import { supabase } from '../../../services/supabaseClient'

// No se importa hoyLocal() de rdcRepository.js a propósito: ese archivo es
// todo el repositorio offline del RDC (IndexedDB, cola de sync — pesado, y
// justo lo que el code-splitting de esta sesión separó para que no cargara
// donde no hace falta). Traer una sola función de ahí volvería a meter ese
// chunk entero en el Dashboard, que lo abre cualquier rol. Se repite acá la
// misma lógica (3 líneas) en vez de esa importación.
//
// `toISOString()` convierte a UTC, y en Perú (UTC-5) eso adelanta el día a
// partir de las 7pm — por eso se arma la fecha con los componentes locales.
function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Un día antes de hoy, mismo cuidado de horario local. */
function ayerLocal() {
  const d = new Date(`${hoyLocal()}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// contarAlertasActivas/contarValesPendientes las usa también App.vue (los
// contadores del sidebar) — viven acá aunque el Dashboard ya no las pinte
// directo, no son exclusivas de esta pantalla.
export async function contarAlertasActivas() {
  const { data, error } = await supabase.from('alertas').select('nivel').eq('estado', 'activa')
  if (error) throw error
  return { total: data.length, criticas: data.filter((a) => a.nivel === 'critica').length }
}

export async function contarValesPendientes() {
  const { count, error } = await supabase
    .from('vales')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['Enviado', 'En revision'])
  if (error) throw error
  return count ?? 0
}

/**
 * No usa la tabla `alertas` (puede estar desactualizada si nadie la
 * refrescó): calcula el umbral directo desde `stock_con_minimo` — la misma
 * vista que usa fn_evaluar_alertas, con el mínimo (20% del último ingreso,
 * por defecto) ya resuelto del lado de la base. Devuelve la lista completa
 * (peor primero, por qué tan por debajo del mínimo está) para poder
 * mostrar las más críticas con su barra, no solo un conteo.
 */
export async function listarStockCritico() {
  const { data, error } = await supabase
    .from('stock_con_minimo')
    .select('material_codigo, material_descripcion, material_unidad, almacen_codigo, almacen_nombre, cantidad_disponible, stock_minimo_efectivo')
  if (error) throw error
  return data
    .filter((s) => s.stock_minimo_efectivo !== null && Number(s.cantidad_disponible) <= Number(s.stock_minimo_efectivo))
    .sort(
      (a, b) =>
        Number(a.cantidad_disponible) / (Number(a.stock_minimo_efectivo) || 1) -
        Number(b.cantidad_disponible) / (Number(b.stock_minimo_efectivo) || 1)
    )
}

export async function listarAlertasCriticasRecientes() {
  const { data, error } = await supabase
    .from('alertas')
    .select('id, tipo, nivel, mensaje, created_at')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return data
}

/**
 * Frentes "en campo" según lo que de verdad mandaron los supervisores (el
 * reporte diario de ayer o de hoy — a veces se manda recién al día siguiente
 * temprano) — NO según `frentes.estado`, a propósito: Planeamiento puede
 * olvidarse de activar o cerrar un frente en el catálogo, y eso dejaría este
 * panel mintiendo. Un frente sin reporte en esta ventana simplemente no
 * aparece acá, sin importar lo que diga su estado.
 */
export async function listarFrentesEnCampo() {
  const desde = ayerLocal()
  const { data: reportes, error } = await supabase
    .from('rdc_reportes')
    .select(
      'id, fecha, frente_id, frentes(id, codigo, nombre), supervisor_id, rdc_supervisores(nombre), capataz_id, rdc_capataces(nombre), ' +
        'restriccion_acceso, restriccion_descripcion, restriccion_inicio, restriccion_fin'
    )
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
  if (error) throw error

  // Un frente puede tener reporte de ayer Y de hoy en la misma ventana — se
  // queda con el más reciente (el order ya vino fecha desc), que es lo que
  // se muestra como "quién está ahí ahora".
  const porFrente = new Map()
  for (const r of reportes) {
    if (!porFrente.has(r.frente_id)) porFrente.set(r.frente_id, r)
  }
  const vigentes = [...porFrente.values()]
  if (!vigentes.length) return []

  const idsReportes = vigentes.map((r) => r.id)
  const [{ data: personal, error: e2 }, { data: maquinaria, error: e3 }] = await Promise.all([
    supabase.from('rdc_reporte_personal').select('reporte_id, categoria, tipo, cantidad').in('reporte_id', idsReportes),
    supabase.from('rdc_reporte_maquinaria').select('reporte_id, tipo, categoria, cantidad').in('reporte_id', idsReportes),
  ])
  if (e2) throw e2
  if (e3) throw e3

  const agruparPorReporte = (filas) => {
    const mapa = new Map()
    for (const f of filas) {
      if (!mapa.has(f.reporte_id)) mapa.set(f.reporte_id, [])
      mapa.get(f.reporte_id).push(f)
    }
    return mapa
  }
  const personalPorReporte = agruparPorReporte(personal)
  const maquinariaPorReporte = agruparPorReporte(maquinaria)

  const hoy = hoyLocal()
  return vigentes
    .map((r) => ({
      frente: r.frentes,
      fecha: r.fecha,
      esHoy: r.fecha === hoy,
      supervisor: r.rdc_supervisores?.nombre ?? '—',
      capataz: r.rdc_capataces?.nombre ?? null,
      personal: personalPorReporte.get(r.id) ?? [],
      maquinaria: maquinariaPorReporte.get(r.id) ?? [],
      restriccion: r.restriccion_acceso
        ? { descripcion: r.restriccion_descripcion, inicio: r.restriccion_inicio, fin: r.restriccion_fin }
        : null,
    }))
    .sort((a, b) => (a.frente?.codigo ?? a.frente?.nombre ?? '').localeCompare(b.frente?.codigo ?? b.frente?.nombre ?? ''))
}

/** Frentes con fecha de inicio programada (fn_frentes_estado_por_fecha ya los
 * pasó a 'proximo' solo, con la fecha que Planeamiento les puso) — para
 * saber cuál sigue antes de que llegue el día y se active solo. */
export async function listarFrentesProximos() {
  const { data, error } = await supabase
    .from('frentes')
    .select('id, codigo, nombre, area, fecha_inicio')
    .eq('estado', 'proximo')
    .order('fecha_inicio')
  if (error) throw error
  return data
}

/**
 * Frentes parados. `updated_at` es una aproximación de "desde cuándo" (no
 * hay todavía una columna que registre el momento exacto en que se marcó
 * 'paralizado' — el usuario pidió dejar el historial detallado de tramos
 * para más adelante) pero alcanza para ordenar los más urgentes primero.
 */
export async function listarFrentesParalizados() {
  const { data, error } = await supabase
    .from('frentes')
    .select('id, codigo, nombre, area, updated_at')
    .eq('estado', 'paralizado')
    .order('updated_at')
  if (error) throw error
  return data
}

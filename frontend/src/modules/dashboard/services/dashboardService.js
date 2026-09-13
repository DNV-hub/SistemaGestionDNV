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

export async function contarReservasActivas() {
  const { count, error } = await supabase
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['Activa', 'Parcial'])
  if (error) throw error
  return count ?? 0
}

export async function contarFrentesActivos() {
  const { count, error } = await supabase
    .from('frentes')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'activo')
  if (error) throw error
  return count ?? 0
}

/**
 * No usa la tabla `alertas` (puede estar desactualizada si nadie la
 * refrescó): calcula el umbral directo desde stock. Devuelve la lista
 * completa (peor primero, por qué tan por debajo del mínimo está) para
 * poder mostrar las más críticas con su barra, no solo un conteo.
 */
export async function listarStockCritico() {
  const { data, error } = await supabase
    .from('stock')
    .select(
      'cantidad_disponible, stock_minimo, almacenes(codigo, nombre), materiales(codigo, descripcion, unidad, stock_minimo_default)'
    )
  if (error) throw error
  return data
    .map((s) => ({ ...s, minimo: s.stock_minimo ?? s.materiales?.stock_minimo_default }))
    .filter((s) => s.minimo !== null && s.minimo !== undefined && Number(s.cantidad_disponible) <= Number(s.minimo))
    .sort((a, b) => Number(a.cantidad_disponible) / (Number(a.minimo) || 1) - Number(b.cantidad_disponible) / (Number(b.minimo) || 1))
}

/**
 * Materiales con salida por frente — base para el panel de barras y la
 * dona. Se agrupa en JS (PostgREST no hace GROUP BY); las cantidades no se
 * suman entre materiales porque mezclarían unidades distintas (kg + m3 +
 * bls no significa nada), así que se cuenta materiales distintos y número
 * de salidas, no volumen.
 */
export async function listarSalidasPorFrente() {
  const { data, error } = await supabase
    .from('salidas')
    .select('material_id, frente_id, frentes(codigo, nombre)')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw error

  const porFrente = new Map()
  for (const s of data) {
    if (!porFrente.has(s.frente_id)) porFrente.set(s.frente_id, { frente: s.frentes, materiales: new Set(), salidas: 0 })
    const entrada = porFrente.get(s.frente_id)
    entrada.materiales.add(s.material_id)
    entrada.salidas += 1
  }
  return [...porFrente.values()]
    .map((e) => ({ frente: e.frente, materialesDistintos: e.materiales.size, salidas: e.salidas }))
    .sort((a, b) => b.salidas - a.salidas)
}

/** El peor % de consumo por frente (entre sus materiales), para los que ya cruzaron el umbral de riesgo. */
export async function listarFrentesSobreconsumo() {
  const [{ data: comparacion, error: e1 }, { data: umbralRow, error: e2 }, { data: frentes, error: e3 }] = await Promise.all([
    supabase.from('procura_vs_consumo').select('frente_id, porcentaje_consumo'),
    supabase.from('configuracion').select('valor').eq('clave', 'umbral_riesgo_sobreconsumo').single(),
    supabase.from('frentes').select('id, codigo, nombre'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  if (e3) throw e3

  const umbral = Number(umbralRow?.valor ?? 90)
  const frentesPorId = new Map(frentes.map((f) => [f.id, f]))

  const peorPorFrente = new Map()
  for (const c of comparacion) {
    if (c.porcentaje_consumo === null || c.porcentaje_consumo < umbral) continue
    const actual = peorPorFrente.get(c.frente_id)
    if (!actual || c.porcentaje_consumo > actual.porcentajeConsumo) {
      peorPorFrente.set(c.frente_id, { frente: frentesPorId.get(c.frente_id), porcentajeConsumo: c.porcentaje_consumo })
    }
  }
  return [...peorPorFrente.values()].sort((a, b) => b.porcentajeConsumo - a.porcentajeConsumo)
}

/**
 * Materiales con salida o reserva en un frente que todavía no tiene metrado
 * Procura vigente para ese material (fn_evaluar_alertas los detecta como
 * 'material_no_previsto'). Situación real de obra: el frente arranca antes
 * de que Planeamiento termine de sacar el metrado del plano. Se resuelve
 * sola en cuanto se carga el metrado (trg_metrados_resolver_alerta).
 */
export async function listarMaterialesSinMetrado() {
  const { data, error } = await supabase
    .from('alertas')
    .select('id, created_at, materiales(codigo, descripcion), frentes(id, codigo, nombre)')
    .eq('tipo', 'material_no_previsto')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data
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
 * Movimientos de los últimos 7 días, agrupados por fecha. Se cuenta la
 * cantidad de movimientos (no se suman las cantidades físicas: mezclarían
 * unidades distintas entre materiales).
 */
export async function listarMovimientosSemana() {
  const hace7 = new Date()
  hace7.setDate(hace7.getDate() - 6)
  const desde = hace7.toISOString().slice(0, 10)

  const [{ data: ingresos, error: e1 }, { data: salidas, error: e2 }] = await Promise.all([
    supabase.from('ingresos').select('fecha').gte('fecha', desde),
    supabase.from('salidas').select('fecha').gte('fecha', desde),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const dias = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dias.push(d.toISOString().slice(0, 10))
  }

  const contarPorFecha = (filas) => {
    const mapa = new Map()
    for (const f of filas) mapa.set(f.fecha, (mapa.get(f.fecha) ?? 0) + 1)
    return mapa
  }
  const mapaIngresos = contarPorFecha(ingresos)
  const mapaSalidas = contarPorFecha(salidas)

  return dias.map((fecha) => ({
    fecha,
    etiqueta: new Date(fecha + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'short' }),
    entradas: mapaIngresos.get(fecha) ?? 0,
    salidas: mapaSalidas.get(fecha) ?? 0,
  }))
}

/** % de materiales en buen nivel de stock (disponible > mínimo) por categoría — no se suma cantidad física entre materiales distintos. */
export async function listarStockPorCategoria() {
  const { data, error } = await supabase
    .from('stock')
    .select('cantidad_disponible, stock_minimo, materiales(categoria_id, stock_minimo_default, categorias(nombre))')
  if (error) throw error

  const porCategoria = new Map()
  for (const s of data) {
    const nombre = s.materiales?.categorias?.nombre ?? 'Sin categoría'
    if (!porCategoria.has(nombre)) porCategoria.set(nombre, { total: 0, sanos: 0 })
    const entrada = porCategoria.get(nombre)
    entrada.total += 1
    const minimo = s.stock_minimo ?? s.materiales?.stock_minimo_default
    const sano = minimo === null || minimo === undefined || Number(s.cantidad_disponible) > Number(minimo)
    if (sano) entrada.sanos += 1
  }
  return [...porCategoria.entries()]
    .map(([nombre, v]) => ({ nombre, porcentajeSano: Math.round((v.sanos / v.total) * 100) }))
    .sort((a, b) => a.porcentajeSano - b.porcentajeSano)
}

export async function listarUltimosMovimientos() {
  const { data, error } = await supabase
    .from('kardex')
    .select('id, fecha_hora, tipo_movimiento, cantidad, materiales(codigo, descripcion, unidad), usuarios(nombre)')
    .order('fecha_hora', { ascending: false })
    .limit(8)
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
      'id, fecha, frente_id, frentes(id, codigo, nombre), supervisor_id, rdc_supervisores(nombre), capataz_id, rdc_capataces(nombre)'
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
    }))
    .sort((a, b) => (a.frente?.codigo ?? a.frente?.nombre ?? '').localeCompare(b.frente?.codigo ?? b.frente?.nombre ?? ''))
}

export async function listarValesPendientesRecientes() {
  const { data, error } = await supabase
    .from('vales')
    .select('id, numero, estado, frentes(codigo), usuarios(nombre)')
    .in('estado', ['Enviado', 'En revision'])
    .order('fecha', { ascending: true })
    .limit(5)
  if (error) throw error
  return data
}

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

/** Un día antes de la fecha dada (string 'YYYY-MM-DD'), mismo cuidado de horario local. */
function diaAnterior(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`)
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
 * Frentes "en campo" según lo que de verdad mandaron los supervisores (el
 * reporte diario de ayer o de hoy — a veces se manda recién al día siguiente
 * temprano) — NO según `frentes.estado`, a propósito: Planeamiento puede
 * olvidarse de activar o cerrar un frente en el catálogo, y eso dejaría este
 * panel mintiendo. Un frente sin reporte en esta ventana simplemente no
 * aparece acá, sin importar lo que diga su estado.
 */
/**
 * Vía fn_dashboard_frentes_en_campo (security definer), no una consulta
 * directa a rdc_reportes: el dashboard lo ve TODO el mundo con permiso de
 * verlo (Almacén, cualquier Supervisor…), pero rdc.ver_todos —lo que exigía
 * la política RLS de la tabla— es "puedo abrir el reporte completo de
 * CUALQUIERA", no "puedo ver este resumen". Dárselo a Supervisor para esto
 * dejaba que un supervisor entrara a /rdc y leyera los reportes de otro
 * (bitácora, observaciones, todo) — exactamente lo que rdc.ver_propios
 * existe para impedir. La función devuelve solo lo que esta tarjeta
 * necesita, gateada por el permiso angosto rdc.ver_resumen_campo.
 *
 * `fecha`: opcional — sin ella, es "ahora mismo" (ventana ayer/hoy, como
 * siempre fue). Con una fecha pasada, hace la misma pregunta pero anclada
 * a ese día: el reporte más reciente de cada frente entre el día anterior
 * y esa fecha misma — para responder "¿qué frentes estaban activos tal
 * día?" sin ir a revisar reporte por reporte.
 */
export async function listarFrentesEnCampo(fecha) {
  const hasta = fecha ?? null
  const desde = diaAnterior(hasta ?? hoyLocal())
  const { data, error } = await supabase.rpc('fn_dashboard_frentes_en_campo', { p_desde: desde, p_hasta: hasta })
  if (error) throw error

  const referencia = hasta ?? hoyLocal()
  return (data ?? []).map((r) => ({ ...r, esHoy: r.fecha === referencia }))
}

/** Mapa de actividad mensual (Dashboard): quién reportó cada frente cada
 * día del mes pedido (`anio`/`mes`, 1-12) — la base del heatmap que
 * reemplaza el check binario "frente activo" por algo que sí distingue un
 * cambio de supervisor de una parada real. `anio`/`mes` en vez de un rango
 * de fechas porque el mes calendario completo es la unidad natural de este
 * mapa (con navegación mes anterior/siguiente), no una ventana arbitraria. */
export async function listarMapaActividad(anio, mes) {
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  const { data, error } = await supabase.rpc('fn_dashboard_mapa_actividad', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return data
}

/** `color = null` vuelve al color automático (hash) — gateado por RLS a
 * rdc.catalogos_gestionar, igual que el resto del catálogo de supervisores. */
export async function actualizarColorSupervisor(supervisorId, color) {
  const { error } = await supabase.from('rdc_supervisores').update({ color }).eq('id', supervisorId)
  if (error) throw error
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
 * Frentes parados, ordenados por más urgente (el que lleva más tiempo
 * parado) primero. fecha_paralizacion la elige quien marca el frente como
 * paralizado (FrenteFormModal) — un frente viejo que quedó paralizado antes
 * de que existiera este campo no la tiene, así que se cae a updated_at como
 * aproximación.
 */
export async function listarFrentesParalizados() {
  const { data, error } = await supabase
    .from('frentes')
    .select('id, codigo, nombre, area, updated_at, fecha_paralizacion')
    .eq('estado', 'paralizado')
    .order('fecha_paralizacion', { ascending: true, nullsFirst: true })
  if (error) throw error
  return data
}

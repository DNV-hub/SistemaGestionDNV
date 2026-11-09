import { supabase } from '../../../services/supabaseClient'

// Solo lectura: la pestaña Semanal nunca escribe en la base.

/** Primera y última fecha con reporte del frente (la última, sin pasar de
 * `hasta`: hay borradores de prueba con fechas como 2051). */
export async function fechasLimiteReportes(frenteId, hasta) {
  const base = () => supabase.from('rdc_reportes').select('fecha').eq('frente_id', frenteId).is('eliminado_at', null).limit(1)
  const [primera, ultima] = await Promise.all([
    base().order('fecha', { ascending: true }),
    base().lte('fecha', hasta).order('fecha', { ascending: false }),
  ])
  if (primera.error) throw primera.error
  if (ultima.error) throw ultima.error
  return { primera: primera.data[0]?.fecha ?? null, ultima: ultima.data[0]?.fecha ?? null }
}

/** Una semana completa en tres consultas: los reportes del lunes al domingo
 * y, con sus ids, todas sus líneas de bitácora y de metrados. */
export async function cargarSemana(frenteId, desde, hasta) {
  const { data: reportes, error } = await supabase
    .from('rdc_reportes')
    .select('id, fecha, estado')
    .eq('frente_id', frenteId)
    .is('eliminado_at', null)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
  if (error) throw error
  if (!reportes.length) return { reportes, bitacora: [], metrados: [] }
  const ids = reportes.map((r) => r.id)
  const [bit, met] = await Promise.all([
    supabase.from('rdc_reporte_bitacora').select('reporte_id, hora_inicio, hora_fin, actividad, orden').in('reporte_id', ids),
    supabase
      .from('rdc_reporte_metrados')
      .select('reporte_id, bloque, partida_codigo, partida_nombre, unidad, cantidad, hora_inicio, hora_fin, orden')
      .in('reporte_id', ids),
  ])
  if (bit.error) throw bit.error
  if (met.error) throw met.error
  return { reportes, bitacora: bit.data, metrados: met.data }
}

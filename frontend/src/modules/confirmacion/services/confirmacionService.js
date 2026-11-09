import { supabase } from '../../../services/supabaseClient'

// Único punto que habla con Supabase para la confirmación de metrados —
// lo usan tanto la pestaña "Metrados" de la ficha de un frente (un frente a
// la vez) como la Bandeja de Confirmación (todos los frentes a la vez).
// Las dos FK hacia rdc_partidas_edt (la real y la sugerida) obligan a
// nombrar la relación explícita en el select, si no PostgREST no sabe cuál
// de las dos usar.
const SELECT_CONFIRMACION = `
  *,
  partida:rdc_partidas_edt!rdc_metrados_confirmacion_partida_edt_id_fkey(id, codigo_edt, nombre, unidad, seccion),
  sugerida:rdc_partidas_edt!rdc_metrados_confirmacion_sugerida_partida_edt_id_fkey(id, codigo_edt, nombre, unidad),
  rdc_reportes(fecha, rdc_supervisores(nombre)),
  resuelto:usuarios!rdc_metrados_confirmacion_resuelto_por_fkey(nombre)
`

/** filtros: { frenteId, desde, hasta, soloConAlerta }. soloConAlerta se
 * resuelve del lado del cliente (cruzando con listarAlertas), no acá: la
 * alerta es un cálculo aparte (fn_rdc_metrados_alertas), no una columna de
 * esta tabla. */
export async function listarConfirmaciones({ frenteId, desde, hasta } = {}) {
  let query = supabase.from('rdc_metrados_confirmacion').select(SELECT_CONFIRMACION).order('fecha', { ascending: false })
  if (frenteId) query = query.eq('frente_id', frenteId)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  const { data, error } = await query
  if (error) throw error
  return data
}

/** Alertas activas (supera previsto / GLB cerrada / coincidencia baja),
 * calculadas al vuelo contra lo que sigue 'por_confirmar' — ver
 * fn_rdc_metrados_alertas. frenteId null trae las de todos los frentes
 * (Bandeja de Confirmación). */
export async function listarAlertas(frenteId = null) {
  const { data, error } = await supabase.rpc('fn_rdc_metrados_alertas', { p_frente_id: frenteId })
  if (error) throw error
  return data
}

/** partidaEdtId solo tiene efecto en filas origen='libre' — es la partida
 * real de cronograma que Planeamiento elige (o acepta de la sugerida) para
 * que ese metrado sí sume al acumulado oficial; en el resto de orígenes la
 * función lo ignora porque la partida ya es la correcta de origen. */
export async function confirmarMetrado(id, partidaEdtId = null) {
  const { error } = await supabase.rpc('fn_rdc_confirmar_metrado', { p_id: id, p_partida_edt_id: partidaEdtId })
  if (error) throw error
}

export async function corregirMetrado(id, cantidad, motivo, partidaEdtId = null) {
  const { error } = await supabase.rpc('fn_rdc_corregir_metrado', { p_id: id, p_cantidad: cantidad, p_motivo: motivo, p_partida_edt_id: partidaEdtId })
  if (error) throw error
}

export async function ignorarMetrado(id, motivo) {
  const { error } = await supabase.rpc('fn_rdc_ignorar_metrado', { p_id: id, p_motivo: motivo })
  if (error) throw error
}

/** Partidas EDT activas para poblar el selector "Partida real de
 * cronograma" de un metrado libre. frenteId null trae las de todos los
 * frentes (Bandeja de Confirmación), que luego se agrupan en el cliente. */
export async function listarPartidasEdtDelFrente(frenteId = null) {
  let query = supabase
    .from('rdc_partidas_edt')
    .select('id, frente_id, codigo_edt, nombre, unidad, seccion')
    .eq('activo', true)
    .order('codigo_edt')
  if (frenteId) query = query.eq('frente_id', frenteId)
  const { data, error } = await query
  if (error) throw error
  return data
}


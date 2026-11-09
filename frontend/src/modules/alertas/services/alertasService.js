import { supabase } from '../../../services/supabaseClient'

const SELECT_ALERTA =
  '*, materiales(id, codigo, descripcion), frentes(id, codigo, nombre), almacenes(id, codigo, nombre), vales(id, numero), rdc_reportes(id, fecha), usuarios(id, nombre)'

/** filtros: { estado, tipo, nivel, frenteId } */
export async function listarAlertas(filtros = {}) {
  let query = supabase.from('alertas').select(SELECT_ALERTA).order('created_at', { ascending: false }).limit(300)

  if (filtros.estado) query = query.eq('estado', filtros.estado)
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
  if (filtros.nivel) query = query.eq('nivel', filtros.nivel)
  if (filtros.frenteId) query = query.eq('frente_id', filtros.frenteId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function resolverAlerta(id, resuelta_por) {
  const { data, error } = await supabase
    .from('alertas')
    .update({ estado: 'resuelta', resuelta_at: new Date().toISOString(), resuelta_por })
    .eq('id', id)
    .select(SELECT_ALERTA)
    .single()
  if (error) throw error
  return data
}

/**
 * fn_evaluar_alertas no está programada todavía (no hay pg_cron ni Edge
 * Function agendada) — este botón es el disparador manual mientras tanto.
 * Es security definer e idempotente (no duplica alertas activas), así que
 * es seguro llamarla cuando sea.
 */
export async function evaluarAlertas() {
  const { error } = await supabase.rpc('fn_evaluar_alertas')
  if (error) throw error
}

export async function listarConfiguracion() {
  const { data, error } = await supabase.from('configuracion').select('*').order('clave')
  if (error) throw error
  return data
}

export async function actualizarConfiguracion(clave, valor, actualizado_por) {
  const { data, error } = await supabase
    .from('configuracion')
    .update({ valor, actualizado_por })
    .eq('clave', clave)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listarFrentesActivos() {
  const { data, error } = await supabase
    .from('frentes')
    .select('id, codigo, nombre')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

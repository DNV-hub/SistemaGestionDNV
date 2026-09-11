import { supabase } from '../../../services/supabaseClient'

export async function listarFrentes() {
  const { data, error } = await supabase.from('frentes').select('id, codigo, nombre').order('codigo')
  if (error) throw error
  return data
}

export async function listarMaterialesActivos() {
  const { data, error } = await supabase
    .from('materiales')
    .select('id, codigo, descripcion, unidad')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

/** filtros: { frenteId, desde, hasta } — salidas reales entregadas (no reservas ni solicitudes). */
export async function listarSalidasReporte({ frenteId, desde, hasta } = {}) {
  let query = supabase
    .from('salidas')
    .select(
      'fecha, cantidad, frentes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), contratos(nombre)'
    )
    .order('fecha')

  if (frenteId) query = query.eq('frente_id', frenteId)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query
  if (error) throw error
  return data
}

/** filtros: { frenteId, desde, hasta } — salidas que además tienen cantidad
 * convertida (cantidad_edp): materiales con tipo_conversion ≠ 'ninguna'. */
export async function listarSalidasEdp({ frenteId, desde, hasta } = {}) {
  let query = supabase
    .from('salidas')
    .select(
      'fecha, cantidad, cantidad_edp, frentes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad, unidad_edp, nombres_edp(id, nombre))'
    )
    .not('cantidad_edp', 'is', null)
    .order('fecha')

  if (frenteId) query = query.eq('frente_id', frenteId)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query
  if (error) throw error
  return data
}

/**
 * procura_vs_consumo de TODOS los frentes (sin filtrar por frente_id) — es
 * una vista, no soporta el embedding de PostgREST, así que frentes y
 * materiales se resuelven aparte con listarFrentes()/materiales activos.
 */
export async function listarComparacionGeneral() {
  const { data, error } = await supabase.from('procura_vs_consumo').select('*')
  if (error) throw error
  return data
}

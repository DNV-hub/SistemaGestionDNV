import { supabase } from '../../../services/supabaseClient'

const SELECT_METRADO =
  '*, materiales(id, codigo, descripcion, unidad), frentes(id, codigo, nombre), usuarios(id, nombre)'

/** Una fila vigente por cada combinación frente+material, de todos los frentes. */
export async function listarMetradosVigentes() {
  const { data, error } = await supabase
    .from('metrados_procura')
    .select(SELECT_METRADO)
    .eq('vigente', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Todas las versiones (vigentes y superadas) de un frente — es el reporte
 * de modificaciones: cada cambio de cantidad_contractual o cantidad_procura
 * ya crea una fila nueva vía trg_metrados_versionar (nunca se actualiza en
 * sitio), así que metrados_procura ES el historial.
 */
export async function listarHistorialFrente(frenteId) {
  const { data, error } = await supabase
    .from('metrados_procura')
    .select(SELECT_METRADO)
    .eq('frente_id', frenteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function crearVersionMetrado(payload) {
  const { data, error } = await supabase
    .from('metrados_procura')
    .insert(payload)
    .select(SELECT_METRADO)
    .single()
  if (error) throw error
  return data
}

export async function listarComparacion(frenteId) {
  const { data, error } = await supabase.from('procura_vs_consumo').select('*').eq('frente_id', frenteId)
  if (error) throw error
  return data
}

export async function listarFrentesActivos() {
  const { data, error } = await supabase
    .from('frentes')
    .select('id, codigo, nombre, area, estado')
    .eq('estado', 'activo')
    .order('codigo')
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

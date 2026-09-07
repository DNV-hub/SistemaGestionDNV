import { supabase } from '../../../services/supabaseClient'

const SELECT_MATERIAL = '*, categorias(id, nombre), nombres_edp(id, nombre)'

export async function listarMateriales() {
  const { data, error } = await supabase.from('materiales').select(SELECT_MATERIAL).order('codigo')
  if (error) throw error
  return data
}

export async function listarCategorias() {
  const { data, error } = await supabase.from('categorias').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearCategoria(payload) {
  const { data, error } = await supabase.from('categorias').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function listarNombresEdp() {
  const { data, error } = await supabase.from('nombres_edp').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearNombreEdp(payload) {
  const { data, error } = await supabase.from('nombres_edp').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function crearNombresEdpEnLote(payloads) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from('nombres_edp').insert(payloads).select()
  if (error) throw error
  return data
}

export async function crearMaterial(payload) {
  const { data, error } = await supabase
    .from('materiales')
    .insert(payload)
    .select(SELECT_MATERIAL)
    .single()

  if (error) throw error
  return data
}

export async function crearMaterialesEnLote(payloads) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from('materiales').insert(payloads).select(SELECT_MATERIAL)
  if (error) throw error
  return data
}

export async function eliminarMaterial(id) {
  const { error } = await supabase.from('materiales').delete().eq('id', id)
  if (error) throw error
}

export async function actualizarMaterial(id, payload) {
  const { data, error } = await supabase
    .from('materiales')
    .update(payload)
    .eq('id', id)
    .select(SELECT_MATERIAL)
    .single()

  if (error) throw error
  return data
}

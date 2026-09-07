import { supabase } from '../../../services/supabaseClient'

export async function listarFrentes() {
  const { data, error } = await supabase.from('frentes').select('*').order('codigo')
  if (error) throw error
  return data
}

export async function crearFrente(payload) {
  const { data, error } = await supabase.from('frentes').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function actualizarFrente(id, payload) {
  const { data, error } = await supabase.from('frentes').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function eliminarFrente(id) {
  const { error } = await supabase.from('frentes').delete().eq('id', id)
  if (error) throw error
}

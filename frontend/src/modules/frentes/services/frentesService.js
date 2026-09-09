import { supabase } from '../../../services/supabaseClient'

export async function listarFrentes() {
  const { data, error } = await supabase
    .from('frentes')
    .select('*, contratos(id, codigo, nombre)')
    .order('codigo')
  if (error) throw error
  return data
}

const SELECT_FRENTE = '*, contratos(id, codigo, nombre)'

export async function crearFrente(payload) {
  const { data, error } = await supabase.from('frentes').insert(payload).select(SELECT_FRENTE).single()
  if (error) throw error
  return data
}

export async function actualizarFrente(id, payload) {
  const { data, error } = await supabase.from('frentes').update(payload).eq('id', id).select(SELECT_FRENTE).single()
  if (error) throw error
  return data
}

export async function eliminarFrente(id) {
  const { error } = await supabase.from('frentes').delete().eq('id', id)
  if (error) throw error
}

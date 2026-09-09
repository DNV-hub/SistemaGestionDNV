import { supabase } from './supabaseClient'

export async function listarContratos() {
  const { data, error } = await supabase.from('contratos').select('*').order('codigo')
  if (error) throw error
  return data
}

import { supabase } from '../../../services/supabaseClient'

const SELECT_USUARIO = '*, roles(id, nombre), frentes(id, codigo, nombre)'

export async function listarUsuarios() {
  const { data, error } = await supabase.from('usuarios').select(SELECT_USUARIO).order('nombre')
  if (error) throw error
  return data
}

export async function listarRoles() {
  const { data, error } = await supabase.from('roles').select('id, nombre').order('nombre')
  if (error) throw error
  return data
}

export async function listarFrentes() {
  const { data, error } = await supabase.from('frentes').select('id, codigo, nombre').order('codigo')
  if (error) throw error
  return data
}

/** Llama a la Edge Function crear-usuario: crea la cuenta de acceso (auth)
 * y el perfil (public.usuarios) en un solo paso, con permisos verificados
 * en el servidor. Devuelve { usuario, passwordTemporal }. */
export async function crearUsuario(payload) {
  const { data, error } = await supabase.functions.invoke('crear-usuario', { body: payload })
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null)
    throw new Error(detalle?.error || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function actualizarUsuario(id, payload) {
  const { data, error } = await supabase.from('usuarios').update(payload).eq('id', id).select(SELECT_USUARIO).single()
  if (error) throw error
  return data
}

/** Llama a la Edge Function restablecer-password: define una contraseña
 * nueva (elegida o generada) para un usuario existente. Nunca se puede leer
 * la contraseña anterior — no es reversible. Devuelve { usuario, password }. */
export async function restablecerPassword(id, password) {
  const { data, error } = await supabase.functions.invoke('restablecer-password', { body: { id, password } })
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null)
    throw new Error(detalle?.error || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** Llama a la Edge Function eliminar-usuario: borra la cuenta de acceso si
 * no tiene historial asociado, o la desactiva si sí lo tiene. Devuelve
 * { eliminado, desactivado }. */
export async function eliminarUsuario(id) {
  const { data, error } = await supabase.functions.invoke('eliminar-usuario', { body: { id } })
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null)
    throw new Error(detalle?.error || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

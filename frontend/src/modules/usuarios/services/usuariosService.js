import { supabase } from '../../../services/supabaseClient'

const SELECT_USUARIO = '*, roles(id, nombre), frentes(id, codigo, nombre), contratos(id, codigo, nombre)'

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

/** El contrato es estable (no rota como el frente): quien pertenece a
 * Marco no pasa a Sala Eléctrica y viceversa. Se asigna una sola vez. */
export async function listarContratos() {
  const { data, error } = await supabase.from('contratos').select('id, codigo, nombre').order('codigo')
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

/** Solo Developer (sistema.borrar_pruebas): rompe el vínculo de un usuario
 * de prueba con el catálogo de supervisores del RDC, que es lo que suele
 * bloquear su eliminación (rdc_supervisores.usuario_id no tiene cascada).
 * Se niega si ese supervisor ya tiene reportes reales guardados. */
export async function desvincularSupervisorPrueba(id) {
  const { error } = await supabase.rpc('fn_desvincular_supervisor_prueba', { p_usuario_id: id })
  if (error) throw error
}

/** Solo Developer: cuenta, tabla por tabla, qué sigue atado a esta cuenta.
 * No borra nada — es diagnóstico, para saber si lo que falta es limpiable
 * (vales, reportes del RDC, el vínculo de catálogo) o es historial real
 * que nunca debería borrarse (auditoría, kardex, movimientos de Almacén,
 * devoluciones, procura), aunque la cuenta se haya creado para probar. */
export async function diagnosticarBloqueoUsuario(id) {
  const { data, error } = await supabase.rpc('fn_diagnosticar_bloqueo_usuario', { p_usuario_id: id })
  if (error) throw error
  return data
}

/** Solo Developer: borra en cadena todo lo que puede estar bloqueando el
 * borrado de una cuenta de prueba — sus vales, sus reportes del RDC y el
 * vínculo con el catálogo de supervisores — antes de reintentar eliminar
 * la cuenta en sí. Devuelve cuántos vales se saltearon (los que ya
 * tuvieron una entrega física real: esos no son prueba, quedan como
 * estaban). */
export async function borrarUsuarioPrueba(id) {
  const { data, error } = await supabase.rpc('fn_borrar_usuario_prueba', { p_usuario_id: id })
  if (error) throw error
  return { valesOmitidos: data?.vales_omitidos ?? 0 }
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

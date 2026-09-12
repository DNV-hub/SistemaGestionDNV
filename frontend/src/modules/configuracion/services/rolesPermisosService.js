import { supabase } from '../../../services/supabaseClient'

// Roles y permisos son datos (tabla roles / permisos / rol_permisos), no
// reglas escritas en el código — así lo dejó 20260822100100 a propósito,
// para que quien tenga 'roles.gestionar' pueda reasignar permisos sin
// migración ni redeploy. Este servicio es la primera pantalla que de verdad
// usa ese diseño: hasta ahora solo existía la tabla y el permiso, nunca una
// interfaz para tocarlos.

export async function listarRoles() {
  const { data, error } = await supabase.from('roles').select('id, nombre, descripcion').order('nombre')
  if (error) throw error
  return data
}

export async function listarPermisos() {
  const { data, error } = await supabase.from('permisos').select('id, codigo, modulo, descripcion').order('modulo').order('codigo')
  if (error) throw error
  return data
}

export async function listarAsignaciones() {
  const { data, error } = await supabase.from('rol_permisos').select('rol_id, permiso_id')
  if (error) throw error
  return data
}

export async function asignarPermiso(rolId, permisoId) {
  const { error } = await supabase.from('rol_permisos').insert({ rol_id: rolId, permiso_id: permisoId })
  if (error) throw error
}

export async function quitarPermiso(rolId, permisoId) {
  const { error } = await supabase.from('rol_permisos').delete().eq('rol_id', rolId).eq('permiso_id', permisoId)
  if (error) throw error
}

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

/** Un rol nuevo nace sin ningún permiso asignado — quien lo crea vuelve
 * enseguida a la matriz de arriba para marcarle los que corresponda, la
 * misma pantalla, sin un paso aparte. */
export async function crearRol({ nombre, descripcion }) {
  const { data, error } = await supabase
    .from('roles')
    .insert({ nombre, descripcion: descripcion || null })
    .select('id, nombre, descripcion')
    .single()
  if (error) throw error
  return data
}

/** `usuarios.rol_id` no tiene "on delete cascade" a propósito (a
 * diferencia de rol_permisos, que sí) — Postgres rechaza el delete solo si
 * todavía hay algún usuario con este rol, así nunca se puede dejar a
 * alguien sin rol por accidente. La vista traduce ese error (código 23503,
 * violación de llave foránea) a un mensaje legible. */
export async function eliminarRol(rolId) {
  const { error } = await supabase.from('roles').delete().eq('id', rolId)
  if (error) throw error
}

/** Cuántas personas tiene cada rol (solo lectura; para mostrar "N usuarios" y
 * avisar cuándo un cambio de permisos afecta a gente). Devuelve { rolId: n }. */
export async function contarUsuariosPorRol() {
  const { data, error } = await supabase.from('usuarios').select('rol_id')
  if (error) throw error
  const conteo = {}
  for (const u of data) conteo[u.rol_id] = (conteo[u.rol_id] ?? 0) + 1
  return conteo
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

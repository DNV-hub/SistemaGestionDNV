import { supabase } from '../../../services/supabaseClient'

// devoluciones tiene dos FKs a usuarios (supervisor_id y recibida_por), hay
// que desambiguar el embedding de PostgREST con !columna.
const SELECT_DEVOLUCION =
  '*, materiales(id, codigo, descripcion, unidad), frentes(id, codigo, nombre), almacenes(id, codigo, nombre), supervisor:usuarios!supervisor_id(id, nombre), receptor:usuarios!recibida_por(id, nombre)'

export async function crearDevolucion(payload) {
  const { data, error } = await supabase.from('devoluciones').insert(payload).select(SELECT_DEVOLUCION).single()
  if (error) throw error
  return data
}

/** RLS ya filtra: un Supervisor solo ve las suyas, Almacén/Planeamiento ven todas. */
export async function listarDevoluciones() {
  const { data, error } = await supabase
    .from('devoluciones')
    .select(SELECT_DEVOLUCION)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function recibirDevolucion({ devolucion_id, almacen_id, usuario_id }) {
  const { error } = await supabase.rpc('fn_recibir_devolucion', {
    p_devolucion_id: devolucion_id,
    p_almacen_id: almacen_id,
    p_usuario_id: usuario_id,
  })
  if (error) throw error
}

export async function rechazarDevolucion({ devolucion_id, motivo, usuario_id }) {
  const { error } = await supabase.rpc('fn_rechazar_devolucion', {
    p_devolucion_id: devolucion_id,
    p_motivo: motivo,
    p_usuario_id: usuario_id,
  })
  if (error) throw error
}

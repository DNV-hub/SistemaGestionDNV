import { supabase } from '../../../services/supabaseClient'

// devoluciones tiene dos FKs a usuarios (supervisor_id y recibida_por), hay
// que desambiguar el embedding de PostgREST con !columna.
const SELECT_DEVOLUCION =
  '*, materiales(id, codigo, descripcion, unidad, tipo_conversion), frentes(id, codigo, nombre), almacenes(id, codigo, nombre), supervisor:usuarios!supervisor_id(id, nombre), receptor:usuarios!recibida_por(id, nombre)'

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

/** cantidad_reutilizable: cuánto de lo devuelto, según lo que Almacén
 * evaluó al recibirlo de verdad, vuelve a stock disponible — el resto se da
 * de baja. Independiente de lo que el supervisor haya declarado al pedir la
 * devolución (bueno/dañado): eso es solo su primera impresión. */
export async function recibirDevolucion({ devolucion_id, almacen_id, usuario_id, cantidad_reutilizable, ancho, largo }) {
  const { error } = await supabase.rpc('fn_recibir_devolucion', {
    p_devolucion_id: devolucion_id,
    p_almacen_id: almacen_id,
    p_usuario_id: usuario_id,
    p_cantidad_reutilizable: cantidad_reutilizable,
    p_ancho: ancho ?? null,
    p_largo: largo ?? null,
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

/** Para cuando Almacén se equivocó y dio de baja algo que en realidad sí
 * servía: mueve esa cantidad de "baja" a "reutilizable" sobre una devolución
 * ya recibida, generando el lote correspondiente en stock (con su propia
 * medida si el material la necesita) — nunca toca lo que ya entró la
 * primera vez. */
export async function reevaluarDevolucion({ devolucion_id, usuario_id, cantidad_a_recuperar, ancho, largo, motivo }) {
  const { error } = await supabase.rpc('fn_reevaluar_devolucion', {
    p_devolucion_id: devolucion_id,
    p_cantidad_a_recuperar: cantidad_a_recuperar,
    p_usuario_id: usuario_id,
    p_ancho: ancho ?? null,
    p_largo: largo ?? null,
    p_motivo: motivo ?? null,
  })
  if (error) throw error
}

/** Una devolución que se recibió por error y debía rechazarse: quita del stock
 * lo que entró y la deja Rechazada. La base lo impide si ese material ya se usó. */
export async function anularRecepcionDevolucion({ devolucion_id, motivo, usuario_id }) {
  const { error } = await supabase.rpc('fn_anular_recepcion_devolucion', {
    p_devolucion_id: devolucion_id,
    p_motivo: motivo,
    p_usuario_id: usuario_id,
  })
  if (error) throw error
}

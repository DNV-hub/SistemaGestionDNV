import { supabase } from '../../../services/supabaseClient'

const SELECT_RESERVA =
  '*, materiales(id, codigo, descripcion, unidad), almacenes(id, codigo, nombre), frentes(id, codigo, nombre), vale_detalle(id, vale_id, vales(numero))'

/** filtros: { estados: string[], almacenId, frenteId } */
export async function listarReservas(filtros = {}) {
  let query = supabase.from('reservas').select(SELECT_RESERVA).order('created_at', { ascending: true })

  if (filtros.estados?.length) query = query.in('estado', filtros.estados)
  if (filtros.almacenId) query = query.eq('almacen_id', filtros.almacenId)
  if (filtros.frenteId) query = query.eq('frente_id', filtros.frenteId)

  const { data, error } = await query
  if (error) throw error
  return data
}

/** Cuántas reservas siguen vigentes (Activa o Parcial): material apartado que
 * todavía no se entregó del todo ni se liberó. */
export async function contarReservasVigentes() {
  const { count, error } = await supabase
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['Activa', 'Parcial'])
  if (error) throw error
  return count ?? 0
}

export async function liberarReserva({ reserva_id, motivo, usuario_id }) {
  const { error } = await supabase.rpc('fn_liberar_reserva', {
    p_reserva_id: reserva_id,
    p_motivo: motivo,
    p_usuario_id: usuario_id,
    p_cancelar: false,
  })
  if (error) throw error
}

export async function obtenerDiasReservaProlongada() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'dias_reserva_prolongada')
    .single()
  if (error) throw error
  return Number(data.valor)
}

export async function listarAlmacenes() {
  const { data, error } = await supabase.from('almacenes').select('id, codigo, nombre').order('nombre')
  if (error) throw error
  return data
}

export async function listarFrentes() {
  const { data, error } = await supabase.from('frentes').select('id, codigo, nombre').order('codigo')
  if (error) throw error
  return data
}

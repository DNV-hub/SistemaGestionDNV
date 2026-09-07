import { supabase } from '../../../services/supabaseClient'

const SELECT_VALE = '*, frentes(id, codigo, nombre, estado), usuarios!supervisor_id(id, nombre)'
const SELECT_DETALLE = '*, materiales(id, codigo, descripcion, unidad)'

export function generarNumeroVale() {
  const ahora = new Date()
  const yyyymmdd = ahora.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `V-${yyyymmdd}-${rand}`
}

export async function listarVales() {
  const { data, error } = await supabase
    .from('vales')
    .select(SELECT_VALE)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function obtenerVale(id) {
  const [{ data: vale, error: errorVale }, { data: lineas, error: errorLineas }] = await Promise.all([
    supabase.from('vales').select(SELECT_VALE).eq('id', id).single(),
    supabase.from('vale_detalle').select(SELECT_DETALLE).eq('vale_id', id).order('created_at'),
  ])
  if (errorVale) throw errorVale
  if (errorLineas) throw errorLineas
  return { ...vale, lineas }
}

export async function crearVale({ frente_id, supervisor_id, observaciones, lineas }) {
  const { data: vale, error: errorVale } = await supabase
    .from('vales')
    .insert({
      numero: generarNumeroVale(),
      frente_id,
      supervisor_id,
      observaciones,
    })
    .select(SELECT_VALE)
    .single()
  if (errorVale) throw errorVale

  const { error: errorLineas } = await supabase.from('vale_detalle').insert(
    lineas.map((l) => ({
      vale_id: vale.id,
      material_id: l.material_id,
      cantidad_solicitada: l.cantidad_solicitada,
    }))
  )
  if (errorLineas) throw errorLineas

  return obtenerVale(vale.id)
}

export async function actualizarVale(id, payload) {
  const { data, error } = await supabase.from('vales').update(payload).eq('id', id).select(SELECT_VALE).single()
  if (error) throw error
  return data
}

export async function agregarLinea(vale_id, { material_id, cantidad_solicitada }) {
  const { data, error } = await supabase
    .from('vale_detalle')
    .insert({ vale_id, material_id, cantidad_solicitada })
    .select(SELECT_DETALLE)
    .single()
  if (error) throw error
  return data
}

export async function eliminarLinea(id) {
  const { error } = await supabase.from('vale_detalle').delete().eq('id', id)
  if (error) throw error
}

export async function rechazarLinea(id) {
  const { data, error } = await supabase
    .from('vale_detalle')
    .update({ estado: 'Rechazado' })
    .eq('id', id)
    .select(SELECT_DETALLE)
    .single()
  if (error) throw error
  return data
}

export async function cancelarLinea(id) {
  const { error } = await supabase.from('vale_detalle').update({ estado: 'Cancelado' }).eq('id', id)
  if (error) throw error
}

export async function aprobarLinea({ vale_detalle_id, almacen_id, cantidad, usuario_id }) {
  const { error } = await supabase.rpc('fn_crear_reserva', {
    p_vale_detalle_id: vale_detalle_id,
    p_almacen_id: almacen_id,
    p_cantidad: cantidad,
    p_usuario_id: usuario_id,
  })
  if (error) throw error
}

export async function liberarReserva({ reserva_id, motivo, usuario_id, cancelar }) {
  const { error } = await supabase.rpc('fn_liberar_reserva', {
    p_reserva_id: reserva_id,
    p_motivo: motivo,
    p_usuario_id: usuario_id,
    p_cancelar: cancelar,
  })
  if (error) throw error
}

export async function listarReservasDeVale(valeDetalleIds) {
  if (!valeDetalleIds.length) return []
  const { data, error } = await supabase
    .from('reservas')
    .select('*')
    .in('vale_detalle_id', valeDetalleIds)
  if (error) throw error
  return data
}

export async function obtenerReservaActivaDeLinea(valeDetalleId) {
  const { data, error } = await supabase
    .from('reservas')
    .select('*, almacenes(id, codigo, nombre)')
    .eq('vale_detalle_id', valeDetalleId)
    .in('estado', ['Activa', 'Parcial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function registrarSalida(payload) {
  const { data, error } = await supabase.from('salidas').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function listarFrentesActivos() {
  const { data, error } = await supabase.from('frentes').select('id, codigo, nombre').eq('estado', 'activo').order('codigo')
  if (error) throw error
  return data
}

export async function listarMaterialesActivos() {
  const { data, error } = await supabase
    .from('materiales')
    .select('id, codigo, descripcion, unidad')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

export async function listarAlmacenesActivos() {
  const { data, error } = await supabase.from('almacenes').select('id, codigo, nombre').eq('estado', 'activo').order('nombre')
  if (error) throw error
  return data
}

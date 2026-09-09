import { supabase } from '../../../services/supabaseClient'

const SELECT_VALE = '*, frentes(id, codigo, nombre, estado, contrato_id), usuarios!supervisor_id(id, nombre)'
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

/**
 * Situación de cada material de un vale frente a Procura y al stock del
 * almacén, para alertar al que aprueba (¿hay stock?, ¿está contemplado en el
 * metrado?, ¿ya hay sobreconsumo?) sin tener que ir a mirar otras pantallas.
 */
export async function obtenerAlertasVale({ frenteId, contratoId, materialIds }) {
  if (!materialIds.length) {
    return { stockPorMaterial: new Map(), procuraPorMaterial: new Map(), umbralSobreconsumo: 90 }
  }

  const [{ data: stock, error: e1 }, { data: procura, error: e2 }, { data: umbralRow }] = await Promise.all([
    supabase.from('stock').select('material_id, cantidad_disponible').eq('contrato_id', contratoId).in('material_id', materialIds),
    supabase
      .from('procura_vs_consumo')
      .select('material_id, cantidad_prevista, cantidad_solicitada, cantidad_entregada, saldo, porcentaje_consumo')
      .eq('frente_id', frenteId)
      .in('material_id', materialIds),
    supabase.from('configuracion').select('valor').eq('clave', 'umbral_riesgo_sobreconsumo').single(),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const stockPorMaterial = new Map()
  for (const s of stock ?? []) {
    stockPorMaterial.set(s.material_id, (stockPorMaterial.get(s.material_id) ?? 0) + Number(s.cantidad_disponible))
  }

  return {
    stockPorMaterial,
    procuraPorMaterial: new Map((procura ?? []).map((p) => [p.material_id, p])),
    umbralSobreconsumo: Number(umbralRow?.valor ?? 90),
  }
}

/** Stock en tiempo real por almacén, para que el supervisor vea qué hay disponible antes de pedir. */
export async function listarStockDisponible() {
  const { data, error } = await supabase
    .from('stock')
    .select('cantidad_disponible, almacenes(codigo, nombre), materiales(codigo, descripcion, unidad, estado)')
    .order('material_id')
  if (error) throw error
  return data.filter((s) => s.materiales?.estado === 'activo')
}

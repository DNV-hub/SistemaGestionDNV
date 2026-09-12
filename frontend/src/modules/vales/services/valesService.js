import { supabase } from '../../../services/supabaseClient'

const SELECT_VALE =
  '*, frentes(id, codigo, nombre, estado, contrato_id), usuarios!supervisor_id(id, nombre), creador:usuarios!creado_por(id, nombre), vale_detalle(id)'
const SELECT_DETALLE = '*, materiales(id, codigo, descripcion, unidad, unidad_edp, tipo_conversion)'

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

export async function crearVale({ frente_id, supervisor_id, creado_por, observaciones, lineas }) {
  const { data: vale, error: errorVale } = await supabase
    .from('vales')
    .insert({
      frente_id,
      supervisor_id,
      creado_por: creado_por ?? null,
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

/** Lotes (ingresos) con saldo, para elegir de cuál sale una entrega cuando
 * el material necesita conversión de unidades (el factor varía por lote:
 * un rollo de malla puede venir de otro tamaño en cada ingreso). */
export async function listarLotesDisponibles(materialId, almacenId) {
  const { data, error } = await supabase
    .from('ingresos')
    .select('id, fecha, cantidad, cantidad_restante, ancho, largo, factor_conversion, documento_referencia')
    .eq('material_id', materialId)
    .eq('almacen_id', almacenId)
    .gt('cantidad_restante', 0)
    .order('fecha')
  if (error) throw error
  return data
}

/** Cuántos de MIS vales tuvieron una novedad (se aprobaron, rechazaron o
 * atendieron) que todavía no vi. Es una pregunta distinta de "cuántos de
 * los míos siguen esperando una decisión" (contarValesPendientes,
 * dashboardService.js) — por eso el filtro de estado es el opuesto: acá
 * son los que YA tuvieron una decisión, no los que la siguen esperando.
 * `supervisor_id` se filtra explícito (no alcanza con RLS) porque quien
 * tiene vales.ver_todos vería todo el ruido de vales ajenos si no. */
export async function contarValesNovedades(supervisorId) {
  if (!supervisorId) return 0
  const { data, error } = await supabase
    .from('vales')
    .select('id, updated_at, visto_supervisor_en')
    .eq('supervisor_id', supervisorId)
    .in('estado', ['Aprobado', 'Rechazado', 'Parcialmente atendido', 'Atendido', 'Cerrado'])
  if (error) throw error
  return (data ?? []).filter((v) => !v.visto_supervisor_en || v.visto_supervisor_en < v.updated_at).length
}

/** Marca el vale como visto por su propio supervisor. Es una función (no un
 * UPDATE directo) porque vales_update por RLS solo deja al supervisor
 * editar su vale mientras sigue en Borrador — una vez enviado, ya no puede
 * hacer UPDATE sobre la fila. fn_marcar_vale_visto es security definer y
 * valida la autoría ella misma. */
export async function marcarValeVisto(id) {
  const { error } = await supabase.rpc('fn_marcar_vale_visto', { p_vale_id: id })
  if (error) throw error
}

export async function registrarSalida(payload) {
  const { data, error } = await supabase.from('salidas').insert(payload).select().single()
  if (error) throw error
  return data
}

/** Para el selector "¿a nombre de quién es este vale?" al cargarlo manualmente. */
export async function listarSupervisores() {
  const { data, error } = await supabase.rpc('fn_listar_supervisores')
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

/** Stock en tiempo real por almacén, para que el supervisor vea qué hay disponible antes de pedir.
 * Antes esto descartaba cualquier fila donde `materiales.estado` no fuera
 * exactamente 'activo' — pero si hay stock físico ya cargado (un ingreso
 * hecho), tiene sentido seguir mostrándolo aunque el material se haya
 * marcado inactivo después (eso solo debería impedir pedirlo de nuevo, no
 * esconder lo que ya existe en el almacén). */
export async function listarStockDisponible() {
  const { data, error } = await supabase
    .from('stock')
    .select('material_id, cantidad_disponible, almacenes(codigo, nombre), materiales(id, codigo, descripcion, unidad, estado)')
    .order('material_id')
  if (error) throw error
  return data
}

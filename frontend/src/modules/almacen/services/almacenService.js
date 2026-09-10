import { supabase } from '../../../services/supabaseClient'

export async function listarAlmacenes() {
  const { data, error } = await supabase.from('almacenes').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearAlmacen(payload) {
  const { data, error } = await supabase.from('almacenes').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function actualizarAlmacen(id, payload) {
  const { data, error } = await supabase.from('almacenes').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function eliminarAlmacen(id) {
  const { error } = await supabase.from('almacenes').delete().eq('id', id)
  if (error) throw error
}

export async function listarMaterialesActivos() {
  const { data, error } = await supabase
    .from('materiales')
    .select('id, codigo, descripcion, unidad, unidad_edp, tipo_conversion')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

/** Lotes (ingresos) de este material en este almacén que todavía tienen
 * saldo por entregar — para elegir de cuál sale una entrega cuando el
 * material necesita conversión de unidades (el factor varía por lote). */
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

const SELECT_STOCK =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad, stock_minimo_default), contratos(id, codigo, nombre)'

export async function listarStock() {
  const { data, error } = await supabase
    .from('stock')
    .select(SELECT_STOCK)
    .order('material_id')
  if (error) throw error
  return data
}

const SELECT_MOVIMIENTO =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), contratos(id, codigo, nombre), usuarios(id, nombre)'

export async function listarIngresos() {
  const { data, error } = await supabase
    .from('ingresos')
    .select(SELECT_MOVIMIENTO)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function crearIngreso(payload) {
  const { data, error } = await supabase.from('ingresos').insert(payload).select(SELECT_MOVIMIENTO).single()
  if (error) throw error
  return data
}

/**
 * Inserta muchos ingresos de una vez (carga inicial de stock desde Excel).
 * En lotes de 300: una sola fila por INSERT no tiene límite práctico aquí,
 * pero evita mandar de una un archivo enorme en un solo request.
 */
export async function crearIngresosMasivo(filas) {
  const LOTE = 300
  const creados = []
  for (let i = 0; i < filas.length; i += LOTE) {
    const { data, error } = await supabase
      .from('ingresos')
      .insert(filas.slice(i, i + LOTE))
      .select(SELECT_MOVIMIENTO)
    if (error) throw error
    creados.push(...data)
  }
  return creados
}

export async function listarAjustes() {
  const { data, error } = await supabase
    .from('ajustes')
    .select(SELECT_MOVIMIENTO)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function crearAjuste(payload) {
  const { data, error } = await supabase.from('ajustes').insert(payload).select(SELECT_MOVIMIENTO).single()
  if (error) throw error
  return data
}

const SELECT_SALIDA =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), frentes(id, codigo, nombre), contratos(id, codigo, nombre), usuarios(id, nombre)'

export async function listarSalidas() {
  const { data, error } = await supabase
    .from('salidas')
    .select(SELECT_SALIDA)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

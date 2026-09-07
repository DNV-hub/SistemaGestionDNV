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
    .select('id, codigo, descripcion, unidad')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

const SELECT_STOCK = '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad, stock_minimo_default)'

export async function listarStock() {
  const { data, error } = await supabase
    .from('stock')
    .select(SELECT_STOCK)
    .order('material_id')
  if (error) throw error
  return data
}

const SELECT_MOVIMIENTO = '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad)'

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

const SELECT_SALIDA = '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), frentes(id, codigo, nombre)'

export async function listarSalidas() {
  const { data, error } = await supabase
    .from('salidas')
    .select(SELECT_SALIDA)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

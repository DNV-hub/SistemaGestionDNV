import { supabase } from '../../../services/supabaseClient'

const SELECT_KARDEX =
  '*, materiales(id, codigo, descripcion, unidad), almacenes(id, codigo, nombre), usuarios(id, nombre), ' +
  'vales(id, numero, frentes(id, codigo, nombre), usuarios!supervisor_id(id, nombre))'

/** filtros: { materialId, almacenId, tipoMovimiento, desde, hasta } */
export async function listarKardex(filtros = {}) {
  let query = supabase.from('kardex').select(SELECT_KARDEX).order('fecha_hora', { ascending: false }).limit(300)

  if (filtros.materialId) query = query.eq('material_id', filtros.materialId)
  if (filtros.almacenId) query = query.eq('almacen_id', filtros.almacenId)
  if (filtros.tipoMovimiento) query = query.eq('tipo_movimiento', filtros.tipoMovimiento)
  if (filtros.desde) query = query.gte('fecha_hora', filtros.desde)
  if (filtros.hasta) query = query.lte('fecha_hora', `${filtros.hasta}T23:59:59`)

  const { data, error } = await query
  if (error) throw error
  return data
}

/** Igual que listarKardex pero sin el tope de 300 — solo para exportar. */
export async function listarKardexParaExportar(filtros = {}) {
  let query = supabase.from('kardex').select(SELECT_KARDEX).order('fecha_hora', { ascending: false })

  if (filtros.materialId) query = query.eq('material_id', filtros.materialId)
  if (filtros.almacenId) query = query.eq('almacen_id', filtros.almacenId)
  if (filtros.tipoMovimiento) query = query.eq('tipo_movimiento', filtros.tipoMovimiento)
  if (filtros.desde) query = query.gte('fecha_hora', filtros.desde)
  if (filtros.hasta) query = query.lte('fecha_hora', `${filtros.hasta}T23:59:59`)

  const { data, error } = await query
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

export async function listarAlmacenes() {
  const { data, error } = await supabase.from('almacenes').select('id, codigo, nombre').order('nombre')
  if (error) throw error
  return data
}

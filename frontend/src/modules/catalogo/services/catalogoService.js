import { supabase } from '../../../services/supabaseClient'

const SELECT_MATERIAL = '*, categorias(id, nombre), nombres_edp(id, nombre)'

export async function listarMateriales() {
  const { data, error } = await supabase.from('materiales').select(SELECT_MATERIAL).order('codigo')
  if (error) throw error
  return data
}

export async function listarCategorias() {
  const { data, error } = await supabase.from('categorias').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearCategoria(payload) {
  const { data, error } = await supabase.from('categorias').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function crearCategoriasEnLote(payloads) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from('categorias').insert(payloads).select()
  if (error) throw error
  return data
}

export async function listarNombresEdp() {
  const { data, error } = await supabase.from('nombres_edp').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearNombreEdp(payload) {
  const { data, error } = await supabase.from('nombres_edp').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function crearNombresEdpEnLote(payloads) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from('nombres_edp').insert(payloads).select()
  if (error) throw error
  return data
}

export async function crearMaterial(payload) {
  const { data, error } = await supabase
    .from('materiales')
    .insert(payload)
    .select(SELECT_MATERIAL)
    .single()

  if (error) throw error
  return data
}

export async function crearMaterialesEnLote(payloads) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from('materiales').insert(payloads).select(SELECT_MATERIAL)
  if (error) throw error
  return data
}

export async function eliminarMaterial(id) {
  const { error } = await supabase.from('materiales').delete().eq('id', id)
  if (error) throw error
}

export async function actualizarMaterial(id, payload) {
  const { data, error } = await supabase
    .from('materiales')
    .update(payload)
    .eq('id', id)
    .select(SELECT_MATERIAL)
    .single()

  if (error) throw error
  return data
}

/** Actualiza solo tipo_conversion de varios materiales por id (viene del
 * importador: exportar catálogo, corregir la columna CONVERSION en Excel,
 * reimportar). Una petición por fila — nada masivo, y así cada una puede
 * fallar sin tirar abajo el resto. */
export async function actualizarConversionEnLote(actualizaciones) {
  const resultados = []
  for (const { id, tipo_conversion } of actualizaciones) {
    const { error } = await supabase.from('materiales').update({ tipo_conversion }).eq('id', id)
    resultados.push({ id, ok: !error, error: error?.message ?? null })
  }
  return resultados
}

/** Misma idea que actualizarConversionEnLote, pero para descripción/unidad de
 * almacén — viene del importador de ingresos masivos: si el Excel de stock
 * trae DESCRIPCION ALMACEN/UNIDAD ALMACEN y no coincide con lo que ya tenía
 * el material, se corrige ahí mismo (esas planillas son las que el usuario
 * mantiene al día con nombres completos, con dimensiones incluidas). */
export async function actualizarDescripcionEnLote(actualizaciones) {
  const resultados = []
  for (const { id, descripcion, unidad } of actualizaciones) {
    const payload = {}
    if (descripcion !== undefined) payload.descripcion = descripcion
    if (unidad !== undefined) payload.unidad = unidad
    const { error } = await supabase.from('materiales').update(payload).eq('id', id)
    resultados.push({ id, ok: !error, error: error?.message ?? null })
  }
  return resultados
}

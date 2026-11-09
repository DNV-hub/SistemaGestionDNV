import { supabase } from '../../../services/supabaseClient'

export async function listarFrentes() {
  const { data, error } = await supabase.from('frentes').select('id, codigo, nombre').order('codigo')
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

/** filtros: { frenteId, desde, hasta } — salidas reales entregadas (no reservas ni solicitudes).
 * vale_detalle(vale_id, vales(usuarios!supervisor_id(nombre))) trae quién lo
 * pidió — una salida directa/manual (sin vale) no tiene nada acá. */
export async function listarSalidasReporte({ frenteId, desde, hasta } = {}) {
  let query = supabase
    .from('salidas')
    .select(
      'fecha, cantidad, frentes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), contratos(nombre), ' +
        'vale_detalle(vale_id, vales(usuarios!supervisor_id(nombre)))'
    )
    .order('fecha')

  if (frenteId) query = query.eq('frente_id', frenteId)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query
  if (error) throw error
  return data
}

/** filtros: { frenteId, desde, hasta } — devoluciones ya RECIBIDAS (confirmadas
 * por Almacén) en el mismo rango: lo que el frente devolvió no cuenta como
 * material que usó, así que se resta de "Salidas por frente" (pedido del
 * usuario: el reporte debe reflejar el consumo neto, no el bruto que salió
 * del almacén). Las devoluciones "Solicitada" (todavía sin confirmar) o
 * "Rechazada" (Almacén determinó que en realidad sí se consumió/dañó) no
 * cuentan acá — solo las que Almacén ya confirmó que volvieron de verdad. */
export async function listarDevolucionesReporte({ frenteId, desde, hasta } = {}) {
  let query = supabase
    .from('devoluciones')
    .select(
      'fecha, cantidad, frente_id, material_id, frentes(codigo, nombre), materiales(codigo, descripcion, unidad), ' +
        'supervisor:usuarios!supervisor_id(nombre)'
    )
    .eq('estado', 'Recibida')
    .order('fecha')

  if (frenteId) query = query.eq('frente_id', frenteId)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query
  if (error) throw error
  return data
}

/** filtros: { frenteId, desde, hasta } — salidas que además tienen cantidad
 * convertida (cantidad_edp): materiales con tipo_conversion ≠ 'ninguna'. */
export async function listarSalidasEdp({ frenteId, desde, hasta } = {}) {
  let query = supabase
    .from('salidas')
    .select(
      'fecha, cantidad, cantidad_edp, frentes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad, unidad_edp, nombres_edp(id, nombre)), ' +
        'vale_detalle(vale_id, vales(usuarios!supervisor_id(nombre)))'
    )
    .not('cantidad_edp', 'is', null)
    .order('fecha')

  if (frenteId) query = query.eq('frente_id', frenteId)
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query
  if (error) throw error
  return data
}

/**
 * procura_vs_consumo de TODOS los frentes (sin filtrar por frente_id) — es
 * una vista, no soporta el embedding de PostgREST, así que frentes y
 * materiales se resuelven aparte con listarFrentes()/materiales activos.
 */
export async function listarComparacionGeneral() {
  const { data, error } = await supabase.from('procura_vs_consumo').select('*')
  if (error) throw error
  return data
}

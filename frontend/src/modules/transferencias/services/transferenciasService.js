import { supabase } from '../../../services/supabaseClient'

// transferencias tiene dos FKs a usuarios (supervisor_id y confirmada_por),
// hay que desambiguar el embedding de PostgREST con !columna — mismo patrón
// que devolucionesService.js.
const SELECT_TRANSFERENCIA =
  '*, materiales(id, codigo, descripcion, unidad), ' +
  'frente_origen:frentes!frente_origen_id(id, codigo, nombre), frente_destino:frentes!frente_destino_id(id, codigo, nombre), ' +
  'supervisor:usuarios!supervisor_id(id, nombre), confirmante:usuarios!confirmada_por(id, nombre)'

export async function crearTransferencia(payload) {
  const { data, error } = await supabase.from('transferencias').insert(payload).select(SELECT_TRANSFERENCIA).single()
  if (error) throw error
  return data
}

/** Cuánto mide cada unidad de un material (barra de 5 m, malla de 12 m2…),
 * para poder transferir por ML/M2 en vez de por unidades. null si el material
 * no tiene conversión. */
export async function obtenerInfoConversion(materialId) {
  const { data, error } = await supabase.rpc('fn_info_conversion_material', { p_material_id: materialId })
  if (error) throw error
  const r = data?.[0]
  if (!r || r.tipo_conversion === 'ninguna' || !(Number(r.factor) > 0)) return null
  return {
    tipo: r.tipo_conversion,
    factor: Number(r.factor),
    unidad: r.unidad_edp || (r.tipo_conversion === 'area' ? 'M2' : 'ML'),
  }
}

/** Cuánto figura en un frente de ese material (unidades de almacén) y cuánto
 * ya está comprometido en transferencias que Almacén todavía no confirma. */
export async function obtenerStockEnFrente(frenteId, materialId) {
  const { data, error } = await supabase.rpc('fn_stock_en_frente', { p_frente_id: frenteId, p_material_id: materialId })
  if (error) throw error
  const r = data?.[0]
  return r ? { disponible: Number(r.disponible), comprometido: Number(r.comprometido) } : null
}

/** Lo que compone ese stock: cada salida (con su fecha y su vale) y los
 * descuentos por devoluciones / transferencias confirmadas (en negativo). */
export async function obtenerMovimientosEnFrente(frenteId, materialId) {
  const { data, error } = await supabase.rpc('fn_movimientos_en_frente', { p_frente_id: frenteId, p_material_id: materialId })
  if (error) throw error
  return (data ?? []).map((m) => ({ tipo: m.tipo, fecha: m.fecha, documento: m.documento, cantidad: Number(m.cantidad) }))
}

/** RLS ya filtra: un Supervisor solo ve las suyas, Almacén/Planeamiento ven todas. */
export async function listarTransferencias() {
  const { data, error } = await supabase
    .from('transferencias')
    .select(SELECT_TRANSFERENCIA)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

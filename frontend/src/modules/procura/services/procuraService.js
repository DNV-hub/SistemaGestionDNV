import { supabase } from '../../../services/supabaseClient'

const SELECT_METRADO =
  '*, nombres_edp(id, nombre), frentes(id, codigo, nombre), usuarios(id, nombre)'

/** Una fila vigente por cada combinación frente+material, de todos los frentes. */
export async function listarMetradosVigentes() {
  const { data, error } = await supabase
    .from('metrados_procura')
    .select(SELECT_METRADO)
    .eq('vigente', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Todas las versiones (vigentes y superadas) de un frente — es el reporte
 * de modificaciones: cada cambio de cantidad_contractual o cantidad_procura
 * ya crea una fila nueva vía trg_metrados_versionar (nunca se actualiza en
 * sitio), así que metrados_procura ES el historial.
 */
export async function listarHistorialFrente(frenteId) {
  const { data, error } = await supabase
    .from('metrados_procura')
    .select(SELECT_METRADO)
    .eq('frente_id', frenteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// La zona solo viaja cuando tiene valor ('' = sin zona = el valor por defecto de
// la base), así un metrado sin zonas se guarda exactamente como siempre.
const limpiarZona = (p) =>
  Object.fromEntries(Object.entries(p).filter(([k, v]) => !((k === 'zona' && !v) || (k === 'orden' && (v === null || v === undefined)))))

export async function crearVersionMetrado(payload) {
  const { data, error } = await supabase
    .from('metrados_procura')
    .insert(limpiarZona(payload))
    .select(SELECT_METRADO)
    .single()
  if (error) throw error
  return data
}

/** Carga masiva: cada fila crea una nueva versión (trg_metrados_versionar se encarga del resto). */
export async function crearVersionesMetradoEnLote(payloads) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from('metrados_procura').insert(payloads.map(limpiarZona)).select(SELECT_METRADO)
  if (error) throw error
  return data
}

export async function listarComparacion(frenteId) {
  const { data, error } = await supabase.from('procura_vs_consumo').select('*').eq('frente_id', frenteId)
  if (error) throw error
  return data
}

/** Todos los frentes, sin importar su estado — cargar un metrado Procura no
 * debería depender de si el frente está activo ahora mismo: un frente
 * paralizado o incluso cerrado puede necesitar su metrado corregido, y uno
 * planificado/próximo puede necesitar el suyo cargado de antemano, antes de
 * arrancar. El filtro por estado, si hace falta, se aplica en la pantalla. */
export async function listarFrentes() {
  const { data, error } = await supabase
    .from('frentes')
    .select('id, codigo, nombre, area, sector, estado, contrato_id, contratos(id, codigo, nombre)')
    .order('codigo')
  if (error) throw error
  return data
}

/** Frentes con consumo/reserva de un grupo EDP que todavía no tiene metrado vigente (fn_evaluar_alertas). */
export async function listarAlertasNoPrevisto() {
  const { data, error } = await supabase
    .from('alertas')
    .select('frente_id, descripcion_edp_id')
    .eq('tipo', 'material_no_previsto')
    .eq('estado', 'activa')
  if (error) throw error
  return data
}

/** Trae el catálogo con su grupo EDP — de acá el store deriva la lista de
 * Nombres EDP (un grupo puede cubrir varios materiales/longitudes). */
export async function listarMaterialesActivos() {
  const { data, error } = await supabase
    .from('materiales')
    .select('id, codigo, descripcion, unidad, unidad_edp, descripcion_edp_id, observaciones, nombres_edp(id, nombre)')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

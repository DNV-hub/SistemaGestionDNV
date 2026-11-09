import { supabase } from '../../../services/supabaseClient'

export async function listarFrentes() {
  const { data, error } = await supabase
    .from('frentes')
    .select('*, contratos(id, codigo, nombre)')
    .order('codigo')
  if (error) throw error
  return data
}

/** Un solo frente, para la Ficha (shell que carga una vez y reparte por
 * prop a cada pestaña — ver FichaFrenteView.vue). */
export async function obtenerFrente(id) {
  const { data, error } = await supabase.from('frentes').select(SELECT_FRENTE).eq('id', id).single()
  if (error) throw error
  return data
}

/** El Reporte Diario de Campo deriva el sector del frente (rdc.sectorIdDeFrente,
 * lee frentes.sector_id) — un frente creado sin sector_id bloquea al
 * supervisor al cerrar su reporte ("falta completar: el sector"), aunque el
 * campo de texto libre `sector` de este formulario esté lleno. Por eso el
 * modal necesita esta lista para el selector real. */
export async function listarSectores() {
  const { data, error } = await supabase.from('sectores').select('id, nombre').eq('activo', true).order('nombre')
  if (error) throw error
  return data
}

export async function crearSector(nombre) {
  const { data, error } = await supabase.from('sectores').insert({ nombre }).select('id, nombre').single()
  if (error) throw error
  return data
}

const SELECT_FRENTE = '*, contratos(id, codigo, nombre)'

export async function crearFrente(payload) {
  const { data, error } = await supabase.from('frentes').insert(payload).select(SELECT_FRENTE).single()
  if (error) throw error
  return data
}

export async function actualizarFrente(id, payload) {
  const { data, error } = await supabase.from('frentes').update(payload).eq('id', id).select(SELECT_FRENTE).single()
  if (error) throw error
  return data
}

export async function eliminarFrente(id) {
  const { error } = await supabase.from('frentes').delete().eq('id', id)
  if (error) throw error
}

/** Frentes con al menos un metrado Procura vigente — para la tarjeta de la
 * lista ("Con procura" / "Sin procura"), sin traer los metrados en sí.
 * Un Set, no un Map: acá solo importa si existe, no cuántos ni cuáles. */
export async function listarFrentesConMetradoProcura() {
  const { data, error } = await supabase.from('metrados_procura').select('frente_id').eq('vigente', true)
  if (error) throw error
  return new Set(data.map((r) => r.frente_id))
}

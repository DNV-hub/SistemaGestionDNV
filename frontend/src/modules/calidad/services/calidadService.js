import { supabase } from '../../../services/supabaseClient'

// Solo lectura: Calidad nunca escribe en la base. Solo cuentan los reportes
// enviados (estado 'Finalizado'); los borradores se ignoran.

const PAGINA = 1000

/** Todas las filas de una consulta, de 1000 en 1000 (el tope de PostgREST). */
async function todas(armar) {
  const filas = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar().range(desde, desde + PAGINA - 1)
    if (error) throw error
    filas.push(...data)
    if (data.length < PAGINA) return filas
  }
}

export async function listarFrentes() {
  const { data, error } = await supabase.from('frentes').select('id, nombre, estado').order('nombre')
  if (error) throw error
  return data
}

const COLUMNAS_ELEMENTO = 'id, reporte_id, elemento, actividad, tipo, zona, codigo, ubicacion, cantidad, unidad, ancho, largo, area_m2, diametro'

/** Lo que necesitan los cinco controles de un frente, en cuatro consultas:
 * reportes enviados, sus elementos, la biblioteca de pernos y las líneas de
 * bitácora que mencionan bolsas (respaldo cuando el campo quedó vacío). */
export async function cargarFrente(frenteId) {
  const [reportes, biblioteca] = await Promise.all([
    todas(() =>
      supabase
        .from('rdc_reportes')
        .select('id, fecha, iny_bolsas_cemento')
        .eq('frente_id', frenteId)
        .eq('estado', 'Finalizado')
        .is('eliminado_at', null)
        .order('id')
    ),
    todas(() =>
      supabase.from('rdc_pernos_biblioteca').select('codigo, zona, ubicacion, diametro, longitud').eq('frente_id', frenteId).order('id')
    ),
  ])
  if (!reportes.length) return { reportes, elementos: [], biblioteca, bitacora: [] }
  const [elementos, bitacora] = await Promise.all([
    todas(() =>
      supabase
        .from('rdc_reporte_elementos')
        .select(`${COLUMNAS_ELEMENTO}, rdc_reportes!inner(frente_id, estado, eliminado_at)`)
        .eq('rdc_reportes.frente_id', frenteId)
        .eq('rdc_reportes.estado', 'Finalizado')
        .is('rdc_reportes.eliminado_at', null)
        .in('elemento', ['Perno', 'Malla', 'Cable'])
        .order('id')
    ),
    todas(() =>
      supabase
        .from('rdc_reporte_bitacora')
        .select('id, reporte_id, actividad, rdc_reportes!inner(frente_id, estado, eliminado_at)')
        .eq('rdc_reportes.frente_id', frenteId)
        .eq('rdc_reportes.estado', 'Finalizado')
        .is('rdc_reportes.eliminado_at', null)
        .ilike('actividad', '%bolsa%')
        .order('id')
    ),
  ])
  return { reportes, elementos, biblioteca, bitacora }
}

/** Totales de todos los frentes para "Comparar frentes" (se pide recién al
 * abrir esa vista). */
export async function cargarComparacion() {
  const [frentes, reportes, elementos, biblioteca] = await Promise.all([
    listarFrentes(),
    todas(() =>
      supabase.from('rdc_reportes').select('id, frente_id, fecha, iny_bolsas_cemento').eq('estado', 'Finalizado').is('eliminado_at', null).order('id')
    ),
    todas(() =>
      supabase
        .from('rdc_reporte_elementos')
        .select('id, reporte_id, elemento, actividad, codigo, cantidad, area_m2, rdc_reportes!inner(estado, eliminado_at)')
        .eq('rdc_reportes.estado', 'Finalizado')
        .is('rdc_reportes.eliminado_at', null)
        .in('elemento', ['Perno', 'Malla', 'Cable'])
        .order('id')
    ),
    todas(() => supabase.from('rdc_pernos_biblioteca').select('id, frente_id').order('id')),
  ])
  return { frentes, reportes, elementos, biblioteca }
}

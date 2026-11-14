import { supabase } from '../../../services/supabaseClient'

// Puramente informativo, como en el RDC original: esto nunca debe
// interferir con ningún formulario ni envío — es solo una consulta de
// lectura, paginada.

/** Traduce la etiqueta PERF/INY/MALLA embebida en el nombre del archivo
 * (p. ej. "Sketch_OPB_2026-09-09_PERF_1.jpg") a texto legible. Si el nombre
 * no trae una etiqueta reconocible (sketches subidos antes de este cambio),
 * no muestra nada — mejor vacío que una traducción incorrecta. */
export function etiquetaDesdeNombre(nombre) {
  if (!nombre) return ''
  const m = /_([A-Z]+(?:-[A-Z]+)*)_\d+\.jpe?g$/i.exec(nombre)
  if (!m) return ''
  const mapa = { PERF: 'Perforación', INY: 'Inyección', MALLA: 'Malla' }
  const partes = m[1].toUpperCase().split('-')
  const traducidas = partes.map((p) => mapa[p]).filter(Boolean)
  if (traducidas.length !== partes.length) return ''
  return traducidas.join(' + ')
}

const ENVIOS_POR_PAGINA = 6

function blobABase64(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => rechazar(lector.error)
    lector.readAsDataURL(blob)
  })
}

/** Una página de sketches de un frente. `pagina` es un índice 0-based.
 * Desde nov-2026 se leen de Supabase (los envíos que la app sube a
 * `rdc-fotos`), ya no del flujo de Power Automate contra SharePoint. Se
 * devuelve la misma forma de antes: { fotos: [{ nombre, contenidoArchivo }], hayMas }. */
export async function obtenerPaginaSketches(frenteNombre, pagina) {
  const desde = pagina * ENVIOS_POR_PAGINA
  const { data: envios, error } = await supabase
    .from('rdc_fotos_envios')
    .select('id, fecha, archivos')
    .eq('frente_nombre', frenteNombre)
    .eq('categoria', 'Sketch')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .range(desde, desde + ENVIOS_POR_PAGINA) // pide uno de más para saber si hay otra página
  if (error) throw error

  const hayMas = envios.length > ENVIOS_POR_PAGINA
  const fotos = []
  for (const envio of envios.slice(0, ENVIOS_POR_PAGINA)) {
    for (const archivo of envio.archivos ?? []) {
      const { data: blob, error: e } = await supabase.storage.from('rdc-fotos').download(archivo.path)
      if (e) continue // una imagen que no baja no debe tumbar la vista entera
      fotos.push({ nombre: archivo.nombreArchivo, contenidoArchivo: await blobABase64(blob) })
    }
  }
  return { fotos, hayMas }
}

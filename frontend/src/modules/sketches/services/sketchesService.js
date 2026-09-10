const URL_SKETCH_PREVIEW = import.meta.env.VITE_POWER_AUTOMATE_SKETCHES_URL

// Puramente informativo, como en el RDC original: esto nunca debe
// interferir con ningún formulario ni envío — es solo una consulta de
// lectura contra SharePoint, paginada.

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

/** Una página de sketches de un frente. `pagina` es un índice 0-based, tal
 * como lo espera el flujo. */
export async function obtenerPaginaSketches(frenteNombre, pagina) {
  const respuesta = await fetch(URL_SKETCH_PREVIEW, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frente: frenteNombre, pagina }),
  })
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
  const datos = await respuesta.json()
  return {
    fotos: Array.isArray(datos.fotos) ? datos.fotos : [],
    hayMas: !!datos.hayMas,
  }
}

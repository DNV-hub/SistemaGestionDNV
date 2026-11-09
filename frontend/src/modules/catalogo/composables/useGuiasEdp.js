import { ref } from 'vue'
import { crearGuiaEdp, listarGuiasEdp } from '../services/catalogoService'

// Descripciones por guía de cada nombre EDP (nombres_edp_guias): son OPCIONES
// para sugerir el nombre EDP cuando alguien escribe lo que dice la guía; no
// limitan nada — se puede dejar otro nombre EDP o ninguno. Se cargan una sola
// vez y se comparten entre el ingreso de Almacén y el formulario de Catálogo.
const guias = ref([])
let cargado = false
let cargando = null

export function cargarGuiasEdp() {
  if (cargado) return Promise.resolve()
  if (!cargando) {
    cargando = listarGuiasEdp()
      .then((filas) => {
        guias.value = filas.map((f) => ({
          nombreEdpId: f.nombre_edp_id,
          nombre: f.nombres_edp?.nombre ?? '',
          guia: f.descripcion,
          clave: normalizar(f.descripcion),
          tokens: tokens(f.descripcion),
        }))
        cargado = true
      })
      .catch((e) => {
        // Sin sugerencias el formulario sigue funcionando igual.
        console.error('No se pudieron cargar las descripciones por guía', e)
        cargando = null
      })
  }
  return cargando
}

function normalizar(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/,/g, '.')
    .replace(/[^A-Z0-9/.]+/g, ' ')
    .trim()
}
function tokens(s) {
  return new Set(normalizar(s).split(' ').filter((t) => t.length > 1))
}

/** Guarda lo que dijo la guía como una opción más de ese nombre EDP, para que
 * la próxima vez se sugiera sola. No es crítico: si falla, el material igual
 * queda creado. */
export async function registrarGuiaEdp(nombreEdpId, nombre, descripcion) {
  const texto = String(descripcion ?? '').trim()
  if (!nombreEdpId || !texto) return
  const clave = normalizar(texto)
  if (guias.value.some((g) => g.nombreEdpId === nombreEdpId && g.clave === clave)) return
  try {
    await crearGuiaEdp({ nombre_edp_id: nombreEdpId, descripcion: texto })
    const nombreFinal = nombre || guias.value.find((g) => g.nombreEdpId === nombreEdpId)?.nombre
    if (nombreFinal) guias.value.push({ nombreEdpId, nombre: nombreFinal, guia: texto, clave, tokens: tokens(texto) })
  } catch (e) {
    console.error('No se pudo guardar la descripción por guía', e)
  }
}

/** Nombres EDP sugeridos para lo que se escribió: [{ nombreEdpId, nombre, guia, puntaje }]
 * ordenados de mejor a peor, uno por nombre EDP. */
export function sugerirNombresEdp(texto, maximo = 4) {
  const q = normalizar(texto)
  if (q.length < 3) return []
  const qt = tokens(texto)
  const mejor = new Map()
  for (const g of guias.value) {
    let puntaje = 0
    if (g.clave === q) puntaje = 10
    else if (g.clave.includes(q) || (g.clave.length >= 10 && q.includes(g.clave))) puntaje = 6
    else if (qt.size) {
      let comunes = 0
      for (const t of qt) if (g.tokens.has(t)) comunes++
      const ratio = comunes / Math.max(qt.size, g.tokens.size)
      if (ratio >= 0.6) puntaje = 3 * ratio
    }
    if (puntaje > 0) {
      const previo = mejor.get(g.nombreEdpId)
      if (!previo || puntaje > previo.puntaje) mejor.set(g.nombreEdpId, { nombreEdpId: g.nombreEdpId, nombre: g.nombre, guia: g.guia, puntaje })
    }
  }
  return [...mejor.values()].sort((a, b) => b.puntaje - a.puntaje).slice(0, maximo)
}

export { guias as guiasEdp }

// "Usados recientemente" en el selector de material (05-selector-material.html)
// — por dispositivo, en localStorage: no hace falta ninguna tabla nueva ni
// sincronizar nada, es solo una comodidad de UI para no tener que buscar
// siempre los mismos materiales.
const CLAVE = 'dnv_materiales_recientes_v1'
const MAXIMO = 8

export function obtenerRecientes() {
  try {
    const crudo = localStorage.getItem(CLAVE)
    return crudo ? JSON.parse(crudo) : []
  } catch {
    return []
  }
}

export function registrarReciente(materialId) {
  try {
    const actuales = obtenerRecientes().filter((id) => id !== materialId)
    actuales.unshift(materialId)
    localStorage.setItem(CLAVE, JSON.stringify(actuales.slice(0, MAXIMO)))
  } catch {
    // localStorage no disponible (modo privado, cuota llena…): sin drama,
    // simplemente no queda memoria de "recientes" esta vez.
  }
}

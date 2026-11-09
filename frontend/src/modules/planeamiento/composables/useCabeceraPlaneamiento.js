import { onBeforeUnmount, reactive, watchEffect } from 'vue'

// Estado de la cabecera del módulo (botón naranja + menú ⋯). Cada vista
// registra lo suyo mientras está montada; la cabecera vive en PlaneamientoView.
export const cabeceraPlaneamiento = reactive({ cta: null, menu: [], duenio: null })

/**
 * @param {() => ({texto: string, ejecutar: Function, visible?: boolean, deshabilitado?: boolean} | null)} obtenerCta
 * @param {() => Array<{texto: string, ejecutar: Function, deshabilitado?: boolean}>} obtenerMenu
 */
export function usarCabeceraPlaneamiento(obtenerCta, obtenerMenu = () => []) {
  const duenio = Symbol('cabecera')
  const detener = watchEffect(() => {
    cabeceraPlaneamiento.duenio = duenio
    cabeceraPlaneamiento.cta = obtenerCta()
    cabeceraPlaneamiento.menu = obtenerMenu()
  })
  onBeforeUnmount(() => {
    detener()
    if (cabeceraPlaneamiento.duenio === duenio) {
      cabeceraPlaneamiento.cta = null
      cabeceraPlaneamiento.menu = []
      cabeceraPlaneamiento.duenio = null
    }
  })
}

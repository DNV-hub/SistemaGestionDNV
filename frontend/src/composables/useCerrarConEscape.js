import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue'

// Cierra un panel/ventana con la tecla Esc. Si hay varios abiertos a la vez
// (un panel sobre otro), Esc cierra solo el de encima, el último que se abrió.
const pila = []
let escuchando = false

function alTeclear(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || !pila.length) return
  const { cerrar, ignorarCampos } = pila[pila.length - 1]
  // Esc dentro de un desplegable lo cierra el propio navegador: no se suma.
  const el = e.target
  if (el?.tagName === 'SELECT') return
  if (ignorarCampos && (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA')) return
  e.preventDefault()
  cerrar()
}

/** `cerrar` por defecto emite el evento `cerrar` del componente. */
export function useCerrarConEscape(cerrar, { ignorarCampos = false } = {}) {
  const inst = getCurrentInstance()
  const entrada = { cerrar: cerrar ?? (() => inst?.emit('cerrar')), ignorarCampos }
  onMounted(() => {
    pila.push(entrada)
    if (!escuchando) {
      document.addEventListener('keydown', alTeclear)
      escuchando = true
    }
  })
  onBeforeUnmount(() => {
    const i = pila.indexOf(entrada)
    if (i >= 0) pila.splice(i, 1)
  })
}

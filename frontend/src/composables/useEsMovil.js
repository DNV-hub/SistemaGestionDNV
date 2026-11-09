import { onBeforeUnmount, ref } from 'vue'

// ¿Pantalla de celular/tablet? Mismo corte que usa App.vue para cambiar el
// rail de escritorio por la barra inferior (1024px).
export function useEsMovil(consulta = '(max-width: 1024px)') {
  const mq = window.matchMedia(consulta)
  const esMovil = ref(mq.matches)
  const alCambiar = (e) => {
    esMovil.value = e.matches
  }
  mq.addEventListener('change', alCambiar)
  onBeforeUnmount(() => mq.removeEventListener('change', alCambiar))
  return esMovil
}

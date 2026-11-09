<script setup>
// Ventana de detalle de Calidad: se monta en <body> (lleva .cal para tener
// los tokens), cierra con ✕, clic fuera o Esc, y mantiene el foco adentro
// mientras está abierta. Al cerrar, el foco vuelve a quien la abrió.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  titulo: { type: String, required: true },
  subtitulo: { type: String, default: '' },
})
const emit = defineEmits(['cerrar'])

const caja = ref(null)
const idTitulo = `cal-md-${Math.random().toString(36).slice(2, 8)}`
let previo = null

const enfocables = () =>
  [...(caja.value?.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])') ?? [])].filter((el) => !el.disabled)

function alTeclear(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('cerrar')
  } else if (e.key === 'Tab') {
    const els = enfocables()
    if (!els.length) return e.preventDefault()
    const [primero, ultimo] = [els[0], els.at(-1)]
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primero.focus()
    }
  }
}

onMounted(async () => {
  previo = document.activeElement
  document.body.style.overflow = 'hidden'
  await nextTick()
  enfocables()[0]?.focus()
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  previo?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="cal cal-ov" @mousedown.self="emit('cerrar')" @keydown="alTeclear">
      <div ref="caja" class="cal-md" role="dialog" aria-modal="true" :aria-labelledby="idTitulo">
        <div class="cal-mh">
          <div>
            <h2 :id="idTitulo">{{ titulo }}</h2>
            <span v-if="subtitulo">{{ subtitulo }}</span>
          </div>
          <button type="button" class="cal-x" aria-label="Cerrar" @click="emit('cerrar')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Campo de texto con lista desplegable: al enfocar o escribir se abre y
// filtra (sin distinguir mayúsculas); clic o Enter elige; Esc cierra y
// restaura el frente que estaba.
import { computed, ref, watch } from 'vue'

const props = defineProps({
  frentes: { type: Array, required: true },
  modelValue: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

const texto = ref('')
const abierto = ref(false)
const activo = ref(0)
const input = ref(null)
const lista = ref(null)
const idLista = `cal-frentes-${Math.random().toString(36).slice(2, 8)}`

const actual = computed(() => props.frentes.find((f) => f.id === props.modelValue) ?? null)
watch(actual, (f) => (texto.value = f?.nombre ?? ''), { immediate: true })

const filtrados = computed(() => {
  const q = texto.value.trim().toLowerCase()
  // Recién enfocado, el texto es el frente actual: se muestra la lista completa.
  if (!q || q === actual.value?.nombre.toLowerCase()) return props.frentes
  return props.frentes.filter((f) => f.nombre.toLowerCase().includes(q))
})

function abrir() {
  abierto.value = true
  activo.value = Math.max(0, filtrados.value.findIndex((f) => f.id === props.modelValue))
}
function cerrar(restaurar = true) {
  abierto.value = false
  if (restaurar) texto.value = actual.value?.nombre ?? ''
}
function elegir(f) {
  emit('update:modelValue', f.id)
  texto.value = f.nombre
  cerrar(false)
  input.value?.blur()
}
function alEnfocar(e) {
  e.target.select()
  abrir()
}
function alEscribir() {
  abierto.value = true
  activo.value = 0
}
function alTeclear(e) {
  if (e.key === 'Escape') {
    cerrar()
    input.value?.blur()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const f = filtrados.value[activo.value]
    if (f) elegir(f)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!abierto.value) return abrir()
    const n = filtrados.value.length
    if (!n) return
    activo.value = (activo.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    lista.value?.children[activo.value]?.scrollIntoView({ block: 'nearest' })
  }
}
// Al salir del campo (clic fuera o Tab) se cierra sin cambiar de frente.
function alSalir() {
  setTimeout(() => abierto.value && cerrar(), 120)
}
</script>

<template>
  <div class="cal-fcb">
    <label class="cal-fsel">
      <small>FRENTE</small>
      <input
        ref="input"
        v-model="texto"
        type="text"
        autocomplete="off"
        role="combobox"
        aria-label="Frente: escribe para buscar"
        aria-autocomplete="list"
        :aria-expanded="abierto"
        :aria-controls="idLista"
        :aria-activedescendant="abierto && filtrados[activo] ? `${idLista}-${activo}` : undefined"
        @focus="alEnfocar"
        @input="alEscribir"
        @keydown="alTeclear"
        @blur="alSalir"
      />
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </label>
    <ul v-show="abierto" :id="idLista" ref="lista" class="cal-fl" role="listbox" aria-label="Frentes">
      <li
        v-for="(f, i) in filtrados"
        :id="`${idLista}-${i}`"
        :key="f.id"
        role="option"
        :aria-selected="f.id === modelValue"
        :class="{ on: i === activo, act: f.id === modelValue }"
        @mousedown.prevent="elegir(f)"
        @mousemove="activo = i"
      >
        {{ f.nombre }}
      </li>
      <li v-if="!filtrados.length" class="em" role="presentation">Sin resultados</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'

// Mismo patrón que components/BuscadorMaterial.vue, pero sobre la lista de
// Nombres EDP (grupos) en vez del catálogo de materiales — Procura ya no
// elige un material puntual, elige un grupo (ver 20260930100000).
const props = defineProps({
  modelValue: { type: String, default: '' },
  grupos: { type: Array, default: () => [] }, // [{ id, nombre, unidad_edp }]
  placeholder: { type: String, default: 'Escribe el Nombre EDP…' },
})

const emit = defineEmits(['update:modelValue'])

const query = ref('')
const abierto = ref(false)
// Índice resaltado dentro de `filtrados` — con flechas se mueve, con mouse
// se sigue (mouseenter), y Enter/Tab confirman lo que esté resaltado. Antes
// este buscador solo se podía usar con mouse: Tab saltaba al siguiente
// campo sin elegir nada, y Enter no hacía nada.
const resaltado = ref(-1)
const opcionEls = ref([])

const grupoSeleccionado = computed(() => props.grupos.find((g) => g.id === props.modelValue) ?? null)

watch(
  grupoSeleccionado,
  (g) => {
    query.value = g ? g.nombre : ''
  },
  { immediate: true }
)

const filtrados = computed(() => {
  const q = query.value.trim().toLowerCase()
  const lista = !q ? props.grupos : props.grupos.filter((g) => g.nombre.toLowerCase().includes(q))
  return lista.slice(0, 30)
})

function onInput() {
  abierto.value = true
  resaltado.value = 0
  if (props.modelValue) emit('update:modelValue', '')
}

function onFocus() {
  abierto.value = true
  resaltado.value = filtrados.value.length ? 0 : -1
}

function elegir(g) {
  emit('update:modelValue', g.id)
  abierto.value = false
}

function onBlur() {
  abierto.value = false
  query.value = grupoSeleccionado.value ? grupoSeleccionado.value.nombre : ''
}

function moverResaltado(delta) {
  if (!abierto.value || !filtrados.value.length) return
  const total = filtrados.value.length
  resaltado.value = (resaltado.value + delta + total) % total
  nextTick(() => opcionEls.value[resaltado.value]?.scrollIntoView({ block: 'nearest' }))
}

function elegirResaltado() {
  if (!abierto.value) return
  const g = filtrados.value[resaltado.value] ?? filtrados.value[0]
  if (g) elegir(g)
}

function onEscape() {
  abierto.value = false
  query.value = grupoSeleccionado.value ? grupoSeleccionado.value.nombre : ''
}
</script>

<template>
  <div class="buscador-edp">
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.down.prevent="moverResaltado(1)"
      @keydown.up.prevent="moverResaltado(-1)"
      @keydown.enter.prevent="elegirResaltado"
      @keydown.tab="elegirResaltado"
      @keydown.esc="onEscape"
    />
    <svg class="chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
    <ul v-if="abierto" class="opciones">
      <li
        v-for="(g, i) in filtrados"
        :key="g.id"
        :ref="(el) => (opcionEls[i] = el)"
        :class="{ resaltado: i === resaltado }"
        @mousedown.prevent="elegir(g)"
        @mouseenter="resaltado = i"
      >
        <span class="texto">{{ g.nombre }}</span>
        <span class="unidad">{{ g.unidad_edp }}</span>
      </li>
      <li v-if="!filtrados.length" class="vacio">Sin resultados</li>
    </ul>
  </div>
</template>

<style scoped>
.buscador-edp {
  position: relative;
}
.chevron {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  stroke: var(--color-text-muted);
  stroke-width: 1.8;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
input {
  width: 100%;
  padding: 0.5rem 1.8rem 0.5rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
.opciones {
  position: absolute;
  z-index: 20;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}
.opciones li {
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  cursor: pointer;
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
}
.texto {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unidad {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  flex-shrink: 0;
}
.opciones li:hover,
.opciones li.resaltado {
  background: var(--color-surface-2);
}
.opciones li.vacio {
  color: var(--color-text-muted);
  cursor: default;
}
.opciones li.vacio:hover {
  background: none;
}
</style>

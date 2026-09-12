<script setup>
import { computed, ref, watch } from 'vue'

// Mismo comportamiento que BuscadorMaterial (escribe y filtra, elige de una
// lista desplegable) pero genérico: sirve para cualquier lista de opciones
// con un id y una etiqueta — Frente, Supervisor, lo que haga falta — sin
// depender de la forma exacta de un material (código/descripción).
const props = defineProps({
  modelValue: { type: String, default: '' },
  opciones: { type: Array, default: () => [] }, // [{ value, etiqueta, sub? }]
  placeholder: { type: String, default: 'Escribe para buscar…' },
})

const emit = defineEmits(['update:modelValue'])

const query = ref('')
const abierto = ref(false)

const seleccionada = computed(() => props.opciones.find((o) => o.value === props.modelValue) ?? null)

watch(
  seleccionada,
  (o) => {
    query.value = o ? o.etiqueta : ''
  },
  { immediate: true }
)

const filtradas = computed(() => {
  const q = query.value.trim().toLowerCase()
  const lista = !q ? props.opciones : props.opciones.filter((o) => o.etiqueta.toLowerCase().includes(q))
  return lista.slice(0, 30)
})

function onInput() {
  abierto.value = true
  if (props.modelValue) emit('update:modelValue', '')
}

function elegir(o) {
  emit('update:modelValue', o.value)
  abierto.value = false
}

function onBlur() {
  abierto.value = false
  query.value = seleccionada.value ? seleccionada.value.etiqueta : ''
}
</script>

<template>
  <div class="buscador-simple">
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="abierto = true"
      @blur="onBlur"
    />
    <ul v-if="abierto" class="opciones">
      <li v-for="o in filtradas" :key="o.value" @mousedown.prevent="elegir(o)">
        <span>{{ o.etiqueta }}</span>
        <span v-if="o.sub" class="sub">{{ o.sub }}</span>
      </li>
      <li v-if="!filtradas.length" class="vacio">Sin resultados</li>
    </ul>
  </div>
</template>

<style scoped>
.buscador-simple {
  position: relative;
}
input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
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
  justify-content: space-between;
}
.opciones li:hover {
  background: var(--color-surface-2);
}
.opciones li.vacio {
  color: var(--color-text-muted);
  cursor: default;
}
.opciones li.vacio:hover {
  background: none;
}
.sub {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
</style>

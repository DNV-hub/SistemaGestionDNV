<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  materiales: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Escribe código o descripción…' },
})

const emit = defineEmits(['update:modelValue'])

const query = ref('')
const abierto = ref(false)

function etiqueta(m) {
  return `${m.codigo} — ${m.descripcion}`
}

const materialSeleccionado = computed(
  () => props.materiales.find((m) => m.id === props.modelValue) ?? null
)

watch(
  materialSeleccionado,
  (m) => {
    query.value = m ? etiqueta(m) : ''
  },
  { immediate: true }
)

const filtrados = computed(() => {
  const q = query.value.trim().toLowerCase()
  const lista = !q
    ? props.materiales
    : props.materiales.filter(
        (m) => m.codigo.toLowerCase().includes(q) || m.descripcion.toLowerCase().includes(q)
      )
  return lista.slice(0, 30)
})

function onInput() {
  abierto.value = true
  if (props.modelValue) emit('update:modelValue', '')
}

function elegir(m) {
  emit('update:modelValue', m.id)
  abierto.value = false
}

function onBlur() {
  // se cierra al perder foco; si no quedó nada seleccionado, limpia el texto
  abierto.value = false
  query.value = materialSeleccionado.value ? etiqueta(materialSeleccionado.value) : ''
}
</script>

<template>
  <div class="buscador-material">
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
      <li v-for="m in filtrados" :key="m.id" @mousedown.prevent="elegir(m)">
        <strong>{{ m.codigo }}</strong> — {{ m.descripcion }}
        <span class="unidad">{{ m.unidad }}</span>
      </li>
      <li v-if="!filtrados.length" class="vacio">Sin resultados</li>
    </ul>
  </div>
</template>

<style scoped>
.buscador-material {
  position: relative;
}
input {
  width: 100%;
  padding: 0.5rem;
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
.unidad {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
</style>

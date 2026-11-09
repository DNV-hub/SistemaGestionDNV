<script setup>
import { computed, onMounted } from 'vue'
import { cargarGuiasEdp, guiasEdp, sugerirNombresEdp } from '../composables/useGuiasEdp'

// Sugiere el nombre EDP según lo que se escribió (las descripciones por guía
// son opciones, no una lista cerrada). Solo propone: quien elige decide.
const props = defineProps({
  texto: { type: String, default: '' },
  // id del nombre EDP ya elegido, para marcarlo
  elegido: { type: String, default: '' },
})
const emit = defineEmits(['elegir'])

onMounted(cargarGuiasEdp)

const sugeridos = computed(() => {
  void guiasEdp.value.length // recalcula cuando terminan de cargar las guías
  return sugerirNombresEdp(props.texto)
})
</script>

<template>
  <div v-if="sugeridos.length" class="sugerencias-edp">
    <span class="etiqueta">Según las guías, podría ser:</span>
    <button
      v-for="s in sugeridos"
      :key="s.nombreEdpId"
      type="button"
      class="chip"
      :class="{ activo: s.nombreEdpId === elegido }"
      :title="`Coincide con la guía: ${s.guia}`"
      @click="emit('elegir', s.nombreEdpId, s.nombre)"
    >
      {{ s.nombre }}
    </button>
  </div>
</template>

<style scoped>
.sugerencias-edp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.etiqueta {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
.chip {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.chip:hover {
  border-color: var(--color-primary);
}
.chip.activo {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-ink);
}
</style>

<script setup>
// Botón "Reporte por mes" que abre su tarjeta debajo (cerrado por defecto).
import { ref } from 'vue'

defineProps({
  titulo: { type: String, required: true },
  resumen: { type: String, default: '' },
})
const abierto = ref(false)
const id = `cal-mes-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <div class="cal-mwrap">
    <button type="button" class="cal-mbtn" :aria-expanded="abierto" :aria-controls="id" @click="abierto = !abierto">
      <div>
        <div>{{ titulo }}</div>
        <span v-if="resumen">{{ resumen }}</span>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <div v-if="abierto" :id="id" class="cal-card">
      <slot />
    </div>
  </div>
</template>

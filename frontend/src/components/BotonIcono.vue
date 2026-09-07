<script setup>
defineProps({
  variante: { type: String, required: true }, // 'editar' | 'eliminar' | 'corregir'
  titulo: { type: String, default: '' },
})
</script>

<template>
  <button type="button" class="boton-icono" :class="variante" :title="titulo" :aria-label="titulo">
    <svg
      v-if="variante === 'editar'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
    <svg
      v-else-if="variante === 'eliminar'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  </button>
</template>

<style scoped>
.boton-icono {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  cursor: pointer;
  color: #6b7280;
}
.boton-icono svg {
  width: 16px;
  height: 16px;
}
.boton-icono:hover {
  background: #f3f4f6;
}
.boton-icono.editar:hover {
  color: #2563eb;
}
.boton-icono.eliminar:hover {
  color: #b91c1c;
}
.boton-icono.corregir:hover {
  color: #b45309;
}
</style>

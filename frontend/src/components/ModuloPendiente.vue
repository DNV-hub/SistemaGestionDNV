<script setup>
defineProps({
  titulo: { type: String, required: true },
})
</script>

<template>
  <div class="pendiente">
    <h1>{{ titulo }}</h1>
    <p>Este módulo todavía no está implementado.</p>
  </div>
</template>

<style scoped>
.pendiente {
  padding: 2rem;
  color: #6b7280;
}
h1 {
  font-size: 1.25rem;
  color: #111827;
}
</style>

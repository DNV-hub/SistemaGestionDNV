<script setup>
import { reactive, ref, useAttrs } from 'vue'

const props = defineProps({
  categorias: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// `emit()` de Vue siempre devuelve undefined y nunca propaga lo que lance el
// handler del padre, así que para poder esperar la operación real y mostrar
// el error si falla, invocamos directamente el listener vía attrs (Vue
// expone @crear="..." del padre como attrs.onCrear).
const attrs = useAttrs()

const form = reactive({ nombre: '', categoria_padre_id: '' })
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (!form.nombre.trim()) {
    error.value = 'El nombre es obligatorio.'
    return
  }

  guardando.value = true
  try {
    await attrs.onCrear({
      nombre: form.nombre.trim(),
      categoria_padre_id: form.categoria_padre_id || null,
    })
    form.nombre = ''
    form.categoria_padre_id = ''
  } catch (e) {
    error.value = 'No se pudo crear la categoría.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Categorías</h2>

      <ul class="lista">
        <li v-for="c in categorias" :key="c.id">
          {{ c.nombre }}
          <span v-if="c.categoria_padre_id" class="padre">
            (subcategoría de {{ categorias.find((p) => p.id === c.categoria_padre_id)?.nombre ?? '—' }})
          </span>
        </li>
        <li v-if="!categorias.length" class="vacio">Todavía no hay categorías.</li>
      </ul>

      <form class="form" @submit.prevent="onSubmit">
        <label>
          Nueva categoría
          <input v-model="form.nombre" type="text" placeholder="Nombre" required />
        </label>
        <label>
          Categoría padre (opcional)
          <select v-model="form.categoria_padre_id">
            <option value="">Ninguna</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Agregar categoría' }}
        </button>
      </form>

      <button type="button" class="secundario" @click="$emit('cerrar')">Cerrar</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: grid;
  place-items: center;
  z-index: 40;
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 360px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.lista li {
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--color-border);
}
.lista li:last-child {
  border-bottom: none;
}
.padre {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
.vacio {
  color: var(--color-text-muted);
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
input,
select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin: 0;
}
</style>

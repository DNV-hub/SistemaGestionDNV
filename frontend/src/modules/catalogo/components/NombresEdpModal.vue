<script setup>
import { reactive, ref, useAttrs } from 'vue'

defineProps({
  nombresEdp: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no propaga errores del padre ni espera de verdad (siempre devuelve
// undefined) — invocamos attrs.onCrear directamente para poder hacer
// try/catch real sobre la operación.
const attrs = useAttrs()

const form = reactive({ nombre: '' })
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
    await attrs.onCrear({ nombre: form.nombre.trim() })
    form.nombre = ''
  } catch (e) {
    error.value = 'No se pudo crear el nombre EDP.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Nombres EDP</h2>
      <p class="ayuda">
        Nombres con los que el cliente identifica los materiales en el EDP (Estado de Pago),
        independientes de la descripción interna de Almacén.
      </p>

      <ul class="lista">
        <li v-for="n in nombresEdp" :key="n.id">{{ n.nombre }}</li>
        <li v-if="!nombresEdp.length" class="vacio">Todavía no hay nombres EDP.</li>
      </ul>

      <form class="form" @submit.prevent="onSubmit">
        <label>
          Nuevo nombre EDP
          <input v-model="form.nombre" type="text" placeholder="Nombre según el EDP" required />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Agregar nombre EDP' }}
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
  z-index: 10;
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
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.ayuda {
  margin: 0;
  font-size: 0.8rem;
  color: #6b7280;
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
.lista li {
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
  border-bottom: 1px solid #f3f4f6;
}
.lista li:last-child {
  border-bottom: none;
}
.vacio {
  color: #6b7280;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e5e7eb;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #374151;
}
input {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font: inherit;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid #d1d5db;
  color: #374151;
}
.error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0;
}
</style>

<script setup>
import { reactive, ref, useAttrs, watch } from 'vue'

const props = defineProps({
  usuario: { type: Object, default: null }, // null = creando, objeto = editando
  roles: { type: Array, default: () => [] },
  frentes: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

function estadoInicial() {
  return {
    email: props.usuario?.email ?? '',
    nombre: props.usuario?.nombre ?? '',
    rol_id: props.usuario?.rol_id ?? props.roles[0]?.id ?? '',
    frente_id: props.usuario?.frente_id ?? '',
    estado: props.usuario?.estado ?? 'activo',
  }
}

const form = reactive(estadoInicial())
const guardando = ref(false)
const error = ref('')

watch(
  () => props.usuario,
  () => Object.assign(form, estadoInicial())
)

async function onSubmit() {
  error.value = ''
  if (!form.nombre.trim() || !form.rol_id) {
    error.value = 'Nombre y rol son obligatorios.'
    return
  }
  if (!props.usuario && !form.email.trim()) {
    error.value = 'El correo es obligatorio.'
    return
  }

  guardando.value = true
  try {
    if (props.usuario) {
      await attrs.onGuardar({
        nombre: form.nombre.trim(),
        rol_id: form.rol_id,
        frente_id: form.frente_id || null,
        estado: form.estado,
      })
    } else {
      await attrs.onGuardar({
        email: form.email.trim(),
        nombre: form.nombre.trim(),
        rol_id: form.rol_id,
        frente_id: form.frente_id || null,
      })
    }
  } catch (e) {
    console.error(e)
    error.value = e?.message || 'No se pudo guardar el usuario.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>{{ usuario ? 'Editar usuario' : 'Nuevo usuario' }}</h2>

      <label>
        Correo
        <input v-model="form.email" type="email" required :disabled="!!usuario" />
      </label>

      <label>
        Nombre
        <input v-model="form.nombre" type="text" required />
      </label>

      <label>
        Rol
        <select v-model="form.rol_id" required>
          <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.nombre }}</option>
        </select>
      </label>

      <label>
        Frente asignado (opcional, para Supervisores)
        <select v-model="form.frente_id">
          <option value="">Ninguno</option>
          <option v-for="f in frentes" :key="f.id" :value="f.id">{{ f.codigo }} — {{ f.nombre }}</option>
        </select>
      </label>

      <label v-if="usuario">
        Estado
        <select v-model="form.estado">
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </form>
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
  width: 380px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.5rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #374151;
}
input,
select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font: inherit;
}
input:disabled {
  background: #f3f4f6;
  color: #6b7280;
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
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

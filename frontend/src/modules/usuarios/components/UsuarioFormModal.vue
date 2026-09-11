<script setup>
import { reactive, ref, useAttrs, watch } from 'vue'

const props = defineProps({
  usuario: { type: Object, default: null }, // null = creando, objeto = editando
  roles: { type: Array, default: () => [] },
  frentes: { type: Array, default: () => [] },
  contratos: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

function estadoInicial() {
  return {
    email: props.usuario?.email ?? '',
    nombre: props.usuario?.nombre ?? '',
    rol_id: props.usuario?.rol_id ?? props.roles[0]?.id ?? '',
    frente_id: props.usuario?.frente_id ?? '',
    contrato_id: props.usuario?.contrato_id ?? '',
    estado: props.usuario?.estado ?? 'activo',
    password: '',
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
  if (!props.usuario && form.password && form.password.length < 8) {
    error.value = 'La contraseña debe tener al menos 8 caracteres.'
    return
  }

  guardando.value = true
  try {
    if (props.usuario) {
      await attrs.onGuardar({
        nombre: form.nombre.trim(),
        rol_id: form.rol_id,
        frente_id: form.frente_id || null,
        contrato_id: form.contrato_id || null,
        estado: form.estado,
      })
    } else {
      await attrs.onGuardar({
        email: form.email.trim(),
        nombre: form.nombre.trim(),
        rol_id: form.rol_id,
        frente_id: form.frente_id || null,
        contrato_id: form.contrato_id || null,
        password: form.password.trim() || undefined,
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

      <label v-if="!usuario">
        Contraseña inicial (opcional)
        <input v-model="form.password" type="text" placeholder="Dejar en blanco para generar una automática" minlength="8" />
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
        Contrato (estable — no cambia aunque rote de frente)
        <select v-model="form.contrato_id">
          <option value="">Ninguno</option>
          <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.codigo ? c.codigo + ' — ' : '' }}{{ c.nombre }}</option>
        </select>
        <span class="ayuda">Determina qué stock puede ver un Supervisor. No lo toques al rotarlo de frente.</span>
      </label>

      <label>
        Frente actual (opcional, cambia según dónde esté trabajando)
        <select v-model="form.frente_id">
          <option value="">Ninguno</option>
          <option v-for="f in frentes" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
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
  background: var(--color-surface);
  border-radius: var(--radius-card);
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
  color: var(--color-text);
}
input,
select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
input:disabled {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
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
.ayuda {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text-muted);
}
</style>

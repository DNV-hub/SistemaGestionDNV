<script setup>
import { reactive, ref, useAttrs } from 'vue'

const props = defineProps({
  usuario: { type: Object, required: true },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const form = reactive({ password: '' })
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (form.password && form.password.length < 8) {
    error.value = 'La contraseña debe tener al menos 8 caracteres.'
    return
  }

  guardando.value = true
  try {
    await attrs.onConfirmar(form.password.trim() || null)
  } catch (e) {
    console.error(e)
    error.value = e?.message || 'No se pudo restablecer la contraseña.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Restablecer contraseña</h2>
      <p class="texto">
        Vas a definir una nueva contraseña para <strong>{{ usuario.nombre }}</strong> ({{ usuario.email }}). La
        anterior deja de funcionar de inmediato.
      </p>

      <label>
        Nueva contraseña (opcional)
        <input v-model="form.password" type="text" placeholder="Dejar en blanco para generar una automática" minlength="8" />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Restableciendo…' : 'Restablecer' }}
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
  z-index: 20;
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 380px;
  max-width: calc(100vw - 2rem);
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.texto {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text);
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
input {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
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
</style>

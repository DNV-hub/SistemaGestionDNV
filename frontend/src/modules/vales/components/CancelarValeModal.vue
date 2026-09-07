<script setup>
import { ref, useAttrs } from 'vue'

defineEmits(['cerrar'])
const attrs = useAttrs()

const motivo = ref('')
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (!motivo.value.trim()) {
    error.value = 'Indica el motivo de la cancelación.'
    return
  }

  guardando.value = true
  try {
    await attrs.onConfirmar(motivo.value.trim())
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cancelar el vale${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Cancelar vale</h2>
      <p class="aviso-texto">
        Las líneas ya reservadas liberarán su stock reservado; las pendientes quedarán canceladas.
      </p>

      <label>
        Motivo
        <textarea v-model="motivo" rows="2" required></textarea>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Volver</button>
        <button type="submit" class="peligro" :disabled="guardando">
          {{ guardando ? 'Cancelando…' : 'Confirmar cancelación' }}
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
  width: 360px;
  max-width: calc(100vw - 2rem);
  padding: 1.5rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.aviso-texto {
  margin: 0;
  font-size: 0.8rem;
  color: #92400e;
  background: #fffbeb;
  padding: 0.5rem 0.65rem;
  border-radius: 4px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #374151;
}
textarea {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
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
.peligro {
  background: #b91c1c;
}
.error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0;
}
</style>

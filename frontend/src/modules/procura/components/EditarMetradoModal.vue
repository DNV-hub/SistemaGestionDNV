<script setup>
import { reactive, ref, useAttrs } from 'vue'

const props = defineProps({
  fila: { type: Object, required: true },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre — invocamos
// attrs.onGuardar directamente para que el try/catch capture fallos reales.
const attrs = useAttrs()

const form = reactive({
  cantidad_contractual: props.fila.cantidad_contractual,
  cantidad_procura: props.fila.cantidad_procura,
  observaciones: props.fila.observaciones ?? '',
})
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  const contractual = Number(form.cantidad_contractual)
  const procuraCant = Number(form.cantidad_procura)
  if (!Number.isFinite(contractual) || contractual < 0 || !Number.isFinite(procuraCant) || procuraCant < 0) {
    error.value = 'Las cantidades deben ser números válidos (0 o más).'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      cantidad_contractual: contractual,
      cantidad_procura: procuraCant,
      observaciones: form.observaciones.trim() || null,
    })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo guardar el cambio.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Editar metrado</h2>
      <p class="material">{{ fila.materiales?.codigo }} — {{ fila.materiales?.descripcion }}</p>

      <label>
        Cantidad contractual
        <div class="con-unidad">
          <input v-model="form.cantidad_contractual" type="number" step="0.001" min="0" required />
          <span class="unidad-badge">{{ fila.unidad }}</span>
        </div>
      </label>

      <label>
        Cantidad Procura
        <div class="con-unidad">
          <input v-model="form.cantidad_procura" type="number" step="0.001" min="0" required />
          <span class="unidad-badge">{{ fila.unidad }}</span>
        </div>
      </label>

      <label>
        Observaciones (opcional)
        <textarea v-model="form.observaciones" rows="2" placeholder="Motivo del cambio, referencia del plano…"></textarea>
      </label>

      <p class="ayuda">Guardar crea una nueva versión — el historial conserva el valor anterior.</p>

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
.material {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
input,
textarea {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
.con-unidad {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.con-unidad input {
  flex: 1;
}
.unidad-badge {
  padding: 0.3rem 0.6rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  font-size: 0.8rem;
  color: var(--color-text);
  font-weight: 600;
  white-space: nowrap;
}
.ayuda {
  margin: 0;
  font-size: 0.75rem;
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
</style>

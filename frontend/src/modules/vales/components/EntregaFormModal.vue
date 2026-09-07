<script setup>
import { computed, ref, useAttrs } from 'vue'

const props = defineProps({
  linea: { type: Object, required: true },
  reserva: { type: Object, required: true },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const saldoPendiente = computed(() => props.reserva.cantidad - props.reserva.cantidad_entregada)

const cantidad = ref(saldoPendiente.value)
const documento_referencia = ref('')
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  const valor = Number(cantidad.value)
  if (!valor || valor <= 0) {
    error.value = 'La cantidad debe ser mayor a cero.'
    return
  }
  if (valor > saldoPendiente.value) {
    error.value = `No puede superar el saldo pendiente (${saldoPendiente.value} ${props.linea.materiales?.unidad}).`
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({ cantidad: valor, documento_referencia: documento_referencia.value.trim() || null })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo registrar la entrega${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Registrar entrega</h2>
      <p class="resumen">
        {{ linea.materiales?.codigo }} — {{ linea.materiales?.descripcion }}<br />
        Almacén: {{ reserva.almacenes?.codigo }} — {{ reserva.almacenes?.nombre }}<br />
        Saldo pendiente: <strong>{{ saldoPendiente }} {{ linea.materiales?.unidad }}</strong>
      </p>

      <label>
        Cantidad a entregar
        <div class="cantidad-con-unidad">
          <input v-model="cantidad" type="number" step="0.001" min="0.001" :max="saldoPendiente" required />
          <span class="unidad-badge">{{ linea.materiales?.unidad }}</span>
        </div>
      </label>

      <label>
        Documento de referencia (opcional)
        <input v-model="documento_referencia" type="text" placeholder="Guía de salida…" />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Registrar entrega' }}
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
  padding: 1.5rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.resumen {
  margin: 0;
  font-size: 0.85rem;
  color: #374151;
  background: #f9fafb;
  padding: 0.5rem 0.65rem;
  border-radius: 4px;
  line-height: 1.5;
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
.cantidad-con-unidad {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.cantidad-con-unidad input {
  flex: 1;
}
.unidad-badge {
  padding: 0.3rem 0.6rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #374151;
  font-weight: 600;
  white-space: nowrap;
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

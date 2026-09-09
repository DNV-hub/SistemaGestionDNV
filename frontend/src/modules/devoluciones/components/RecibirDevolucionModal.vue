<script setup>
import { ref, useAttrs } from 'vue'

const props = defineProps({
  devolucion: { type: Object, required: true },
  almacenes: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const almacenId = ref(props.almacenes[0]?.id ?? '')
const guardando = ref(false)
const error = ref('')

async function confirmar() {
  if (!almacenId.value) {
    error.value = 'Selecciona el almacén donde entró el material.'
    return
  }
  error.value = ''
  guardando.value = true
  try {
    await attrs.onRecibir({ devolucion_id: props.devolucion.id, almacen_id: almacenId.value })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo confirmar la recepción${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Recibir devolución</h2>
      <p class="detalle">
        {{ devolucion.materiales?.codigo }} — {{ devolucion.materiales?.descripcion }}<br />
        {{ devolucion.cantidad }} {{ devolucion.materiales?.unidad }} ·
        <strong :class="devolucion.estado_material">{{ devolucion.estado_material === 'bueno' ? 'Bueno' : 'Dañado' }}</strong>
        · {{ devolucion.frentes?.codigo }} — {{ devolucion.frentes?.nombre }}
      </p>
      <p v-if="devolucion.estado_material === 'danado'" class="nota">
        Al estar dañado, esta cantidad no vuelve a stock disponible — solo queda registrada como devuelta.
      </p>

      <label>
        Almacén donde entró el material
        <select v-model="almacenId" required>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="button" :disabled="guardando" @click="confirmar">
          {{ guardando ? 'Confirmando…' : 'Confirmar recepción' }}
        </button>
      </div>
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
.detalle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.detalle strong.bueno {
  color: var(--color-success);
}
.detalle strong.danado {
  color: var(--color-danger);
}
.nota {
  margin: 0;
  padding: 0.5rem 0.65rem;
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border-radius: var(--radius-control);
  font-size: 0.8rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
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

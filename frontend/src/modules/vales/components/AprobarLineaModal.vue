<script setup>
import { reactive, ref, useAttrs } from 'vue'

const props = defineProps({
  linea: { type: Object, required: true },
  almacenesActivos: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const form = reactive({
  almacen_id: props.almacenesActivos[0]?.id ?? '',
  cantidad: props.linea.cantidad_solicitada,
})
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (!form.almacen_id || !form.cantidad || Number(form.cantidad) <= 0) {
    error.value = 'Selecciona el almacén y una cantidad mayor a cero.'
    return
  }

  guardando.value = true
  try {
    await attrs.onAprobar({
      vale_detalle_id: props.linea.id,
      almacen_id: form.almacen_id,
      cantidad: Number(form.cantidad),
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo aprobar la línea${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Aprobar línea</h2>
      <p class="resumen">
        {{ linea.materiales?.codigo }} — {{ linea.materiales?.descripcion }}
        (solicitado: {{ linea.cantidad_solicitada }} {{ linea.materiales?.unidad }})
      </p>

      <label>
        Almacén de origen
        <select v-model="form.almacen_id" required>
          <option v-for="a in almacenesActivos" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </label>

      <label>
        Cantidad a aprobar
        <div class="cantidad-con-unidad">
          <input v-model="form.cantidad" type="number" step="0.001" min="0.001" required />
          <span class="unidad-badge">{{ linea.materiales?.unidad }}</span>
        </div>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Aprobando…' : 'Aprobar y reservar' }}
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
.resumen {
  margin: 0;
  font-size: 0.85rem;
  color: #6b7280;
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

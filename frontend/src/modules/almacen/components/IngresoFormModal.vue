<script setup>
import { computed, reactive, ref, useAttrs } from 'vue'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'

const props = defineProps({
  almacenes: { type: Array, default: () => [] },
  materiales: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onGuardar directamente para que el
// try/catch capture fallos reales (ej. stock negativo, RLS, etc.).
const attrs = useAttrs()

const form = reactive({
  almacen_id: props.almacenes[0]?.id ?? '',
  material_id: '',
  cantidad: '',
  documento_referencia: '',
  proveedor: '',
  observacion: '',
})
const guardando = ref(false)
const error = ref('')

const materialSeleccionado = computed(() => props.materiales.find((m) => m.id === form.material_id))

async function onSubmit() {
  error.value = ''
  if (!form.almacen_id || !form.material_id || !form.cantidad) {
    error.value = 'Almacén, material y cantidad son obligatorios.'
    return
  }
  if (Number(form.cantidad) <= 0) {
    error.value = 'La cantidad debe ser mayor a cero.'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      almacen_id: form.almacen_id,
      material_id: form.material_id,
      cantidad: Number(form.cantidad),
      documento_referencia: form.documento_referencia.trim() || null,
      proveedor: form.proveedor.trim() || null,
      observacion: form.observacion.trim() || null,
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo registrar el ingreso${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Registrar ingreso</h2>

      <label>
        Almacén
        <select v-model="form.almacen_id" required>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </label>

      <label>
        Material
        <BuscadorMaterial v-model="form.material_id" :materiales="materiales" />
      </label>

      <label>
        Cantidad
        <div class="cantidad-con-unidad">
          <input v-model="form.cantidad" type="number" step="0.001" min="0.001" required />
          <span v-if="materialSeleccionado" class="unidad-badge">{{ materialSeleccionado.unidad }}</span>
        </div>
      </label>

      <label>
        Documento de referencia (opcional)
        <input v-model="form.documento_referencia" type="text" placeholder="Guía, factura…" />
      </label>

      <label>
        Proveedor (opcional)
        <input v-model="form.proveedor" type="text" />
      </label>

      <label>
        Observación (opcional)
        <textarea v-model="form.observacion" rows="2"></textarea>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Registrar ingreso' }}
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
select,
textarea {
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

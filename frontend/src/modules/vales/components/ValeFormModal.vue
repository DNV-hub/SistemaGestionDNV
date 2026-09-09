<script setup>
import { computed, reactive, ref, useAttrs } from 'vue'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'

const props = defineProps({
  frentesActivos: { type: Array, default: () => [] },
  materialesActivos: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const form = reactive({
  frente_id: props.frentesActivos[0]?.id ?? '',
  observaciones: '',
})
const lineas = ref([{ material_id: '', cantidad_solicitada: '' }])
const guardando = ref(false)
const error = ref('')

function agregarLinea() {
  lineas.value.push({ material_id: '', cantidad_solicitada: '' })
}

function quitarLinea(idx) {
  lineas.value.splice(idx, 1)
}

function unidadDe(materialId) {
  return props.materialesActivos.find((m) => m.id === materialId)?.unidad ?? ''
}

const lineasValidas = computed(() =>
  lineas.value.filter((l) => l.material_id && Number(l.cantidad_solicitada) > 0)
)

async function onSubmit() {
  error.value = ''
  if (!form.frente_id) {
    error.value = 'Selecciona un frente.'
    return
  }
  if (!lineasValidas.value.length) {
    error.value = 'Agrega al menos un material con cantidad mayor a cero.'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      frente_id: form.frente_id,
      observaciones: form.observaciones.trim() || null,
      lineas: lineasValidas.value.map((l) => ({
        material_id: l.material_id,
        cantidad_solicitada: Number(l.cantidad_solicitada),
      })),
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo crear el vale${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Nuevo vale</h2>

      <label>
        Frente
        <select v-model="form.frente_id" required>
          <option value="" disabled>Selecciona un frente…</option>
          <option v-for="f in frentesActivos" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
        </select>
      </label>

      <div class="lineas">
        <p class="etiqueta">Materiales solicitados</p>
        <div v-for="(linea, idx) in lineas" :key="idx" class="linea">
          <BuscadorMaterial v-model="linea.material_id" :materiales="materialesActivos" class="linea-material" />
          <input v-model="linea.cantidad_solicitada" type="number" step="0.001" min="0.001" placeholder="Cantidad" />
          <span class="unidad-badge">{{ unidadDe(linea.material_id) }}</span>
          <button type="button" class="quitar" title="Quitar línea" @click="quitarLinea(idx)">×</button>
        </div>
        <button type="button" class="secundario agregar-linea" @click="agregarLinea">+ Agregar material</button>
      </div>

      <label>
        Observaciones (opcional)
        <textarea v-model="form.observaciones" rows="2"></textarea>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Crear vale (Borrador)' }}
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
  width: 480px;
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
select,
textarea {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
.lineas {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
}
.etiqueta {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}
.linea {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.linea-material {
  flex: 1;
}
.linea input[type='number'] {
  width: 100px;
}
.unidad-badge {
  min-width: 2.5rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 600;
}
.quitar {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
}
.quitar:hover {
  color: var(--color-danger);
}
.agregar-linea {
  align-self: flex-start;
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

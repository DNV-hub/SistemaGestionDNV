<script setup>
import { computed, reactive, ref, useAttrs } from 'vue'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'
import BuscadorSimple from '../../../components/BuscadorSimple.vue'

const props = defineProps({
  frentesActivos: { type: Array, default: () => [] },
  materialesActivos: { type: Array, default: () => [] },
  // Solo quien puede crear vales a nombre de otro (Almacén cargando algo
  // que llegó por WhatsApp) ve este selector; un supervisor que crea su
  // propio vale no lo necesita, el dueño ya es él mismo.
  supervisoresActivos: { type: Array, default: null },
  // id de material -> cantidad disponible ahora, para mostrarla al lado de
  // cada línea a medida que se elige el material — igual que ya lo ve el
  // supervisor en su propio panel, para no pedir a ciegas algo que no hay.
  stockPorMaterial: { type: Map, default: () => new Map() },
})

const opcionesFrentes = computed(() =>
  props.frentesActivos.map((f) => ({ value: f.id, etiqueta: f.codigo ? `${f.codigo} — ${f.nombre}` : f.nombre }))
)
const opcionesSupervisores = computed(() => (props.supervisoresActivos ?? []).map((s) => ({ value: s.id, etiqueta: s.nombre })))

defineEmits(['cerrar'])
const attrs = useAttrs()

const mostrarSelectorSupervisor = computed(() => props.supervisoresActivos !== null)

const form = reactive({
  frente_id: props.frentesActivos[0]?.id ?? '',
  supervisor_id: '',
  actividad: '',
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

function disponibleDe(materialId) {
  if (!materialId) return null
  return props.stockPorMaterial.get(materialId) ?? 0
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
  if (mostrarSelectorSupervisor.value && !form.supervisor_id) {
    error.value = 'Selecciona a nombre de qué supervisor es este vale.'
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
      supervisor_id: mostrarSelectorSupervisor.value ? form.supervisor_id : undefined,
      actividad: form.actividad.trim() || null,
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
        <BuscadorSimple v-model="form.frente_id" :opciones="opcionesFrentes" placeholder="Escribe para buscar un frente…" />
      </label>

      <label v-if="mostrarSelectorSupervisor">
        Supervisor (a nombre de quién es este vale)
        <BuscadorSimple v-model="form.supervisor_id" :opciones="opcionesSupervisores" placeholder="Escribe para buscar un supervisor…" />
        <span class="ayuda">Para cargar un vale que llegó por WhatsApp u otro medio, a nombre del supervisor que lo pidió.</span>
      </label>

      <div class="lineas">
        <p class="etiqueta">Materiales solicitados</p>
        <div v-for="(linea, idx) in lineas" :key="idx" class="linea">
          <div class="linea-material-col">
            <BuscadorMaterial v-model="linea.material_id" :materiales="materialesActivos" class="linea-material" />
            <span v-if="linea.material_id" class="stock-vivo">Disponible ahora: {{ disponibleDe(linea.material_id) }} {{ unidadDe(linea.material_id) }}</span>
          </div>
          <input v-model="linea.cantidad_solicitada" type="number" step="0.001" min="0.001" placeholder="Cantidad" />
          <span class="unidad-badge">{{ unidadDe(linea.material_id) }}</span>
          <button type="button" class="quitar" title="Quitar línea" @click="quitarLinea(idx)">×</button>
        </div>
        <button type="button" class="secundario agregar-linea" @click="agregarLinea">+ Agregar material</button>
      </div>

      <label>
        Actividad (opcional)
        <input v-model="form.actividad" type="text" placeholder="Ej. Pie del activo" />
      </label>

      <label>
        Observaciones (opcional)
        <textarea v-model="form.observaciones" rows="2"></textarea>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Enviando…' : 'Enviar vale' }}
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
  z-index: 40;
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: 640px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.75rem;
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
.ayuda {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text-muted);
}
.lineas {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.9rem;
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
  gap: 0.6rem;
  align-items: flex-start;
}
.linea-material-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.linea-material {
  flex: 1;
}
.stock-vivo {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  padding-left: 0.15rem;
}
.linea input[type='number'] {
  width: 110px;
  flex-shrink: 0;
}
.linea .unidad-badge {
  padding-top: 0.5rem;
}
.linea .quitar {
  padding-top: 0.3rem;
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

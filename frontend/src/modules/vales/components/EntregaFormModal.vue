<script setup>
import { computed, onMounted, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { listarLotesDisponibles } from '../services/valesService'

const props = defineProps({
  linea: { type: Object, required: true },
  reserva: { type: Object, required: true },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const saldoPendiente = computed(() => props.reserva.cantidad - props.reserva.cantidad_entregada)
const necesitaLote = computed(() => (props.linea.materiales?.tipo_conversion ?? 'ninguna') !== 'ninguna')
const unidad = computed(() => props.linea.materiales?.unidad ?? '')
const unidadEdp = computed(() => props.linea.materiales?.unidad_edp || (props.linea.materiales?.tipo_conversion === 'area' ? 'm2' : 'ml'))

const documento_referencia = ref('')
const guardando = ref(false)
const error = ref('')

// Caso SIN lote: una sola cantidad, igual que siempre.
const cantidadSinLote = ref(saldoPendiente.value)

// Caso CON lote: una fila {ingreso_id, cantidad} por cada lote elegido —
// permite repartir una entrega entre varios lotes en una sola operación,
// sin tener que repetir todo el flujo del modal para el resto.
const asignaciones = ref([{ ingreso_id: '', cantidad: '' }])
const lotes = ref([])
const cargandoLotes = ref(false)

onMounted(async () => {
  if (!necesitaLote.value) return
  cargandoLotes.value = true
  try {
    lotes.value = await listarLotesDisponibles(props.linea.material_id, props.reserva.almacen_id)
    if (lotes.value.length === 1) {
      asignaciones.value[0].ingreso_id = lotes.value[0].id
      asignaciones.value[0].cantidad = Math.min(saldoPendiente.value, lotes.value[0].cantidad_restante)
    }
  } catch (e) {
    console.error(e)
    error.value = 'No se pudieron cargar los lotes disponibles.'
  } finally {
    cargandoLotes.value = false
  }
})

function agregarFila() {
  asignaciones.value.push({ ingreso_id: '', cantidad: '' })
}
function quitarFila(idx) {
  asignaciones.value.splice(idx, 1)
}
function loteDe(ingresoId) {
  return lotes.value.find((l) => l.id === ingresoId)
}

// Un mismo lote no se puede elegir en dos filas (una fila = un lote): cada
// select solo ofrece los lotes que ninguna OTRA fila ya tomó.
function opcionesPara(idx) {
  const elegidosEnOtras = new Set(asignaciones.value.filter((f, i) => i !== idx && f.ingreso_id).map((f) => f.ingreso_id))
  return lotes.value.filter((l) => !elegidosEnOtras.has(l.id))
}

function etiquetaLote(l) {
  const medida = l.ancho ? `${l.ancho}×${l.largo} m` : `${l.largo} m`
  return `${l.fecha} — ${medida} — quedan ${l.cantidad_restante} ${unidad.value}${l.documento_referencia ? ` (${l.documento_referencia})` : ''}`
}

const totalAsignado = computed(() => asignaciones.value.reduce((acc, f) => acc + (Number(f.cantidad) || 0), 0))

function edpDeFila(f) {
  const lote = loteDe(f.ingreso_id)
  return lote && f.cantidad ? Number(f.cantidad) * lote.factor_conversion : 0
}
const totalEdpPreview = computed(() => (necesitaLote.value ? asignaciones.value.reduce((acc, f) => acc + edpDeFila(f), 0) : null))

async function guardar(asignacionesFinal) {
  guardando.value = true
  try {
    await attrs.onGuardar({
      documento_referencia: documento_referencia.value.trim() || null,
      asignaciones: asignacionesFinal,
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo registrar la entrega${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}

async function onSubmit() {
  error.value = ''

  if (!necesitaLote.value) {
    // "No se entrega" no se registra acá: es la acción "No entregar" de la
    // línea, que pide motivo y cierra la línea.
    const valor = Number(cantidadSinLote.value)
    if (!valor || valor <= 0) {
      error.value = 'La cantidad debe ser mayor a cero.'
      return
    }
    if (valor > saldoPendiente.value) {
      error.value = `No puede superar el saldo pendiente (${saldoPendiente.value} ${unidad.value}).`
      return
    }
    await guardar([{ cantidad: valor, ingreso_id: null }])
    return
  }

  const filas = asignaciones.value.filter((f) => f.ingreso_id && Number(f.cantidad) > 0)
  if (!filas.length) {
    error.value = 'Agrega al menos un lote con una cantidad mayor a cero.'
    return
  }
  for (const f of filas) {
    const lote = loteDe(f.ingreso_id)
    if (lote && Number(f.cantidad) > lote.cantidad_restante) {
      error.value = `Ese lote solo tiene ${lote.cantidad_restante} ${unidad.value} — elegí otro lote o repartí distinto.`
      return
    }
  }
  if (totalAsignado.value > saldoPendiente.value) {
    error.value = `El total repartido (${totalAsignado.value} ${unidad.value}) supera el saldo pendiente (${saldoPendiente.value} ${unidad.value}).`
    return
  }

  await guardar(filas.map((f) => ({ cantidad: Number(f.cantidad), ingreso_id: f.ingreso_id })))
}
</script>

<template>
  <ModalFormulario
    titulo="Registrar entrega"
    :subtitulo="linea.materiales?.descripcion ?? ''"
    ancho="780px"
    texto-guardar="Registrar entrega"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <p class="mf-info">
      Almacén: <strong>{{ reserva.almacenes?.codigo }} — {{ reserva.almacenes?.nombre }}</strong> · Saldo pendiente:
      <strong>{{ saldoPendiente }} {{ unidad }}</strong>
    </p>

    <template v-if="!necesitaLote">
      <div class="mf-campo">
        <span class="mf-rotulo">Cantidad a entregar</span>
        <div class="mf-con-unidad">
          <input v-model="cantidadSinLote" type="number" step="0.001" min="0.001" :max="saldoPendiente" required />
          <span class="mf-unidad">{{ unidad }}</span>
        </div>
      </div>
    </template>

    <template v-else>
      <p v-if="cargandoLotes" class="mf-ayuda">Cargando lotes…</p>
      <div v-else class="lotes">
        <span class="mf-rotulo">De qué lote(s) sale</span>
        <div v-for="(fila, idx) in asignaciones" :key="idx" class="lote-fila">
          <select v-model="fila.ingreso_id">
            <option value="" disabled>Selecciona un lote…</option>
            <option v-for="l in opcionesPara(idx)" :key="l.id" :value="l.id">{{ etiquetaLote(l) }}</option>
          </select>
          <input v-model="fila.cantidad" type="number" step="0.001" min="0.001" placeholder="Cantidad" />
          <span class="mf-unidad">{{ unidad }}</span>
          <button type="button" class="quitar" :disabled="asignaciones.length === 1" title="Quitar lote" aria-label="Quitar lote" @click="quitarFila(idx)">×</button>
        </div>
        <button type="button" class="agregar" :disabled="!lotes.length || asignaciones.length >= lotes.length" @click="agregarFila">
          + Agregar otro lote
        </button>
        <span v-if="!lotes.length" class="mf-ayuda">No hay lotes con saldo para este material en este almacén.</span>
      </div>
      <p class="mf-info">
        Total repartido: <strong>{{ totalAsignado }} {{ unidad }}</strong> de {{ saldoPendiente }} {{ unidad }}
        <template v-if="totalEdpPreview">· equivale a {{ totalEdpPreview.toFixed(2) }} {{ unidadEdp }} para el EDP</template>
      </p>
    </template>

    <div class="mf-campo">
      <span class="mf-rotulo">Documento de referencia <em>(opcional)</em></span>
      <input v-model="documento_referencia" type="text" placeholder="Guía de salida…" />
    </div>
  </ModalFormulario>
</template>

<style scoped>
.lotes {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.lote-fila {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px auto 32px;
  gap: 0.6rem;
  align-items: center;
}
.lote-fila select,
.lote-fila input {
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
  width: 100%;
  min-width: 0;
}
.quitar {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}
.quitar:hover:not(:disabled) {
  color: var(--color-danger);
}
.quitar:disabled {
  opacity: 0.4;
  cursor: default;
}
.agregar {
  align-self: flex-start;
  padding: 0.5rem 0.9rem;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
}
.agregar:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (max-width: 720px) {
  .lote-fila {
    grid-template-columns: minmax(0, 1fr) 100px auto 32px;
  }
}
</style>

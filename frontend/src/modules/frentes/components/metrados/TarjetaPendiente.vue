<script setup>
import { computed, ref } from 'vue'
import { formatearNumero } from '../../../../utils/formatearNumero'

const props = defineProps({
  item: { type: Object, required: true },
  alertas: { type: Array, default: () => [] },
  // Previsto/acumulado oficial de la partida (para "Quedaría: X/Y UM") —
  // null si la partida no tiene previsto configurado.
  previsto: { type: Number, default: null },
  acumuladoOficial: { type: Number, default: 0 },
  procesando: { type: Boolean, default: false },
  // Partidas EDT activas del frente de este item — solo se usa cuando el
  // origen necesita que alguien elija a qué partida real de cronograma
  // queda enlazado (sin esto, confirmar no suma a ningún acumulado).
  partidas: { type: Array, default: () => [] },
})
const emit = defineEmits(['confirmar', 'corregir', 'ignorar'])

const modo = ref(null) // null | 'corregir' | 'ignorar'
const nuevaCantidad = ref(props.item.cantidad)
const motivo = ref('')
const partidaSeleccionada = ref(props.item.sugerida_partida_edt_id ?? '')

// 'libre' (texto suelto) y 'estandar' (una de las 15 partidas fijas del
// Bloque 1/3) llegan sin partida_edt_id propia — el servidor solo sugiere
// la más parecida por texto, Planeamiento confirma o cambia acá. El resto
// de orígenes (digitado_edt, conteo_pernos, suma_*) ya traen la partida
// correcta de origen y no se tocan.
const esSugerido = computed(() => props.item.origen === 'libre' || props.item.origen === 'estandar')

function partidaElegida() {
  return esSugerido.value ? partidaSeleccionada.value || null : null
}

function abrirCorregir() {
  modo.value = 'corregir'
  nuevaCantidad.value = props.item.cantidad
  motivo.value = ''
}
function abrirIgnorar() {
  modo.value = 'ignorar'
  motivo.value = ''
}
function cancelar() {
  modo.value = null
  motivo.value = ''
}
function confirmar() {
  emit('confirmar', { partidaEdtId: partidaElegida() })
}
function confirmarCorreccion() {
  if (!motivo.value.trim()) return
  emit('corregir', { cantidad: Number(nuevaCantidad.value) || 0, motivo: motivo.value.trim(), partidaEdtId: partidaElegida() })
}
function confirmarIgnorar() {
  if (!motivo.value.trim()) return
  emit('ignorar', { motivo: motivo.value.trim() })
}

const partidasOrdenadas = computed(() => [...props.partidas].sort((a, b) => a.codigo_edt.localeCompare(b.codigo_edt)))
const unidadSeleccionada = computed(() => {
  if (!esSugerido.value) return unidad
  return props.partidas.find((p) => p.id === partidaSeleccionada.value)?.unidad ?? unidad
})

const nombrePartida = props.item.partida
  ? `${props.item.partida.codigo_edt} · ${props.item.partida.nombre}`
  : props.item.sugerida
    ? `${props.item.sugerida.codigo_edt} · ${props.item.sugerida.nombre}`
    : null
const unidad = props.item.partida?.unidad ?? props.item.sugerida?.unidad ?? ''
const quedaria = props.previsto != null ? props.acumuladoOficial + Number(props.item.cantidad) : null

function fechaCorta(f) {
  return f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : '—'
}
</script>

<template>
  <div class="tarjeta">
    <div class="meta">{{ fechaCorta(item.fecha) }} · {{ item.rdc_reportes?.rdc_supervisores?.nombre ?? '—' }}</div>

    <p v-if="esSugerido" class="texto-reportado">«{{ item.texto_reportado }}»</p>

    <div v-if="esSugerido" class="sugerencia">
      <span class="etiqueta">Partida real de cronograma</span>
      <select v-model="partidaSeleccionada" class="selector-partida">
        <option value="">Sin partida (queda libre, no suma a ningún acumulado)</option>
        <option v-for="p in partidasOrdenadas" :key="p.id" :value="p.id">{{ p.codigo_edt }} · {{ p.nombre }}</option>
      </select>
      <p v-if="item.coincidencia_pct != null && partidaSeleccionada === item.sugerida_partida_edt_id" class="nota-sugerida">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        Sugerida por parecido de texto · {{ item.coincidencia_pct }}%
      </p>
      <p class="cantidad-linea">Cantidad {{ formatearNumero(item.cantidad) }} {{ unidadSeleccionada }}</p>
    </div>
    <div v-else class="sugerencia">
      <span class="etiqueta">{{ nombrePartida ?? 'Partida' }}</span>
      <p class="cantidad-linea">
        Cantidad {{ formatearNumero(item.cantidad) }} {{ unidad }}
        <template v-if="quedaria !== null"> · Quedaría: {{ formatearNumero(quedaria) }} / {{ formatearNumero(previsto) }} {{ unidad }}</template>
      </p>
    </div>

    <div v-if="alertas.length" class="alertas">
      <div v-for="a in alertas" :key="a.tipo" class="alerta" :class="a.tipo === 'coincidencia_baja' ? 'roja' : 'ambar'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 9v4M12 16h.01" /><circle cx="12" cy="12" r="9" /></svg>
        <span>{{ a.detalle }}</span>
      </div>
    </div>

    <template v-if="modo === null">
      <div class="acciones">
        <button type="button" class="confirmar" :disabled="procesando" @click="confirmar">Confirmar</button>
        <button type="button" class="secundario" :disabled="procesando" @click="abrirCorregir">Corregir</button>
        <button type="button" class="secundario" :disabled="procesando" @click="abrirIgnorar">Ignorar</button>
      </div>
    </template>

    <template v-else-if="modo === 'corregir'">
      <div class="form-inline">
        <label>
          Cantidad correcta
          <input v-model="nuevaCantidad" type="number" step="0.001" min="0" />
        </label>
        <label>
          Motivo
          <input v-model="motivo" type="text" placeholder="Por qué se corrige…" />
        </label>
        <div class="acciones">
          <button type="button" class="confirmar" :disabled="procesando || !motivo.trim()" @click="confirmarCorreccion">Guardar corrección</button>
          <button type="button" class="secundario" :disabled="procesando" @click="cancelar">Cancelar</button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="form-inline">
        <label>
          Motivo para ignorar
          <input v-model="motivo" type="text" placeholder="Por qué no se considera…" />
        </label>
        <div class="acciones">
          <button type="button" class="peligro" :disabled="procesando || !motivo.trim()" @click="confirmarIgnorar">Ignorar</button>
          <button type="button" class="secundario" :disabled="procesando" @click="cancelar">Cancelar</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tarjeta {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}
.texto-reportado {
  margin: 0;
  font-size: 13.5px;
  font-style: italic;
  color: var(--color-text);
}
.etiqueta {
  font-size: 11px;
  color: var(--color-text-muted);
}
.linea-sugerencia {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-success);
  font-size: 13px;
  margin-top: 2px;
}
.pct {
  margin-left: auto;
  color: var(--color-success);
}
.selector-partida {
  width: 100%;
  min-height: 38px;
  padding: 0 8px;
  margin-top: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}
.nota-sugerida {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--color-success);
}
.cantidad-linea {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.alertas {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.alerta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
}
.alerta.ambar {
  background: var(--color-warning-soft, #fff7e5);
  color: var(--color-warning);
}
.alerta.roja {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.acciones {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 4px;
}
button {
  padding: 8px 10px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--color-border);
}
.confirmar {
  background: var(--color-primary);
  color: var(--color-primary-ink);
  border-color: var(--color-primary);
  grid-column: 1 / -1;
}
.secundario {
  background: var(--color-surface);
  color: var(--color-text);
}
.peligro {
  background: var(--color-danger);
  color: #fff;
  border-color: var(--color-danger);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
.form-inline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-inline label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.form-inline input {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}
</style>

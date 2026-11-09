<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { compararCodigoNatural } from '../../avance/utils/ordenNatural'
import { formatearNumero } from '../../../utils/formatearNumero'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'

const props = defineProps({
  tipo: { type: String, required: true }, // 'perforacion' | 'inyeccion' | 'malla' | 'cable'
})

const rdc = useRdcStore()
const router = useRouter()

onMounted(() => rdc.iniciar())

// dd/mm/aa — la tabla venía apretada con el año completo, sobre todo en
// Malla/Cable que ya tienen 5 columnas.
function fmtFechaCorta(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const frenteId = computed(() => rdc.frenteActualId)

const TITULOS = {
  perforacion: 'Perforación',
  inyeccion: 'Inyección',
  malla: 'Malla',
  cable: 'Cable',
}
const titulo = computed(() => TITULOS[props.tipo] ?? 'Control de sostenimiento')

const normalizarCodigo = (c) => (c ?? '').trim().toUpperCase()

/** Perforación/Inyección comparten la misma fuente (fn_rdc_pernos_estado,
 * ya descargada en catalogos.pernosEstado): cada código reportado trae su
 * estado ('perforado' | 'inyectado'). Lo que todavía no tiene ninguna
 * perforación no aparece ahí — se completa con lo que falta del catálogo
 * (catalogos.pernos), mismo criterio que ya usa Control de sostenimiento
 * en escritorio. */
const pernosBiblioteca = computed(() => (rdc.catalogos?.pernos ?? []).filter((p) => p.frente_id === frenteId.value))
const pernosEstadoFrente = computed(() => (rdc.catalogos?.pernosEstado ?? []).filter((p) => p.frente_id === frenteId.value))
const codigosReportados = computed(() => new Set(pernosEstadoFrente.value.map((p) => p.codigo_norm)))

const filasPernos = computed(() => {
  const reportados = pernosEstadoFrente.value.map((p) => ({
    codigo: p.codigo,
    zona: p.zona,
    ubicacion: p.ubicacion,
    estado: p.estado, // 'perforado' | 'inyectado'
    fecha: p.estado === 'inyectado' ? p.inyeccion_fecha : p.perforacion_fecha,
    cantidad: p.perforacion_ml,
  }))
  const sinPerforar = pernosBiblioteca.value
    .filter((c) => !codigosReportados.value.has(normalizarCodigo(c.codigo)))
    .map((c) => ({ codigo: c.codigo, zona: c.zona, ubicacion: c.ubicacion, estado: 'sin_perforar', fecha: null, cantidad: null }))
  // Primero lo que ya se avanzó (perforado/inyectado), lo sin perforar
  // siempre al final — así lo que falta no tapa lo que ya está hecho.
  return [...reportados, ...sinPerforar].sort((a, b) => {
    const prioridad = (f) => (f.estado === 'sin_perforar' ? 1 : 0)
    return prioridad(a) - prioridad(b) || compararCodigoNatural(a.codigo, b.codigo)
  })
})

// Para "Inyección" tiene sentido resaltar primero lo que YA se inyectó y
// lo que está perforado esperando su turno — lo sin perforar es ruido ahí,
// se oculta (sigue disponible en la pestaña de Perforación).
const filasMostradas = computed(() =>
  props.tipo === 'inyeccion' ? filasPernos.value.filter((f) => f.estado !== 'sin_perforar') : filasPernos.value
)

const ETIQUETA_ESTADO = {
  perforado: 'Perforado',
  inyectado: 'Inyectado',
  sin_perforar: 'Sin perforar',
}

/** Malla/Cable: lista plana de paños/tramos, ordenada por tipo y luego por
 * código — el desglose por tipo ya se vio en la tarjeta del Dashboard, acá
 * está el detalle fila por fila. */
const filasMalla = computed(() =>
  (rdc.catalogos?.mallaEstado ?? [])
    .filter((f) => f.frente_id === frenteId.value)
    .slice()
    .sort((a, b) => (a.tipo || '').localeCompare(b.tipo || '') || compararCodigoNatural(a.codigo, b.codigo))
)
const filasCable = computed(() =>
  (rdc.catalogos?.cableEstado ?? [])
    .filter((f) => f.frente_id === frenteId.value)
    .slice()
    .sort((a, b) => (a.tipo || '').localeCompare(b.tipo || '') || compararCodigoNatural(a.codigo, b.codigo))
)

function volver() {
  router.push({ name: 'rdc' })
}
</script>

<template>
  <div class="rdc-app">
    <header class="appbar-plana">
      <button type="button" class="volver-btn" aria-label="Volver" @click="volver">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4L6 10l6.5 6" /></svg>
      </button>
      <h1>{{ titulo }}</h1>
    </header>

    <main class="app">
      <p v-if="!rdc.frenteActual" class="empty-msg">Elige un frente en el Dashboard primero.</p>

      <template v-else-if="tipo === 'perforacion' || tipo === 'inyeccion'">
        <table v-if="filasMostradas.length" class="summary-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Zona</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filasMostradas" :key="f.codigo">
              <td>{{ f.codigo }}</td>
              <td>{{ f.zona || '—' }}</td>
              <td>{{ fmtFechaCorta(f.fecha) }}</td>
              <td>
                <span class="chip" :class="f.estado">{{ ETIQUETA_ESTADO[f.estado] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-msg">Nada registrado todavía.</p>
      </template>

      <template v-else-if="tipo === 'malla'">
        <table v-if="filasMalla.length" class="summary-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Código</th>
              <th>Zona</th>
              <th>Área</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filasMalla" :key="f.codigo_norm">
              <td>{{ f.tipo || '—' }}</td>
              <td>{{ f.codigo }}</td>
              <td>{{ f.zona || '—' }}</td>
              <td>{{ formatearNumero(f.area_m2) }} m²</td>
              <td>{{ fmtFechaCorta(f.fecha) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-msg">Nada instalado todavía.</p>
      </template>

      <template v-else-if="tipo === 'cable'">
        <table v-if="filasCable.length" class="summary-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Código</th>
              <th>Zona</th>
              <th>Longitud</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filasCable" :key="`${f.tipo}-${f.codigo}-${f.fecha}`">
              <td>{{ f.tipo || '—' }}</td>
              <td>{{ f.codigo || '—' }}</td>
              <td>{{ f.zona || '—' }}</td>
              <td>{{ formatearNumero(f.longitud_ml) }} ML</td>
              <td>{{ fmtFechaCorta(f.fecha) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-msg">Nada instalado todavía.</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
.appbar-plana {
  display: flex;
  align-items: center;
  gap: 10px;
}
.volver-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text2);
  cursor: pointer;
  flex-shrink: 0;
}
.chip {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
}
.chip.perforado {
  background: var(--blue-bg);
  color: var(--blue-text);
}
.chip.inyectado {
  background: var(--green-bg);
  color: var(--green-text);
}
.chip.sin_perforar {
  background: var(--neutral-bg);
  color: var(--neutral-text);
}
</style>

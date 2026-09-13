<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProcuraStore } from '../store/procura'
import { useAuthStore } from '../../../store/auth'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'
import ImportarMetradoModal from '../components/ImportarMetradoModal.vue'
import EditarMetradoModal from '../components/EditarMetradoModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'
import { descargarExcel } from '../../../utils/exportarExcel'

const ESTRUCTURA_IMPORT_MASIVO =
  'Estructura del Excel: columnas CODIGO, CANTIDAD CONTRACTUAL y CANTIDAD PROCURA (OBSERVACION es opcional). El código debe existir ya en el catálogo.'

const route = useRoute()
const router = useRouter()
const procura = useProcuraStore()
const auth = useAuthStore()

const puedeEditar = computed(() => auth.tienePermiso('procura.crear_version'))
const puedeVerComparacion = computed(() => auth.tienePermiso('procura.ver_comparacion'))

const frenteId = computed(() => route.params.frenteId)
const frente = computed(() => procura.frentesActivos.find((f) => f.id === frenteId.value) ?? null)
const filas = computed(() => procura.metradosPorFrente(frenteId.value))

const aviso = ref('')
const cuerpoPlanilla = ref(null)
const nuevaFila = reactive({ material_id: '', cantidad_contractual: '', cantidad_procura: '' })
const guardandoNueva = ref(false)
const mostrarModalImportar = ref(false)
const filaEnEdicion = ref(null)

async function guardarEdicion(payload) {
  aviso.value = ''
  await procura.guardarFila({
    frente_id: filaEnEdicion.value.frente_id,
    material_id: filaEnEdicion.value.material_id,
    unidad: filaEnEdicion.value.unidad,
    responsable_id: auth.session.user.id,
    ...payload,
  })
  aviso.value = `"${filaEnEdicion.value.materiales?.codigo}" actualizado.`
  filaEnEdicion.value = null
}

async function eliminarFila(fila) {
  if (!confirm(`¿Quitar "${fila.materiales?.codigo} — ${fila.materiales?.descripcion}" del metrado de este frente?`))
    return
  aviso.value = ''
  await procura.eliminarFila(fila, auth.session.user.id)
  aviso.value = `"${fila.materiales?.codigo}" se quitó del metrado.`
}

async function importarMetrado(filasAImportar) {
  aviso.value = ''
  const payloads = filasAImportar.map((f) => ({
    frente_id: frenteId.value,
    material_id: f.material_id,
    unidad: f.unidad,
    cantidad_contractual: f.cantidad_contractual,
    cantidad_procura: f.cantidad_procura,
    responsable_id: auth.session.user.id,
    observaciones: f.observacion,
  }))
  await procura.importarMetradoMasivo(payloads)
  aviso.value = `Se importaron ${payloads.length} materiales al metrado.`
}

function cargar() {
  procura.cargarDetalleFrente(frenteId.value)
}
onMounted(cargar)
watch(frenteId, cargar)

function total(fila) {
  return (Number(fila.cantidad_contractual) || 0) + (Number(fila.cantidad_procura) || 0)
}

async function guardarCelda(fila, campo, valorNuevo) {
  const valor = valorNuevo === '' ? 0 : Number(valorNuevo)
  if (valor === Number(fila[campo])) return

  aviso.value = ''
  try {
    await procura.guardarFila({
      frente_id: fila.frente_id,
      material_id: fila.material_id,
      unidad: fila.unidad,
      cantidad_contractual: campo === 'cantidad_contractual' ? valor : Number(fila.cantidad_contractual),
      cantidad_procura: campo === 'cantidad_procura' ? valor : Number(fila.cantidad_procura),
      responsable_id: auth.session.user.id,
      observaciones: fila.observaciones ?? null,
    })
    aviso.value = `"${fila.materiales?.codigo}" actualizado.`
  } catch (e) {
    console.error(e)
    aviso.value = 'No se pudo guardar el cambio.'
  }
}

const materialesDisponibles = computed(() => {
  const usados = new Set(filas.value.map((f) => f.material_id))
  return procura.materialesActivos.filter((m) => !usados.has(m.id))
})

async function agregarMaterial() {
  if (!nuevaFila.material_id) return
  const material = procura.materialPorId(nuevaFila.material_id)
  guardandoNueva.value = true
  aviso.value = ''
  try {
    await procura.guardarFila({
      frente_id: frenteId.value,
      material_id: nuevaFila.material_id,
      unidad: material?.unidad ?? '',
      cantidad_contractual: Number(nuevaFila.cantidad_contractual) || 0,
      cantidad_procura: Number(nuevaFila.cantidad_procura) || 0,
      responsable_id: auth.session.user.id,
      observaciones: null,
    })
    nuevaFila.material_id = ''
    nuevaFila.cantidad_contractual = ''
    nuevaFila.cantidad_procura = ''
    aviso.value = 'Material agregado al metrado.'
  } catch (e) {
    console.error(e)
    aviso.value = 'No se pudo agregar el material.'
  } finally {
    guardandoNueva.value = false
  }
}

function enfocarCelda(fila, col) {
  const destino = cuerpoPlanilla.value?.querySelector(`input[data-fila="${fila}"][data-col="${col}"]`)
  if (destino) destino.focus()
}

function onTeclaCelda(ev) {
  const input = ev.target
  if (input.tagName !== 'INPUT') return
  const fila = Number(input.dataset.fila)
  const col = Number(input.dataset.col)
  const ultimaFila = filas.value.length - 1

  if (ev.key === 'ArrowRight' && col < 1) {
    ev.preventDefault()
    enfocarCelda(fila, col + 1)
  } else if (ev.key === 'ArrowLeft' && col > 0) {
    ev.preventDefault()
    enfocarCelda(fila, col - 1)
  } else if (ev.key === 'ArrowDown' && fila < ultimaFila) {
    ev.preventDefault()
    enfocarCelda(fila + 1, col)
  } else if (ev.key === 'ArrowUp' && fila > 0) {
    ev.preventDefault()
    enfocarCelda(fila - 1, col)
  } else if (ev.key === 'Enter') {
    ev.preventDefault()
    input.blur()
    if (ev.shiftKey) {
      if (fila > 0) enfocarCelda(fila - 1, col)
    } else if (fila < ultimaFila) {
      enfocarCelda(fila + 1, col)
    }
  }
}

/** Historial global del frente, con la variación de Procura contra la versión anterior del mismo material. */
const historialConDelta = computed(() => {
  const porMaterial = new Map()
  for (const h of procura.historial) {
    if (!porMaterial.has(h.material_id)) porMaterial.set(h.material_id, [])
    porMaterial.get(h.material_id).push(h)
  }
  const deltas = new Map()
  for (const versiones of porMaterial.values()) {
    const ascendente = [...versiones].sort((a, b) => a.version - b.version)
    ascendente.forEach((v, i) => {
      const anterior = i > 0 ? ascendente[i - 1] : null
      deltas.set(v.id, anterior ? v.cantidad_procura - anterior.cantidad_procura : null)
    })
  }
  return procura.historial.map((h) => ({ ...h, deltaProcura: deltas.get(h.id) }))
})

function claseConsumo(pct) {
  if (pct === null || pct === undefined) return ''
  if (pct >= 100) return 'sobre'
  if (pct >= 90) return 'riesgo'
  return 'normal'
}

/** Exporta la planilla vigente, el historial y (si el permiso lo permite) la comparación de este frente. */
function exportarExcel() {
  const hojas = [
    {
      nombre: 'Planilla vigente',
      filas: filas.value.map((f) => ({
        Código: f.materiales?.codigo ?? '',
        Material: f.materiales?.descripcion ?? '',
        Unidad: f.unidad,
        Contractual: f.cantidad_contractual,
        Procura: f.cantidad_procura,
        'Total previsto': total(f),
      })),
    },
    {
      nombre: 'Historial',
      filas: historialConDelta.value.map((h) => ({
        Fecha: new Date(h.created_at).toLocaleString(),
        Código: h.materiales?.codigo ?? '',
        Material: h.materiales?.descripcion ?? '',
        Unidad: h.unidad,
        Versión: h.version,
        Contractual: h.cantidad_contractual,
        Procura: h.cantidad_procura,
        'Δ Procura': h.deltaProcura ?? '',
        Total: total(h),
        Responsable: h.usuarios?.nombre ?? '',
      })),
    },
  ]

  if (puedeVerComparacion.value) {
    hojas.push({
      nombre: 'Comparación vs consumo',
      filas: procura.comparacion.map((c) => ({
        Código: procura.materialPorId(c.material_id)?.codigo ?? '',
        Material: procura.materialPorId(c.material_id)?.descripcion ?? '',
        Unidad: c.unidad,
        Previsto: c.cantidad_prevista,
        Reservado: c.cantidad_reservada,
        Solicitado: c.cantidad_solicitada,
        Entregado: c.cantidad_entregada,
        Saldo: c.saldo,
        '% Consumo': c.porcentaje_consumo,
        Desviación: c.desviacion,
      })),
    })
  }

  const nombreFrente = (frente.value.codigo ? `${frente.value.codigo}_` : '') + frente.value.nombre
  descargarExcel(`procura_${nombreFrente}.xlsx`, hojas)
}
</script>

<template>
  <div class="detalle">
    <button class="volver" @click="router.push('/procura')">&larr; Volver a Procura</button>

    <p v-if="procura.cargando">Cargando…</p>
    <p v-else-if="procura.error" class="error">{{ procura.error }}</p>

    <template v-else-if="frente">
      <header class="cabecera">
        <div>
          <h1>{{ frente.codigo ? frente.codigo + ' — ' : '' }}{{ frente.nombre }}</h1>
          <p class="subtitulo">{{ frente.area ?? 'Sin área asignada' }}</p>
        </div>
        <button type="button" class="secundario" @click="exportarExcel">Exportar Excel</button>
      </header>

      <p v-if="aviso" class="aviso">{{ aviso }}</p>

      <section>
        <div class="seccion-cabecera">
          <h2>Planilla de metrado</h2>
          <button
            v-if="puedeEditar"
            type="button"
            class="secundario"
            :title="ESTRUCTURA_IMPORT_MASIVO"
            @click="mostrarModalImportar = true"
          >
            Importar metrado masivo
          </button>
        </div>
        <p class="nota-ayuda">
          Navega con <span class="tecla">↑</span><span class="tecla">↓</span><span class="tecla">←</span
          ><span class="tecla">→</span> o <span class="tecla">Tab</span> · <span class="tecla">Enter</span> baja de fila
          — el Total se calcula solo (Contractual + Procura).
        </p>

        <div class="marco-tabla">
          <table>
            <thead>
              <tr>
                <th class="col-num">#</th>
                <th>Código</th>
                <th>Material</th>
                <th>Unidad</th>
                <th>Contractual</th>
                <th>Procura</th>
                <th class="col-total">Total previsto</th>
                <th v-if="puedeEditar"></th>
              </tr>
            </thead>
            <tbody ref="cuerpoPlanilla" @keydown="onTeclaCelda">
              <tr v-for="(fila, i) in filas" :key="fila.id">
                <td class="col-num">{{ i + 1 }}</td>
                <td class="col-codigo">{{ fila.materiales?.codigo }}</td>
                <td class="col-descripcion">{{ fila.materiales?.descripcion }}</td>
                <td class="col-unidad">{{ fila.unidad }}</td>
                <td class="celda-editable">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    :data-fila="i"
                    data-col="0"
                    :value="fila.cantidad_contractual"
                    :disabled="!puedeEditar"
                    @focus="$event.target.select()"
                    @change="guardarCelda(fila, 'cantidad_contractual', $event.target.value)"
                  />
                </td>
                <td class="celda-editable">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    :data-fila="i"
                    data-col="1"
                    :value="fila.cantidad_procura"
                    :disabled="!puedeEditar"
                    @focus="$event.target.select()"
                    @change="guardarCelda(fila, 'cantidad_procura', $event.target.value)"
                  />
                </td>
                <td class="col-total">{{ total(fila) }}</td>
                <td v-if="puedeEditar" class="acciones-fila">
                  <BotonIcono variante="editar" titulo="Editar" @click="filaEnEdicion = fila" />
                  <BotonIcono variante="eliminar" titulo="Quitar del metrado" @click="eliminarFila(fila)" />
                </td>
              </tr>
              <tr v-if="!filas.length">
                <td colspan="8" class="vacio">Este frente todavía no tiene materiales previstos.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="puedeEditar" class="agregar-fila">
          <BuscadorMaterial v-model="nuevaFila.material_id" :materiales="materialesDisponibles" class="buscador" />
          <input v-model="nuevaFila.cantidad_contractual" type="number" step="0.001" min="0" placeholder="Contractual" />
          <input v-model="nuevaFila.cantidad_procura" type="number" step="0.001" min="0" placeholder="Procura" />
          <button type="button" :disabled="!nuevaFila.material_id || guardandoNueva" @click="agregarMaterial">
            + Agregar material
          </button>
        </div>
      </section>

      <section>
        <h2>Historial de modificaciones</h2>
        <div class="marco-tabla">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Código</th>
                <th>Material</th>
                <th>Unidad</th>
                <th>Versión</th>
                <th>Contractual</th>
                <th>Procura</th>
                <th>Δ Procura</th>
                <th class="col-total">Total</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in historialConDelta" :key="h.id">
                <td>{{ new Date(h.created_at).toLocaleString() }}</td>
                <td class="col-codigo">{{ h.materiales?.codigo }}</td>
                <td class="col-descripcion">{{ h.materiales?.descripcion }}</td>
                <td class="col-unidad">{{ h.unidad }}</td>
                <td>v{{ h.version }}</td>
                <td>{{ h.cantidad_contractual }}</td>
                <td>{{ h.cantidad_procura }}</td>
                <td>
                  <span v-if="h.deltaProcura === null">—</span>
                  <span v-else :class="h.deltaProcura >= 0 ? 'delta-pos' : 'delta-neg'">
                    {{ h.deltaProcura > 0 ? '+' : '' }}{{ h.deltaProcura }}
                  </span>
                </td>
                <td class="col-total">{{ total(h) }}</td>
                <td>{{ h.usuarios?.nombre ?? '—' }}</td>
              </tr>
              <tr v-if="!historialConDelta.length">
                <td colspan="10" class="vacio">Todavía no hay modificaciones registradas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="puedeVerComparacion">
        <h2>Comparación Procura vs. consumo</h2>
        <div class="marco-tabla">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Material</th>
                <th>Unidad</th>
                <th>Previsto</th>
                <th>Reservado</th>
                <th>Solicitado</th>
                <th>Entregado</th>
                <th>Saldo</th>
                <th>% Consumo</th>
                <th>Desviación</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in procura.comparacion" :key="c.material_id">
                <td class="col-codigo">{{ procura.materialPorId(c.material_id)?.codigo ?? '—' }}</td>
                <td class="col-descripcion">{{ procura.materialPorId(c.material_id)?.descripcion ?? '—' }}</td>
                <td class="col-unidad">{{ c.unidad }}</td>
                <td>{{ c.cantidad_prevista }}</td>
                <td>{{ c.cantidad_reservada }}</td>
                <td>{{ c.cantidad_solicitada }}</td>
                <td>{{ c.cantidad_entregada }}</td>
                <td>{{ c.saldo }}</td>
                <td>
                  <span class="badge-pct" :class="claseConsumo(c.porcentaje_consumo)">{{ c.porcentaje_consumo ?? '—' }}%</span>
                </td>
                <td>{{ c.desviacion }}</td>
              </tr>
              <tr v-if="!procura.comparacion.length">
                <td colspan="10" class="vacio">No hay datos de consumo para este frente.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <ImportarMetradoModal
      v-if="mostrarModalImportar"
      :materiales="procura.materialesActivos"
      @importar="importarMetrado"
      @cerrar="mostrarModalImportar = false"
    />

    <EditarMetradoModal
      v-if="filaEnEdicion"
      :fila="filaEnEdicion"
      @guardar="guardarEdicion"
      @cerrar="filaEnEdicion = null"
    />
  </div>
</template>

<style scoped>
.detalle {
  padding: 1.5rem 2rem;
}
.volver {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  padding: 0;
  cursor: pointer;
  margin-bottom: 1rem;
}
.cabecera {
  margin-bottom: 0.5rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.subtitulo {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
h2 {
  font-size: 1rem;
  margin: 0 0 0.5rem;
  color: var(--color-text);
}
section {
  margin-top: 2rem;
}
.seccion-cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.seccion-cabecera h2 {
  margin: 0;
}
.nota-ayuda {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  margin: 0 0 0.6rem;
}
.tecla {
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-bottom-width: 2px;
  padding: 0.05rem 0.4rem;
  border-radius: var(--radius-control);
  color: var(--color-text);
}
.marco-tabla {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}
th,
td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.86rem;
  text-align: center;
  white-space: nowrap;
}
thead th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
td.col-descripcion {
  white-space: normal;
  min-width: 200px;
  text-align: left;
}
td.col-codigo {
  font-weight: 600;
}
td.col-unidad {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
.acciones-fila {
  display: flex;
  gap: 0.15rem;
  justify-content: center;
}
td.celda-editable {
  padding: 0;
}
td.celda-editable input {
  width: 100%;
  height: 100%;
  min-height: 2.4rem;
  border: none;
  background: transparent;
  padding: 0.4rem 0.6rem;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--color-text);
}
td.celda-editable input:disabled {
  color: var(--color-text-muted);
}
td.celda-editable input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
  background: var(--color-surface-2);
}
td.col-total {
  background: var(--color-success-soft);
  color: var(--color-success);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.agregar-fila {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.agregar-fila .buscador {
  flex: 1;
  min-width: 220px;
}
.agregar-fila input {
  width: 140px;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  text-align: center;
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
.badge-pct {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}
.badge-pct.normal {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge-pct.riesgo {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge-pct.sobre {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.delta-pos {
  color: var(--color-success);
  font-weight: 600;
}
.delta-neg {
  color: var(--color-danger);
  font-weight: 600;
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
  white-space: normal;
}
.aviso {
  color: var(--color-success);
  font-size: 0.9rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

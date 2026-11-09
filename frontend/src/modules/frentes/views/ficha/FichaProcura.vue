<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { claveMetrado, useProcuraStore } from '../../../procura/store/procura'
import { useAuthStore } from '../../../../store/auth'
import BuscadorNombreEdp from '../../../procura/components/BuscadorNombreEdp.vue'
import ImportarMetradoModal from '../../../procura/components/ImportarMetradoModal.vue'
import EditarMetradoModal from '../../../procura/components/EditarMetradoModal.vue'
import BotonIcono from '../../../../components/BotonIcono.vue'
import { descargarExcel } from '../../../../utils/exportarExcel'

// Era ProcuraFrenteView.vue (ruta propia /procura/:frenteId, con botón
// "Volver a Procura") — ahora vive como pestaña de la ficha del frente: el
// frente ya no sale de route.params, llega por prop (misma fuente que ya
// cargó FichaFrenteView.vue, no hace falta volver a pedirlo), y no hay
// "volver" — las pestañas de arriba ya cumplen ese rol.
const props = defineProps({
  frenteId: { type: String, required: true },
  frente: { type: Object, required: true },
})

const procura = useProcuraStore()
const auth = useAuthStore()

const puedeEditar = computed(() => auth.tienePermiso('procura.crear_version'))
const puedeVerComparacion = computed(() => auth.tienePermiso('procura.ver_comparacion'))

const filas = computed(() => procura.metradosPorFrente(props.frenteId))

const aviso = ref('')
const cuerpoPlanilla = ref(null)
const nuevaFila = reactive({ descripcion_edp_id: '', zona: '', cantidad_procura: '' })
const hayZonas = computed(() => filas.value.some((f) => f.zona))
const guardandoNueva = ref(false)
const mostrarModalImportar = ref(false)
const filaEnEdicion = ref(null)

async function guardarEdicion(payload) {
  aviso.value = ''
  await procura.guardarFila({
    frente_id: filaEnEdicion.value.frente_id,
    descripcion_edp_id: filaEnEdicion.value.descripcion_edp_id,
    zona: filaEnEdicion.value.zona ?? '',
    orden: filaEnEdicion.value.orden ?? null,
    unidad: filaEnEdicion.value.unidad,
    responsable_id: auth.session.user.id,
    ...payload,
  })
  aviso.value = `"${filaEnEdicion.value.nombres_edp?.nombre}" actualizado.`
  filaEnEdicion.value = null
}

async function eliminarFila(fila) {
  if (!confirm(`¿Quitar "${fila.nombres_edp?.nombre}" del metrado de este frente?`)) return
  aviso.value = ''
  await procura.eliminarFila(fila, auth.session.user.id)
  aviso.value = `"${fila.nombres_edp?.nombre}" se quitó del metrado.`
}

async function importarMetrado(filasAImportar, { reemplazar = false } = {}) {
  aviso.value = ''
  const payloads = filasAImportar.map((f) => ({
    frente_id: props.frenteId,
    descripcion_edp_id: f.descripcion_edp_id,
    zona: f.zona ?? '',
    orden: f.fila, // posición en el Excel: la planilla se ve en ese mismo orden
    unidad: f.unidad,
    cantidad_contractual: 0,
    cantidad_procura: f.cantidad_procura,
    responsable_id: auth.session.user.id,
    observaciones: f.observacion,
  }))
  // "Reemplazar todo": lo que ya estaba y no viene en el archivo queda en 0.
  let quitados = 0
  if (reemplazar) {
    quitados = await procura.vaciarFrente(props.frenteId, auth.session.user.id, {
      salvo: new Set(payloads.map((p) => claveMetrado(p))),
    })
  }
  await procura.importarMetradoMasivo(payloads)
  aviso.value = `Se importaron ${payloads.length} materiales al metrado${reemplazar ? ` (se quitaron ${quitados} que ya no están)` : ''}.`
}

async function vaciarMetrado() {
  if (!filas.value.length) return
  if (!confirm(`¿Vaciar TODO el metrado de este frente (${filas.value.length} materiales)? Queda en blanco para subirlo de nuevo; el historial se conserva.`)) return
  aviso.value = ''
  try {
    const n = await procura.vaciarFrente(props.frenteId, auth.session.user.id)
    aviso.value = `Metrado vaciado (${n} materiales). Ya puedes importar el nuevo.`
  } catch (e) {
    console.error(e)
    aviso.value = 'No se pudo vaciar el metrado.'
  }
}

function cargar() {
  procura.cargarDetalleFrente(props.frenteId)
}
onMounted(cargar)
watch(() => props.frenteId, cargar)

function total(fila) {
  return (Number(fila.cantidad_contractual) || 0) + (Number(fila.cantidad_procura) || 0)
}
const rotuloZona = (z) => z || '—'

// Planilla agrupada por zona (en el orden de las filas, que ya vienen por zona).
const grupos = computed(() => {
  const mapa = new Map()
  filas.value.forEach((fila, i) => {
    const z = fila.zona ?? ''
    if (!mapa.has(z)) mapa.set(z, [])
    mapa.get(z).push({ fila, i })
  })
  return [...mapa.entries()].map(([zona, lista]) => ({ zona, filas: lista }))
})

// Consolidado del frente: el mismo material de todas las zonas, sumado. Es la
// cantidad contra la que se mide lo que sale de Almacén.
const consolidado = computed(() => {
  const mapa = new Map()
  for (const f of filas.value) {
    const k = f.descripcion_edp_id
    if (!mapa.has(k)) mapa.set(k, { nombre: f.nombres_edp?.nombre ?? '', unidad: f.unidad, total: 0, zonas: 0 })
    const x = mapa.get(k)
    x.total += Number(f.cantidad_procura) || 0
    x.zonas++
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
})

async function guardarCelda(fila, campo, valorNuevo) {
  const valor = valorNuevo === '' ? 0 : Number(valorNuevo)
  if (valor === Number(fila[campo])) return

  aviso.value = ''
  try {
    await procura.guardarFila({
      frente_id: fila.frente_id,
      descripcion_edp_id: fila.descripcion_edp_id,
      zona: fila.zona ?? '',
      orden: fila.orden ?? null,
      unidad: fila.unidad,
      cantidad_contractual: campo === 'cantidad_contractual' ? valor : Number(fila.cantidad_contractual),
      cantidad_procura: campo === 'cantidad_procura' ? valor : Number(fila.cantidad_procura),
      responsable_id: auth.session.user.id,
      observaciones: fila.observaciones ?? null,
    })
    aviso.value = `"${fila.nombres_edp?.nombre}" actualizado.`
  } catch (e) {
    console.error(e)
    aviso.value = 'No se pudo guardar el cambio.'
  }
}

// Un mismo material puede repetirse en otra zona, así que se ofrecen todos.
const gruposDisponibles = computed(() => procura.nombresEdpActivos)

async function agregarMaterial() {
  if (!nuevaFila.descripcion_edp_id) return
  const grupo = procura.nombresEdpActivos.find((g) => g.id === nuevaFila.descripcion_edp_id)
  guardandoNueva.value = true
  aviso.value = ''
  try {
    await procura.guardarFila({
      frente_id: props.frenteId,
      descripcion_edp_id: nuevaFila.descripcion_edp_id,
      zona: nuevaFila.zona.trim(),
      unidad: grupo?.unidad_edp ?? '',
      cantidad_contractual: 0,
      cantidad_procura: Number(nuevaFila.cantidad_procura) || 0,
      responsable_id: auth.session.user.id,
      observaciones: null,
    })
    nuevaFila.descripcion_edp_id = ''
    nuevaFila.zona = ''
    nuevaFila.cantidad_procura = ''
    aviso.value = 'Grupo EDP agregado al metrado.'
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

/** Historial global del frente, con la variación de Procura contra la versión anterior del mismo grupo EDP. */
const historialConDelta = computed(() => {
  const porMaterial = new Map()
  for (const h of procura.historial) {
    const k = claveMetrado(h)
    if (!porMaterial.has(k)) porMaterial.set(k, [])
    porMaterial.get(k).push(h)
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
        ...(hayZonas.value ? { Zona: f.zona || '' } : {}),
        'Nombre EDP': f.nombres_edp?.nombre ?? '',
        Cantidad: total(f),
        Unidad: f.unidad,
      })),
    },
    {
      nombre: 'Historial',
      filas: historialConDelta.value.map((h) => ({
        Fecha: new Date(h.created_at).toLocaleString(),
        Zona: h.zona || '',
        'Nombre EDP': h.nombres_edp?.nombre ?? '',
        Unidad: h.unidad,
        Versión: h.version,
        Cantidad: total(h),
        'Δ Cantidad': h.deltaProcura ?? '',
        Responsable: h.usuarios?.nombre ?? '',
      })),
    },
  ]

  if (puedeVerComparacion.value) {
    hojas.push({
      nombre: 'Comparación vs consumo',
      filas: procura.comparacion.map((c) => ({
        'Nombre EDP': c.nombre_edp ?? '',
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

  const nombreFrente = (props.frente.codigo ? `${props.frente.codigo}_` : '') + props.frente.nombre
  descargarExcel(`procura_${nombreFrente}.xlsx`, hojas)
}
</script>

<template>
  <div class="pl-col">
    <p v-if="procura.cargando" class="pl-empty">Cargando…</p>
    <p v-else-if="procura.error" class="error">{{ procura.error }}</p>

    <template v-else>
      <div class="seccion-cabecera">
        <div class="pl-sh">Planilla de metrado</div>
        <div class="pl-acts">
          <button
            v-if="puedeEditar"
            type="button"
            class="pl-ghost"
            @click="mostrarModalImportar = true"
          >
            Importar metrado masivo
          </button>
          <button v-if="puedeEditar && filas.length" type="button" class="pl-ghost" @click="vaciarMetrado">Vaciar metrado</button>
          <button type="button" class="pl-ghost" @click="exportarExcel">Exportar Excel</button>
        </div>
      </div>

      <p v-if="aviso" class="aviso">{{ aviso }}</p>

      <section class="planilla">
        <div class="marco-tabla">
          <table data-sin-filtro>
            <thead>
              <tr>
                <th class="col-num">#</th>
                <th>Nombre EDP</th>
                <th>Cantidad</th>
                <th>Unidad</th>
                <th v-if="puedeEditar"></th>
              </tr>
            </thead>
            <tbody ref="cuerpoPlanilla" @keydown="onTeclaCelda">
              <template v-for="g in grupos" :key="g.zona">
                <!-- Subtítulo de zona: el metrado se ve tal como se subió por Excel. -->
                <tr v-if="hayZonas" class="fila-zona">
                  <td :colspan="puedeEditar ? 5 : 4">{{ g.zona || 'Sin zona' }}</td>
                </tr>
                <tr v-for="x in g.filas" :key="x.fila.id">
                  <td class="col-num">{{ x.i + 1 }}</td>
                  <td class="col-descripcion">{{ x.fila.nombres_edp?.nombre }}</td>
                  <td class="celda-editable">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      :data-fila="x.i"
                      data-col="0"
                      :value="x.fila.cantidad_procura"
                      :disabled="!puedeEditar"
                      @focus="$event.target.select()"
                      @change="guardarCelda(x.fila, 'cantidad_procura', $event.target.value)"
                    />
                  </td>
                  <td class="col-unidad">{{ x.fila.unidad }}</td>
                  <td v-if="puedeEditar" class="td-acciones">
                    <div class="acciones-fila">
                      <BotonIcono variante="editar" titulo="Editar" @click="filaEnEdicion = x.fila" />
                      <BotonIcono variante="eliminar" titulo="Quitar del metrado" @click="eliminarFila(x.fila)" />
                    </div>
                  </td>
                </tr>
              </template>
              <tr v-if="!filas.length">
                <td :colspan="puedeEditar ? 5 : 4" class="vacio">Este frente todavía no tiene materiales previstos.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="puedeEditar" class="agregar-fila">
          <BuscadorNombreEdp v-model="nuevaFila.descripcion_edp_id" :grupos="gruposDisponibles" class="buscador" />
          <input v-model="nuevaFila.zona" type="text" placeholder="Zona (opcional)" />
          <input v-model="nuevaFila.cantidad_procura" type="number" step="0.001" min="0" placeholder="Cantidad" />
          <button type="button" class="pl-ghost" :disabled="!nuevaFila.descripcion_edp_id || guardandoNueva" @click="agregarMaterial">
            + Agregar material
          </button>
        </div>
      </section>

      <details v-if="hayZonas" class="pl-det" open>
        <summary>Consolidado del frente (todas las zonas)</summary>
        <div class="cuerpo"><div class="marco-tabla">
          <table data-sin-filtro>
            <thead>
              <tr>
                <th class="col-num">#</th>
                <th>Nombre EDP</th>
                <th>Cantidad total</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, i) in consolidado" :key="c.nombre">
                <td class="col-num">{{ i + 1 }}</td>
                <td class="col-descripcion">{{ c.nombre }}</td>
                <td><strong>{{ c.total }}</strong><span v-if="c.zonas > 1" class="en-zonas"> · en {{ c.zonas }} zonas</span></td>
                <td class="col-unidad">{{ c.unidad }}</td>
              </tr>
            </tbody>
          </table>
        </div></div>
      </details>

      <details class="pl-det">
        <summary>Historial de modificaciones</summary>
        <div class="cuerpo"><div class="marco-tabla">
          <table data-sin-filtro>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Zona</th>
                <th>Nombre EDP</th>
                <th>Unidad</th>
                <th>Versión</th>
                <th>Cantidad</th>
                <th>Δ</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in historialConDelta" :key="h.id">
                <td>{{ new Date(h.created_at).toLocaleString() }}</td>
                <td>{{ rotuloZona(h.zona) }}</td>
                <td class="col-descripcion">{{ h.nombres_edp?.nombre }}</td>
                <td class="col-unidad">{{ h.unidad }}</td>
                <td>v{{ h.version }}</td>
                <td>{{ total(h) }}</td>
                <td>
                  <span v-if="h.deltaProcura === null">—</span>
                  <span v-else :class="h.deltaProcura >= 0 ? 'delta-pos' : 'delta-neg'">
                    {{ h.deltaProcura > 0 ? '+' : '' }}{{ h.deltaProcura }}
                  </span>
                </td>
                <td>{{ h.usuarios?.nombre ?? '—' }}</td>
              </tr>
              <tr v-if="!historialConDelta.length">
                <td colspan="8" class="vacio">Todavía no hay modificaciones registradas.</td>
              </tr>
            </tbody>
          </table>
        </div></div>
      </details>

      <details v-if="puedeVerComparacion" class="pl-det">
        <summary>Comparación Procura vs. consumo</summary>
        <div class="cuerpo"><div class="marco-tabla">
          <table data-sin-filtro>
            <thead>
              <tr>
                <th>Nombre EDP</th>
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
              <tr v-for="c in procura.comparacion" :key="c.descripcion_edp_id">
                <td class="col-descripcion">{{ c.nombre_edp ?? '—' }}</td>
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
                <td colspan="9" class="vacio">No hay datos de consumo para este frente.</td>
              </tr>
            </tbody>
          </table>
        </div></div>
      </details>
    </template>

    <ImportarMetradoModal
      v-if="mostrarModalImportar"
      :nombres-edp="procura.nombresEdpActivos"
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
.seccion-cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
/* Subtítulo de zona: tal como viene en el Excel, a la izquierda, sin fondo. */
.planilla .fila-zona td {
  background: transparent;
  padding: 12px 10px 3px 16px;
  text-align: left !important;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: none;
  color: #dc2626;
  border-bottom: 0;
}
/* Planilla compacta */
.planilla table th {
  padding: 8px 10px;
}
.planilla .marco-tabla table td {
  padding: 0 10px;
  height: 27px;
  line-height: 1.15;
  font-size: 13px;
}
.planilla .marco-tabla table th {
  padding: 6px 10px;
}
.planilla .celda-editable input {
  height: 22px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 13px;
}
.planilla .acciones-fila {
  transform: scale(0.85);
  transform-origin: right center;
}
.en-zonas {
  font-size: 12px;
  color: var(--p-faint);
}
.nota-ayuda {
  font-size: 13px;
  color: var(--p-faint);
  margin: 0 0 12px;
}
.tecla {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  background: var(--p-chip);
  border: 1px solid var(--p-line);
  border-bottom-width: 2px;
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--p-text);
}
.marco-tabla {
  overflow-x: auto;
  border-radius: 20px;
  background: var(--p-card);
  box-shadow: 0 0 0 1px var(--p-line);
  padding: 6px 8px 8px;
}
.pl-det .marco-tabla {
  box-shadow: none;
  padding: 0;
}
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 760px;
}
th,
td {
  padding: 10px 12px;
  font-size: 14px;
  text-align: center;
  white-space: nowrap;
}
tbody td {
  height: 52px;
}
thead th {
  height: 44px;
  padding: 0 12px;
  color: var(--p-faint);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
tbody tr:hover td {
  background: var(--p-hover);
}
tbody td:first-child {
  border-radius: 12px 0 0 12px;
}
tbody td:last-child {
  border-radius: 0 12px 12px 0;
}
td.col-descripcion {
  white-space: normal;
  min-width: 220px;
  text-align: left;
  font-weight: 600;
}
th.col-descripcion,
thead th:nth-child(2) {
  text-align: left;
}
td.col-unidad {
  color: var(--p-faint);
  font-size: 12px;
  font-weight: 600;
}
.acciones-fila {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}
td.celda-editable {
  padding: 0;
}
td.celda-editable input {
  width: 100%;
  height: 100%;
  min-height: 52px;
  border: none;
  background: transparent;
  padding: 0.4rem 0.6rem;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--p-text);
}
td.celda-editable input:disabled {
  color: var(--p-muted);
}
td.celda-editable input:focus {
  outline: 2px solid #f6a800;
  outline-offset: -2px;
  background: var(--p-hover);
}
tbody td.col-total {
  background: var(--p-ok-bg);
  color: var(--p-ok-fg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.agregar-fila {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 16px;
  flex-wrap: wrap;
}
.agregar-fila .buscador {
  flex: 1;
  min-width: 220px;
}
.agregar-fila input {
  width: 150px;
  height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: var(--p-card);
  color: var(--p-text);
  box-shadow: 0 0 0 1px var(--p-line-ctl);
  text-align: center;
}
.badge-pct {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.badge-pct.normal {
  background: var(--p-ok-bg);
  color: var(--p-ok-fg);
}
.badge-pct.riesgo {
  background: var(--p-warn-bg);
  color: var(--p-warn-fg);
}
.badge-pct.sobre {
  background: var(--p-low-bg);
  color: var(--p-low-fg);
}
.delta-pos {
  color: var(--p-ok-fg);
  font-weight: 700;
}
.delta-neg {
  color: var(--p-low-fg);
  font-weight: 700;
}
.vacio {
  text-align: center;
  color: var(--p-faint);
  white-space: normal;
}
.aviso {
  color: var(--p-ok-fg);
  font-size: 14px;
  margin: 0;
}
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
</style>

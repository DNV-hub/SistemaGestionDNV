<script setup>
// Calidad: control de sostenimiento por frente (perforación, inyección,
// malla, cable y pull test) y comparativo entre frentes. Solo lectura.
import { computed, onMounted, ref, watch } from 'vue'
import { cargarComparacion, cargarFrente, listarFrentes } from '../services/calidadService'
import { PERIODOS, armarCalidad, armarComparacion, listaDiametros, num } from '../utils/calidad'
import { exportarCalidad } from '../utils/exportarCalidad'
import SelectorFrente from '../components/SelectorFrente.vue'
import PanelPerforacion from '../components/PanelPerforacion.vue'
import PanelInyeccion from '../components/PanelInyeccion.vue'
import PanelMalla from '../components/PanelMalla.vue'
import PanelCable from '../components/PanelCable.vue'
import PanelPullTest from '../components/PanelPullTest.vue'
import CompararFrentes from '../components/CompararFrentes.vue'
import '../../../styles/planeamiento-ui.css'
import '../calidad.css'

const CLAVE_FRENTE = 'dnv-calidad-frente'
const leer = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const guardar = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: se elige de nuevo la próxima vez */
  }
}

const modo = ref('uno')
const periodo = ref('todo')
const pestana = ref('perf')

const frentes = ref([])
const frenteId = ref(null)
const errorFrentes = ref('')

const crudos = new Map() // frenteId → datos del servicio (se piden una vez)
const datos = ref(null)
const cargando = ref(false)
const error = ref('')

const comparacionCruda = ref(null)
const cargandoCmp = ref(false)
const errorCmp = ref('')

async function iniciar() {
  errorFrentes.value = ''
  try {
    frentes.value = await listarFrentes()
    const guardado = leer(CLAVE_FRENTE)
    frenteId.value =
      frentes.value.find((f) => f.id === guardado)?.id ?? frentes.value.find((f) => f.estado === 'activo')?.id ?? frentes.value[0]?.id ?? null
  } catch (e) {
    console.error(e)
    errorFrentes.value = `No se pudo cargar la lista de frentes${e?.message ? ': ' + e.message : '.'}`
  }
}
onMounted(iniciar)

async function cargar() {
  const id = frenteId.value
  if (!id) return
  error.value = ''
  if (crudos.has(id)) {
    datos.value = crudos.get(id)
    return
  }
  cargando.value = true
  datos.value = null
  try {
    const d = await cargarFrente(id)
    crudos.set(id, d)
    if (frenteId.value === id) datos.value = d
  } catch (e) {
    console.error(e)
    if (frenteId.value === id) error.value = `No se pudo cargar el frente${e?.message ? ': ' + e.message : '.'}`
  } finally {
    if (frenteId.value === id) cargando.value = false
  }
}
watch(frenteId, (id) => {
  if (!id) return
  guardar(CLAVE_FRENTE, id)
  cargar()
})

async function cargarCmp() {
  if (comparacionCruda.value || cargandoCmp.value) return
  cargandoCmp.value = true
  errorCmp.value = ''
  try {
    comparacionCruda.value = await cargarComparacion()
  } catch (e) {
    console.error(e)
    errorCmp.value = `No se pudo cargar el comparativo${e?.message ? ': ' + e.message : '.'}`
  } finally {
    cargandoCmp.value = false
  }
}
watch(modo, (m) => m === 'todos' && cargarCmp())

const calidad = computed(() => (datos.value ? armarCalidad(datos.value, periodo.value) : null))
const filasCmp = computed(() => (comparacionCruda.value ? armarComparacion(comparacionCruda.value, periodo.value) : []))
const frente = computed(() => frentes.value.find((f) => f.id === frenteId.value) ?? null)

function abrirFrente(id) {
  frenteId.value = id
  modo.value = 'uno'
}

const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0)
const tarjetas = computed(() => {
  const c = calidad.value
  if (!c) return []
  const tot = c.conBiblioteca ? c.totalBiblioteca : null
  const m = c.malla
  const tipoMalla = m.tipos.length === 1 ? ` ${m.tipos[0]}` : m.tipos.length > 1 ? ` · ${m.tipos.length} tipos` : ''
  const ult = c.pullTest.ultimo
  return [
    { clave: 'perf', nombre: 'Perforación', ic: 'pf', v: num(c.perforacion.n), u: tot ? `/${tot}` : ' pernos', s: `${num(c.perforacion.ml)} ML perforados`, barra: tot ? pct(c.perforacion.n, tot) : null },
    { clave: 'iny', nombre: 'Inyección', ic: 'in', v: num(c.inyeccion.anclajes), u: tot ? `/${tot}` : ' anclajes', s: `${num(c.inyeccion.bolsas)} ${c.inyeccion.bolsas === 1 ? 'bolsa' : 'bolsas'} de cemento`, barra: tot ? pct(c.inyeccion.anclajes, tot) : null },
    { clave: 'mal', nombre: 'Malla', ic: 'ml', v: num(m.area), u: ' m²', s: `${m.n} ${m.n === 1 ? 'paño' : 'paños'}${tipoMalla}`, barra: null },
    { clave: 'cab', nombre: 'Cable', ic: 'cb', v: num(c.cable.ml), u: ' ML', s: `${c.cable.n} ${c.cable.n === 1 ? 'tramo' : 'tramos'}${c.cable.n ? ' · ' + listaDiametros(c.cable.porDiametro) : ''}`, barra: null },
    { clave: 'pt', nombre: 'Pull test', ic: 'pt', v: String(c.pullTest.n), u: c.pullTest.n === 1 ? ' ensayo' : ' ensayos', s: ult ? `${ult.codigo} · ${ult.etiqueta}` : 'Sin ensayos', barra: null },
  ]
})

// Flechas izquierda/derecha entre las cinco tarjetas (patrón de pestañas).
const refTarjetas = ref([])
function alTeclearTab(e, i) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  e.preventDefault()
  const n = tarjetas.value.length
  const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n
  pestana.value = tarjetas.value[j].clave
  refTarjetas.value[j]?.focus()
}

const exportando = ref(false)
async function exportar() {
  if (!calidad.value || !frente.value) return
  exportando.value = true
  try {
    await exportarCalidad(frente.value.nombre, periodo.value, calidad.value)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo exportar${e?.message ? ': ' + e.message : '.'}`
  } finally {
    exportando.value = false
  }
}
</script>

<template>
  <div class="pl cal cal-page">
    <header class="cal-top">
      <div>
        <h1>Calidad</h1>
        <div class="sub">Control de sostenimiento por frente</div>
      </div>
      <div class="cal-seg" role="group" aria-label="Pantalla">
        <button type="button" :aria-pressed="modo === 'uno'" @click="modo = 'uno'">Un frente</button>
        <button type="button" :aria-pressed="modo === 'todos'" @click="modo = 'todos'">Comparar frentes</button>
      </div>
      <button
          type="button"
          class="cal-btn"
          :disabled="modo !== 'uno' || !calidad || exportando"
          :title="modo !== 'uno' ? 'Exporta un frente a la vez: elige «Un frente»' : 'Descargar Excel del frente y periodo en pantalla'"
          @click="exportar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
          {{ exportando ? 'Exportando…' : 'Exportar' }}
      </button>
    </header>

    <div class="cal-bar">
      <SelectorFrente v-if="modo === 'uno' && frentes.length" v-model="frenteId" :frentes="frentes" />
      <span v-else></span>
      <div class="cal-chips" role="group" aria-label="Periodo">
        <button v-for="p in PERIODOS" :key="p.clave" type="button" class="cal-chip" :aria-pressed="periodo === p.clave" @click="periodo = p.clave">
          {{ p.etiqueta }}
        </button>
      </div>
    </div>

    <div v-if="errorFrentes" class="cal-error" role="alert">{{ errorFrentes }} <button type="button" @click="iniciar">Reintentar</button></div>

    <template v-if="modo === 'uno'">
      <div v-if="error" class="cal-error" role="alert">{{ error }} <button type="button" @click="cargar">Reintentar</button></div>

      <template v-if="cargando">
        <div class="cal-ctrls" aria-hidden="true"><div v-for="i in 5" :key="i" class="cal-sk" style="height: 112px"></div></div>
        <div class="cal-sk" style="height: 260px" aria-label="Cargando…"></div>
      </template>

      <template v-else-if="calidad">
        <div class="cal-ctrls" role="tablist" aria-label="Controles de calidad">
          <button
            v-for="(t, i) in tarjetas"
            :id="`cal-tab-${t.clave}`"
            :key="t.clave"
            :ref="(el) => (refTarjetas[i] = el)"
            type="button"
            class="cal-cc"
            role="tab"
            :aria-selected="pestana === t.clave"
            aria-controls="cal-panel"
            :tabindex="pestana === t.clave ? 0 : -1"
            @click="pestana = t.clave"
            @keydown="alTeclearTab($event, i)"
          >
            <div class="h">
              <span class="cal-ic" :class="t.ic" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                  <path v-if="t.ic === 'pf'" d="M12 3v14M8 13l4 4 4-4M5 21h14" />
                  <path v-else-if="t.ic === 'in'" d="M12 3c3 4 5 6.5 5 9.5a5 5 0 01-10 0C7 9.5 9 7 12 3z" />
                  <path v-else-if="t.ic === 'ml'" d="M3 6l9-3 9 3M3 12l9-3 9 3M3 18l9-3 9 3" />
                  <path v-else-if="t.ic === 'cb'" d="M4 17c4-8 12-8 16 0M4 11c4-8 12-8 16 0" />
                  <path v-else d="M12 21V8M7 13l5-5 5 5M5 4h14" />
                </svg>
              </span>
              {{ t.nombre }}
            </div>
            <div class="v">{{ t.v }}<small>{{ t.u }}</small></div>
            <div class="s">{{ t.s }}</div>
            <div v-if="t.barra !== null" class="cal-pb"><i :style="{ width: t.barra + '%' }"></i></div>
          </button>
        </div>

        <div id="cal-panel" role="tabpanel" :aria-labelledby="`cal-tab-${pestana}`">
          <PanelPerforacion v-if="pestana === 'perf'" :datos="calidad.perforacion" :con-biblioteca="calidad.conBiblioteca" />
          <PanelInyeccion
            v-else-if="pestana === 'iny'"
            :datos="calidad.inyeccion"
            :con-biblioteca="calidad.conBiblioteca"
            :total-biblioteca="calidad.totalBiblioteca"
          />
          <PanelMalla v-else-if="pestana === 'mal'" :datos="calidad.malla" />
          <PanelCable v-else-if="pestana === 'cab'" :datos="calidad.cable" />
          <PanelPullTest v-else :datos="calidad.pullTest" />
        </div>
        <p class="cal-nota">Solo cuentan los reportes enviados; los borradores no aparecen hasta que el supervisor los envía.</p>
      </template>
    </template>

    <template v-else>
      <div v-if="errorCmp" class="cal-error" role="alert">{{ errorCmp }} <button type="button" @click="cargarCmp">Reintentar</button></div>
      <div v-if="cargandoCmp" class="cal-sk" style="height: 420px" aria-label="Cargando…"></div>
      <CompararFrentes v-else-if="comparacionCruda" :filas="filasCmp" :frente-actual="frenteId" :periodo-todo="periodo === 'todo'" @elegir="abrirFrente" />
    </template>
  </div>
</template>

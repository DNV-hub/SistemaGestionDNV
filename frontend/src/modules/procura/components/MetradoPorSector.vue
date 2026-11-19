<script setup>
// PRUEBA · Metrado del plano por sector (v5). Constructivo → redline.
// Solo el redline con firma de BBA entra a la cantidad vigente; el que
// está sin firma se muestra en ámbar como "pendiente".
import { computed, onMounted, ref, watch } from 'vue'
import { cargarMetradoVigente, cargarSectores, num } from '../../frentes/services/controlObraService'
import { descargarExcel } from '../../../utils/exportarExcel'

const props = defineProps({
  frenteId: { type: String, required: true },
  nombreFrente: { type: String, default: '' },
})

const cargando = ref(false)
const error = ref('')
const filas = ref([])
const sectores = ref([])
const sector = ref('all')
const abierta = ref(null)

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [m, s] = await Promise.all([cargarMetradoVigente(props.frenteId), cargarSectores(props.frenteId)])
    filas.value = m
    sectores.value = s
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo cargar el metrado por sector.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)
watch(() => props.frenteId, cargar)

const opciones = computed(() => [{ codigo: 'all', nombre: 'Todo el frente' }, ...sectores.value])
const nombre = (c) => opciones.value.find((o) => o.codigo === c)?.nombre ?? c
const visibles = computed(() => (sector.value === 'all' ? filas.value : filas.value.filter((f) => f.sector_codigo === sector.value)))
const conCambio = (f) => f.redline_aprobado || f.redline_pendiente
const cantRl = (f) => (f.redline_aprobado ? f.cantidad_redline_aprobado : f.cantidad_redline_pendiente)
const dif = (f) => Number(cantRl(f) ?? f.cantidad_constructivo) - Number(f.cantidad_constructivo)
const pendientes = computed(() => visibles.value.filter((f) => f.redline_pendiente && !f.redline_aprobado).length)
const planos = computed(() => [...new Set(filas.value.map((f) => f.plano_origen).filter(Boolean))])

function exportar() {
  const datos = visibles.value.map((f) => ({
    Sector: nombre(f.sector_codigo),
    Ítem: f.item_codigo,
    Descripción: f.descripcion,
    Unidad: f.unidad,
    Constructivo: Number(f.cantidad_constructivo),
    Redline: f.redline_aprobado || f.redline_pendiente || '',
    'Cantidad redline': cantRl(f) == null ? '' : Number(cantRl(f)),
    'Firma BBA': f.redline_aprobado ? 'Sí' : f.redline_pendiente ? 'Pendiente' : '',
    Vigente: Number(f.cantidad_vigente),
    Nota: f.nota_redline || '',
  }))
  descargarExcel(`metrado_por_sector_${props.nombreFrente || 'frente'}.xlsx`, [{ nombre: 'Metrado por sector', filas: datos }])
}
</script>

<template>
  <section class="pl-panel">
    <div class="cab">
      <div>
        <div class="pl-sh">Metrado del plano por sector</div>
        <p class="pl-sub">{{ planos.join(' · ') || 'Sin plano cargado' }}</p>
      </div>
      <button type="button" class="pl-ghost" :disabled="!visibles.length" @click="exportar">Exportar</button>
    </div>

    <div v-if="sectores.length" class="sectores" role="group" aria-label="Sector">
      <button
        v-for="o in opciones"
        :key="o.codigo"
        type="button"
        class="pl-seg"
        :class="{ on: sector === o.codigo }"
        :aria-pressed="sector === o.codigo"
        @click="sector = o.codigo"
      >
        {{ o.nombre }}
      </button>
    </div>

    <p v-if="error" class="pl-error">{{ error }}</p>
    <p v-else-if="cargando" class="pl-empty">Cargando…</p>
    <p v-else-if="!filas.length" class="pl-empty">Este frente todavía no tiene metrado del plano por sector.</p>
    <template v-else>
      <p v-if="pendientes" class="aviso">
        <span class="rl pend">RL</span> {{ pendientes }} ítem(s) con redline sin firma de BBA: la cantidad vigente sigue siendo la del constructivo.
      </p>
      <div class="tabla">
        <div class="pl-th fila">
          <span>SECTOR</span><span>DESCRIPCIÓN</span><span>UND</span><span class="pl-r">CONSTRUCTIVO</span><span class="pl-c">RL</span><span class="pl-r">REDLINE</span><span class="pl-r">VIGENTE</span>
        </div>
        <template v-for="f in visibles" :key="f.item_codigo">
          <div class="pl-tr fila">
            <span class="pl-semi">{{ nombre(f.sector_codigo) }}</span>
            <span>{{ f.descripcion }}</span>
            <span>{{ f.unidad }}</span>
            <span class="pl-r">{{ num(f.cantidad_constructivo) }}</span>
            <span class="pl-c">
              <button
                v-if="conCambio(f)"
                type="button"
                class="rl"
                :class="f.redline_aprobado ? 'ok' : 'pend'"
                :title="`${num(f.cantidad_constructivo)} constructivo → ${num(cantRl(f))} ${f.redline_aprobado || f.redline_pendiente}${f.redline_aprobado ? ' (firmado BBA)' : ' (pendiente de firma BBA)'}`"
                :aria-expanded="abierta === f.item_codigo"
                @click="abierta = abierta === f.item_codigo ? null : f.item_codigo"
              >
                RL
              </button>
            </span>
            <span class="pl-r" :class="{ amb: f.redline_pendiente && !f.redline_aprobado }">
              <template v-if="conCambio(f)">
                {{ num(cantRl(f)) }}
                <small v-if="dif(f)" :class="dif(f) > 0 ? 'mas' : 'menos'">{{ dif(f) > 0 ? '+' : '' }}{{ num(dif(f)) }}</small>
              </template>
              <template v-else>—</template>
            </span>
            <span class="pl-r pl-strong">{{ num(f.cantidad_vigente) }}</span>
          </div>
          <div v-if="abierta === f.item_codigo" class="nota">
            <b>{{ num(f.cantidad_constructivo) }} {{ f.unidad }} constructivo → {{ num(cantRl(f)) }} {{ f.unidad }} {{ f.redline_aprobado || f.redline_pendiente }}</b>
            <span>{{ f.redline_aprobado ? 'Firmado por BBA: entra a la cantidad vigente.' : 'Sin firma de BBA: no entra a la cantidad vigente hasta que se apruebe.' }}</span>
            <span v-if="f.nota_redline">{{ f.nota_redline }}</span>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.cab { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
.sectores { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 10px; background: var(--p-chip); width: fit-content; margin-bottom: 12px; }
.pl-seg.on { background: #f5a800; color: #0d0f10; }
.tabla { overflow-x: auto; }
.fila { display: grid; grid-template-columns: 90px minmax(240px, 1fr) 50px 110px 50px 110px 90px; gap: 8px; align-items: center; padding: 0 8px; }
.rl { font-size: 11px; font-weight: 800; border-radius: 6px; padding: 3px 6px; border: 1px solid; cursor: pointer; background: transparent; }
.rl.ok { color: var(--p-ok-fg); border-color: var(--p-ok-fg); }
.rl.pend { color: var(--p-amber-txt); border-color: var(--p-amber-txt); background: var(--p-warn-bg); }
.amb { color: var(--p-amber-txt); }
small { font-size: 11px; margin-left: 4px; }
.mas { color: var(--p-ok-fg); }
.menos { color: var(--p-danger); }
.aviso { font-size: 13px; color: var(--p-amber-txt); margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
.nota { display: flex; flex-direction: column; gap: 4px; margin: 0 8px 8px 98px; padding: 10px 12px; border-radius: 10px; background: var(--p-chip); font-size: 13px; }
</style>

<script setup>
import { computed, ref } from 'vue'
import { fechaCorta, num } from '../utils/calidad'
import AvisoCalidad from './AvisoCalidad.vue'
import DesplegableMes from './DesplegableMes.vue'
import ModalCalidad from './ModalCalidad.vue'

const props = defineProps({
  datos: { type: Object, required: true },
  conBiblioteca: { type: Boolean, default: false },
})

const resumenMes = computed(() => (props.datos.porMes.length ? `${props.datos.porMes.map((m) => `${m.corto} ${m.n}`).join(' · ')} pernos` : 'Sin perforaciones'))
const maxMes = computed(() => Math.max(1, ...props.datos.porMes.map((m) => m.n)))
const maxDia = computed(() => Math.max(1, ...props.datos.porDia.map((d) => d.n)))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const metros = (v) => (v ? `${num(v, 2)} m` : '—')

// Ventana: una ubicación de la biblioteca, lo reportado de una zona sin
// biblioteca, o los códigos fuera de biblioteca de una zona.
const sel = ref(null)
const filtro = ref('todos')
function abrir(v) {
  sel.value = v
  filtro.value = 'todos'
}
const tituloModal = computed(() => (sel.value ? `${sel.value.zona} · ${sel.value.ubicacion}` : ''))
const subModal = computed(() => {
  const s = sel.value
  if (!s) return ''
  if (s.tipo === 'fuera') return 'Códigos perforados que no están en la biblioteca de pernos'
  if (s.tipo === 'reportado') return `${s.items.length} perforados (frente sin biblioteca de pernos)`
  return [s.diametro ? `Ø ${num(s.diametro)} mm` : null, s.longitud ? `longitud ${num(s.longitud, 2)} m` : null].filter(Boolean).join(' · ')
})
const conteo = computed(() => {
  const items = sel.value?.items ?? []
  const p = items.filter((i) => i.fecha).length
  return { todos: items.length, ok: p, no: items.length - p }
})
const visibles = computed(() => {
  const items = sel.value?.items ?? []
  if (filtro.value === 'ok') return items.filter((i) => i.fecha)
  if (filtro.value === 'no') return items.filter((i) => !i.fecha)
  return items
})

const textoFuera = computed(() => {
  const f = props.datos.fuera
  const codigos = f.map((c) => c.codigo)
  const lista = codigos.length > 1 ? `${codigos.slice(0, -1).join(', ')} y ${codigos.at(-1)}` : codigos[0]
  const ubics = [...new Set(f.map((c) => c.ubicacionReportada))].map((u) => `«${u}»`).join(', ')
  const fechas = [...new Set(f.map((c) => fechaCorta(c.fecha)))].join(', ')
  return { lista, ubics, fechas }
})
</script>

<template>
  <div class="cal-panel">
    <DesplegableMes titulo="Reporte por mes" :resumen="resumenMes">
      <div class="cal-ch"><h3>Perforados por mes</h3><span>pernos</span></div>
      <div class="cal-mrow h"><span>MES</span><span>PERNOS</span><span class="cal-num">TOTAL</span><span class="hm2"></span></div>
      <div v-for="m in datos.porMes" :key="m.clave" class="cal-mrow">
        <b>{{ m.nombre }}</b>
        <div class="cal-pbar"><i :style="{ width: pct(m.n, maxMes) + '%' }"></i></div>
        <b class="cal-num">{{ m.n }}</b>
        <span class="hm2"></span>
      </div>
      <p v-if="!datos.porMes.length" class="cal-vacio">Sin perforaciones en este periodo.</p>
    </DesplegableMes>

    <!-- Con biblioteca: avance contra lo esperado por zona y ubicación -->
    <div v-if="conBiblioteca" class="cal-card">
      <div class="cal-ch"><h3>Avance por zona</h3><span>toca una fila para ver sus códigos</span></div>
      <div class="cal-row h r-zona"><span>UBICACIÓN</span><span class="cal-num">PERFORADOS</span><span class="hm">AVANCE</span></div>
      <template v-for="z in datos.avance" :key="z.zona">
        <div class="cal-zh">
          <b>{{ z.zona }}</b>
          <span v-if="z.total">{{ z.perforados }} / {{ z.total }} perforados</span>
          <span v-else>fuera de biblioteca</span>
        </div>
        <button
          v-for="u in z.ubicaciones"
          :key="u.ubicacion"
          type="button"
          class="cal-row r-zona"
          :aria-label="`${z.zona} · ${u.ubicacion}: ${u.perforados} de ${u.total} perforados. Ver códigos`"
          @click="abrir({ tipo: 'biblioteca', zona: z.zona, ...u })"
        >
          <div class="cal-nm"><b>{{ u.ubicacion }}</b></div>
          <span class="cal-num"><b>{{ u.perforados }}</b> / {{ u.total }}</span>
          <div class="cal-pbar hm" :class="{ g: u.perforados === u.total }"><i :style="{ width: pct(u.perforados, u.total) + '%' }"></i></div>
        </button>
        <button
          v-if="z.fuera.length"
          type="button"
          class="cal-row r-zona"
          :aria-label="`${z.zona}: ${z.fuera.length} códigos fuera de biblioteca. Ver códigos`"
          @click="abrir({ tipo: 'fuera', zona: z.zona, ubicacion: 'Fuera de biblioteca', items: z.fuera })"
        >
          <div class="cal-nm"><b>Fuera de biblioteca</b></div>
          <span class="cal-num"><span class="cal-pill r">{{ z.fuera.length }}</span></span>
          <span class="hm"></span>
        </button>
      </template>
      <p v-if="!datos.avance.length" class="cal-vacio">La biblioteca de pernos de este frente está vacía.</p>
    </div>

    <!-- Sin biblioteca: solo lo reportado -->
    <div v-else class="cal-card">
      <div class="cal-ch"><h3>Perforados por zona</h3><span>sin biblioteca de pernos: solo lo reportado</span></div>
      <div class="cal-row h r-zona"><span>UBICACIÓN</span><span class="cal-num">PERFORADOS</span><span class="hm"></span></div>
      <template v-for="z in datos.sinBiblioteca" :key="z.zona">
        <div class="cal-zh"><b>{{ z.zona }}</b><span>{{ z.total }} perforados</span></div>
        <button
          v-for="u in z.ubicaciones"
          :key="u.ubicacion"
          type="button"
          class="cal-row r-zona"
          :aria-label="`${z.zona} · ${u.ubicacion}: ${u.perforados} perforados. Ver códigos`"
          @click="abrir({ tipo: 'reportado', zona: z.zona, ubicacion: u.ubicacion, items: u.items })"
        >
          <div class="cal-nm"><b>{{ u.ubicacion }}</b></div>
          <span class="cal-num"><b>{{ u.perforados }}</b></span>
          <span class="hm"></span>
        </button>
      </template>
      <p v-if="!datos.sinBiblioteca.length" class="cal-vacio">Sin perforaciones en este periodo.</p>
    </div>

    <div class="cal-card">
      <div class="cal-ch"><h3>Perforados por día</h3><span>pernos</span></div>
      <div v-if="datos.porDia.length" class="cal-bars">
        <div v-for="d in datos.porDia" :key="d.fecha" :title="`${d.etiqueta}: ${d.n} pernos`">
          <b>{{ d.n }}</b>
          <i :style="{ height: Math.max(3, (d.n / maxDia) * 88) + 'px' }"></i>
          <span>{{ d.etiqueta }}</span>
        </div>
      </div>
      <p v-else class="cal-vacio">Sin perforaciones en este periodo.</p>
    </div>

    <AvisoCalidad v-if="conBiblioteca && datos.fuera.length">
      <b>{{ datos.fuera.length }} {{ datos.fuera.length === 1 ? 'perforación' : 'perforaciones' }} con código fuera de la biblioteca:</b>
      {{ textoFuera.lista }} (ubicación {{ textoFuera.ubics }}, {{ textoFuera.fechas }}). Cuentan en el total de perforados ({{ datos.n }}) pero no en
      el avance por ubicación.
    </AvisoCalidad>

    <ModalCalidad v-if="sel" :titulo="tituloModal" :subtitulo="subModal" @cerrar="sel = null">
      <div v-if="sel.tipo === 'biblioteca'" class="cal-zf" role="group" aria-label="Filtro de códigos">
        <button type="button" class="cal-chip" :aria-pressed="filtro === 'todos'" @click="filtro = 'todos'">Todos ({{ conteo.todos }})</button>
        <button type="button" class="cal-chip" :aria-pressed="filtro === 'ok'" @click="filtro = 'ok'">Perforados ({{ conteo.ok }})</button>
        <button type="button" class="cal-chip" :aria-pressed="filtro === 'no'" @click="filtro = 'no'">Faltan ({{ conteo.no }})</button>
      </div>
      <div v-else style="height: 12px"></div>
      <div class="cal-pg">
        <template v-if="sel.tipo === 'biblioteca'">
          <div v-for="i in visibles" :key="i.codigo" class="cal-pt" :class="{ no: !i.fecha }">
            {{ i.codigo }}<small>{{ i.fecha ? fechaCorta(i.fecha) : 'falta' }} · {{ metros(i.longitud) }}</small>
          </div>
        </template>
        <template v-else-if="sel.tipo === 'fuera'">
          <div v-for="i in sel.items" :key="i.cod" class="cal-pt out">
            {{ i.codigo }}<small>{{ fechaCorta(i.fecha) }} · {{ i.ubicacionReportada }}</small>
          </div>
        </template>
        <template v-else>
          <div v-for="i in sel.items" :key="i.cod" class="cal-pt">
            {{ i.codigo }}<small>{{ fechaCorta(i.fecha) }} · {{ metros(i.longitud) }}</small>
          </div>
        </template>
      </div>
      <p v-if="sel.tipo === 'biblioteca' && !visibles.length" class="cal-vacio">Sin códigos con este filtro.</p>
    </ModalCalidad>
  </div>
</template>

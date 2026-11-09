<script setup>
import { computed, ref } from 'vue'
import { num } from '../utils/calidad'
import AvisoCalidad from './AvisoCalidad.vue'
import DesplegableMes from './DesplegableMes.vue'
import ModalCalidad from './ModalCalidad.vue'

const props = defineProps({
  datos: { type: Object, required: true },
  conBiblioteca: { type: Boolean, default: false },
  totalBiblioteca: { type: Number, default: 0 },
})

const bolsasTxt = (n) => `${num(n)} ${n === 1 ? 'bolsa' : 'bolsas'}`
const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0)
const maxMes = computed(() => Math.max(1, ...props.datos.porMes.map((m) => m.mostrado)))
const maxDia = computed(() => Math.max(1, ...props.datos.porDia.map((d) => d.bolsas ?? 0)))
const resumenMes = computed(() =>
  props.datos.porMes.length ? `${props.datos.porMes.map((m) => `${m.corto} ${num(m.mostrado)}`).join(' · ')} bolsas` : 'Sin inyecciones'
)
const hayBitacoraMes = computed(() => props.datos.porMes.some((m) => m.bitacora > 0))

const sel = ref(null)
const subModal = computed(() => {
  const d = sel.value
  if (!d) return ''
  const bol = d.bolsas != null ? bolsasTxt(d.bolsas) : d.enBitacora ? `bitácora dice ${num(d.enBitacora)}` : 'sin dato de bolsas'
  return `${d.anclajes} anclajes · ${num(d.ml)} ml · ${bol}`
})

// Aviso: días con inyección y sin el campo de bolsas.
const aviso = computed(() => {
  const sin = props.datos.sinBolsas
  if (!sin.length) return null
  const partes = sin.map((d) => (d.enBitacora ? `${d.etiqueta} (la bitácora menciona ${bolsasTxt(d.enBitacora)}, pero el campo está vacío)` : `${d.etiqueta} (${num(d.ml)} ml)`))
  const bitacora = sin.reduce((s, d) => s + (d.enBitacora ?? 0), 0)
  const sinNada = sin.some((d) => !d.enBitacora)
  const total = props.datos.bolsas
  let cierre
  if (bitacora && !sinNada) cierre = `El total real podría ser ${num(total + bitacora)} bolsas, no ${num(total)}.`
  else if (bitacora) cierre = `El total real podría ser ${num(total + bitacora)} bolsas o más, no ${num(total)}.`
  else cierre = `El total real podría ser mayor que ${bolsasTxt(total)}.`
  return { n: sin.length, lista: partes.join(', '), cierre }
})

const zonasPorInyectar = computed(() => [...new Set(props.datos.porInyectar.map((p) => p.zona))].join(', '))
</script>

<template>
  <div class="cal-panel">
    <div class="cal-kp">
      <div class="hl">
        <div class="l">Bolsas de cemento (reporte del supervisor)</div>
        <div class="v">{{ num(datos.bolsas) }}<small> bolsas</small></div>
      </div>
      <div>
        <div class="l">ml inyectados</div>
        <div class="v">{{ num(datos.ml) }}<small> ML</small></div>
      </div>
      <div>
        <div class="l">Anclajes inyectados</div>
        <div class="v">{{ datos.anclajes }}<small v-if="conBiblioteca"> / {{ totalBiblioteca }}</small></div>
      </div>
      <div>
        <div class="l">Rendimiento (días con dato)</div>
        <div v-if="datos.rendimiento != null" class="v">{{ num(datos.rendimiento) }}<small> ml/bolsa</small></div>
        <div v-else class="v vacio">—</div>
      </div>
    </div>

    <DesplegableMes titulo="Reporte de bolsas por mes" :resumen="resumenMes">
      <div class="cal-ch"><h3>Bolsas de cemento por mes</h3><span>según el reporte del supervisor</span></div>
      <div class="cal-mrow h"><span>MES</span><span>BOLSAS</span><span class="cal-num">ML</span><span class="cal-num hm2">ML / BOLSA</span></div>
      <div v-for="m in datos.porMes" :key="m.clave" class="cal-mrow">
        <b>{{ m.nombre }}</b>
        <div class="bb">
          <div class="cal-pbar"><i :style="{ width: pct(m.mostrado, maxMes) + '%' }"></i></div>
          <b class="tab">{{ num(m.mostrado) }}</b>
          <span v-if="m.soloBitacora" class="cal-pill w">Bitácora</span>
          <span v-else-if="m.bitacora" class="cal-pill w">+{{ num(m.bitacora) }} bitácora</span>
        </div>
        <span class="cal-num">{{ num(m.ml) }}</span>
        <span class="cal-num hm2">{{ m.rendimiento != null ? num(m.rendimiento) : '—' }}</span>
      </div>
      <p v-if="!datos.porMes.length" class="cal-vacio">Sin inyecciones en este periodo.</p>
      <div v-if="hayBitacoraMes" class="cal-foot">
        Lo marcado «Bitácora» sale del texto de la bitácora porque el campo de bolsas del reporte estaba vacío; no suma al total de
        {{ num(datos.bolsas) }} del reporte. ML / bolsa solo considera los días con dato.
      </div>
    </DesplegableMes>

    <div class="cal-card">
      <div class="cal-ch"><h3>Inyección y cemento por día</h3><span>toca un día para ver los anclajes inyectados</span></div>
      <div class="cal-row h r-day">
        <span>DÍA</span><span class="cal-num hm">ANCLAJES</span><span class="cal-num">ML</span><span>BOLSAS DE CEMENTO</span><span style="text-align: right">FUENTE</span>
      </div>
      <button
        v-for="d in datos.porDia"
        :key="d.fecha"
        type="button"
        class="cal-row r-day"
        :aria-label="`Inyección del ${d.etiqueta}: ${d.anclajes} anclajes, ${num(d.ml)} ml. Ver anclajes`"
        @click="sel = d"
      >
        <b>{{ d.etiqueta }}</b>
        <span class="cal-num hm">{{ d.anclajes }}</span>
        <span class="cal-num">{{ num(d.ml) }}</span>
        <div>
          <div v-if="d.bolsas != null" class="bb" style="display: flex; align-items: center; gap: 10px">
            <div class="cal-pbar" style="flex: 1; max-width: 160px"><i :style="{ width: pct(d.bolsas, maxDia) + '%' }"></i></div>
            <b class="tab">{{ bolsasTxt(d.bolsas) }}</b>
            <span v-if="d.rendimiento != null" class="cal-mut" style="font-size: 12px">{{ num(d.rendimiento) }} ml/bolsa</span>
          </div>
          <template v-else-if="d.enBitacora">
            <span class="cal-mut">— </span><span class="cal-mut" style="font-size: 12px">(bitácora dice {{ num(d.enBitacora) }})</span>
          </template>
          <span v-else class="cal-mut">—</span>
        </div>
        <span style="text-align: right">
          <span v-if="d.fuente === 'reporte'" class="cal-pill ok">Reporte</span>
          <span v-else-if="d.fuente === 'bitacora'" class="cal-pill w">Bitácora</span>
          <span v-else class="cal-pill r">Sin dato</span>
        </span>
      </button>
      <p v-if="!datos.porDia.length" class="cal-vacio">Sin inyecciones en este periodo.</p>
    </div>

    <AvisoCalidad v-if="aviso">
      <b>{{ aviso.n }} {{ aviso.n === 1 ? 'día inyectó' : 'días inyectaron' }} sin registrar bolsas:</b> {{ aviso.lista }}. {{ aviso.cierre }}
    </AvisoCalidad>

    <div class="cal-card">
      <div class="cal-ch">
        <h3>Perforados por inyectar</h3>
        <span>{{ datos.porInyectar.length }}<template v-if="zonasPorInyectar"> · {{ zonasPorInyectar }}</template></span>
      </div>
      <div v-if="datos.porInyectar.length" class="cal-codes">
        <span v-for="p in datos.porInyectar" :key="p.codigo" class="cal-code">{{ p.codigo }}</span>
      </div>
      <p v-else class="cal-vacio">Todo lo perforado en este periodo ya está inyectado.</p>
    </div>

    <ModalCalidad v-if="sel" :titulo="`Inyección del ${sel.etiqueta}`" :subtitulo="subModal" @cerrar="sel = null">
      <div v-for="g in sel.grupos" :key="g.zona + g.ubicacion" class="cal-ug">
        <h4>
          <b>{{ g.zona }} · {{ g.ubicacion }}</b>
          <span>{{ g.items.length }} anclajes<template v-if="g.mlCu"> · {{ num(g.mlCu, 2) }} m c/u</template></span>
        </h4>
        <div class="cal-pg">
          <div v-for="i in g.items" :key="i.codigo" class="cal-pt iny">{{ i.codigo }}<small>{{ num(i.ml, 2) }} ml</small></div>
        </div>
      </div>
    </ModalCalidad>
  </div>
</template>

<script setup>
// PRUEBA · Curva S v5: programado vs ejecutado, banda de tolerancia
// (−3 / +6, alerta desde +4) y caja de la semana elegida con su desviación
// a la fecha de dato. La semana va de jueves a miércoles.
import { computed } from 'vue'
import { semanaDe, fechaCorta } from '../../services/controlObraService'

const props = defineProps({
  puntos: { type: Array, required: true },
  param: { type: Object, default: null },
  semana: { type: String, default: '' },
})
const emit = defineEmits(['update:semana'])

const W = 640, H = 300, L = 40, R = 16, T = 16, B = 34
const tolInf = computed(() => Number(props.param?.tol_inf ?? -3))
const tolSup = computed(() => Number(props.param?.tol_sup ?? 6))
const alerta = computed(() => Number(props.param?.alerta_desde ?? 4))
const n = computed(() => props.puntos.length)
const X = (i) => L + (n.value > 1 ? (i * (W - L - R)) / (n.value - 1) : 0)
const Y = (v) => T + ((100 - Math.max(0, Math.min(100, v))) * (H - T - B)) / 100

const prog = computed(() => props.puntos.map((p, i) => `${X(i).toFixed(1)},${Y(Number(p.programado_pct)).toFixed(1)}`).join(' '))
const ejec = computed(() =>
  props.puntos
    .map((p, i) => (p.ejecutado_pct == null ? null : `${X(i).toFixed(1)},${Y(Number(p.ejecutado_pct)).toFixed(1)}`))
    .filter(Boolean)
    .join(' '),
)
const banda = computed(() => {
  const up = props.puntos.map((p, i) => `${X(i).toFixed(1)},${Y(Number(p.programado_pct) + tolSup.value).toFixed(1)}`)
  const dn = props.puntos.map((p, i) => `${X(i).toFixed(1)},${Y(Number(p.programado_pct) + tolInf.value).toFixed(1)}`).reverse()
  return [...up, ...dn].join(' ')
})

function estado(dv) {
  if (dv < tolInf.value || dv > tolSup.value) return { c: 'var(--p-danger)', t: 'Crítico' }
  if (dv > alerta.value) return { c: 'var(--p-amber-txt)', t: 'Alerta' }
  return { c: 'var(--p-ok-fg)', t: 'En banda' }
}

const semanas = computed(() => {
  const m = new Map()
  props.puntos.forEach((p, i) => {
    const s = semanaDe(p.fecha)
    if (!m.has(s.clave)) m.set(s.clave, { ...s, idx: [] })
    m.get(s.clave).idx.push(i)
  })
  return [...m.values()].map((s) => {
    const conDato = s.idx.filter((i) => props.puntos[i].ejecutado_pct != null)
    const iDato = conDato.length ? conDato[conDato.length - 1] : null
    const p = iDato == null ? null : props.puntos[iDato]
    const dv = p ? Number(p.ejecutado_pct) - Number(p.programado_pct) : null
    return { ...s, iDato, p, dv, est: dv == null ? null : estado(dv) }
  })
})
const sel = computed(() => semanas.value.find((s) => s.clave === props.semana) ?? null)
const ultimoDato = computed(() => {
  const i = props.puntos.map((p) => p.ejecutado_pct != null).lastIndexOf(true)
  return i
})
const caja = computed(() => {
  const s = sel.value
  if (!s || s.iDato == null) return null
  const x = X(s.iDato), y = Y(Number(s.p.ejecutado_pct))
  const bx = x + 150 > W - R ? x - 160 : x + 12
  return { x, y, bx, by: Math.max(T, y - 52) }
})
const ticks = [0, 25, 50, 75, 100]
</script>

<template>
  <section class="pl-panel">
    <div class="cab">
      <div>
        <div class="pl-sh">Curva S · avance ponderado por HH</div>
        <p class="pl-sub">{{ param?.fuente || 'Línea base' }} · banda {{ tolInf }} / +{{ tolSup }} pts · alerta desde +{{ alerta }}</p>
      </div>
      <div class="chips" role="group" aria-label="Semana de control">
        <button
          v-for="s in semanas"
          :key="s.clave"
          type="button"
          class="pl-seg"
          :class="{ on: s.clave === semana }"
          :aria-pressed="s.clave === semana"
          @click="emit('update:semana', s.clave)"
        >
          {{ s.clave }}
        </button>
      </div>
    </div>
    <p v-if="!puntos.length" class="pl-empty">Este frente todavía no tiene línea base cargada.</p>
    <template v-else>
      <svg :viewBox="`0 0 ${W} ${H}`" class="svg" role="img" aria-label="Curva S programado vs ejecutado">
        <g v-for="t in ticks" :key="t">
          <line :x1="L" :x2="W - R" :y1="Y(t)" :y2="Y(t)" class="grid" />
          <text :x="L - 6" :y="Y(t) + 4" text-anchor="end" class="ax">{{ t }}%</text>
        </g>
        <rect
          v-if="sel"
          :x="X(sel.idx[0]) - 4"
          :y="T"
          :width="X(sel.idx[sel.idx.length - 1]) - X(sel.idx[0]) + 8"
          :height="H - T - B"
          class="selw"
        />
        <polygon :points="banda" class="banda" />
        <polyline :points="prog" fill="none" class="prog" />
        <polyline v-if="ejec" :points="ejec" fill="none" stroke="#f59e0b" stroke-width="3.2" stroke-linejoin="round" />
        <line
          v-if="ultimoDato >= 0"
          :x1="X(ultimoDato)" :x2="X(ultimoDato)" :y1="T" :y2="H - B"
          stroke="#f5a800" stroke-width="1.5" stroke-dasharray="4 4"
        />
        <g v-for="(p, i) in puntos" :key="p.fecha">
          <text v-if="i % 3 === 0" :x="X(i)" :y="H - 12" text-anchor="middle" class="ax">{{ fechaCorta(p.fecha) }}</text>
        </g>
        <g v-if="caja">
          <circle :cx="caja.x" :cy="caja.y" r="5" fill="#f59e0b" stroke="#fff" stroke-width="1.5" />
          <rect :x="caja.bx" :y="caja.by" width="148" height="44" rx="8" class="box" :stroke="sel.est.c" />
          <text :x="caja.bx + 10" :y="caja.by + 18" class="bt">{{ sel.clave }} · al {{ fechaCorta(sel.p.fecha) }}</text>
          <text :x="caja.bx + 10" :y="caja.by + 36" class="bv" :fill="sel.est.c">
            {{ sel.dv > 0 ? '+' : '' }}{{ sel.dv.toFixed(1) }} % · {{ sel.est.t }}
          </text>
        </g>
      </svg>
      <div class="ley">
        <span><i class="l prog-l"></i>Programado</span>
        <span><i class="l" style="background: #f59e0b"></i>Ejecutado aprobado</span>
        <span><i class="b"></i>Banda de tolerancia</span>
        <span><i class="l dash"></i>Fecha de dato</span>
      </div>
      <div v-if="sel" class="kk">
        <div><span>Semana</span><b>{{ fechaCorta(sel.desde) }} – {{ fechaCorta(sel.hasta) }}</b></div>
        <div><span>Programado a la fecha de dato</span><b>{{ sel.p ? Number(sel.p.programado_pct).toFixed(1) + ' %' : '—' }}</b></div>
        <div><span>Ejecutado</span><b style="color: #f59e0b">{{ sel.p ? Number(sel.p.ejecutado_pct).toFixed(1) + ' %' : 'Sin dato' }}</b></div>
        <div><span>Desviación</span><b :style="{ color: sel.est?.c }">{{ sel.dv == null ? '—' : (sel.dv > 0 ? '+' : '') + sel.dv.toFixed(1) + ' %' }}</b></div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.cab { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 10px; background: var(--p-chip); }
.pl-seg.on { background: var(--p-seg-on-bg); color: var(--p-seg-on-fg); }
.svg { width: 100%; height: auto; display: block; }
.grid { stroke: var(--p-line); stroke-width: 1; }
.ax { fill: var(--p-muted); font-size: 11px; }
.banda { fill: rgba(34, 197, 94, 0.18); stroke: none; }
.prog { stroke: var(--p-muted); stroke-width: 2.4; }
.selw { fill: var(--p-hover); opacity: 0.6; }
.box { fill: var(--p-card); stroke-width: 1.5; }
.bt { fill: var(--p-muted); font-size: 11.5px; }
.bv { font-size: 14px; font-weight: 800; }
.ley { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12.5px; color: var(--p-muted); margin-top: 6px; }
.ley span { display: inline-flex; align-items: center; gap: 6px; }
.l { width: 18px; height: 3px; display: inline-block; }
.prog-l { background: var(--p-muted); }
.dash { background: repeating-linear-gradient(90deg, #f5a800 0 4px, transparent 4px 8px); }
.b { width: 14px; height: 10px; background: rgba(34, 197, 94, 0.3); display: inline-block; }
.kk { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }
.kk div { background: var(--p-chip); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.kk span { font-size: 12px; color: var(--p-muted); }
.kk b { font-size: 18px; }
</style>

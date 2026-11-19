<script setup>
// Curva S (v5): cortes semanales de jueves a miércoles con su recuadro,
// desviación a la fecha de dato, banda −3/+6 (alerta desde +4), tabla de
// partidas con avance de la semana y proyección.
import { computed, ref } from 'vue'
import { semanaDe, fechaCorta, num } from '../../services/controlObraService'
import { descargarExcel } from '../../../../utils/exportarExcel'

const props = defineProps({
  puntos: { type: Array, required: true },
  param: { type: Object, default: null },
  semana: { type: String, default: '' },
  dia: { type: String, default: '' },
  partidas: { type: Array, default: () => [] },
  avance: { type: Array, default: () => [] },
  nombreFrente: { type: String, default: '' },
  ajustes: { type: Array, default: () => [] },
  puedeEditar: { type: Boolean, default: false },
  fuenteEjecutado: { type: String, default: '' },
})
const emit = defineEmits(['update:semana', 'ver-semanal', 'ajustar', 'anular'])
const editando = ref(false)
const fAj = ref({ fecha: '', valor: null, motivo: '' })
function abrirEditor() {
  const ult = [...props.puntos].reverse().find((p) => p.ejecutado_pct != null)
  fAj.value = { fecha: ult?.fecha || props.puntos[0]?.fecha || '', valor: ult ? Number(ult.ejecutado_pct) : null, motivo: '' }
  editando.value = true
}
function guardarAjuste() {
  if (!fAj.value.fecha || fAj.value.valor == null || fAj.value.motivo.trim().length < 5) return
  emit('ajustar', { ...fAj.value })
  editando.value = false
}

const W = 640, H = 330, L = 44, R = 14, T = 92, B = 44
const tolInf = computed(() => Number(props.param?.tol_inf ?? -3))
const tolSup = computed(() => Number(props.param?.tol_sup ?? 6))
const alerta = computed(() => Number(props.param?.alerta_desde ?? 4))

const iso = (d) => d.toISOString().slice(0, 10)
const addD = (s, k) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return iso(d) }
const eje = computed(() => {
  if (!props.puntos.length) return []
  const ini = semanaDe(props.puntos[0].fecha).desde
  const fin = semanaDe(props.puntos[props.puntos.length - 1].fecha).hasta
  const out = []
  for (let d = ini; d <= fin; d = addD(d, 1)) out.push(d)
  return out
})
const mapa = computed(() => new Map(props.puntos.map((p) => [p.fecha, p])))
const prog = (d) => {
  const p = mapa.value.get(d)
  if (p) return Number(p.programado_pct)
  return d < props.puntos[0]?.fecha ? 0 : 100
}
const ejec = (d) => { const p = mapa.value.get(d); return p && p.ejecutado_pct != null ? Number(p.ejecutado_pct) : null }
const X = (i) => L + (eje.value.length > 1 ? (i * (W - L - R)) / (eje.value.length - 1) : 0)
const Y = (v) => T + ((100 - Math.max(0, Math.min(100, v))) * (H - T - B)) / 100
const xd = (d) => X(eje.value.indexOf(d))

const lProg = computed(() => eje.value.map((d, i) => `${X(i).toFixed(1)},${Y(prog(d)).toFixed(1)}`).join(' '))
const lEjec = computed(() => eje.value.map((d, i) => (ejec(d) == null ? null : `${X(i).toFixed(1)},${Y(ejec(d)).toFixed(1)}`)).filter(Boolean).join(' '))
const banda = computed(() => {
  const up = eje.value.map((d, i) => `${X(i).toFixed(1)},${Y(prog(d) + tolSup.value).toFixed(1)}`)
  const dn = eje.value.map((d, i) => `${X(i).toFixed(1)},${Y(prog(d) + tolInf.value).toFixed(1)}`).reverse()
  return [...up, ...dn].join(' ')
})
const estado = (dv) => {
  if (dv < tolInf.value || dv > tolSup.value) return { c: '#f87171', t: 'Crítico' }
  if (dv > alerta.value) return { c: '#fbbf24', t: 'Alerta' }
  return { c: '#4ade80', t: 'En banda' }
}
const ultimoDato = computed(() => [...props.puntos].reverse().find((p) => p.ejecutado_pct != null)?.fecha ?? null)

const semanas = computed(() => {
  const m = new Map()
  for (const d of eje.value) {
    const s = semanaDe(d)
    if (!m.has(s.clave)) m.set(s.clave, { ...s, dias: [] })
    m.get(s.clave).dias.push(d)
  }
  return [...m.values()].map((s) => {
    const conDato = s.dias.filter((d) => ejec(d) != null)
    const fd = conDato.length ? conDato[conDato.length - 1] : null
    const enCurso = fd && fd < s.hasta
    const corte = fd || s.hasta
    const dv = fd ? ejec(fd) - prog(fd) : null
    return { ...s, fd, corte, enCurso, dv, est: dv == null ? null : estado(dv), progCorte: prog(s.hasta), progDato: fd ? prog(fd) : null, ej: fd ? ejec(fd) : null }
  }).filter((s) => s.dias.some((d) => mapa.value.has(d)))
})
const sel = computed(() => semanas.value.find((s) => s.clave === props.semana) ?? null)

// Partidas con avance en la semana elegida y HH ganadas
const partidasSemana = computed(() => {
  const s = sel.value
  if (!s) return []
  const P = new Map(props.partidas.map((p) => [p.edt, p]))
  const acc = new Map()
  for (const a of props.avance) {
    if (a.fecha < s.desde || a.fecha > s.hasta) continue
    acc.set(a.edt, (acc.get(a.edt) || 0) + Number(a.cantidad))
  }
  return [...acc.entries()].map(([edt, q]) => {
    const p = P.get(edt)
    const hh = p && Number(p.metrado) ? (q / Number(p.metrado)) * Number(p.hh) : 0
    return { edt, nombre: p?.nombre ?? edt, unidad: (p?.unidad ?? '').toLowerCase(), q, hh }
  }).sort((a, b) => b.hh - a.hh)
})
const hhSemana = computed(() => partidasSemana.value.reduce((a, p) => a + p.hh, 0))

const proyeccion = computed(() => {
  const s = sel.value
  if (!s || !s.fd || !s.enCurso) return null
  const ps = props.puntos.filter((p) => p.ejecutado_pct != null)
  const k = Math.min(5, ps.length - 1)
  if (k < 1) return null
  const ritmo = (Number(ps[ps.length - 1].ejecutado_pct) - Number(ps[ps.length - 1 - k].ejecutado_pct)) / k
  const diasRest = eje.value.indexOf(s.hasta) - eje.value.indexOf(s.fd)
  const ejFin = s.ej + ritmo * diasRest
  const dvFin = ejFin - s.progCorte
  return { ritmo, diasRest, ejFin, dvFin, est: estado(dvFin), falta: s.progCorte - s.ej }
})

function exportar() {
  descargarExcel(`curva_s_${props.nombreFrente || 'frente'}.xlsx`, [
    { nombre: 'Curva diaria', filas: props.puntos.map((p) => ({ Fecha: p.fecha, 'Programado %': Number(p.programado_pct), 'Ejecutado %': p.ejecutado_pct == null ? '' : Number(p.ejecutado_pct), 'Desviación (pts)': p.ejecutado_pct == null ? '' : Math.round((p.ejecutado_pct - p.programado_pct) * 10) / 10 })) },
    { nombre: 'Cortes semanales', filas: semanas.value.map((s) => ({ Semana: s.clave, Desde: s.desde, Hasta: s.hasta, 'Programado al corte %': s.progCorte, 'Fecha de dato': s.fd ?? '', 'Programado a la fecha de dato %': s.progDato ?? '', 'Ejecutado %': s.ej ?? '', 'Desviación (pts)': s.dv == null ? '' : Math.round(s.dv * 10) / 10, Evaluación: s.est?.t ?? 'Por ejecutar' })) },
    { nombre: 'Parámetros', filas: [{ Parámetro: 'Tolerancia inferior', Valor: tolInf.value }, { Parámetro: 'Tolerancia superior', Valor: tolSup.value }, { Parámetro: 'Alerta desde', Valor: alerta.value }, { Parámetro: 'Semana', Valor: 'Jueves a miércoles' }, { Parámetro: 'Fuente', Valor: props.param?.fuente ?? '' }] },
  ])
}
const BOXW = 150
const boxX = (s) => Math.min(W - R - BOXW, Math.max(L, xd(s.corte) - BOXW / 2))
</script>

<template>
  <section class="v5-card">
    <div class="top">
      <div>
        <h2>Curva S · avance ponderado por HH</h2>
        <p>Cortes semanales de jueves a miércoles · {{ semanas.map((s) => s.clave).join(' · ') }}</p>
      </div>
      <div class="acc">
        <button v-if="puedeEditar" type="button" class="gh" :disabled="!puntos.length" @click="editando ? (editando = false) : abrirEditor()">{{ editando ? 'Cerrar edición' : 'Editar curva (opcional)' }}</button>
        <button type="button" class="gh" :disabled="!puntos.length" @click="exportar">Exportar datos a Excel</button>
      </div>
    </div>
    <div v-if="editando" class="editor">
      <p class="mu sm">Ajuste manual opcional: reemplaza el ejecutado calculado de una fecha. Primero se ajustan ratios y HH; los metrados solo como último recurso. Todo ajuste queda registrado con su motivo.</p>
      <div class="frm">
        <label>Fecha<input v-model="fAj.fecha" type="date" /></label>
        <label>Ejecutado %<input v-model.number="fAj.valor" type="number" step="0.1" min="0" max="100" /></label>
        <label class="mot">Motivo<input v-model="fAj.motivo" type="text" placeholder="Ej.: prorrateo de HH de cosido por redline RL01" /></label>
        <button type="button" class="pr" :disabled="!fAj.fecha || fAj.valor == null || fAj.motivo.trim().length < 5" @click="guardarAjuste">Guardar ajuste</button>
      </div>
    </div>
    <div v-if="ajustes.length" class="ajs">
      <span class="mu sm">Ajustes activos:</span>
      <span v-for="a in ajustes" :key="a.id" class="aj">{{ fechaCorta(a.fecha) }} → {{ Number(a.ejecutado_pct).toFixed(1) }} % · {{ a.motivo }}<button v-if="puedeEditar" type="button" title="Anular ajuste" @click="emit('anular', a.id)">×</button></span>
    </div>
    <p v-if="!puntos.length" class="vacio">Este frente todavía no tiene línea base cargada.</p>
    <template v-else>
      <div class="ley">
        <span><i class="l" style="background: #cbd5e1"></i>Programado {{ param?.fuente?.split(' ')[0] || 'Rev00' }} (HH)</span>
        <span><i class="l" style="background: #f59e0b"></i>Ejecutado aprobado</span>
        <span><i class="b"></i>Tolerancia {{ tolInf }} / +{{ tolSup }} (alerta desde +{{ alerta }})</span>
        <span><i class="d"></i>Crítico</span>
      </div>
      <svg :viewBox="`0 0 ${W} ${H}`" class="svg" role="img" aria-label="Curva S programado vs ejecutado con cortes semanales">
        <g v-for="t in [0, 20, 40, 60, 80, 100]" :key="t">
          <line :x1="L" :x2="W - R" :y1="Y(t)" :y2="Y(t)" stroke="#2d3139" />
          <text :x="L - 6" :y="Y(t) + 4" text-anchor="end" class="ax">{{ t }}%</text>
        </g>
        <rect v-if="sel" :x="xd(sel.desde)" :y="T" :width="xd(sel.hasta) - xd(sel.desde)" :height="H - T - B" fill="#ffffff" opacity="0.04" />
        <polygon :points="banda" fill="rgba(34,197,94,0.22)" />
        <polyline :points="lProg" fill="none" stroke="#cbd5e1" stroke-width="2.4" />
        <polyline v-if="lEjec" :points="lEjec" fill="none" stroke="#f59e0b" stroke-width="3.2" stroke-linejoin="round" />
        <line v-if="dia && eje.includes(dia)" :x1="xd(dia)" :x2="xd(dia)" :y1="T" :y2="H - B" stroke="#f5a800" stroke-width="1" opacity="0.5" />
        <g v-for="s in semanas" :key="s.clave" :opacity="s.clave === semana ? 1 : 0.55">
          <line :x1="xd(s.corte)" :x2="xd(s.corte)" :y1="T - 6" :y2="H - B" :stroke="s.est ? s.est.c : '#9ca3af'" stroke-width="1.5" stroke-dasharray="4 4" />
          <g v-if="s.clave === semana">
            <rect :x="boxX(s)" :y="4" :width="BOXW" height="62" rx="8" fill="#1a1c1e" :stroke="s.est ? s.est.c : '#9ca3af'" stroke-width="1.5" />
            <text :x="boxX(s) + 10" y="22" class="bt">{{ s.clave }} · {{ s.enCurso ? 'al ' + fechaCorta(s.fd) + ' (corte ' + fechaCorta(s.hasta) + ')' : 'corte ' + fechaCorta(s.hasta) }}</text>
            <text :x="boxX(s) + 10" y="40" class="bl">Programado</text>
            <text :x="boxX(s) + BOXW - 10" y="40" text-anchor="end" class="bv">{{ (s.fd ? s.progDato : s.progCorte).toFixed(1) }} %</text>
            <text :x="boxX(s) + 10" y="57" class="bl">Ejecutado</text>
            <text :x="boxX(s) + BOXW - 10" y="57" text-anchor="end" class="bv" :fill="s.ej != null ? '#f59e0b' : '#9ca3af'">{{ s.ej != null ? s.ej.toFixed(1) + ' %' : 'por ejecutar' }}</text>
          </g>
          <g v-if="s.fd">
            <circle :cx="xd(s.fd)" :cy="Y(s.ej)" r="5.5" :fill="s.est.c" stroke="#fff" stroke-width="1.5" />
            <circle :cx="xd(s.fd)" :cy="Y(s.progDato)" r="4" fill="#cbd5e1" stroke="#0d0f10" />
            <rect :x="xd(s.fd) + 10" :y="Y(s.ej) - 12" width="62" height="24" rx="6" fill="#1a1c1e" :stroke="s.est.c" stroke-width="1.5" />
            <text :x="xd(s.fd) + 41" :y="Y(s.ej) + 5" text-anchor="middle" class="badge" :fill="s.est.c">{{ s.dv > 0 ? '+' : '' }}{{ s.dv.toFixed(1) }} %</text>
          </g>
        </g>
        <g v-for="(d, i) in eje" :key="d">
          <text :x="X(i)" :y="H - B + 14" text-anchor="middle" class="ax sm">{{ +d.slice(8, 10) }}</text>
        </g>
        <g v-for="s in semanas" :key="'l' + s.clave">
          <text :x="(xd(s.desde) + xd(s.hasta)) / 2" :y="H - 14" text-anchor="middle" class="wk" :fill="s.clave === semana ? '#f5a800' : '#c9ced6'">{{ s.clave }}</text>
          <text :x="(xd(s.desde) + xd(s.hasta)) / 2" :y="H - 2" text-anchor="middle" class="ax sm">{{ fechaCorta(s.desde) }}–{{ fechaCorta(s.hasta) }}</text>
        </g>
      </svg>
      <div class="pie">
        <div class="seg" role="group" aria-label="Semana de control">
          <button v-for="s in semanas" :key="s.clave" type="button" :class="{ on: s.clave === semana }" :aria-pressed="s.clave === semana" @click="emit('update:semana', s.clave)">{{ s.clave }}</button>
        </div>
        <button type="button" class="lnk" @click="emit('ver-semanal')">Ver detalle completo en Semanal</button>
      </div>
      <div v-if="sel" class="kk">
        <div><span>Programado a la fecha de dato</span><b>{{ sel.fd ? sel.progDato.toFixed(1) : sel.progCorte.toFixed(1) }} %</b></div>
        <div><span>Ejecutado</span><b style="color: #f59e0b">{{ sel.ej != null ? sel.ej.toFixed(1) + ' %' : '—' }}</b></div>
        <div><span>Desviación</span><b :style="{ color: sel.est?.c }">{{ sel.dv == null ? '—' : (sel.dv > 0 ? '+' : '') + sel.dv.toFixed(1) + ' %' }}</b></div>
        <div><span>HH ganadas en la semana</span><b>{{ num(hhSemana, 0) }}</b></div>
      </div>
      <p v-if="sel" class="nota">
        <template v-if="sel.fd">Fecha de dato {{ fechaCorta(sel.fd) }}<template v-if="sel.enCurso"> (semana en curso; corte {{ fechaCorta(sel.hasta) }} programado en {{ sel.progCorte.toFixed(1) }} %)</template>. {{ sel.est.t === 'En banda' ? `Dentro de la banda ${tolInf} / +${alerta}: sin ajustes.` : sel.est.t === 'Alerta' ? 'En alerta: revisar ratios y HH.' : 'Fuera de banda: ajustar con criterio (primero ratios y HH).' }}</template>
        <template v-else>Semana programada: {{ sel.progCorte.toFixed(1) }} % al corte {{ fechaCorta(sel.hasta) }}.</template>
      </p>
      <div v-if="partidasSemana.length" class="tab">
        <div class="th"><span>EDT</span><span>Partida con avance</span><span class="r">Semana</span><span class="r">HH</span></div>
        <div v-for="p in partidasSemana" :key="p.edt" class="tr">
          <span class="mu">{{ p.edt }}</span><span>{{ p.nombre }}</span><span class="r">{{ num(p.q) }} {{ p.unidad }}</span><span class="r">{{ num(p.hh, 1) }}</span>
        </div>
      </div>
      <p v-if="proyeccion" class="proy">
        <b>Proyección {{ sel.clave }}:</b> al {{ fechaCorta(sel.fd) }} la variación es {{ sel.dv > 0 ? '+' : '' }}{{ sel.dv.toFixed(1) }} % ({{ sel.est.t.toLowerCase() }}).
        Para cerrar el {{ fechaCorta(sel.hasta) }} en {{ sel.progCorte.toFixed(1) }} % faltan {{ proyeccion.falta.toFixed(1) }} % en {{ proyeccion.diasRest }} día(s); al ritmo actual (≈{{ proyeccion.ritmo.toFixed(1) }} %/día) cerraría en ≈{{ proyeccion.ejFin.toFixed(0) }} %:
        <b :style="{ color: proyeccion.est.c }">{{ proyeccion.dvFin > 0 ? '+' : '' }}{{ proyeccion.dvFin.toFixed(1) }} %, {{ proyeccion.est.t.toLowerCase() }}</b>.
        Primero se ajustan ratios y HH; los metrados solo como último recurso.
      </p>
      <p v-if="ultimoDato" class="mu sm2">Último ejecutado aprobado: {{ fechaCorta(ultimoDato) }}{{ fuenteEjecutado ? ' · ' + fuenteEjecutado : '' }}</p>
    </template>
  </section>
</template>

<style scoped>
.v5-card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
h2 { margin: 0; font-size: 17px; font-weight: 700; }
.top p { margin: 4px 0 0; color: var(--p-muted); font-size: 12.5px; }
.gh { min-height: 40px; padding: 0 14px; border-radius: 10px; font: inherit; font-weight: 700; font-size: 13.5px; cursor: pointer; background: transparent; color: var(--p-text); border: 1px solid var(--p-line); }
.vacio { color: var(--p-muted); }
.acc { display: flex; gap: 8px; flex-wrap: wrap; }
.editor { border: 1px solid rgba(245, 168, 0, 0.45); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
.frm { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.frm label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--p-muted); }
.frm input { min-height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--p-line); background: var(--p-bg); color: var(--p-text); font: inherit; }
.frm .mot { flex: 1 1 260px; }
.pr { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 0; background: #f5a800; color: #0d0f10; font: inherit; font-weight: 800; cursor: pointer; }
.pr:disabled { opacity: 0.5; cursor: default; }
.ajs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.aj { font-size: 12px; padding: 3px 8px; border-radius: 8px; background: rgba(245, 168, 0, 0.12); color: #fbbf24; }
.aj button { margin-left: 6px; border: 0; background: transparent; color: inherit; cursor: pointer; font-weight: 800; }
.sm { font-size: 12px; }
.ley { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--p-muted); margin-bottom: 4px; }
.ley span { display: inline-flex; align-items: center; gap: 6px; }
.l { width: 18px; height: 3px; display: inline-block; }
.b { width: 14px; height: 10px; background: rgba(34, 197, 94, 0.3); display: inline-block; }
.d { width: 9px; height: 9px; border-radius: 50%; background: #f87171; display: inline-block; }
.svg { width: 100%; height: auto; display: block; }
.ax { fill: #9ca3af; font-size: 11px; }
.ax.sm { font-size: 9px; }
.wk { font-size: 12px; font-weight: 700; }
.bt { fill: #f8fafc; font-size: 11px; font-weight: 700; }
.bl { fill: #9ca3af; font-size: 11px; }
.bv { fill: #f8fafc; font-size: 11.5px; font-weight: 700; }
.badge { font-size: 13px; font-weight: 800; }
.pie { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-top: 8px; }
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: var(--p-chip); }
.seg button { min-height: 32px; padding: 0 12px; border-radius: 8px; border: 0; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--p-muted); }
.seg button.on { background: #f5a800; color: #0d0f10; }
.lnk { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--p-line); background: transparent; color: #f5a800; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
.kk { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
.kk div { background: var(--p-chip); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.kk span { font-size: 12px; color: var(--p-muted); }
.kk b { font-size: 19px; }
.nota { font-size: 12.5px; color: var(--p-text); margin: 10px 0; }
.tab { font-size: 13px; }
.th, .tr { display: grid; grid-template-columns: 50px 1fr 110px 60px; gap: 8px; padding: 8px 4px; border-bottom: 1px solid var(--p-line); }
.th { font-size: 11px; font-weight: 700; color: var(--p-muted); text-transform: uppercase; }
.r { text-align: right; }
.mu { color: var(--p-muted); }
.sm2 { font-size: 12px; margin: 8px 0 0; }
.proy { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(245, 168, 0, 0.45); background: rgba(245, 168, 0, 0.08); font-size: 12.5px; line-height: 1.5; }
</style>

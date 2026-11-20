<script setup>
// Lienzo 6 · Modificar curva S con criterio de Planeamiento. Se cambian los
// ratios (HH/und); HH, peso y desviaciones por corte se recalculan con la misma
// función que dibuja la curva (curvaEjecutada), así lo simulado es lo que
// quedará. Guardar crea la siguiente revisión de línea base (Rev01, Rev02…)
// con motivo obligatorio; el Rev00 queda como referencia.
import { computed, ref, watch } from 'vue'
import { curvaEjecutada, guardarRevisionLineaBase, semanaDe, num, fechaCorta } from '../../services/controlObraService'

const props = defineProps({
  frenteId: { type: String, required: true },
  puntos: { type: Array, required: true }, // puntos Rev00 guardados (sin ajustar)
  partidas: { type: Array, required: true },
  avance: { type: Array, required: true },
  revs: { type: Array, default: () => [] },
  param: { type: Object, default: null },
  puedeGuardar: { type: Boolean, default: false },
})
const emit = defineEmits(['cerrar', 'guardado'])

const tolI = computed(() => Number(props.param?.tol_inf ?? -3))
const tolS = computed(() => Number(props.param?.tol_sup ?? 6))
const alerta = computed(() => Number(props.param?.alerta_desde ?? 4))
const dcol = (x) => (x == null ? '' : x < tolI.value || x > tolS.value ? '#f87171' : x > alerta.value ? '#fbbf24' : '#4ade80')
const sg = (x) => (x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + ' %')

const actual = computed(() => curvaEjecutada(props.puntos, props.partidas, props.avance, props.revs))
const base = computed(() => new Map(actual.value.partidasVig.map((p) => [p.edt, p.ratio])))
const rev00 = computed(() => props.partidas.filter((p) => p.en_linea_base !== false).reduce((a, p) => a + Number(p.hh || 0), 0))
const editados = ref({})
watch(() => props.revs, () => { editados.value = {} })

const cambios = computed(() => Object.entries(editados.value)
  .filter(([edt, v]) => Math.abs(v - (base.value.get(edt) ?? 0)) > 1e-9)
  .map(([edt, v]) => ({ edt, antes: base.value.get(edt) ?? 0, nuevo: v })))
const sim = computed(() => (cambios.value.length
  ? curvaEjecutada(props.puntos, props.partidas, props.avance, [...props.revs, ...cambios.value.map((c) => ({ edt: c.edt, ratio_nuevo: c.nuevo }))])
  : actual.value))

function setRatio(edt, ev) {
  const x = parseFloat(ev.target.value)
  if (!(x >= 0)) return
  editados.value = { ...editados.value, [edt]: x }
  guardado.value = ''
}
const ratioDe = (p) => (editados.value[p.edt] ?? p.ratio)
const filas = computed(() => sim.value.partidasVig.map((p) => ({ ...p, cambiado: cambios.value.some((c) => c.edt === p.edt), avPct: p.q ? Math.min(100, (p.acum / p.q) * 100) : 0 })))

// Cortes: los tres últimos miércoles hasta la fecha de dato (el último puede ser la fecha de dato).
const cortes = computed(() => {
  const ult = actual.value.ultima
  if (!ult) return []
  const fechas = new Set(props.puntos.map((p) => p.fecha))
  const out = []
  let s = semanaDe(ult)
  while (out.length < 3) {
    const f = s.hasta <= ult ? s.hasta : ult
    if (fechas.has(f)) out.unshift({ w: s.clave, f })
    const d = new Date(`${s.desde}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1)
    if (d.toISOString().slice(0, 10) < props.puntos[0]?.fecha) break
    s = semanaDe(d.toISOString().slice(0, 10))
  }
  const at = (c, f) => c.puntos.find((p) => p.fecha === f)
  return out.map((c) => {
    const a = at(actual.value, c.f), b = at(sim.value, c.f)
    const da = a?.ejecutado_pct != null ? a.ejecutado_pct - a.programado_pct : null
    const ds = b?.ejecutado_pct != null ? b.ejecutado_pct - b.programado_pct : null
    return { ...c, p: b?.programado_pct, e: b?.ejecutado_pct, da, ds }
  })
})
const ultCorte = computed(() => cortes.value[cortes.value.length - 1] || null)
const fuera = computed(() => ultCorte.value?.da != null && (ultCorte.value.da < tolI.value || ultCorte.value.da > tolS.value))
const motivo = ref('')
const guardando = ref(false)
const guardado = ref('')
const error = ref('')
const siguienteRev = computed(() => {
  const n = props.revs.reduce((m, r) => Math.max(m, parseInt(String(r.rev).replace(/\D/g, ''), 10) || 0), 0)
  return `Rev${String(n + 1).padStart(2, '0')}`
})
const puede = computed(() => props.puedeGuardar && cambios.value.length && motivo.value.trim().length >= 10 && !guardando.value)
const estado = computed(() => {
  if (guardado.value) return { bg: 'rgba(34,197,94,0.12)', t: guardado.value }
  const c = ultCorte.value
  if (!c) return { bg: 'rgba(96,165,250,0.10)', t: 'Sin avance aprobado todavía: no hay desviación que evaluar.' }
  const base0 = `${c.w} al ${fechaCorta(c.f)}: ${sg(c.da)}`
  const simTxt = cambios.value.length ? ` Simulado: ${sg(c.ds)} con ${cambios.value.length} cambio(s).` : ''
  return fuera.value
    ? { bg: 'rgba(239,68,68,0.12)', t: `${base0}, fuera de banda. Corresponde ajustar: empieza por los ratios de las partidas con rendimiento real distinto al previsto.${simTxt}` }
    : { bg: 'rgba(96,165,250,0.10)', t: `${base0}, dentro de la banda ${tolI.value} / +${tolS.value}. No corresponde ajustar; puedes simular, pero guardar pide justificación.${simTxt}` }
})
async function guardar() {
  if (!puede.value) return
  guardando.value = true; error.value = ''
  try {
    const c = ultCorte.value
    const rev = siguienteRev.value
    await guardarRevisionLineaBase(props.frenteId, rev, cambios.value, motivo.value.trim(), c?.da ?? null, c?.ds ?? null)
    guardado.value = `Guardado como línea base ${rev} con ${cambios.value.length} ratio(s) cambiado(s). El Rev00 queda como referencia y el cambio se registra con tu motivo.`
    motivo.value = ''
    emit('guardado')
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo guardar la revisión. Revisa tu permiso o el motivo (mínimo 10 caracteres).'
  } finally { guardando.value = false }
}
function restablecer() { editados.value = {}; guardado.value = '' }
</script>

<template>
  <section class="mc" aria-label="Modificar curva S">
    <div class="hd">
      <div>
        <h2>Modificar curva S · criterio de Planeamiento</h2>
        <p class="sub">Cambia los ratios (HH/und); la HH, el peso de cada partida y las desviaciones se recalculan al instante. Nada se guarda hasta que pongas el motivo.</p>
      </div>
      <div class="bt">
        <button type="button" class="b2" @click="restablecer">Restablecer</button>
        <button type="button" class="b1" :disabled="!puede" :title="!puedeGuardar ? 'Solo Planeamiento puede guardar' : ''" @click="guardar">{{ guardando ? 'Guardando…' : `Guardar como ${siguienteRev}` }}</button>
        <button type="button" class="bx" aria-label="Cerrar" @click="emit('cerrar')">×</button>
      </div>
    </div>
    <div class="gr">
      <div class="tw">
        <table data-sin-filtro>
          <thead><tr><th>EDT</th><th>Partida</th><th class="r">Metrado</th><th class="r">Ratio HH/und</th><th class="r">HH</th><th class="r">Peso</th><th class="r">Avance</th></tr></thead>
          <tbody>
            <tr v-for="p in filas" :key="p.edt">
              <td class="mu">{{ p.edt }}</td>
              <td>{{ p.nombre }}</td>
              <td class="r mu">{{ num(p.q) }} {{ (p.unidad || '').toLowerCase() }}</td>
              <td class="r"><input type="number" step="0.01" min="0" :value="Math.round(ratioDe(p) * 1000) / 1000" :aria-label="`Ratio HH por unidad de ${p.edt}`" :class="{ ch: p.cambiado }" @change="setRatio(p.edt, $event)" /></td>
              <td class="r b">{{ num(p.hh, 1) }}</td>
              <td class="r mu">{{ (p.peso * 100).toFixed(1) }} %</td>
              <td class="r mu">{{ p.avPct.toFixed(0) }} %</td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="4" class="b">Total HH de la línea base</td><td class="r b">{{ num(sim.BAC, 1) }}</td><td colspan="2" class="r mu">Rev00: {{ num(rev00, 1) }}</td></tr></tfoot>
        </table>
      </div>
      <div class="side">
        <div class="box">
          <p class="cap">Desviación por corte · actual → simulada</p>
          <table data-sin-filtro>
            <thead><tr><th>Corte</th><th class="r">Prog.</th><th class="r">Ejec.</th><th class="r">Actual</th><th class="r">Simulada</th></tr></thead>
            <tbody>
              <tr v-for="c in cortes" :key="c.w">
                <td class="b">{{ c.w }}</td>
                <td class="r">{{ c.p != null ? c.p.toFixed(1) + ' %' : '—' }}</td>
                <td class="r">{{ c.e != null ? c.e.toFixed(1) + ' %' : '—' }}</td>
                <td class="r b" :style="{ color: dcol(c.da) }">{{ sg(c.da) }}</td>
                <td class="r b" :style="{ color: dcol(c.ds) }">{{ sg(c.ds) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="box est" :style="{ background: estado.bg }">{{ estado.t }}</div>
        <label class="mot">Motivo del ajuste (obligatorio para guardar, mínimo 10 caracteres)
          <textarea v-model="motivo" rows="3" placeholder="Ej.: rendimiento real de perforación con patín 2.1 HH/ml vs 3.3 previsto (RDC 12–18/11)."></textarea>
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <div class="box">
          <ol>
            <li><b>Solo se ajusta si la desviación sale de la banda {{ tolI }} % / +{{ tolS }} %</b> (alerta desde +{{ alerta }} %). Dentro de banda se puede simular, pero no guardar sin justificación.</li>
            <li><b>Primero los ratios</b> (HH por unidad) de las partidas con rendimiento real distinto al previsto.</li>
            <li><b>Luego las HH</b> de partidas mal dimensionadas en el Rev00.</li>
            <li><b>Los metrados ejecutados no se tocan</b>: salen de lo que aprobaste en la bandeja.</li>
            <li>Guardar crea la <b>línea base {{ siguienteRev }}</b> con motivo, fecha y usuario; el Rev00 queda como referencia. Rebase solo si el cambio supera el 10 % de las HH.</li>
          </ol>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mc { padding: 16px; border-radius: 12px; background: #1a1c1e; border: 1px solid #f5a800; }
.hd { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
h2 { margin: 0; font-size: 17px; font-weight: 700; }
.sub { margin: 4px 0 0; color: #9ca3af; font-size: 12.5px; }
.bt { display: flex; gap: 8px; flex-wrap: wrap; }
.b1, .b2, .bx { min-height: 40px; border-radius: 10px; font: inherit; font-size: 14px; cursor: pointer; }
.b1 { padding: 0 16px; border: 0; background: #f5a800; color: #0d0f10; font-weight: 700; }
.b1:disabled { background: #4b5563; cursor: default; }
.b2 { padding: 0 14px; border: 1px solid #3a3f47; background: transparent; color: #f1f3f5; font-weight: 600; }
.bx { width: 40px; border: 1px solid #3a3f47; background: transparent; color: #f1f3f5; font-size: 20px; }
.gr { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1100px) { .gr { grid-template-columns: minmax(0, 1fr); } }
.tw { max-height: 470px; overflow: auto; border: 1px solid #2d3139; border-radius: 10px; }
table { width: 100%; border-collapse: collapse; }
th { position: sticky; top: 0; background: #1a1c1e; text-align: left; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; padding: 8px 10px; border-bottom: 1px solid #2d3139; }
td { padding: 7px 10px; border-bottom: 1px solid #2d3139; font-size: 13px; }
.r { text-align: right; }
.b { font-weight: 700; }
.mu { color: #9ca3af; }
input { width: 84px; min-height: 32px; padding: 0 8px; border-radius: 6px; border: 1px solid #3a3f47; background: #111315; color: #f1f3f5; font: inherit; font-size: 13px; text-align: right; }
input.ch { border-color: #f5a800; }
.side { display: flex; flex-direction: column; gap: 12px; }
.box { padding: 12px; border-radius: 10px; background: #202327; font-size: 12.5px; line-height: 1.5; }
.box th { background: #202327; }
.cap { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4px; }
.est { color: #f1f3f5; }
.mot { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #9ca3af; }
textarea { padding: 8px 10px; border-radius: 8px; border: 1px solid #3a3f47; background: #111315; color: #f1f3f5; font: inherit; font-size: 13px; resize: vertical; }
ol { margin: 0; padding-left: 18px; color: #d6dae0; }
.err { margin: 0; color: #f87171; font-size: 12.5px; }
</style>

<script setup>
// Resumen del frente · versión 5 (PRUEBA). Misma distribución que la
// propuesta: indicadores, reproductor por día, sketch sobre el plano,
// cronograma Rev00 vs ejecutado, curva S con cortes semanales, metrados
// aprobados, restricciones y Stand By por día, fotos, rendimiento y
// conciliación con Almacén. Solo lectura.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../../store/auth'
import { listarReportes } from '../../../rdc/services/rdcService'
import { listarAlertas } from '../../../alertas/services/alertasService'
import {
  cargarSectores, cargarCurva, cargarFotos, cargarAvanceElementos, cargarSketch, cargarCronograma,
  cargarRdcRango, minutosStandBy, semanaDe, fechaCorta, num, horasTexto,
  curvaEjecutada, guardarAjusteCurva, anularAjusteCurva,
} from '../../services/controlObraService'
import SketchAvance from '../../components/control/SketchAvance.vue'
import CronogramaGantt from '../../components/control/CronogramaGantt.vue'
import CurvaSSemanal from '../../components/control/CurvaSSemanal.vue'
import ConciliacionAlmacen from '../../../procura/components/ConciliacionAlmacen.vue'

const props = defineProps({ frente: { type: Object, required: true } })
const router = useRouter()
const auth = useAuthStore()

const cargando = ref(true)
const reportes = ref([])
const alertas = ref([])
const sectores = ref([])
const sector = ref('all')
const curva = ref({ param: null, puntos: [] })
const crono = ref({ partidas: [], avance: [], porAprobar: [], bandejaPendientes: 0, ajustes: [] })
const sketch = ref(null)
const elementos = ref([])
const semana = ref('')
const rdcSemana = ref([])
const fotos = ref([])
const cargandoSemana = ref(false)
const fotoGrande = ref(null)

const seguro = (p, def) => p.catch((e) => { console.warn(e); return def })
const iso = (d) => d.toISOString().slice(0, 10)
const addD = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const hoyIso = iso(new Date(Date.now() - 5 * 3600000))

onMounted(async () => {
  const id = props.frente.id
  const [r, a, s, c, cr, sk, el] = await Promise.all([
    seguro(listarReportes({ frenteId: id }), []),
    seguro(listarAlertas({ estado: 'activa', frenteId: id }), []),
    seguro(cargarSectores(id), []),
    seguro(cargarCurva(id), { param: null, puntos: [] }),
    seguro(cargarCronograma(id), { partidas: [], avance: [], porAprobar: [], bandejaPendientes: 0, ajustes: [] }),
    seguro(cargarSketch(id), null),
    seguro(cargarAvanceElementos(id), []),
  ])
  reportes.value = r; alertas.value = a; sectores.value = s; curva.value = c; crono.value = cr; sketch.value = sk; elementos.value = el
  idx.value = Math.max(0, diasPlayer.value.indexOf(fechaDato.value) >= 0 ? diasPlayer.value.indexOf(fechaDato.value) : diasPlayer.value.length - 1)
  semana.value = semanaDe(fechaDato.value).clave
  cargando.value = false
})

// ---------- curva: programado Rev00 + ejecutado APROBADO (bandeja) ----------
const curvaEj = computed(() => curvaEjecutada(curva.value.puntos, crono.value.partidas, crono.value.avance, crono.value.ajustes))
const puntos = computed(() => curvaEj.value.puntos)
const puedeEditar = computed(() => auth.tienePermiso('procura.crear_version'))
async function ajustar(a) {
  try { await guardarAjusteCurva(props.frente.id, a.fecha, a.valor, a.motivo); crono.value = await cargarCronograma(props.frente.id) } catch (e) { console.error(e); alertaMsg.value = 'No se pudo guardar el ajuste.' }
}
async function anular(id) {
  try { await anularAjusteCurva(id); crono.value = await cargarCronograma(props.frente.id) } catch (e) { console.error(e) }
}
const alertaMsg = ref('')

// ---------- reproductor por día ----------
const fechaDato = computed(() => curvaEj.value.ultima || curva.value.param?.fecha_dato || reportes.value[0]?.fecha || hoyIso)
const inicioObra = computed(() => props.frente.fecha_inicio || curva.value.puntos[0]?.fecha || reportes.value[reportes.value.length - 1]?.fecha || fechaDato.value)
const ultimoRdc = computed(() => reportes.value[0]?.fecha || fechaDato.value)
const diasPlayer = computed(() => {
  const out = []
  const fin = ultimoRdc.value > fechaDato.value ? ultimoRdc.value : fechaDato.value
  for (let d = inicioObra.value; d <= fin && out.length < 400; d = addD(d, 1)) out.push(d)
  return out
})
const idx = ref(0)
const dia = computed(() => diasPlayer.value[idx.value] || fechaDato.value)
const reproduciendo = ref(false)
let timer = null
function toggle() {
  if (reproduciendo.value) { clearInterval(timer); timer = null; reproduciendo.value = false; return }
  if (idx.value >= diasPlayer.value.length - 1) idx.value = 0
  reproduciendo.value = true
  timer = setInterval(() => {
    if (idx.value >= diasPlayer.value.length - 1) { clearInterval(timer); timer = null; reproduciendo.value = false; return }
    idx.value++
  }, 1100)
}
onBeforeUnmount(() => timer && clearInterval(timer))
watch(dia, (d) => { if (reproduciendo.value) semana.value = semanaDe(d).clave })

// ---------- semana ----------
const semanaSel = computed(() => {
  const d = diasPlayer.value.find((x) => semanaDe(x).clave === semana.value) || curva.value.puntos.map((p) => p.fecha).find((x) => semanaDe(x).clave === semana.value)
  return d ? semanaDe(d) : null
})
watch(semanaSel, async (s) => {
  if (!s) return
  cargandoSemana.value = true
  const [r, f] = await Promise.all([
    seguro(cargarRdcRango(props.frente.id, s.desde, s.hasta), []),
    seguro(cargarFotos(props.frente.id, s.desde, s.hasta, 9), []),
  ])
  rdcSemana.value = r; fotos.value = f
  cargandoSemana.value = false
})

// ---------- indicadores ----------
const puntoDato = computed(() => puntos.value.find((p) => p.fecha === fechaDato.value && p.ejecutado_pct != null) || [...puntos.value].reverse().find((p) => p.ejecutado_pct != null))
const kv = computed(() => (puntoDato.value?.ejecutado_pct != null ? Number(puntoDato.value.ejecutado_pct) : null))
const kp = computed(() => (puntoDato.value ? Number(puntoDato.value.programado_pct) : null))
const kdv = computed(() => (kv.value != null && kp.value != null ? kv.value - kp.value : null))
const puntoDia = computed(() => [...puntos.value].reverse().find((p) => p.fecha <= dia.value && p.ejecutado_pct != null) || null)
const pdDia = computed(() => [...puntos.value].reverse().find((p) => p.fecha <= dia.value) || null)
const kvD = computed(() => (puntoDia.value ? Number(puntoDia.value.ejecutado_pct) : null))
const kpD = computed(() => (pdDia.value ? Number(pdDia.value.programado_pct) : null))
const kdvD = computed(() => (kvD.value != null && kpD.value != null ? kvD.value - kpD.value : null))
const col = (dv) => {
  const ti = Number(curva.value.param?.tol_inf ?? -3), ts = Number(curva.value.param?.tol_sup ?? 6), al = Number(curva.value.param?.alerta_desde ?? 4)
  if (dv == null) return 'inherit'
  if (dv < ti || dv > ts) return '#f87171'
  if (dv > al) return '#fbbf24'
  return '#4ade80'
}
// Término pronosticado por Earned Schedule: ES = fecha en que el programado
// alcanza el ejecutado de la fecha de dato; atraso = fecha de dato − ES.
const termino = computed(() => {
  const ps = puntos.value
  if (!ps.length || kv.value == null) return null
  const finRev = ps.find((p) => Number(p.programado_pct) >= 100)?.fecha ?? ps[ps.length - 1].fecha
  const es = ps.find((p) => Number(p.programado_pct) >= kv.value)?.fecha ?? finRev
  const dias = Math.round((new Date(puntoDato.value.fecha) - new Date(es)) / 86400000)
  return { fecha: addD(finRev, dias), finRev, dias }
})
const diasObra = computed(() => Math.max(0, Math.round((new Date(hoyIso) - new Date(inicioObra.value)) / 86400000) + 1))
const borradores = computed(() => reportes.value.filter((r) => r.estado !== 'Finalizado'))

const pernosPlano = computed(() => (sketch.value?.elementos ?? []).filter((e) => e.tipo === 'perno'))
const setAct = (act) => new Set(elementos.value.filter((e) => e.elemento === 'Perno' && e.actividad === act).map((e) => e.codigo_norm))
const pendientes = computed(() => {
  const perf = setAct('Perforación'), iny = setAct('Inyección')
  const cods = pernosPlano.value.map((p) => (p.codigo_rdc || p.codigo).toUpperCase())
  const porIny = cods.filter((c) => perf.has(c) && !iny.has(c)).length
  const porPerf = cods.filter((c) => !perf.has(c) && !iny.has(c)).length
  return { porIny, porPerf, total: porIny + porPerf }
})

// ---------- metrados aprobados al día ----------
const metrados = computed(() => {
  const acc = new Map()
  for (const a of crono.value.avance) if (a.fecha <= dia.value) acc.set(a.edt, (acc.get(a.edt) || 0) + Number(a.cantidad))
  const pend = new Map()
  for (const a of crono.value.porAprobar) if (a.fecha <= dia.value) pend.set(a.edt, (pend.get(a.edt) || 0) + Number(a.cantidad))
  const filas = crono.value.partidas.map((p) => {
    const q = acc.get(p.edt) || 0
    return { ...p, q, pend: pend.get(p.edt) || 0, pct: Number(p.metrado) ? Math.min(100, (q / Number(p.metrado)) * 100) : 0, exceso: q > Number(p.metrado) * 1.0001 }
  })
  const g = []
  for (const f of filas) {
    const nom = f.grupo || 'Partidas'
    if (!g.length || g[g.length - 1].nombre !== nom) g.push({ nombre: nom, edt: f.edt.split('.')[0], filas: [] })
    g[g.length - 1].filas.push(f)
  }
  return g.map((x) => {
    const hh = x.filas.reduce((a, f) => a + Number(f.hh || 0), 0)
    const gan = x.filas.reduce((a, f) => a + (Number(f.metrado) ? (Math.min(f.q, Number(f.metrado)) / Number(f.metrado)) * Number(f.hh) : 0), 0)
    return { ...x, pct: hh ? (gan / hh) * 100 : 0 }
  })
})
const enSector = (f) => sector.value === 'all' || !f.sector_codigo || f.sector_codigo.split(',').includes(sector.value)
const totalPendAprobar = computed(() => crono.value.porAprobar.length + (crono.value.bandejaPendientes || 0))

// ---------- restricciones y Stand By ----------
const CAUSA = (c) => {
  const t = (c || '').toUpperCase()
  if (t.includes('CLIMA')) return { t: 'Clima adverso', k: 'am' }
  if (t.includes('CLIENTE')) return { t: 'Causa del cliente', k: 'ro' }
  if (t.includes('CIERRE') || t.includes('VÍA') || t.includes('VIA')) return { t: 'Cierre de vías por encapsulados', k: 'az' }
  return { t: c || 'Otro', k: 'gr' }
}
const diasSb = computed(() => rdcSemana.value.map((r) => {
  const ev = (r.rdc_reporte_standby ?? []).map((s) => ({ ...CAUSA(s.causa === 'OTRO' ? s.causa_otro : s.causa), min: minutosStandBy(s), desde: s.desde?.slice(0, 5), hasta: s.hasta?.slice(0, 5), actividad: s.actividad }))
  return { fecha: r.fecha, ev, total: ev.reduce((a, e) => a + e.min, 0), redline: r.redline ? r.redline_descripcion || 'Redline reportado' : null }
}).filter((d) => d.ev.length || d.redline))
const sbTotal = computed(() => diasSb.value.reduce((a, d) => a + d.total, 0))
const sbCausas = computed(() => {
  const m = new Map()
  for (const d of diasSb.value) for (const e of d.ev) m.set(e.t, (m.get(e.t) || 0) + e.min)
  return [...m.entries()].map(([t, min]) => ({ t, min })).sort((a, b) => b.min - a.min)
})
const sinHora = computed(() => diasSb.value.reduce((a, d) => a + d.ev.filter((e) => !e.min).length, 0))

// ---------- rendimiento ----------
const rend = computed(() => {
  const s = semanaSel.value
  if (!s) return null
  const P = new Map(crono.value.partidas.map((p) => [p.edt, p]))
  let gan = 0
  for (const a of crono.value.avance) {
    if (a.fecha < s.desde || a.fecha > s.hasta) continue
    const p = P.get(a.edt)
    if (p && Number(p.metrado)) gan += (Number(a.cantidad) / Number(p.metrado)) * Number(p.hh)
  }
  const pd = rdcSemana.value.reduce((a, r) => a + (r.rdc_reporte_personal ?? []).reduce((b, x) => b + (Number(x.cantidad) || 0), 0), 0)
  const cons = pd * 9
  const barras = []
  for (let d = s.desde; d <= s.hasta; d = addD(d, 1)) {
    const p = puntos.value.find((x) => x.fecha === d), prev = puntos.value.find((x) => x.fecha === addD(d, -1))
    if (p?.ejecutado_pct != null) barras.push({ d, v: Number(p.ejecutado_pct) - (prev?.ejecutado_pct != null ? Number(prev.ejecutado_pct) : 0) })
  }
  const mx = Math.max(1, ...barras.map((b) => b.v))
  return { gan, cons, pd, r: cons ? gan / cons : null, barras: barras.map((b) => ({ ...b, h: Math.max(4, (b.v / mx) * 60) })) }
})

const verConciliacion = computed(() => auth.tienePermiso('procura.ver') || auth.tienePermiso('procura.ver_comparacion'))
const fmtDia = (d) => (d ? `${fechaCorta(d)}/${d.slice(0, 4)}` : '—')
</script>

<template>
  <div class="pl-col v5">
    <p v-if="cargando" class="pl-empty">Cargando…</p>
    <template v-else>
      <div class="kpis">
        <div class="kpi">
          <p class="l">Avance físico (HH)</p>
          <p class="v">{{ kv != null ? kv.toFixed(1) + ' %' : '—' }}</p>
          <p class="s">Programado {{ kp != null ? kp.toFixed(1) + ' %' : '—' }} · al {{ fechaCorta(puntoDato?.fecha) }}</p>
        </div>
        <div class="kpi">
          <p class="l">Desviación</p>
          <p class="v" :style="{ color: col(kdv) }">{{ kdv != null ? (kdv > 0 ? '+' : '') + kdv.toFixed(1) + ' %' : '—' }}</p>
          <p class="s">Tolerancia {{ curva.param?.tol_inf ?? -3 }} / +{{ curva.param?.tol_sup ?? 6 }} · alerta desde +{{ curva.param?.alerta_desde ?? 4 }}</p>
        </div>
        <div class="kpi">
          <p class="l">Término pronosticado</p>
          <p class="v" :style="{ color: termino && termino.dias > 0 ? '#f87171' : '#4ade80' }">{{ termino ? fechaCorta(termino.fecha) : '—' }}</p>
          <p class="s">Earned Schedule · Rev00 {{ termino ? fechaCorta(termino.finRev) : '' }}{{ termino && termino.dias ? ` · ${termino.dias > 0 ? '+' : ''}${termino.dias} d` : '' }}</p>
        </div>
        <div class="kpi">
          <p class="l">Días en obra</p>
          <p class="v">{{ diasObra }}</p>
          <p class="s">Inicio {{ fmtDia(inicioObra) }}</p>
        </div>
        <div class="kpi">
          <p class="l">RDC recibidos</p>
          <p class="v">{{ reportes.length }}</p>
          <p class="s">Último {{ fechaCorta(reportes[0]?.fecha) }}<template v-if="borradores.length"> · {{ borradores.map((b) => fechaCorta(b.fecha)).join(', ') }} en borrador</template></p>
        </div>
        <div class="kpi">
          <p class="l">Pernos pendientes</p>
          <p class="v" :style="pendientes.total ? 'color: #fbbf24' : ''">{{ pernosPlano.length ? pendientes.total : '—' }}</p>
          <p class="s">{{ pendientes.porIny }} por inyectar · {{ pendientes.porPerf }} por perforar</p>
        </div>
        <div class="kpi">
          <p class="l">Alertas abiertas</p>
          <p class="v" :style="alertas.length ? 'color: #f87171' : ''">{{ alertas.length }}</p>
          <p class="s">{{ alertas.length ? 'Procura excedida · ver Procura' : 'Sin alertas' }}</p>
        </div>
      </div>
      <div v-if="totalPendAprobar" class="pend">
        <b>⚠ Avance por aprobar:</b> {{ crono.porAprobar.length }} metrado(s) reportado(s) en el RDC después del {{ fechaCorta(fechaDato) }} y {{ crono.bandejaPendientes }} ítem(s) por confirmar en la bandeja. La curva S, el Gantt y los metrados solo cuentan lo que apruebas.
        <router-link v-if="auth.tienePermiso('rdc.confirmar_metrados')" to="/confirmacion">Ir a la bandeja</router-link>
      </div>

      <div class="player">
        <button type="button" class="play" @click="toggle">{{ reproduciendo ? '❚❚ Pausar' : '▶ Reproducir' }}</button>
        <span class="mu">Día</span>
        <input v-model.number="idx" type="range" min="0" :max="Math.max(0, diasPlayer.length - 1)" step="1" aria-label="Día del reproductor" />
        <b class="fecha">{{ fmtDia(dia) }}</b>
        <span class="live">Curva S <b>{{ kvD != null ? kvD.toFixed(1) + '%' : '—' }}</b> prog. {{ kpD != null ? kpD.toFixed(1) + '%' : '—' }} <b :style="{ color: col(kdvD) }">{{ kdvD != null ? (kdvD > 0 ? '+' : '') + kdvD.toFixed(1) + ' %' : '' }}</b></span>
        <span class="mu sm full">Plano, cronograma, curva S, metrados, restricciones y fotos avanzan juntos; esta barra queda fija al bajar.</span>
      </div>

      <div class="full-row">
          <SketchAvance v-model:sector="sector" :sketch="sketch" :avance="elementos" :dia="dia" :sectores="sectores" />
      </div>
      <div class="full-row">
          <CronogramaGantt :partidas="crono.partidas" :avance="crono.avance" :por-aprobar="crono.porAprobar" :sector="sector" :dia="dia" :nombre-frente="frente.nombre" />
      </div>
      <div class="g2 cm">
          <CurvaSSemanal
            v-model:semana="semana"
            :puntos="puntos" :param="curva.param" :dia="dia"
            :partidas="crono.partidas" :avance="crono.avance" :nombre-frente="frente.nombre"
            :ajustes="crono.ajustes" :puede-editar="puedeEditar" fuente-ejecutado="aprobado en bandeja / Control diario"
            @ajustar="ajustar" @anular="anular"
            @ver-semanal="router.push({ name: 'ficha-frente', params: { id: frente.id, tab: 'semanal' } })"
          />
          <section class="card">
            <h2>Metrados de avance aprobados</h2>
            <p class="sub">Al {{ fmtDia(dia) }} · vigente plano {{ sketch?.plano?.split(' ').pop() || '—' }}</p>
            <p v-if="!metrados.length" class="mu">Sin línea base por partida.</p>
            <div v-else class="met">
              <div class="th"><span>EDT</span><span>Partida</span><span class="r">Aprobado</span><span class="r">%</span></div>
              <template v-for="g in metrados" :key="g.nombre">
                <div class="tr grp"><span>{{ g.edt }}</span><span :title="g.nombre">{{ g.nombre }}</span><span></span><span class="r">{{ g.pct.toFixed(0) }}</span></div>
                <div v-for="m in g.filas" :key="m.edt" class="tr" :class="{ apagada: !enSector(m) }" :title="`${num(m.q)} de ${num(m.metrado)} ${m.unidad}`">
                  <span class="mu">{{ m.edt }}</span>
                  <span class="nom">{{ m.nombre }}<small>{{ num(m.metrado) }} {{ m.unidad }}<template v-if="m.sector_codigo"> · {{ m.sector_codigo.replace(',', ' · ') }}</template><template v-if="m.pend"> · <b class="amb">+{{ num(m.pend) }} por aprobar</b></template></small></span>
                  <span class="r">{{ m.q ? num(m.q) : '—' }}</span>
                  <span class="r"><span class="mini"><i :style="{ width: m.pct + '%', background: m.exceso ? '#f87171' : m.pct >= 99.9 ? '#4ade80' : '#f59e0b' }"></i></span>{{ m.pct.toFixed(0) }}</span>
                </div>
              </template>
            </div>
          </section>
      </div>
      <div class="g2 rf">
        <div class="col">
          <section class="card">
            <h2>Restricciones y Stand By</h2>
            <p class="sub">Semana {{ semana }} · tabla de Stand By del RDC · se cambia desde la curva S</p>
            <p v-if="cargandoSemana" class="mu">Cargando…</p>
            <template v-else>
              <div class="tiles">
                <div class="tile am"><span>Stand By total</span><b>{{ horasTexto(sbTotal) }}</b></div>
                <div v-for="c in sbCausas" :key="c.t" class="tile"><span>{{ c.t }}</span><b>{{ horasTexto(c.min) }}</b></div>
              </div>
              <p v-if="!diasSb.length" class="mu">Sin restricciones registradas en la semana.</p>
              <div v-for="d in diasSb" :key="d.fecha" class="dsb">
                <div class="dh"><b>{{ fechaCorta(d.fecha) }}</b><span v-if="d.total" class="amb">Stand By {{ horasTexto(d.total) }}</span></div>
                <div v-for="(e, i) in d.ev" :key="i" class="ev">
                  <span class="tag" :class="e.k" :title="e.actividad">{{ e.t }}</span>
                  <span class="amb">{{ e.desde && e.hasta ? `${e.desde}–${e.hasta} · ` : '' }}{{ e.min ? horasTexto(e.min) : 'sin hora' }}</span>
                </div>
                <div v-if="d.redline" class="ev"><span class="tag rl">Redline</span><span class="txt">{{ d.redline }}</span></div>
              </div>
              <p v-if="sinHora" class="warn">⚠ {{ sinHora }} registro(s) sin hora: pedir al supervisor que los complete (R-09).</p>
            </template>
          </section>
        </div>
        <div class="col">
          <section class="card">
            <h2>Fotos del frente</h2>
            <p class="sub">Semana {{ semana }} · se cambia desde la curva S</p>
            <p v-if="cargandoSemana" class="mu">Cargando…</p>
            <p v-else-if="!fotos.length" class="mu">Sin fotos enviadas en la semana.</p>
            <div v-else class="fotos">
              <button v-for="(f, i) in fotos" :key="i" type="button" class="foto" @click="fotoGrande = f">
                <img :src="f.url" :alt="f.etiqueta" loading="lazy" />
                <span class="cap"><b>{{ fmtDia(f.fecha) }}</b>{{ f.etiqueta }}</span>
              </button>
            </div>
          </section>
          <section class="card">
            <h2>Rendimiento de la semana</h2>
            <p class="sub">Semana {{ semana }} · HH, avance diario y Stand By</p>
            <template v-if="rend">
              <div class="tiles">
                <div class="tile"><span>HH ganadas</span><b style="color: #f59e0b">{{ num(rend.gan, 0) }}</b><small>según Rev00</small></div>
                <div class="tile"><span>HH consumidas</span><b>{{ rend.cons ? num(rend.cons, 0) : '—' }}</b><small>{{ rend.pd }} personas-día × 9 h</small></div>
                <div class="tile"><span>Rendimiento</span><b :style="{ color: rend.r == null ? '' : rend.r >= 1 ? '#4ade80' : '#fbbf24' }">{{ rend.r != null ? rend.r.toFixed(2) : '—' }}</b><small>ganadas / consumidas</small></div>
                <div class="tile"><span>Stand By</span><b style="color: #fbbf24">{{ horasTexto(sbTotal) }}</b><small>tabla de Stand By del RDC</small></div>
              </div>
              <p class="mu sm">Avance diario (% de la curva)</p>
              <div class="barras">
                <div v-for="b in rend.barras" :key="b.d" class="bcol">
                  <span>{{ b.v.toFixed(1) }}</span><i :style="{ height: b.h + 'px' }"></i><small>{{ fechaCorta(b.d) }}</small>
                </div>
              </div>
            </template>
          </section>
        </div>
      </div>

      <ConciliacionAlmacen v-if="verConciliacion" :frente-id="frente.id" :nombre-frente="frente.nombre" />
    </template>

    <div v-if="fotoGrande" class="modal" role="dialog" aria-modal="true" @click="fotoGrande = null">
      <img :src="fotoGrande.url" :alt="fotoGrande.etiqueta" />
      <p>{{ fmtDia(fotoGrande.fecha) }} · {{ fotoGrande.etiqueta }}</p>
    </div>
  </div>
</template>

<style scoped>
.v5 { gap: 16px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 12px; }
.kpi { box-sizing: border-box; background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.kpi.full { flex-basis: 100%; }
.kpi .l { margin: 0; color: var(--p-muted); font-size: 13px; }
.kpi .v { margin: 6px 0 4px; font-size: 27px; font-weight: 700; }
.kpi .s { margin: 0; color: var(--p-muted); font-size: 12px; line-height: 1.35; }
.player { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; background: var(--p-card); border: 1px solid var(--p-line); }
.play { min-height: 44px; padding: 0 18px; border-radius: 10px; border: 0; background: #f5a800; color: #0d0f10; font: inherit; font-weight: 800; cursor: pointer; }
.player input { flex: 1 1 240px; accent-color: #f5a800; }
.fecha { font-size: 20px; color: #f5a800; }
.mu { color: var(--p-muted); }
.sm { font-size: 12px; }
.player { position: sticky; top: 8px; z-index: 30; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45); }
.live { display: inline-flex; gap: 10px; align-items: baseline; padding-left: 12px; border-left: 1px solid var(--p-line); font-size: 12.5px; color: var(--p-muted); white-space: nowrap; }
.live b:first-child { font-size: 16px; color: var(--p-text); }
.full { flex: 1 1 100%; }
.g2 { display: grid; gap: 16px; align-items: stretch; }
.g2.cm { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
.g2.rf { grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); }
@media (max-width: 1100px) { .g2.cm, .g2.rf { grid-template-columns: minmax(0, 1fr); } }
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.col > .card:last-child { flex: 1 1 auto; }
.fotos { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important; }
.card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.card h2 { margin: 0; font-size: 17px; font-weight: 700; }
.sub { margin: 4px 0 12px; color: var(--p-muted); font-size: 12.5px; }
.met .th, .met .tr { display: grid; grid-template-columns: 38px 1fr 72px 64px; gap: 6px; align-items: center; padding: 8px 2px; border-bottom: 1px solid var(--p-line); font-size: 13px; }
.met .th { font-size: 11px; font-weight: 700; color: var(--p-muted); text-transform: uppercase; }
.met .grp { background: var(--p-chip); font-weight: 800; font-size: 11.5px; text-transform: uppercase; border-radius: 6px; }
.met .grp span:nth-child(2) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.apagada { opacity: 0.3; }
.pend { padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(245, 168, 0, 0.45); background: rgba(245, 168, 0, 0.08); font-size: 13px; line-height: 1.5; }
.pend a { color: #f5a800; font-weight: 800; margin-left: 6px; }
.met .nom small { display: block; font-size: 11px; color: var(--p-muted); }
.r { text-align: right; }
.mini { display: inline-block; width: 28px; height: 5px; border-radius: 9px; background: var(--p-line); margin-right: 4px; vertical-align: middle; overflow: hidden; }
.mini i { display: block; height: 100%; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.tile { background: var(--p-chip); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.tile.am { background: rgba(245, 168, 0, 0.14); }
.tile span { font-size: 11.5px; color: var(--p-muted); }
.tile b { font-size: 16px; }
.tile.am b { color: #fbbf24; }
.tile small { font-size: 10.5px; color: var(--p-muted); }
.dsb { border: 1px solid var(--p-line); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
.dh { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.ev { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12.5px; padding: 3px 0; }
.amb { color: #fbbf24; font-weight: 700; font-size: 12.5px; }
.tag { font-size: 11.5px; font-weight: 700; border-radius: 6px; padding: 2px 8px; }
.tag.am { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.tag.ro { background: rgba(248, 113, 113, 0.18); color: #f87171; }
.tag.az { background: rgba(96, 165, 250, 0.18); color: #93c5fd; }
.tag.gr { background: var(--p-chip); color: var(--p-muted); }
.tag.rl { background: rgba(96, 165, 250, 0.25); color: #bfdbfe; }
.txt { flex: 1; font-size: 12.5px; }
.warn { font-size: 12.5px; color: #fbbf24; }
.fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.foto { border: 0; padding: 0; background: var(--p-chip); cursor: pointer; border-radius: 10px; overflow: hidden; text-align: left; color: inherit; }
.foto img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
.cap { display: block; padding: 6px 8px; font-size: 11px; color: var(--p-muted); }
.cap b { display: block; color: var(--p-text); font-size: 11.5px; }
.barras { display: flex; gap: 8px; align-items: flex-end; height: 100px; }
.bcol { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; font-size: 11px; }
.bcol i { width: 100%; background: #f59e0b; border-radius: 3px 3px 0 0; display: block; }
.bcol small { color: var(--p-muted); font-size: 10.5px; }
.modal { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100; padding: 24px; cursor: zoom-out; }
.modal img { max-width: 100%; max-height: 85vh; border-radius: 12px; }
.modal p { color: #fff; margin-top: 10px; }
</style>
<style scoped>
@media (min-width: 1101px) {
  .g2.rf > .col:first-child { position: relative; }
  .g2.rf > .col:first-child > .card { position: absolute; inset: 0; overflow: auto; }
}
</style>

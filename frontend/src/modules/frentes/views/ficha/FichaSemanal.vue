<script setup>
// Plan semanal · lienzo 6 (aprobado 20/11/2026). Semana jueves a miércoles;
// todo lo que se ve (curva S, Stand By, metrados y fuerza laboral) es de la
// semana elegida. Avance aprobado (bandeja / Control diario) y RDC finalizados.
// Planeamiento puede "Modificar curva" (ratios HH/und → revisión de línea base)
// y exportar la semana, la curva S, el Stand By y la fuerza laboral.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../../store/auth'
import {
  cargarCurva, cargarCronograma, curvaEjecutada, cargarSemanaRdc, causaStandBy,
  minutosStandBy, semanaDe, fechaCorta, num,
} from '../../services/controlObraService'
import { exportarCurvaS } from '../../services/exportarCurvaS'
import { eventosStandBy, exportarStandBy, exportarFuerzaLaboral } from '../../services/exportarSemana'
import ModificarCurva from '../../components/control/ModificarCurva.vue'

const props = defineProps({ frente: { type: Object, required: true } })
const auth = useAuthStore()
const hayInforme = useRouter().hasRoute('planeamiento-informe')
const esPlaneamiento = computed(() => ['Planeamiento', 'Developer', 'Administrador'].includes(auth.nombreRol))
const puedeGuardarCurva = computed(() => auth.tienePermiso('procura.crear_version'))
const mcOn = ref(false)
const ocupado = ref('')
async function recargarCrono() { crono.value = await seguro(cargarCronograma(props.frente.id), crono.value) }
const INC_SEM = ['Hojas de la curva S: gráfico, datos diarios, partidas con ratios y HH, cortes y ajustes', 'Metrados aprobados por partida en la semana', 'Stand By por evento (formato del informe) y por causa', 'Fuerza laboral por día', 'Una hoja Resumen con los indicadores de la semana']
const INC_CURVA = ['Hoja Curva S: gráfico de Excel (programado, ejecutado y banda) listo para pegar en el informe', 'Hoja Datos diarios: fecha, semana, programado %, ejecutado %, desviación, banda y estado', 'Hoja Partidas: EDT, partida, unidad, metrado, ratio HH/und, HH, peso %, acumulado aprobado, % avance y HH ganadas', 'Hoja Cortes semanales: corte de cada miércoles con desviación y criterio aplicado', 'Hoja Ajustes: revisiones de la línea base con motivo, fecha y usuario']
const INC_SB = ['Tabla en el formato del informe: N°, frente, fecha, actividad afectada, causa, horario, total hh:mm', 'Personal afectado y HH de Stand By por evento', 'Resumen por causa y por día, con total de la semana', 'Restricciones escritas en el RDC y eventos "Otro" por revisar']
const INC_FL = ['Tabla por día con el formato del informe (Tabla 10): mano de obra directa, operadores/conductores y staff', 'Cuadrilla por frente (Tabla 11)', 'Nota de fuente y criterio de conductores']
async function conOcupado(k, fn) { ocupado.value = k; try { await fn() } catch (e) { console.error(e) } finally { ocupado.value = '' } }
const expCurva = () => conOcupado('cv', () => exportarCurvaS({ frente: props.frente.nombre, puntos: puntos.value, partidasVig: curvaEj.value.partidasVig, revs: crono.value.revs, param: curva.value.param, fechaDato: fechaDato.value }))
const expSb = () => semana.value && conOcupado('sb', () => exportarStandBy(props.frente.id, props.frente.nombre, semana.value))
const expFl = () => semana.value && conOcupado('fl', () => exportarFuerzaLaboral(props.frente.id, props.frente.nombre, semana.value))

const iso = (d) => d.toISOString().slice(0, 10)
const addD = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const hoy = iso(new Date(Date.now() - 5 * 3600000))
const seguro = (p, def) => p.catch((e) => { console.warn(e); return def })

const cargando = ref(true)
const curva = ref({ param: null, puntos: [] })
const crono = ref({ partidas: [], avance: [], porAprobar: [], revs: [] })
const sel = ref('')
const rdc = ref([])
const cargandoSem = ref(false)
const cache = new Map()

onMounted(async () => {
  const id = props.frente.id
  const [c, cr] = await Promise.all([
    seguro(cargarCurva(id), { param: null, puntos: [] }),
    seguro(cargarCronograma(id), { partidas: [], avance: [], porAprobar: [], revs: [] }),
  ])
  curva.value = c; crono.value = cr
  // Abre en la semana del último avance aprobado (la que se informa), no en la que recién empieza.
  const dato = semanas.value.find((x) => x.clave === semanaDe(fechaDato.value).clave)
  sel.value = (dato || semanas.value[semanas.value.length - 1])?.clave || ''
  cargando.value = false
})

const curvaEj = computed(() => curvaEjecutada(curva.value.puntos, crono.value.partidas, crono.value.avance, crono.value.revs))
const puntos = computed(() => curvaEj.value.puntos)
const fechaDato = computed(() => curvaEj.value.ultima || hoy)
const inicio = computed(() => props.frente.fecha_inicio || curva.value.puntos[0]?.fecha || hoy)

const semanas = computed(() => {
  const out = []
  let d = semanaDe(inicio.value).desde
  while (d <= hoy && out.length < 80) { const s = semanaDe(d); out.push(s); d = addD(s.hasta, 1) }
  return out
})
const semana = computed(() => semanas.value.find((s) => s.clave === sel.value) || null)
const dias = computed(() => (semana.value ? Array.from({ length: 7 }, (_, i) => addD(semana.value.desde, i)) : []))
const DL = ['Jue', 'Vie', 'Sáb', 'Dom', 'Lun', 'Mar', 'Mié']

watch(semana, async (s) => {
  if (!s) return
  if (cache.has(s.clave)) { rdc.value = cache.get(s.clave); return }
  cargandoSem.value = true
  const r = await seguro(cargarSemanaRdc(props.frente.id, s.desde, s.hasta), [])
  cache.set(s.clave, r)
  if (sel.value === s.clave) rdc.value = r
  cargandoSem.value = false
})

// ---------- indicadores ----------
const corte = computed(() => (semana.value ? (semana.value.hasta < fechaDato.value ? semana.value.hasta : fechaDato.value) : null))
const enCurso = computed(() => semana.value && semana.value.hasta > fechaDato.value)
const pAt = (f, campo) => { const p = [...puntos.value].reverse().find((x) => x.fecha <= f && x[campo] != null); return p ? Number(p[campo]) : null }
const kp = computed(() => (corte.value ? pAt(corte.value, 'programado_pct') : null))
const kpFin = computed(() => (semana.value ? pAt(semana.value.hasta, 'programado_pct') : null))
const kv = computed(() => (corte.value && semana.value.desde <= fechaDato.value ? pAt(corte.value, 'ejecutado_pct') : null))
const kdv = computed(() => (kv.value != null && kp.value != null ? kv.value - kp.value : null))
const tolI = computed(() => Number(curva.value.param?.tol_inf ?? -3))
const tolS = computed(() => Number(curva.value.param?.tol_sup ?? 6))
const alerta = computed(() => Number(curva.value.param?.alerta_desde ?? 4))
const col = (d) => (d == null ? '' : d < tolI.value || d > tolS.value ? '#f87171' : d > alerta.value ? '#fbbf24' : '#4ade80')

// ---------- metrados de la semana (solo aprobado) ----------
const P = computed(() => new Map(crono.value.partidas.map((p) => [p.edt, p])))
const metSemana = computed(() => {
  if (!semana.value) return []
  const m = new Map()
  for (const a of crono.value.avance) {
    if (!m.has(a.edt)) m.set(a.edt, { acum: 0, sem: 0, dias: new Set() })
    const x = m.get(a.edt)
    if (a.fecha <= semana.value.hasta) x.acum += a.cantidad
    if (a.fecha >= semana.value.desde && a.fecha <= semana.value.hasta && a.cantidad) { x.sem += a.cantidad; x.dias.add(a.fecha) }
  }
  return [...m.entries()].filter(([, x]) => x.sem > 1e-9).map(([edt, x]) => {
    const p = P.value.get(edt) || {}
    const q = Number(p.metrado || 0)
    return { edt, nombre: p.partida || p.nombre || edt, unidad: p.unidad || '', sem: x.sem, acum: x.acum, q, pct: q ? (x.acum / q) * 100 : 0, dias: x.dias }
  }).sort((a, b) => a.edt.localeCompare(b.edt, undefined, { numeric: true }))
})
const diasConMetrado = computed(() => new Set(metSemana.value.flatMap((m) => [...m.dias])))

// ---------- Stand By (criterio aprobado 20/11) ----------
// Solo causas ajenas a DESNIVEL; repetidos (frente, fecha, causa, actividad y
// horario) se cuentan una vez; "Otro" queda por revisar y no suma.
const eventos = computed(() => {
  const out = []
  for (const r of rdc.value) {
    const vistos = new Set()
    for (const s of [...(r.rdc_reporte_standby ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))) {
      const c = causaStandBy(s)
      let act = s.actividad, obs = null
      if (!act && s.responsable && s.responsable.length > 12) { act = s.responsable; obs = 'La actividad está escrita en el campo "responsable" del RDC' }
      if (!act) obs = 'El RDC no indica la actividad afectada'
      const min = minutosStandBy(s)
      const clave = [c.k, (act || '').trim().toLowerCase(), s.desde || '', s.hasta || '', s.desde ? '' : min].join('|')
      if (vistos.has(clave)) continue
      vistos.add(clave)
      if (c.k === 'ot') obs = 'Causa "Otro": no entra al informe hasta que Planeamiento la impute'
      out.push({ fecha: r.fecha, act, obs, nota: s.comentario, c, rev: c.k === 'ot', desde: s.desde?.slice(0, 5), hasta: s.hasta?.slice(0, 5), min })
    }
  }
  return out
})
const evInforme = computed(() => eventos.value.filter((e) => !e.rev))
const sbTot = computed(() => evInforme.value.reduce((a, e) => a + e.min, 0))
const CAUS = [
  { k: 'cv', c: '#60a5fa' }, { k: 'cc', c: '#f87171' }, { k: 'cl', c: '#fbbf24' }, { k: 'ex', c: '#c084fc' }, { k: 'ot', c: '#9ca3af' },
]
const porCausa = computed(() => CAUS.map((x) => {
  const ev = evInforme.value.filter((e) => e.c.k === x.k)
  return { ...x, t: ev[0]?.c.t, r: ev[0]?.c.r, min: ev.reduce((a, e) => a + e.min, 0) }
}).filter((x) => x.min > 0))
const actividades = computed(() => {
  const m = new Map()
  for (const e of evInforme.value) {
    const t = (e.act || '').toLowerCase()
    const k = t.includes('erfora') ? 'Perforación e inyección' : t.includes('malla') ? 'Instalación de malla' : t.includes('cable') ? 'Tensado de cable' : t.includes('eplanteo') ? 'Replanteo de puntos' : e.act ? e.act : 'Sin actividad en el RDC'
    m.set(k, (m.get(k) || 0) + e.min)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
})
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const hayOtro = computed(() => eventos.value.some((e) => e.c.k === 'ot'))

// ---------- fuerza laboral ----------
const PLURAL = { Capataz: 'Capataces', Operario: 'Operarios', Oficial: 'Oficiales', Peón: 'Peones', Vigía: 'Vigías' }
const SOPORTE = ['Camioneta', 'Minibús', 'Camión grúa', 'Camión Grúa', 'Camión Baranda', 'Camión baranda', 'Cisterna', 'Volquete']
const porDia = computed(() => {
  const m = new Map()
  for (const r of rdc.value) {
    const x = m.get(r.fecha) || { mod: {}, veh: {} }
    for (const p of r.rdc_reporte_personal ?? []) if ((p.tipo || 'directa') === 'directa') x.mod[p.categoria] = (x.mod[p.categoria] || 0) + Number(p.cantidad || 0)
    for (const q of r.rdc_reporte_maquinaria ?? []) if (q.categoria === 'soporte' || SOPORTE.includes(q.tipo)) { const t = q.tipo.charAt(0) + q.tipo.slice(1).toLowerCase(); x.veh[t] = (x.veh[t] || 0) + Number(q.cantidad || 0) }
    m.set(r.fecha, x)
  }
  return m
})
const catsMod = computed(() => {
  const orden = ['Capataz', 'Operario', 'Oficial', 'Peón', 'Vigía']
  const s = new Set(); for (const x of porDia.value.values()) Object.keys(x.mod).forEach((k) => s.add(k))
  return [...s].sort((a, b) => (orden.indexOf(a) + 99 * (orden.indexOf(a) < 0)) - (orden.indexOf(b) + 99 * (orden.indexOf(b) < 0)))
})
const catsVeh = computed(() => { const s = new Set(); for (const x of porDia.value.values()) Object.keys(x.veh).forEach((k) => s.add(k)); return [...s].sort() })
const tMod = (d) => { const x = porDia.value.get(d); return x ? Object.values(x.mod).reduce((a, b) => a + b, 0) : null }
const tOp = (d) => { const x = porDia.value.get(d); return x ? Object.values(x.veh).reduce((a, b) => a + b, 0) : null }
const tSup = (d) => (porDia.value.has(d) ? 1 : null)
const tTot = (d) => (porDia.value.has(d) ? tMod(d) + tOp(d) + 1 : null)
const diasRdc = computed(() => dias.value.filter((d) => porDia.value.has(d)))
const promedio = computed(() => (diasRdc.value.length ? diasRdc.value.reduce((a, d) => a + tTot(d), 0) / diasRdc.value.length : 0))
const hhSemana = computed(() => diasRdc.value.reduce((a, d) => a + tTot(d) * 9, 0))
const FCOL = { mod: '#3b82f6', op: '#f97316', sup: '#eab308' }

// ---------- gráfico de fuerza laboral ----------
const fl = computed(() => {
  const W = 460, H = 330, L = 30, B = 34, T = 24
  const mx = Math.max(8, Math.ceil((Math.max(0, ...dias.value.map((d) => tTot(d) || 0)) + 2) / 4) * 4)
  const bw = (W - L - 10) / 7
  const Y = (v) => T + (H - T - B) * (1 - v / mx)
  const grid = []; for (let v = 0; v <= mx; v += mx > 24 ? 8 : 4) grid.push({ v, y: Y(v) })
  const bars = dias.value.map((d, i) => {
    const x = L + i * bw + bw * 0.18, w = bw * 0.64
    if (!porDia.value.has(d)) return { d, i, x, w, sin: true }
    let y = H - B
    const segs = [['mod', tMod(d)], ['op', tOp(d)], ['sup', 1]].map(([k, v]) => { const h = (H - T - B) * v / mx; y -= h; return { k, v, y, h } })
    return { d, i, x, w, segs, top: y, tot: tTot(d) }
  })
  return { W, H, L, B, grid, bars }
})

// ---------- curva S de la semana ----------
const cs = computed(() => {
  const W = 760, H = 300, L = 44, R = 16, T = 26, B = 46
  const pts = puntos.value
  if (!pts.length || !semana.value) return null
  const f0 = pts[0].fecha, f1 = pts[pts.length - 1].fecha
  const n = Math.max(1, Math.round((new Date(f1) - new Date(f0)) / 86400000))
  const X = (f) => L + (Math.round((new Date(f) - new Date(f0)) / 86400000) / n) * (W - L - R)
  const Y = (v) => T + (H - T - B) * (1 - v / 100)
  const prog = pts.map((p) => `${X(p.fecha).toFixed(1)},${Y(Number(p.programado_pct)).toFixed(1)}`).join(' ')
  const up = pts.map((p) => `${X(p.fecha).toFixed(1)},${Y(Math.min(100, Number(p.programado_pct) + tolS.value)).toFixed(1)}`)
  const lo = pts.map((p) => `${X(p.fecha).toFixed(1)},${Y(Math.max(0, Number(p.programado_pct) + tolI.value)).toFixed(1)}`).reverse()
  const ej = pts.filter((p) => p.ejecutado_pct != null && p.fecha <= (corte.value || '')).map((p) => `${X(p.fecha).toFixed(1)},${Y(Number(p.ejecutado_pct)).toFixed(1)}`).join(' ')
  const xw = (W - L - R) / n
  const sem = { x: X(semana.value.desde) - xw / 2, w: 7 * xw }
  const labs = semanas.value.filter((s) => s.desde >= f0 && s.desde <= f1).map((s) => ({ t: s.clave, x: (X(s.desde) + X(s.hasta < f1 ? s.hasta : f1)) / 2, on: s.clave === sel.value }))
  const ticks = pts.filter((_, i) => i % 3 === 0).map((p) => ({ x: X(p.fecha), t: fechaCorta(p.fecha) }))
  let mk = null
  if (kv.value != null && kp.value != null) {
    const x = X(corte.value)
    mk = { x, yp: Y(kp.value), ye: Y(kv.value), bx: x < W - R - 170 ? x + 10 : x - 170, c: col(kdv.value) }
  }
  return { W, H, L, R, T, B, prog, band: `${up.join(' ')} ${lo.join(' ')}`, ej, sem, labs, ticks, mk, Y, grid: [0, 25, 50, 75, 100] }
})

// ---------- exportar ----------
async function exportar() {
  const s = semana.value
  if (!s) return
  ocupado.value = 'sem'
  try { await exportarSemanaXlsx(s) } catch (e) { console.error(e) } finally { ocupado.value = '' }
}
async function exportarSemanaXlsx(s) {
  const nom = props.frente.nombre
  const sb = eventosStandBy(rdc.value, nom).informe
  await exportarCurvaS({ frente: nom, puntos: puntos.value, partidasVig: curvaEj.value.partidasVig, revs: crono.value.revs, param: curva.value.param, fechaDato: fechaDato.value, nombreArchivo: `Plan_semanal_${nom}_${s.clave}_${s.desde}_${s.hasta}.xlsx`, extra: [
    { nombre: 'Resumen', anchos: [34, 18], filas: [
      { Concepto: 'Frente', Valor: nom },
      { Concepto: 'Semana', Valor: `${s.clave} (${fechaCorta(s.desde)} al ${fechaCorta(s.hasta)})` },
      { Concepto: 'Fecha de dato', Valor: corte.value },
      { Concepto: 'Programado %', Valor: kp.value != null ? +kp.value.toFixed(2) : '' },
      { Concepto: 'Ejecutado % (aprobado)', Valor: kv.value != null ? +kv.value.toFixed(2) : '' },
      { Concepto: 'Desviación %', Valor: kdv.value != null ? +kdv.value.toFixed(2) : '' },
      { Concepto: 'Stand By total (hh:mm)', Valor: hhmm(sbTot.value) },
      { Concepto: 'Promedio diario de personas', Valor: +promedio.value.toFixed(1) },
      { Concepto: 'HH de la semana', Valor: hhSemana.value },
    ] },
    { nombre: 'Metrados', anchos: [8, 46, 8, 12, 12, 12, 10], filas: metSemana.value.map((m) => ({ EDT: m.edt, Partida: m.nombre, 'U.M.': m.unidad, Semana: +m.sem.toFixed(2), Acumulado: +m.acum.toFixed(2), Vigente: +m.q.toFixed(2), 'Avance %': +m.pct.toFixed(1) })) },
    { nombre: 'Stand By', anchos: [5, 12, 12, 52, 30, 18, 12, 10, 12], filas: sb.map((e, i) => ({ 'N°': i + 1, Frente: e.frente, Fecha: `${e.fecha.slice(8, 10)}/${e.fecha.slice(5, 7)}/${e.fecha.slice(0, 4)}`, 'Actividad afectada': e.act, Causa: e.causa, Horario: e.horario, 'Total hh:mm': hhmm(e.min), 'Personal afectado': e.personal, 'HH stand-by': e.hh })) },
    { nombre: 'Fuerza laboral', anchos: [32, 9, 9, 9, 9, 9, 9, 9], filas: [
      ...catsMod.value.map((c) => filaFL(PLURAL[c] || c, (d) => porDia.value.get(d)?.mod[c] ?? 0)),
      filaFL('Total mano de obra directa', tMod),
      ...catsVeh.value.map((v) => filaFL('Conductor ' + v.toLowerCase(), (d) => porDia.value.get(d)?.veh[v] ?? 0)),
      filaFL('Total operadores / conductores', tOp),
      filaFL('Supervisor de campo', tSup),
      filaFL('Total en el frente', tTot),
    ] },
  ] })
}
function filaFL(t, f) {
  const o = { 'Cargo / categoría': t }
  dias.value.forEach((d, i) => { o[`${DL[i]} ${d.slice(8, 10)}`] = porDia.value.has(d) ? f(d) : '' })
  return o
}
</script>

<template>
  <div class="pl-col sem">
    <p v-if="cargando" class="pl-empty">Cargando…</p>
    <template v-else>
      <div class="top">
        <div class="seg" role="group" aria-label="Semana">
          <button v-for="s in semanas" :key="s.clave" type="button" :class="{ on: sel === s.clave }" :aria-pressed="sel === s.clave" @click="sel = s.clave">
            {{ s.clave }} · {{ s.desde.slice(8, 10) }}.{{ s.desde.slice(5, 7) }}–{{ s.hasta.slice(8, 10) }}.{{ s.hasta.slice(5, 7) }}
          </button>
        </div>
        <div class="acts">
          <button type="button" class="gh" :disabled="!semana || cargandoSem || ocupado === 'sem'" @click="exportar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 13l6 6M15 13l-6 6" /></svg>
            {{ ocupado === 'sem' ? 'Exportando…' : 'Exportar semana a Excel' }}
          </button>
          <span class="pop pr" tabindex="0" aria-label="El Excel incluye"><span class="ico">i</span><span class="pb"><b>El Excel incluye</b><ul><li v-for="t in INC_SEM" :key="t">{{ t }}</li></ul></span></span>
          <router-link v-if="esPlaneamiento && hayInforme" class="pri" :to="{ name: 'planeamiento-informe', query: { semana: sel } }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            Exportar informe de plan semanal
          </router-link>
          <button v-else-if="esPlaneamiento" type="button" class="pri" disabled title="Se habilita con la página Planeamiento › Informe semanal">Exportar informe de plan semanal</button>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi"><p class="l">Programado a la fecha de dato</p><p class="v">{{ kp != null ? kp.toFixed(1) + '%' : '—' }}</p><p class="s">{{ enCurso ? `Al ${fechaCorta(corte)} · corte ${fechaCorta(semana?.hasta)}: ${kpFin != null ? kpFin.toFixed(1) : '—'} %` : `Corte miércoles ${fechaCorta(semana?.hasta)}` }}</p></div>
        <div class="kpi"><p class="l">Ejecutado</p><p class="v am">{{ kv != null ? kv.toFixed(1) + '%' : '—' }}</p><p class="s">{{ enCurso ? `En curso · al ${fechaCorta(corte)}` : 'Aprobado en bandeja' }}</p></div>
        <div class="kpi"><p class="l">Desviación</p><p class="v" :style="{ color: col(kdv) }">{{ kdv != null ? (kdv > 0 ? '+' : '') + kdv.toFixed(1) + ' %' : '—' }}</p><p class="s">Tolerancia {{ tolI }} / +{{ tolS }}</p></div>
        <div class="kpi"><p class="l">Días reportados</p><p class="v">{{ rdc.length }}</p><p class="s">RDC finalizados · {{ fechaCorta(semana?.desde) }}–{{ fechaCorta(semana?.hasta) }}</p></div>
        <div class="kpi"><p class="l">Partidas con avance</p><p class="v">{{ metSemana.length }}</p><p class="s">con metrado aprobado</p></div>
        <div class="kpi"><p class="l">Días sin metrado</p><p class="v">{{ Math.max(0, rdc.length - diasConMetrado.size) }}</p><p class="s">RDC sin partidas aprobadas</p></div>
      </div>

      <div class="g2 a">
        <section class="card">
          <div class="hdr">
            <div><h2>Curva S · {{ sel }}</h2>
            <p class="sub">Avance ponderado por HH · semana {{ fechaCorta(semana?.desde) }} – {{ fechaCorta(semana?.hasta) }} resaltada</p></div>
            <div class="acts">
              <button v-if="esPlaneamiento" type="button" class="mcb" :aria-pressed="mcOn" @click="mcOn = true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                Modificar curva
              </button>
              <button type="button" class="gh" :disabled="ocupado === 'cv' || !puntos.length" @click="expCurva">{{ ocupado === 'cv' ? 'Exportando…' : 'Exportar curva S' }}</button>
              <span class="pop pr" tabindex="0" aria-label="El Excel incluye"><span class="ico">i</span><span class="pb"><b>El Excel incluye</b><ul><li v-for="t in INC_CURVA" :key="t">{{ t }}</li></ul></span></span>
            </div>
          </div>
          <div class="leg">
            <span><i style="background: #cbd5e1; height: 3px"></i>Programado Rev00</span>
            <span><i style="background: #f59e0b; height: 3px"></i>Ejecutado aprobado</span>
            <span><i style="background: rgba(34, 197, 94, 0.35)"></i>Banda {{ tolI }} % / +{{ tolS }} %</span>
            <span><i style="background: rgba(245, 168, 0, 0.3)"></i>Semana {{ sel }}</span>
          </div>
          <svg v-if="cs" :viewBox="`0 0 ${cs.W} ${cs.H}`" class="svg" role="img" :aria-label="`Curva S con la semana ${sel} resaltada`">
            <rect :x="cs.sem.x" :y="cs.T" :width="cs.sem.w" :height="cs.H - cs.T - cs.B" fill="#f5a800" fill-opacity="0.08" stroke="#f5a800" stroke-opacity="0.35" />
            <g v-for="g in cs.grid" :key="g">
              <line :x1="cs.L" :x2="cs.W - cs.R" :y1="cs.Y(g)" :y2="cs.Y(g)" stroke="#2d3139" />
              <text :x="cs.L - 6" :y="cs.Y(g) + 4" text-anchor="end" font-size="10.5" fill="#9ca3af">{{ g }}%</text>
            </g>
            <text v-for="t in cs.ticks" :key="t.x" :x="t.x" :y="cs.H - 30" text-anchor="middle" font-size="9" fill="#6b7280">{{ t.t }}</text>
            <text v-for="l in cs.labs" :key="l.t" :x="l.x" :y="cs.H - 14" text-anchor="middle" font-size="11" font-weight="700" :fill="l.on ? '#f5b93a' : '#9ca3af'">{{ l.t }}</text>
            <polygon :points="cs.band" fill="#22c55e" fill-opacity="0.09" />
            <polyline :points="cs.prog" fill="none" stroke="#cbd5e1" stroke-width="2.2" />
            <polyline v-if="cs.ej" :points="cs.ej" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round" />
            <g v-if="cs.mk">
              <line :x1="cs.mk.x" :x2="cs.mk.x" :y1="cs.T" :y2="cs.H - cs.B" :stroke="cs.mk.c" stroke-dasharray="4 4" />
              <circle :cx="cs.mk.x" :cy="cs.mk.yp" r="4.5" fill="#cbd5e1" stroke="#111315" stroke-width="1.5" />
              <circle :cx="cs.mk.x" :cy="cs.mk.ye" r="6" :fill="cs.mk.c" stroke="#111315" stroke-width="2" />
              <rect :x="cs.mk.bx" :y="cs.mk.ye - 44" width="160" height="40" rx="7" fill="#202327" :stroke="cs.mk.c" />
              <text :x="cs.mk.bx + 10" :y="cs.mk.ye - 28" font-size="11" fill="#cbd5e1">Prog. {{ kp.toFixed(1) }} % · Ejec. {{ kv.toFixed(1) }} %</text>
              <text :x="cs.mk.bx + 10" :y="cs.mk.ye - 12" font-size="12" font-weight="800" :fill="cs.mk.c">Desviación {{ kdv > 0 ? '+' : '' }}{{ kdv.toFixed(1) }} % · al {{ fechaCorta(corte) }}</text>
            </g>
          </svg>
          <p v-else class="mu">Sin curva cargada para este frente.</p>
        </section>

        <section class="card col">
          <h2>Stand By · {{ sel }}</h2>
          <p class="sub">Resumen por causa · RDC finalizados</p>
          <p v-if="cargandoSem" class="mu">Cargando…</p>
          <template v-else-if="evInforme.length">
            <div class="tiles">
              <div class="tile am"><span>Stand By total</span><b>{{ hhmm(sbTot) }} h</b></div>
              <div class="tile"><span>Eventos · días</span><b>{{ evInforme.length }} · {{ new Set(evInforme.map((e) => e.fecha)).size }}</b></div>
            </div>
            <div v-for="c in porCausa" :key="c.k" class="cau">
              <div class="ch"><span><span class="tag" :class="c.k">{{ c.t }}</span> <span class="mu">{{ c.r }}</span></span><b>{{ hhmm(c.min) }} h</b></div>
              <div class="trk"><i :style="{ width: (c.min / sbTot) * 100 + '%', background: c.c }"></i></div>
            </div>
            <p class="cap">Actividades más afectadas</p>
            <ul class="tops"><li v-for="[k, m] in actividades" :key="k"><span>{{ k }}</span><b>{{ hhmm(m) }} h</b></li></ul>
          </template>
          <p v-else class="mu">Sin Stand By registrado en los RDC finalizados de la semana.</p>
          <p class="ok">Solo causas ajenas a DESNIVEL: clima, cliente y terceros.<template v-if="hayOtro"> Hay eventos "Otro": revisar que no sean imputables al contratista.</template><template v-else> Ningún evento imputable al contratista.</template></p>
        </section>
      </div>

      <ModificarCurva
        v-if="mcOn && esPlaneamiento"
        :frente-id="frente.id" :puntos="curva.puntos" :partidas="crono.partidas" :avance="crono.avance"
        :revs="crono.revs" :param="curva.param" :puede-guardar="puedeGuardarCurva"
        @cerrar="mcOn = false" @guardado="recargarCrono"
      />

      <section class="card">
        <h2>Metrados de la {{ sel }} por partida</h2>
        <p class="sub">Semana jueves a miércoles · solo partidas con avance aprobado</p>
        <table v-if="metSemana.length" class="t" data-sin-filtro>
          <thead><tr><th>EDT</th><th>Partida</th><th>U.M.</th><th class="r">Semana</th><th class="r">Acumulado</th><th class="r">Vigente</th><th>Avance</th><th>Días con avance (jue → mié)</th></tr></thead>
          <tbody>
            <tr v-for="m in metSemana" :key="m.edt">
              <td class="mu">{{ m.edt }}</td><td class="b">{{ m.nombre }}</td><td class="mu">{{ m.unidad }}</td>
              <td class="r am b">{{ num(m.sem) }}</td><td class="r">{{ num(m.acum) }}</td><td class="r mu">{{ num(m.q) }}</td>
              <td><span class="pc"><span>{{ m.pct.toFixed(0) }}%</span><span class="trk"><i :style="{ width: Math.min(100, m.pct) + '%', background: m.pct >= 99.9 ? '#22c55e' : '#f59e0b' }"></i></span></span></td>
              <td><span class="dots"><span v-for="(d, i) in dias" :key="d" :title="fechaCorta(d)" :class="m.dias.has(d) ? 'on' : d > fechaDato ? 'fut' : ''">{{ DL[i].slice(0, 2) }}</span></span></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="mu">Sin metrados aprobados en la semana.</p>
        <p v-if="enCurso && crono.porAprobar.length" class="mu sm">Metrados aprobados hasta el {{ fechaCorta(fechaDato) }}. Hay {{ crono.porAprobar.length }} metrado(s) esperando tu aprobación en la bandeja.</p>
      </section>

      <section class="card">
        <div class="hdr">
          <div><h2>Detalle de Stand By · {{ sel }}</h2>
          <p class="sub">Actividad afectada, causa y tiempo · hh:mm · solo causas ajenas a DESNIVEL</p></div>
          <div class="acts">
            <button type="button" class="gh" :disabled="ocupado === 'sb' || !semana" @click="expSb">{{ ocupado === 'sb' ? 'Exportando…' : 'Exportar a Excel' }}</button>
            <span class="pop pr" tabindex="0" aria-label="El Excel incluye"><span class="ico">i</span><span class="pb"><b>El Excel incluye</b><ul><li v-for="t in INC_SB" :key="t">{{ t }}</li></ul></span></span>
          </div>
        </div>
        <table v-if="eventos.length" class="t" data-sin-filtro>
          <thead><tr><th>N°</th><th>Fecha</th><th>Actividad afectada</th><th>Causa</th><th>Horario</th><th class="r">Total hh:mm</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in eventos" :key="i">
              <td class="mu">{{ i + 1 }}</td>
              <td class="nw">{{ e.fecha.slice(8, 10) }}/{{ e.fecha.slice(5, 7) }}/{{ e.fecha.slice(0, 4) }}</td>
              <td>
                <span :class="{ am: !e.act }">{{ e.act || 'Sin actividad en el RDC' }}</span>
                <span v-if="e.obs || e.nota" class="pop" tabindex="0" :aria-label="e.obs || e.nota"><span class="ico" :class="{ warn: e.obs }">{{ e.obs ? '!' : 'i' }}</span><span class="pb">{{ e.obs || e.nota }}</span></span>
              </td>
              <td><span class="tag" :class="e.c.k">{{ e.c.t }}<template v-if="e.rev"> · por revisar</template></span></td>
              <td class="mu nw">{{ e.desde ? `${e.desde}–${e.hasta}` : 'sin hora (total)' }}</td>
              <td class="r b" :class="e.rev ? 'mu' : 'am'">{{ hhmm(e.min) }}</td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="5" class="b">Total {{ sel }} · {{ evInforme.length }} eventos<template v-if="eventos.length > evInforme.length"> · {{ eventos.length - evInforme.length }} por revisar (no suman)</template></td><td class="r am b">{{ hhmm(sbTot) }} h</td></tr></tfoot>
        </table>
        <p v-else class="mu">Sin eventos en la semana.</p>
      </section>

      <section class="card">
        <div class="hdr">
          <div><h2>Fuerza laboral · {{ sel }}</h2>
          <p class="sub">Mano de obra directa, operadores y supervisión según RDC · jornada de 9 h</p></div>
          <div class="acts">
            <button type="button" class="gh" :disabled="ocupado === 'fl' || !semana" @click="expFl">{{ ocupado === 'fl' ? 'Exportando…' : 'Exportar a Excel' }}</button>
            <span class="pop pr" tabindex="0" aria-label="El Excel incluye"><span class="ico">i</span><span class="pb"><b>El Excel incluye</b><ul><li v-for="t in INC_FL" :key="t">{{ t }}</li></ul></span></span>
          </div>
        </div>
        <div class="g2 f">
          <div>
            <div class="leg">
              <span><i :style="{ background: FCOL.mod }"></i>Mano de obra directa</span>
              <span><i :style="{ background: FCOL.op }"></i>Operadores / conductores</span>
              <span><i :style="{ background: FCOL.sup }"></i>Supervisión</span>
            </div>
            <svg :viewBox="`0 0 ${fl.W} ${fl.H}`" class="svg" role="img" :aria-label="`Fuerza laboral diaria de la semana ${sel}`">
              <g v-for="g in fl.grid" :key="g.v"><line :x1="fl.L" :x2="fl.W - 6" :y1="g.y" :y2="g.y" stroke="#2d3139" /><text :x="fl.L - 6" :y="g.y + 4" text-anchor="end" font-size="10" fill="#9ca3af">{{ g.v }}</text></g>
              <g v-for="b in fl.bars" :key="b.d">
                <text :x="b.x + b.w / 2" :y="fl.H - 12" text-anchor="middle" font-size="10.5" fill="#c9ced6">{{ DL[b.i] }} {{ b.d.slice(8, 10) }}</text>
                <template v-if="b.sin">
                  <rect :x="b.x" :y="fl.H - fl.B - 14" :width="b.w" height="14" rx="3" fill="none" stroke="#4b5563" stroke-dasharray="3 3" />
                  <text :x="b.x + b.w / 2" :y="fl.H - fl.B - 20" text-anchor="middle" font-size="9.5" fill="#6b7280">sin RDC</text>
                </template>
                <template v-else>
                  <rect v-for="sg in b.segs" :key="sg.k" :x="b.x" :y="sg.y" :width="b.w" :height="sg.h" :fill="FCOL[sg.k]"><title>{{ DL[b.i] }} {{ fechaCorta(b.d) }} · {{ sg.k === 'mod' ? 'Mano de obra directa' : sg.k === 'op' ? 'Operadores / conductores' : 'Supervisión' }}: {{ sg.v }}</title></rect>
                  <text :x="b.x + b.w / 2" :y="b.top - 5" text-anchor="middle" font-size="11" font-weight="700" fill="#f1f3f5">{{ b.tot }}</text>
                </template>
              </g>
            </svg>
            <div class="tiles t3">
              <div class="tile"><span>Promedio diario</span><b>{{ promedio.toFixed(1) }} personas</b></div>
              <div class="tile"><span>HH de la semana</span><b>{{ hhSemana.toLocaleString('es-PE') }} HH</b></div>
              <div class="tile"><span>Días con RDC</span><b>{{ diasRdc.length }} de 7</b></div>
            </div>
          </div>
          <div>
            <table class="t fl" data-sin-filtro>
              <thead><tr><th>Cargo / categoría</th><th v-for="(d, i) in dias" :key="d" class="c">{{ DL[i] }} {{ d.slice(8, 10) }}</th></tr></thead>
              <tbody>
                <tr><td colspan="8" class="sec" style="color: #3b82f6">Mano de obra directa</td></tr>
                <tr v-for="c in catsMod" :key="c"><th scope="row" class="sub2">{{ PLURAL[c] || c }}</th><td v-for="d in dias" :key="d" class="c">{{ porDia.has(d) ? porDia.get(d).mod[c] ?? 0 : '—' }}</td></tr>
                <tr class="tot"><th scope="row">Total mano de obra directa</th><td v-for="d in dias" :key="d" class="c">{{ tMod(d) ?? '—' }}</td></tr>
                <tr><td colspan="8" class="sec" style="color: #f97316">Operadores / conductores</td></tr>
                <tr v-for="v in catsVeh" :key="v"><th scope="row" class="sub2">Conductor {{ v.toLowerCase() }}</th><td v-for="d in dias" :key="d" class="c">{{ porDia.has(d) ? porDia.get(d).veh[v] ?? 0 : '—' }}</td></tr>
                <tr class="tot"><th scope="row">Total operadores / conductores</th><td v-for="d in dias" :key="d" class="c">{{ tOp(d) ?? '—' }}</td></tr>
                <tr><td colspan="8" class="sec" style="color: #eab308">Supervisión (staff)</td></tr>
                <tr><th scope="row" class="sub2">Supervisor de campo</th><td v-for="d in dias" :key="d" class="c">{{ tSup(d) ?? '—' }}</td></tr>
                <tr class="tot"><th scope="row">Total en el frente</th><td v-for="d in dias" :key="d" class="c">{{ tTot(d) ?? '—' }}</td></tr>
              </tbody>
            </table>
            <p class="mu sm">Conductores: uno por vehículo de soporte declarado en el RDC. Los equipos de perforación los operan los operarios de la mano de obra directa.</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.sem { gap: 16px; }
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.seg { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 10px; background: var(--p-card); border: 1px solid var(--p-line); }
.seg button { min-height: 36px; padding: 0 14px; border-radius: 8px; border: 0; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; background: transparent; color: var(--p-muted); }
.seg button.on { background: #f5a800; color: #0d0f10; }
.gh { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border-radius: 10px; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; background: transparent; color: var(--p-text); border: 1px solid var(--p-line); }
.gh:disabled { opacity: 0.5; cursor: default; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 12px; }
.kpi { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 14px 16px; min-width: 0; }
.kpi .l { margin: 0; color: var(--p-muted); font-size: 12.5px; }
.kpi .v { margin: 6px 0 3px; font-size: 25px; font-weight: 700; }
.kpi .s { margin: 0; color: var(--p-muted); font-size: 12px; }
.g2 { display: grid; gap: 16px; align-items: stretch; }
.g2.a { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
.g2.f { grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.35fr); gap: 20px; align-items: start; }
@media (max-width: 1100px) { .g2.a, .g2.f { grid-template-columns: minmax(0, 1fr); } }
.card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.card.col { display: flex; flex-direction: column; }
.card h2 { margin: 0; font-size: 17px; font-weight: 700; }
.sub { margin: 4px 0 12px; color: var(--p-muted); font-size: 12.5px; }
.leg { display: flex; flex-wrap: wrap; gap: 14px; margin: 2px 0 6px; font-size: 12px; color: #c9ced6; }
.leg span { display: inline-flex; align-items: center; gap: 6px; }
.leg i { display: inline-block; width: 14px; height: 10px; border-radius: 2px; }
.svg { display: block; width: 100%; height: auto; }
.tiles { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 4px; }
.tile { flex: 1 1 120px; padding: 10px 12px; border-radius: 10px; background: var(--p-chip); display: flex; flex-direction: column; gap: 2px; }
.tile span { font-size: 11.5px; color: var(--p-muted); }
.tile b { font-size: 22px; font-weight: 800; }
.tile.am { background: rgba(245, 168, 0, 0.12); }
.tile.am span, .tile.am b { color: #f5b93a; }
.t3 { margin-top: 8px; }
.t3 .tile b { font-size: 17px; }
.cau { margin-top: 10px; }
.ch { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; }
.trk { display: block; height: 7px; margin-top: 5px; border-radius: 99px; background: var(--p-line); overflow: hidden; flex: 1 1 auto; }
.trk i { display: block; height: 100%; }
.cap { margin: 14px 0 4px; color: var(--p-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px; }
.tops { list-style: none; margin: 0; padding: 0; }
.tops li { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--p-line); font-size: 12.5px; }
.tops b { color: #f5b93a; white-space: nowrap; }
.ok { margin: auto 0 0; padding: 8px 10px; border-radius: 8px; background: rgba(34, 197, 94, 0.1); color: #86efac; font-size: 12px; }
.card.col .ok { margin-top: 12px; }
.tag { display: inline-flex; font-size: 11.5px; font-weight: 700; border-radius: 6px; padding: 2px 8px; white-space: nowrap; }
.tag.cv { background: rgba(96, 165, 250, 0.18); color: #93c5fd; }
.tag.cl { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.tag.cc { background: rgba(248, 113, 113, 0.18); color: #f87171; }
.tag.ex { background: rgba(192, 132, 252, 0.18); color: #d8b4fe; }
.tag.ot { background: var(--p-chip); color: var(--p-muted); }
.t { width: 100%; border-collapse: collapse; font-size: 13px; }
.t th { text-align: left; padding: 10px; color: var(--p-muted); font-size: 11.5px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; border-bottom: 1px solid var(--p-line); white-space: nowrap; }
.t td, .t tbody th { padding: 9px 10px; border-bottom: 1px solid var(--p-line); text-align: left; font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 13px; color: var(--p-text); }
.t tfoot td { font-weight: 700; }
.t .r { text-align: right; }
.t .c { text-align: center; }
.t.fl .sec { padding: 9px 10px 5px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
.t.fl .sub2 { padding-left: 22px; }
.t.fl .tot th, .t.fl .tot td { font-weight: 700; }
.b { font-weight: 700; }
.am { color: #f5b93a; }
.mu { color: var(--p-muted); }
.sm { font-size: 11.5px; margin: 8px 0 0; }
.nw { white-space: nowrap; }
.pc { display: flex; align-items: center; gap: 8px; min-width: 130px; }
.pc > span:first-child { min-width: 40px; text-align: right; }
.dots { display: inline-flex; gap: 4px; }
.dots span { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; font-size: 10.5px; font-weight: 700; background: var(--p-chip); color: #6b7280; }
.dots .on { background: #f5a800; color: #0d0f10; }
.dots .fut { background: transparent; color: #4b5563; border: 1px dashed #374151; }
.pop { position: relative; display: inline-flex; vertical-align: -2px; margin-left: 6px; cursor: pointer; outline: none; }
.ico { display: inline-flex; width: 15px; height: 15px; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid #6b7280; color: #9ca3af; font-size: 10px; font-weight: 800; }
.ico.warn { border-color: #f59e0b; color: #fbbf24; }
.pb { display: none; position: absolute; left: 0; top: calc(100% + 6px); z-index: 40; width: max-content; max-width: 340px; background: #1b1e22; border: 1px solid #3a3f47; border-radius: 10px; padding: 8px 10px; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5); font-size: 12px; line-height: 1.45; color: #e5e7eb; white-space: normal; }
.pop:hover .pb, .pop:focus .pb { display: block; }
.pop.pr { margin-left: 0; vertical-align: middle; }
.pop.pr .ico { width: 18px; height: 18px; font-size: 11px; }
.pop.pr .pb { left: auto; right: 0; width: 320px; }
.pb ul { margin: 4px 0 0; padding-left: 18px; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.hdr { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 10px; }
.hdr .sub { margin-bottom: 8px; }
.pri:disabled { opacity: 0.55; cursor: default; border: 0; font: inherit; }
.pri { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border-radius: 10px; background: #f5a800; color: #0d0f10; font-weight: 700; font-size: 14px; text-decoration: none; }
.mcb { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #f5a800; background: rgba(245, 168, 0, 0.12); color: #f5b93a; font: inherit; font-weight: 700; font-size: 13.5px; cursor: pointer; }
</style>

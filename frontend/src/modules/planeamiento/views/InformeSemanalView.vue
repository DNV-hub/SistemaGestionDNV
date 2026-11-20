<script setup>
// Planeamiento › Informe semanal · lienzo 6 (aprobado 20/11/2026).
// Arma el informe de plan semanal con lo que el sistema tiene (curva S y
// metrados aprobados, RDC finalizados) y los planes semanales (PTS) que sube
// cada supervisor. El miércoles, si el RDC del día no llegó, el corte sale
// "proyectado" (nunca se valoriza).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  cargarCurva, cargarCronograma, curvaEjecutada, cargarSemanaRdc, minutosStandBy, causaStandBy, semanaDe, fechaCorta, num,
} from '../../frentes/services/controlObraService'
import { cargarFrentesInforme, cargarPts, subirPts, cargarBandejaAgente } from '../services/agenteService'

const route = useRoute()
const router = useRouter()
const iso = (d) => d.toISOString().slice(0, 10)
const addD = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const hoy = iso(new Date(Date.now() - 5 * 3600000))
const ahora = new Date(Date.now() - 5 * 3600000)

// Semanas: las 3 últimas cerradas o en curso. Por defecto, la del último miércoles de corte ya vencido.
const semanas = computed(() => {
  const act = semanaDe(hoy)
  const out = []
  for (let i = 3; i >= 0; i--) out.push(semanaDe(addD(act.desde, -7 * i)))
  return out
})
const porDefecto = computed(() => { const ult = [...semanas.value].reverse().find((s) => s.hasta <= hoy); return (ult || semanas.value[semanas.value.length - 1]).clave })
const sel = ref(route.query.semana || '')
const semana = computed(() => semanas.value.find((s) => s.clave === sel.value) || semanas.value.find((s) => s.clave === porDefecto.value))
const siguiente = computed(() => semanaDe(addD(semana.value.hasta, 1)))
watch(sel, (v) => router.replace({ query: { ...route.query, semana: v } }))

const cargando = ref(true)
const frentes = ref([])
const pts = ref([])
const datos = ref({}) // por frente: { curva, crono, rdc }
const alertas = ref([])
const msg = ref('')
const err = ref('')

async function cargar() {
  cargando.value = true; err.value = ''
  try {
    const s = semana.value
    const [fr, p, ag] = await Promise.all([
      cargarFrentesInforme(s.desde, s.hasta),
      cargarPts([s.clave, siguiente.value.clave]),
      cargarBandejaAgente().catch(() => ({ hallazgos: [] })),
    ])
    frentes.value = fr; pts.value = p
    alertas.value = ag.hallazgos.filter((h) => h.categoria === 'informe')
    const d = {}
    await Promise.all(fr.map(async (f) => {
      const [c, cr, r] = await Promise.all([
        f.conCurva ? cargarCurva(f.id).catch(() => null) : null,
        f.conCurva ? cargarCronograma(f.id).catch(() => null) : null,
        cargarSemanaRdc(f.id, addD(s.desde, -7), s.hasta).catch(() => []),
      ])
      d[f.id] = { curva: c, crono: cr, rdc: r }
    }))
    datos.value = d
  } catch (e) { console.error(e); err.value = 'No se pudo cargar el informe.' } finally { cargando.value = false }
}
onMounted(cargar)
watch(() => semana.value?.clave, (a, b) => { if (b && a !== b) cargar() })

// ---------- PTS ----------
const ptsDe = (fid, clave) => pts.value.find((p) => p.frente_id === fid && p.semana === clave) || null
const plazo = computed(() => new Date(`${addD(siguiente.value.desde, -1)}T12:00:00`)) // miércoles 12:00 antes de la semana que planifica
const vencido = computed(() => ahora > plazo.value)
const subiendo = ref('')
async function subir(f, ev) {
  const archivo = ev.target.files?.[0]
  ev.target.value = ''
  if (!archivo) return
  subiendo.value = f.id; msg.value = ''; err.value = ''
  try {
    const r = await subirPts(f.id, siguiente.value, archivo, semanaDe)
    msg.value = `PTS de ${f.nombre} (${r.semana}) ${r.estado}${r.observaciones.length ? ': ' + r.observaciones.join(' ') : '.'}`
    pts.value = await cargarPts([semana.value.clave, siguiente.value.clave])
  } catch (e) { console.error(e); err.value = e?.message || 'No se pudo subir el PTS.' } finally { subiendo.value = '' }
}

// ---------- Tabla 01 con proyectado del miércoles ----------
function resumenFrente(f) {
  const d = datos.value[f.id]
  const s = semana.value
  if (!d?.curva?.puntos?.length || !d.crono) return { f, sinCurva: true }
  const ej = curvaEjecutada(d.curva.puntos, d.crono.partidas, d.crono.avance, d.crono.revs)
  const pts0 = ej.puntos
  const at = (fe, campo) => { const p = [...pts0].reverse().find((x) => x.fecha <= fe && x[campo] != null); return p ? { v: Number(p[campo]), fecha: p.fecha } : null }
  const prev = at(s.hasta, 'programado_pct')
  const real = at(s.hasta, 'ejecutado_pct')
  let proy = null
  if (real && real.fecha < s.hasta) {
    // Rendimiento real de los últimos 5 días con avance aprobado.
    const hace5 = at(addD(real.fecha, -5), 'ejecutado_pct')
    const ritmo = hace5 ? Math.max(0, (real.v - hace5.v) / Math.max(1, Math.round((new Date(real.fecha) - new Date(hace5.fecha)) / 86400000))) : 0
    const faltan = Math.round((new Date(s.hasta) - new Date(real.fecha)) / 86400000)
    // Días programados en el PTS de la semana para los días que faltan (si hay PTS).
    const p = ptsDe(f.id, s.clave)
    let factor = 1
    if (p && p.estado !== 'rechazado') {
      const idx = [...Array(faltan)].map((_, k) => Math.round((new Date(addD(real.fecha, k + 1)) - new Date(s.desde)) / 86400000))
      const prog = idx.filter((i) => p.actividades.some((a) => a.dias.includes(i))).length
      factor = faltan ? prog / faltan : 1
    }
    // Stand By típico: horas por día de los últimos 7 RDC sobre jornada de 9 h.
    const sbMin = d.rdc.reduce((a, r) => a + (r.rdc_reporte_standby ?? []).filter((x) => causaStandBy(x).k !== 'ot').reduce((b, x) => b + minutosStandBy(x), 0), 0)
    const sbFrac = d.rdc.length ? Math.min(0.9, sbMin / 60 / (9 * d.rdc.length)) : 0
    proy = Math.min(100, real.v + ritmo * faltan * factor * (1 - sbFrac))
  }
  const base = proy ?? real?.v ?? null
  const dv = base != null && prev ? base - prev.v : null
  const tolI = Number(d.curva.param?.tol_inf ?? -3), tolS = Number(d.curva.param?.tol_sup ?? 6)
  const est = dv == null ? null : dv < tolI ? 'Atrasado' : dv > tolS ? 'Adelantado fuera de banda' : dv < 0 ? 'Ligeramente atrasado' : 'En plazo'
  // Borrador del texto de la figura: partidas con avance aprobado en la semana + Stand By.
  const P = new Map(d.crono.partidas.map((x) => [x.edt, x]))
  const m = new Map()
  for (const a of d.crono.avance) if (a.fecha >= s.desde && a.fecha <= s.hasta) m.set(a.edt, (m.get(a.edt) || 0) + a.cantidad)
  const top = [...m.entries()].filter(([, q]) => q > 0).sort((a, b) => (Number(P.get(b[0])?.hh || 0) / Number(P.get(b[0])?.metrado || 1)) * b[1] - (Number(P.get(a[0])?.hh || 0) / Number(P.get(a[0])?.metrado || 1)) * a[1]).slice(0, 4)
  const sbSem = d.rdc.filter((r) => r.fecha >= s.desde && r.fecha <= s.hasta).reduce((a, r) => a + (r.rdc_reporte_standby ?? []).filter((x) => causaStandBy(x).k !== 'ot').reduce((b, x) => b + minutosStandBy(x), 0), 0)
  const causas = [...new Set(d.rdc.filter((r) => r.fecha >= s.desde && r.fecha <= s.hasta).flatMap((r) => (r.rdc_reporte_standby ?? []).map((x) => causaStandBy(x)).filter((c) => c.k !== 'ot').map((c) => c.t.toLowerCase())))]
  const texto = top.length
    ? `Durante la semana se ejecutó ${top.map(([edt, q]) => `${(P.get(edt)?.nombre || edt).toLowerCase()} (${num(q)} ${(P.get(edt)?.unidad || '').toLowerCase()})`).join(', ')}.${sbSem ? ` Se registraron ${Math.floor(sbSem / 60)} h ${sbSem % 60} min de stand-by por ${causas.join(', ')}.` : ''}`
    : 'Sin metrados aprobados en la semana.'
  return { f, prev, real, proy, dv, est, texto, tolI, tolS }
}
const tabla01 = computed(() => frentes.value.map(resumenFrente))
const pill = (r) => (r.sinCurva ? 'mu' : r.dv == null ? 'mu' : r.dv < r.tolI || r.dv > r.tolS ? 'da' : r.dv < 0 ? 'wa' : 'ok')
const pct = (x) => (x == null ? '—' : `${x.toFixed(1)}%`)
const sg = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`)

// ---------- secciones de la plantilla ----------
const nCurva = computed(() => frentes.value.filter((f) => f.conCurva).length)
const nPts = computed(() => frentes.value.filter((f) => ptsDe(f.id, semana.value.clave) && ptsDe(f.id, semana.value.clave).estado !== 'rechazado').length)
const nPtsSig = computed(() => frentes.value.filter((f) => ptsDe(f.id, siguiente.value.clave) && ptsDe(f.id, siguiente.value.clave).estado !== 'rechazado').length)
const N = computed(() => frentes.value.length)
const est = (a, b) => (a >= b && b ? ['Listo', 'ok'] : a ? [`${a} de ${b}`, 'wa'] : [`0 de ${b}`, 'da'])
const secciones = computed(() => [
  ['—', 'Encabezado y portada', 'Contrato, semana, fecha de corte, paginación', 'Automático', ['Listo', 'ok']],
  ['1', 'Resumen ejecutivo · Tabla 01', 'Frente, corte, previsto acum., real acum., desviación y estado', 'Curva S de cada frente (avance aprobado) · miércoles: proyectado si el RDC no llegó', est(nCurva.value, N.value).map((x, i) => (i === 0 && x !== 'Listo' ? `${x} frentes` : x))],
  ['2', 'Curvas S por frente · Figuras', 'Gráfico, nota "Real vs Previsto" y texto de la semana', 'Curva S del sistema · nota armada desde la Tabla 01 (no se puede invertir) · texto en borrador que corriges', est(nCurva.value, N.value).map((x, i) => (i === 0 && x !== 'Listo' ? `${x} frentes` : x))],
  ['3', 'Metrados de avance · Tablas por frente', 'Sección / sub-frente, programado y % ejecutado', 'Partidas del cronograma + avance aprobado', est(nCurva.value, N.value).map((x, i) => (i === 0 && x !== 'Listo' ? `${x} frentes` : x))],
  ['4', 'Cumplimiento semanal PPC', 'Actividades programadas vs cumplidas por frente y PPC general', 'PTS de la semana × actividades programadas del RDC de cada día', est(nPts.value, N.value).map((x, i) => (i === 0 && x !== 'Listo' ? `${x} PTS` : x))],
  ['5', 'Programación semanal y partidas críticas', 'Actividades principales por frente y día', `PTS de la ${siguiente.value.clave}`, nPtsSig.value ? est(nPtsSig.value, N.value).map((x, i) => (i === 0 && x !== 'Listo' ? `${x} PTS` : x)) : [`Falta PTS ${siguiente.value.clave}`, 'da']],
  ['6', 'Stand-by por causas ajenas a DESNIVEL · tabla', 'N°, frente, fecha, actividad afectada, causa, horario, total hh:mm', 'RDC finalizados de todos los frentes · título y numeración automáticos', ['Listo', 'ok']],
  ['6.1', 'Restricciones (PTS)', 'Frente, actividades, restricción, responsable', 'PTS + restricciones del RDC · las de DESNIVEL se anulan', est(nPts.value, N.value).map((x, i) => (i === 0 && x !== 'Listo' ? `${x} PTS` : x))],
  ['7', 'Fuerza laboral proyectada · tabla y gráfico', 'Por día: mano de obra directa, operadores y staff', 'Hoja Fuerza Laboral del PTS · si sus fechas no son de la semana, lo real del RDC', ['Parcial', 'wa']],
  ['8', 'Cuadrilla por frente · tabla', 'Capataz, operario, oficial, peón y vigía por frente', 'Personal del RDC del último día', ['Listo', 'ok']],
  ['9', 'Riesgos identificados', 'Un párrafo por frente', 'Lo escribes tú; el agente sugiere desviaciones fuera de banda, Stand By alto y redlines pendientes', ['Manual', 'in']],
])
const listas = computed(() => secciones.value.filter((x) => x[4][0] === 'Listo').length)
const alertasAbiertas = computed(() => alertas.value.filter((a) => a.estado === 'abierto'))
</script>

<template>
  <div class="pl-col inf">
    <div class="top">
      <p class="mu">Informe de plan semanal {{ semana.clave }} · {{ fechaCorta(semana.desde) }} al {{ fechaCorta(semana.hasta) }}/{{ semana.hasta.slice(0, 4) }} · plantilla <b>Informe_plan_semanal_PLANTILLA_v2.docx</b> · corte miércoles {{ fechaCorta(semana.hasta) }}</p>
      <div class="acts">
        <div class="seg" role="group" aria-label="Semana">
          <button v-for="s in semanas" :key="s.clave" type="button" :class="{ on: s.clave === semana.clave }" :aria-pressed="s.clave === semana.clave" @click="sel = s.clave">{{ s.clave }} · {{ s.desde.slice(8, 10) }}.{{ s.desde.slice(5, 7) }}–{{ s.hasta.slice(8, 10) }}.{{ s.hasta.slice(5, 7) }}</button>
        </div>
        <button type="button" class="gh" disabled title="Se habilita con el generador del Word (plantilla v2)">Exportar PDF</button>
        <button type="button" class="pri" disabled title="Se habilita con el generador del Word (plantilla v2)">Exportar Word</button>
      </div>
    </div>
    <p v-if="msg" class="okm">{{ msg }}</p>
    <p v-if="err" class="erm">{{ err }}</p>
    <p v-if="cargando" class="pl-empty">Cargando…</p>
    <template v-else>
      <div class="kpis">
        <div class="kpi"><p class="l">Secciones listas</p><p class="v am">{{ listas }} de {{ secciones.length }}</p><p class="s">el resto queda parcial o pide un dato</p></div>
        <div class="kpi"><p class="l">Frentes con curva en el sistema</p><p class="v" :class="nCurva < N ? 'ro' : ''">{{ nCurva }} de {{ N }}</p><p class="s">{{ frentes.filter((f) => !f.conCurva).map((f) => f.nombre).join(', ') || 'todos' }}<template v-if="nCurva < N"> sin curva</template></p></div>
        <div class="kpi"><p class="l">Planes semanales (PTS) {{ semana.clave }}</p><p class="v" :class="nPts < N ? 'am' : ''">{{ nPts }} de {{ N }}</p><p class="s">{{ siguiente.clave }}: {{ nPtsSig }} de {{ N }} · plazo miércoles 12:00</p></div>
        <div class="kpi"><p class="l">Alertas de consistencia</p><p class="v" :class="alertasAbiertas.length ? 'ro' : ''">{{ alertasAbiertas.length }}</p><p class="s">{{ alertasAbiertas.filter((a) => a.nivel === 'ALTA').length }} críticas · {{ alertas.length - alertasAbiertas.length }} resueltas</p></div>
      </div>

      <div class="g2">
        <section class="card fx">
          <h2>Planes semanales de la supervisión (PTS)</h2>
          <p class="sub">Cada supervisor manda su Excel PLAN DE TRABAJO martes o miércoles; plazo miércoles 12:00 · se lee al subirlo</p>
          <ul class="ptsl">
            <li v-for="f in frentes" :key="f.id" :class="{ falta: !ptsDe(f.id, siguiente.clave) && vencido }">
              <b>{{ f.nombre }}</b>
              <span class="pi">
                <span class="row">
                  <template v-for="cl in [semana.clave, siguiente.clave]" :key="cl">
                    <span v-if="ptsDe(f.id, cl)" class="pill" :class="{ recibido: 'ok', observado: 'wa', rechazado: 'da' }[ptsDe(f.id, cl).estado]">{{ cl }} {{ ptsDe(f.id, cl).estado }}</span>
                    <span v-else class="pill" :class="cl === siguiente.clave && vencido ? 'da' : 'mu'">{{ cl }}: por subir</span>
                  </template>
                </span>
                <template v-for="cl in [semana.clave, siguiente.clave]" :key="'o' + cl">
                  <span v-for="o in ptsDe(f.id, cl)?.observaciones ?? []" :key="o" class="ob">⚠ {{ cl }} · {{ o }}</span>
                </template>
              </span>
              <label class="up" :class="{ dis: subiendo === f.id }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21V9M7 14l5-5 5 5M5 3h14" /></svg>
                {{ subiendo === f.id ? 'Leyendo…' : `Subir PTS ${siguiente.clave}` }}
                <input type="file" accept=".xlsx,.xlsm,.xls" :disabled="subiendo === f.id" @change="subir(f, $event)" />
              </label>
            </li>
          </ul>
          <p class="info">Del Excel <b>PLAN DE TRABAJO</b> el sistema lee: actividades programadas por día (barras de color de la hoja Formato Supervisor), restricción y responsable, y la fuerza laboral proyectada. Si las fechas no son de una semana jueves–miércoles, se rechaza. Las restricciones con responsable DESNIVEL se anulan: solo cuentan clima, cliente y terceros. Si un supervisor no lo sube, se usa lo real de su RDC y se marca en el informe.</p>
          <p class="info2"><b>Plazo miércoles 12:00.</b> Pasada esa hora, quien no subió su PTS de la {{ siguiente.clave }} queda marcado en rojo en esta lista.</p>
        </section>

        <section class="card fx">
          <h2>Vista previa · Tabla 01 Resumen ejecutivo</h2>
          <p class="sub">Así sale en el Word · corte miércoles {{ fechaCorta(semana.hasta) }}</p>
          <table class="t" data-sin-filtro>
            <thead><tr><th>Frente</th><th>Corte</th><th class="r">Previsto acum.</th><th class="r">Real acum.</th><th class="r">Desviación</th><th>Estado</th></tr></thead>
            <tbody>
              <tr v-for="r in tabla01" :key="r.f.id">
                <td class="b">{{ r.f.nombre }}</td>
                <td>{{ fechaCorta(semana.hasta) }}/{{ semana.hasta.slice(0, 4) }}</td>
                <td class="r">{{ r.sinCurva ? '—' : pct(r.prev?.v) }}</td>
                <td class="r">{{ r.sinCurva ? '—' : `${pct(r.real?.v)}${r.real && r.real.fecha < semana.hasta ? ' al ' + fechaCorta(r.real.fecha) : ''}` }}<span v-if="r.proy != null" class="pr">≈{{ r.proy.toFixed(1) }}% proyectado</span></td>
                <td class="r b" :class="'c-' + pill(r)">{{ r.sinCurva ? '—' : sg(r.dv) }}</td>
                <td><span class="pill" :class="pill(r)">{{ r.sinCurva ? 'Cargar curva en el sistema' : r.est + (r.proy != null ? ' · proyectado' : '') }}</span></td>
              </tr>
            </tbody>
          </table>
          <div class="proy"><b>Proyectado del miércoles (antes de las 7 p. m.):</b> si el RDC del miércoles no llegó, el corte usa lo aprobado hasta el último día más lo proyectado: los días programados en el PTS × el rendimiento real de los últimos 5 días − el Stand By típico del frente. Sale marcado como <b>proyectado</b>; cuando llega el RDC, se reemplaza por lo real. Nunca entra a la valorización.</div>
          <div v-for="r in tabla01.filter((x) => !x.sinCurva)" :key="'b' + r.f.id" class="bor">
            <p class="cap">Borrador · Frente {{ r.f.nombre }} (texto de la figura)</p>
            {{ r.texto }}
            <p class="nota">Nota: Curva S {{ r.f.nombre }} — Real {{ pct(r.proy ?? r.real?.v) }} vs. Previsto {{ pct(r.prev?.v) }} (corte {{ fechaCorta(semana.hasta) }}/{{ semana.hasta.slice(0, 4) }}{{ r.proy != null ? ', proyectado' : '' }}, {{ (r.est || '').toLowerCase() }} {{ sg(r.dv) }}).</p>
            <p class="ed">Lo arma el sistema con los metrados aprobados y el Stand By de la semana; tú lo corriges antes de exportar.</p>
          </div>
        </section>
      </div>

      <section class="card">
        <h2>Qué se rellena en la plantilla</h2>
        <p class="sub">Sección por sección: de dónde sale el dato y si ya lo tenemos</p>
        <table class="t" data-sin-filtro>
          <thead><tr><th>N°</th><th>Sección de la plantilla</th><th>Qué lleva</th><th>Fuente en el sistema</th><th>Estado</th></tr></thead>
          <tbody>
            <tr v-for="x in secciones" :key="x[0] + x[1]"><td class="mu nw">{{ x[0] }}</td><td class="b">{{ x[1] }}</td><td>{{ x[2] }}</td><td class="mu2">{{ x[3] }}</td><td class="nw"><span class="pill" :class="x[4][1]">{{ x[4][0] }}</span></td></tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Lo que no cuadra en los informes enviados y la plantilla</h2>
        <p class="sub">Revisión forense del agente · el sistema evita estos errores al generar el Word</p>
        <ul class="al">
          <li v-for="a in alertas" :key="a.id" :class="a.estado === 'resuelto' ? 'ok' : a.nivel === 'ALTA' ? 'da' : 'wa'">
            <span class="ic">{{ a.estado === 'resuelto' ? '✓' : '!' }}</span>
            <span><b>{{ a.titulo }}.</b> {{ a.detalle }}<template v-if="a.estado === 'resuelto' && a.accion"> <em>{{ a.accion }}</em></template></span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.inf { gap: 16px; }
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.top p { margin: 0; font-size: 13px; }
.top b { color: #d6dae0; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: var(--p-card); border: 1px solid var(--p-line); }
.seg button { min-height: 36px; padding: 0 14px; border-radius: 8px; border: 0; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; background: transparent; color: #c9ced6; }
.seg button.on { background: #f5a800; color: #0d0f10; }
.gh, .pri { min-height: 40px; padding: 0 16px; border-radius: 10px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.gh { background: transparent; color: var(--p-text); border: 1px solid #3a3f47; }
.pri { background: #f5a800; color: #0d0f10; border: 0; }
.gh:disabled, .pri:disabled { opacity: 0.5; cursor: default; }
.kpis { display: flex; flex-wrap: wrap; gap: 12px; }
.kpi { flex: 1 1 180px; padding: 14px 16px; border-radius: 12px; background: var(--p-card); border: 1px solid var(--p-line); }
.kpi .l { margin: 0; color: var(--p-muted); font-size: 12.5px; }
.kpi .v { margin: 6px 0 3px; font-size: 25px; font-weight: 700; }
.kpi .s { margin: 0; color: var(--p-muted); font-size: 12px; }
.am { color: #f5b93a; }
.ro { color: #fca5a5; }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 16px; align-items: stretch; }
@media (max-width: 1100px) { .g2 { grid-template-columns: minmax(0, 1fr); } }
.card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.card.fx { display: flex; flex-direction: column; }
.card h2 { margin: 0; font-size: 17px; font-weight: 700; }
.sub { margin: 4px 0 12px; color: var(--p-muted); font-size: 12.5px; }
.ptsl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ptsl li { display: grid; grid-template-columns: 130px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 10px; background: var(--p-chip); border: 1px solid var(--p-line); }
.ptsl li.falta { border-color: rgba(239, 68, 68, 0.5); }
.ptsl b { font-size: 14px; }
.pi { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
.ob { font-size: 12px; color: #fbbf24; line-height: 1.4; }
.up { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid #3a3f47; color: #f1f3f5; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.up.dis { opacity: 0.6; }
.pill { display: inline-flex; padding: 2px 9px; border-radius: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.pill.ok { background: rgba(34, 197, 94, 0.16); color: #4ade80; }
.pill.wa { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
.pill.da { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
.pill.mu { background: #2a2d33; color: #9ca3af; }
.pill.in { background: rgba(96, 165, 250, 0.16); color: #93c5fd; }
.c-ok { color: #4ade80; } .c-wa { color: #fbbf24; } .c-da { color: #fca5a5; } .c-mu { color: #9ca3af; }
.info { margin: 12px 0 0; padding: 10px 12px; border-radius: 8px; background: rgba(96, 165, 250, 0.1); color: #c9d8f5; font-size: 12.5px; line-height: 1.5; }
.info2 { margin: 10px 0 0; padding: 10px 12px; border-radius: 8px; background: var(--p-chip); color: #d6dae0; font-size: 12.5px; line-height: 1.5; }
.t { width: 100%; border-collapse: collapse; }
.t th { text-align: left; padding: 9px 10px; font-size: 11.5px; font-weight: 700; color: var(--p-muted); text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid var(--p-line); }
.t td { padding: 10px; border-bottom: 1px solid var(--p-line); vertical-align: top; font-size: 13px; line-height: 1.45; }
.r { text-align: right; }
.b { font-weight: 700; }
.nw { white-space: nowrap; }
.mu { color: var(--p-muted); }
.mu2 { color: #c9ced6; }
.pr { display: block; color: #fbbf24; font-size: 12px; }
.proy { margin-top: 12px; padding: 12px; border-radius: 10px; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.4); font-size: 12.5px; line-height: 1.5; color: #fde68a; }
.bor { margin-top: 12px; padding: 12px; border-radius: 10px; background: var(--p-chip); font-size: 12.5px; line-height: 1.55; color: #d6dae0; }
.cap { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--p-muted); text-transform: uppercase; letter-spacing: 0.4px; }
.nota { margin: 8px 0 0; color: var(--p-muted); }
.ed { margin: 6px 0 0; color: #fbbf24; font-size: 12px; }
.al { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.al li { display: flex; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; line-height: 1.45; color: #d6dae0; }
.al li b { color: #f1f3f5; }
.al li.da { background: rgba(239, 68, 68, 0.16); }
.al li.wa { background: rgba(245, 158, 11, 0.16); }
.al li.ok { background: rgba(34, 197, 94, 0.1); }
.al em { color: #86efac; font-style: normal; }
.ic { flex: none; width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; border: 1.5px solid currentColor; }
.al li.da .ic { color: #fca5a5; } .al li.wa .ic { color: #fbbf24; } .al li.ok .ic { color: #4ade80; }
.okm { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(34, 197, 94, 0.1); color: #86efac; font-size: 13px; }
.erm { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(248, 113, 113, 0.1); color: #fca5a5; font-size: 13px; }
</style>

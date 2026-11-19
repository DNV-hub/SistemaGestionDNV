<script setup>
// PRUEBA · Conciliación de materiales (lienzo versión 5): salido de almacén
// vs instalado (RDC aprobado) vs devuelto, por sector. Solo lectura.
// 1 · Alcance previsto contra instalado  2 · Balance por material  3 · Tabla.
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../../../services/supabaseClient'
import { descargarExcel } from '../../../utils/exportarExcel'

const props = defineProps({
  frenteId: { type: String, required: true },
  nombreFrente: { type: String, default: '' },
})

const cargando = ref(false)
const error = ref('')
const sectores = ref([])
const filas = ref([])
const vales = ref(null)
const elementos = ref([])
const avance = ref([])
const vigente = ref([])
const plano = ref([])
const sector = ref('todo')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const id = props.frenteId
    const [s, c, v, el, av, mv, pe] = await Promise.all([
      supabase.from('ctl_sectores').select('codigo, nombre, tipo, orden').eq('frente_id', id).order('orden'),
      supabase.from('ctl_conciliacion_material').select('*').eq('frente_id', id),
      supabase.from('ctl_vales_destino').select('*').eq('frente_id', id).maybeSingle(),
      supabase.rpc('ctl_avance_elementos', { p_frente_id: id }),
      supabase.rpc('ctl_avance_aprobado', { p_frente_id: id }),
      supabase.from('ctl_metrado_vigente').select('*').eq('frente_id', id),
      supabase.from('ctl_plano_elemento').select('codigo, codigo_rdc, sector_codigo, descripcion, tipo').eq('frente_id', id).eq('tipo', 'perno'),
    ])
    if (c.error) throw c.error
    sectores.value = s.data ?? []
    filas.value = c.data ?? []
    vales.value = v.data ?? null
    elementos.value = el.data ?? []
    avance.value = av.data ?? []
    vigente.value = mv.data ?? []
    plano.value = pe.data ?? []
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo cargar la conciliación.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)
watch(() => props.frenteId, cargar)

const opciones = computed(() => [{ codigo: 'todo', nombre: 'Todo el frente' }, ...sectores.value])
const secLabel = computed(() => opciones.value.find((o) => o.codigo === sector.value)?.nombre ?? '')

// ---- conversión de unidades de almacén (rollos) a unidad de obra ----
function factor(desc, unidad) {
  const u = (unidad || '').toUpperCase()
  if (u !== 'RLL' && u !== 'ROLLO') return 1
  const m = (desc || '').toUpperCase().replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) * Number(m[2]) : 1
}

// ---- reglas: qué material corresponde a qué instalado y previsto ----
const nz = (c) => (c ?? '').trim().toUpperCase()
const pernoCods = (re) => plano.value.filter((p) => re.test(p.descripcion || '')).map((p) => ({ c: nz(p.codigo_rdc || p.codigo), s: p.sector_codigo }))
const pernosEjecutados = (lista) => {
  const hechos = new Set(elementos.value.filter((e) => e.elemento === 'Perno' && (e.actividad === 'Perforación' || e.actividad === 'Inyección')).map((e) => e.codigo_norm))
  return lista.filter((p) => hechos.has(p.c))
}
// eslint-disable-next-line no-unused-vars
const mallaTipo = (t) => elementos.value.filter((e) => e.elemento === 'Malla' && (e.tipo || '').toLowerCase().includes(t)).reduce((a, e) => a + (Number(e.area_m2) || Number(e.cantidad) || 0), 0)
const acumPartida = (edt) => avance.value.filter((a) => a.edt === edt).reduce((s, a) => s + Number(a.cantidad), 0)
const vig = (re) => vigente.value.filter((v) => re.test(v.descripcion || ''))
const sumVig = (re) => vig(re).reduce((a, v) => a + Number(v.cantidad_vigente || 0), 0)
const fuenteVig = (re) => [...new Set(vig(re).map((v) => v.plano_origen?.split(' (')[0]))].filter(Boolean).join(' · ')

const REGLAS = [
  { k: 'm804', t: 'Malla MINAX 80/4', match: /MINAX\s*80\/4/i, u: 'm²', sec: ['P1'], inst: () => acumPartida('2.03'), fteInst: 'aprobado (partida 2.03)', prev: () => sumVig(/MINAX\s*80\/4/i), fte: () => fuenteVig(/MINAX\s*80\/4/i), partida: '2.03', principal: true },
  { k: 'm803', t: 'Malla MINAX 80/3', match: /MINAX\s*80\/3/i, u: 'm²', sec: ['P2'], inst: () => acumPartida('2.04'), fteInst: 'aprobado (partida 2.04)', prev: () => sumVig(/MINAX\s*80\/3/i), fte: () => fuenteVig(/MINAX\s*80\/3/i), partida: '2.04', principal: true },
  { k: 'geo', t: 'Geotextil no tejido', match: /GEOTEXTIL/i, u: 'm²', sec: ['P1'], inst: () => acumPartida('3.03'), fteInst: 'aprobado (partida 3.03)', prev: () => sumVig(/geotextil/i), fte: () => fuenteVig(/geotextil/i), partida: '3.03', principal: true },
  { k: 'd25l2', t: 'Barra helicoidal D25 L=2 m', match: /D25\s*MM\s*L=0?2\s*M/i, u: 'und', sec: ['P1', 'P2'], inst: () => pernosEjecutados(pernoCods(/D25 L2/)).length, fteInst: 'perforados según RDC', prev: () => pernoCods(/D25 L2/).length, fte: () => 'Plano (códigos D25 L2.0)', principal: true },
  { k: 'd32l5', t: 'Barra helicoidal D32 L=5 m', match: /D32\s*MM\s*L=0?5\s*M/i, u: 'und', sec: ['P1'], inst: () => pernosEjecutados(pernoCods(/D32 L5/)).length, fteInst: 'perforados según RDC', prev: () => pernoCods(/D32 L5/).length, fte: () => 'Plano (códigos D32 L5.0)' },
  { k: 'd25l3', t: 'Barra helicoidal D25 L=3 m', match: /D25\s*MM\s*L=0?3\s*M/i, u: 'und', sec: [], inst: () => 0, prev: () => 0, fte: () => 'No figura en el plano' },
  { k: 'd32l3', t: 'Barra helicoidal D32 L=3 m', match: /D32\s*MM\s*L=0?3\s*M/i, u: 'und', sec: [], inst: () => 0, prev: () => 0, fte: () => 'No figura en el plano' },
  { k: 'c6', t: 'Cable Ø6 mm (línea de vida)', match: /CABLE.*D=0?6\s*MM/i, u: 'ml', sec: [], aux: true, inst: () => 0, prev: () => 0, fte: () => 'Facilidades (no valoriza)' },
]

const grupos = computed(() => REGLAS.map((r) => {
  const mats = filas.value.filter((f) => r.match.test(f.descripcion || ''))
  if (!mats.length) return null
  const conv = (f, campo) => Number(f[campo] || 0) * factor(f.descripcion, f.unidad)
  const sum = (campo) => mats.reduce((a, f) => a + conv(f, campo), 0)
  const salida = sum('salida'), te = sum('transf_entrada'), ts = sum('transf_salida'), dev = sum('devuelto_recibido'), porRec = sum('devolucion_por_recibir')
  const neto = salida + te - ts - dev
  const inst = r.inst()
  const aux = r.aux ? neto : sum('declarado_facilidades')
  const acopio = neto - inst - (r.aux ? 0 : aux)
  const prev = r.prev()
  return { ...r, mats, salida, transf: te - ts, dev, porRec, neto, inst, aux: r.aux ? neto : aux, acopio: r.aux ? 0 : acopio, prev, fuente: r.fte() }
}).filter(Boolean))

const visibles = computed(() => grupos.value.filter((g) => sector.value === 'todo' || g.sec.includes(sector.value)))
const tarjetas = computed(() => visibles.value.filter((g) => g.principal || g.prev))

function estadoTarjeta(g) {
  const pct = g.prev ? (g.inst / g.prev) * 100 : 0
  if (g.prev && g.inst > g.prev * 1.0005) return { t: 'Mayor metrado', k: 'mal', pct, txt: `Excede el plano en ${f2(g.inst - g.prev)} ${g.u}: requiere redline BBA para valorizar.` }
  if (pct >= 97) return { t: 'Terminado', k: 'ok', pct, txt: `${f2(g.inst)} ${g.u} instalados según RDC.` }
  if (g.inst > 0) return { t: 'En curso', k: 'warn', pct, txt: `Faltan ${f2(Math.max(0, g.prev - g.inst))} ${g.u} por instalar.` }
  return { t: 'Por iniciar', k: 'neu', pct, txt: 'Sin instalado aprobado.' }
}
function estadoBalance(g) {
  if (g.aux && !g.inst) return { t: g.neto ? `Uso auxiliar ${f2(g.neto)} ${g.u}` : 'Cuadra', k: 'pu' }
  if (g.acopio < -0.01) return { t: `Falta ${f2(-g.acopio)} ${g.u}`, k: 'mal' }
  if (g.acopio > 0.01) return { t: g.porRec ? `En acopio ${f2(g.acopio)} ${g.u} · devolución por recibir ${f2(g.porRec)}` : `En acopio ${f2(g.acopio)} ${g.u}`, k: 'am' }
  return { t: 'Cuadra', k: 'ok' }
}
const barra = (g) => {
  const tot = Math.max(g.neto, g.inst + (g.aux && !g.inst ? 0 : 0), 0.0001)
  const i = Math.min(100, (g.inst / tot) * 100)
  const a = g.aux ? Math.min(100 - i, (g.aux / tot) * 100) : 0
  const ac = Math.max(0, 100 - i - a)
  return { i, a, ac }
}

const alertaTexto = computed(() => {
  const faltan = visibles.value.filter((g) => g.acopio < -0.01)
  const mayores = visibles.value.filter((g) => g.prev && g.inst > g.prev * 1.0005)
  const acopio = visibles.value.filter((g) => g.acopio > 0.01)
  const partes = []
  if (mayores.length) partes.push(`${mayores.map((g) => g.t).join(', ')} con mayor metrado sobre el plano: no valorizar el exceso sin redline firmado por BBA.`)
  if (faltan.length) partes.push(`${faltan.map((g) => `${g.t}: lo instalado supera lo neto en ${f2(-g.acopio)} ${g.u}`).join('; ')} — revisar vales o metrados.`)
  if (acopio.length) partes.push(`Con acopio por devolver: ${acopio.map((g) => `${g.t} ${f2(g.acopio)} ${g.u}`).join(', ')}.`)
  return partes
})

const f2 = (x) => (Number(x) || 0).toLocaleString('es-PE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const n = (x) => { const v = Number(x) || 0; return Math.abs(v) < 0.005 ? '—' : v.toLocaleString('es-PE', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) }

function exportar() {
  descargarExcel(`conciliacion_${props.nombreFrente || 'frente'}.xlsx`, [{
    nombre: 'Conciliación',
    filas: visibles.value.map((g) => ({
      Material: g.t, Unidad: g.u, 'Salió de almacén': g.salida, 'Transf. ±': g.transf, 'Devuelto (recibido)': g.dev,
      'Neto en frente': g.neto, 'Instalado (RDC aprobado)': g.inst, 'Uso auxiliar': g.aux, 'Acopio teórico': g.acopio,
      'Devolución por recibir': g.porRec, Previsto: g.prev, Fuente: g.fuente, Estado: estadoBalance(g).t,
    })),
  }])
}
</script>

<template>
  <section class="v5-card">
    <div class="top">
      <h2>Conciliación de materiales: salido de almacén vs instalado y devuelto · {{ secLabel }}</h2>
      <div class="acc">
        <div class="seg" role="group" aria-label="Sector">
          <button v-for="o in opciones" :key="o.codigo" type="button" :class="{ on: sector === o.codigo }" :aria-pressed="sector === o.codigo" @click="sector = o.codigo">{{ o.nombre }}</button>
        </div>
        <button type="button" class="gh" :disabled="!visibles.length" @click="exportar">Exportar Excel</button>
      </div>
    </div>

    <p v-if="cargando" class="mu">Cargando…</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <template v-else>
      <div v-if="alertaTexto.length || (vales && vales.sin_destino)" class="alerta">
        <b>Conciliación con observaciones.</b>
        <span v-for="(t, i) in alertaTexto" :key="i"> {{ t }}</span>
        <span v-if="vales && vales.sin_destino"> {{ vales.sin_destino }} de {{ vales.vales }} vales sin destino declarado.</span>
      </div>

      <h3>1 · Alcance previsto contra instalado</h3>
      <div class="cards">
        <div v-for="g in tarjetas" :key="g.k" class="mc">
          <b class="mt">{{ g.t }}</b>
          <small class="mu">{{ g.fuente }}{{ g.partida ? ' · partida ' + g.partida : '' }}</small>
          <div class="dos">
            <div><span>Previsto</span><b>{{ f2(g.prev) }} {{ g.u }}</b></div>
            <div><span>Instalado · {{ g.fteInst }}</span><b>{{ f2(g.inst) }} {{ g.u }}</b></div>
          </div>
          <span class="mu sm">Avance</span>
          <b class="pct" :class="estadoTarjeta(g).k">{{ estadoTarjeta(g).pct.toFixed(0) }} %</b>
          <div class="bar"><i :class="estadoTarjeta(g).k" :style="{ width: Math.min(100, estadoTarjeta(g).pct) + '%' }"></i><em></em></div>
          <p class="nota"><span class="tag" :class="estadoTarjeta(g).k">{{ estadoTarjeta(g).t }}</span> {{ estadoTarjeta(g).txt }}</p>
        </div>
      </div>

      <h3>2 · Balance por material: salida, devolución, instalado y acopio</h3>
      <div class="bal">
        <div v-for="g in visibles" :key="g.k" class="bl">
          <span class="bn">{{ g.t }} <small class="mu">· neto {{ f2(g.neto) }} {{ g.u }}</small></span>
          <div class="bb">
            <i class="i" :style="{ width: barra(g).i + '%' }"></i><i class="a" :style="{ width: barra(g).a + '%' }"></i><i class="ac" :style="{ width: barra(g).ac + '%' }"></i>
          </div>
          <small :class="estadoBalance(g).k">{{ estadoBalance(g).t }}</small>
        </div>
      </div>
      <div class="ley">
        <span><i class="i"></i>Instalado (valorizable)</span>
        <span><i class="a"></i>Uso auxiliar (línea de vida, tirolina, patín)</span>
        <span><i class="ac"></i>Debe estar en el acopio</span>
      </div>

      <div class="tabla">
        <table>
          <thead>
            <tr><th>Material</th><th class="r">Salió de almacén</th><th class="r">Transf. ±</th><th class="r">Devuelto (recibido)</th><th class="r">Neto en frente</th><th class="r">Instalado</th><th class="r">Uso auxiliar declarado</th><th class="r">Acopio teórico</th><th class="r">Devolución por recibir</th></tr>
          </thead>
          <tbody>
            <tr v-for="g in visibles" :key="g.k">
              <td class="mat">{{ g.t }}<span>{{ g.u }} · {{ g.mats.map((m) => m.codigo).join(', ') }}</span></td>
              <td class="r">{{ n(g.salida) }}</td>
              <td class="r">{{ n(g.transf) }}</td>
              <td class="r">{{ n(g.dev) }}</td>
              <td class="r b">{{ n(g.neto) }}</td>
              <td class="r" :title="g.fteInst">{{ n(g.inst) }}</td>
              <td class="r pu">{{ n(g.aux) }}</td>
              <td class="r b" :class="g.acopio < -0.01 ? 'mal' : g.acopio > 0.01 ? 'am' : ''">{{ n(g.acopio) }}</td>
              <td class="r">{{ n(g.porRec) }}</td>
            </tr>
            <tr v-if="!visibles.length"><td colspan="9" class="mu">Sin movimientos de Almacén para este sector.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.v5-card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }
h2 { margin: 0; font-size: 17px; font-weight: 700; }
h3 { margin: 4px 0 0; font-size: 14px; font-weight: 700; }
.acc { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: var(--p-chip); }
.seg button { min-height: 32px; padding: 0 12px; border-radius: 8px; border: 0; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--p-muted); }
.seg button.on { background: #f5a800; color: #0d0f10; }
.gh { min-height: 40px; padding: 0 14px; border-radius: 10px; font: inherit; font-weight: 700; font-size: 13.5px; cursor: pointer; background: transparent; color: var(--p-text); border: 1px solid var(--p-line); }
.mu { color: var(--p-muted); }
.sm { font-size: 12px; }
.err { color: #f87171; }
.alerta { padding: 12px 14px; border-radius: 10px; border-left: 4px solid #f87171; background: rgba(248, 113, 113, 0.1); font-size: 13px; line-height: 1.5; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.mc { border: 1px solid var(--p-line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; background: var(--p-bg); }
.mt { font-size: 14px; }
.dos { display: flex; gap: 18px; margin: 6px 0; }
.dos div { display: flex; flex-direction: column; }
.dos span { font-size: 12px; color: var(--p-muted); }
.dos b { font-size: 19px; }
.pct { font-size: 20px; }
.pct.ok { color: #4ade80; } .pct.mal { color: #f87171; } .pct.warn { color: #fbbf24; } .pct.neu { color: var(--p-muted); }
.bar { position: relative; height: 8px; border-radius: 9px; background: var(--p-line); margin: 4px 0; }
.bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 9px; }
.bar i.ok { background: #4ade80; } .bar i.mal { background: #f87171; } .bar i.warn { background: #fbbf24; } .bar i.neu { background: #6b7280; }
.bar em { position: absolute; left: calc(100% * 0.84); top: -3px; bottom: -3px; width: 2px; background: #f8fafc; display: none; }
.nota { margin: 4px 0 0; font-size: 12.5px; line-height: 1.45; }
.tag { font-size: 11.5px; font-weight: 700; border-radius: 6px; padding: 2px 8px; }
.tag.ok { background: rgba(74, 222, 128, 0.16); color: #4ade80; } .tag.mal { background: rgba(248, 113, 113, 0.16); color: #f87171; } .tag.warn { background: rgba(251, 191, 36, 0.16); color: #fbbf24; } .tag.neu { background: var(--p-chip); color: var(--p-muted); }
.bal { display: flex; flex-direction: column; gap: 10px; }
.bn { font-size: 13px; }
.bb { display: flex; height: 10px; border-radius: 9px; overflow: hidden; background: var(--p-line); margin: 3px 0; }
.bb .i, .ley .i { background: #22c55e; } .bb .a, .ley .a { background: #a78bfa; } .bb .ac, .ley .ac { background: #f5b93a; }
.bl small { font-size: 12px; }
.ok { color: #4ade80; } .mal { color: #f87171; } .am { color: #fbbf24; } .pu { color: #a78bfa; }
.ley { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--p-muted); }
.ley span { display: inline-flex; align-items: center; gap: 6px; }
.ley i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.tabla { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 980px; font-size: 13px; }
th { text-align: left; padding: 8px 10px; color: var(--p-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid var(--p-line); white-space: nowrap; }
td { padding: 9px 10px; border-bottom: 1px solid var(--p-line); }
.r { text-align: right; white-space: nowrap; }
.b { font-weight: 800; }
.mat { font-weight: 700; }
.mat span { display: block; color: var(--p-muted); font-size: 11px; font-weight: 400; }
</style>

<script setup>
// Sketch de avance sobre el plano (v5). Cada perno y paño se pinta con la
// fecha real del RDC hasta el día elegido en el reproductor.
import { computed, ref } from 'vue'

const props = defineProps({
  sketch: { type: Object, default: null },
  avance: { type: Array, default: () => [] },
  dia: { type: String, required: true },
  sector: { type: String, default: 'all' },
  sectores: { type: Array, default: () => [] },
  pullRequeridos: { type: Number, default: 4 },
})
const emit = defineEmits(['update:sector'])

const capas = ref({ per: true, iny: true, mal: true, cab: true, pt: true })
const CAPAS = [
  { k: 'per', t: 'Perforación', c: '#f59e0b' },
  { k: 'iny', t: 'Inyección', c: '#2563eb' },
  { k: 'mal', t: 'Malla', c: '#06b6d4' },
  { k: 'cab', t: 'Cable', c: '#22c55e' },
  { k: 'pt', t: 'Pull test', c: '#e11d48' },
]
const svgRef = ref(null)

const fechas = computed(() => {
  const m = { per: new Map(), iny: new Map(), pt: new Map(), mal: new Map() }
  for (const e of props.avance) {
    const k = e.elemento === 'Perno'
      ? e.actividad === 'Perforación' ? 'per' : e.actividad === 'Inyección' ? 'iny' : e.actividad === 'Pull Test' ? 'pt' : null
      : e.elemento === 'Malla' ? 'mal' : null
    if (!k) continue
    const clave = k === 'mal' ? `${e.codigo_norm}|${(e.tipo || '').toLowerCase()}` : e.codigo_norm
    const prev = m[k].get(clave)
    if (!prev || e.primera_fecha < prev.ini) m[k].set(clave, { ini: e.primera_fecha, fin: e.ultima_fecha })
  }
  return m
})

const enSector = (s) => props.sector === 'all' || s === props.sector
const pernos = computed(() =>
  (props.sketch?.elementos ?? []).filter((e) => e.tipo === 'perno').map((e) => {
    const c = (e.codigo_rdc || e.codigo).toUpperCase()
    const p = fechas.value.per.get(c)?.ini, i = fechas.value.iny.get(c)?.ini, t = fechas.value.pt.get(c)?.ini
    const d = props.dia
    const P = !!(p && p <= d) || !!(i && i <= d), I = !!(i && i <= d), T = !!(t && t <= d)
    const showI = I && capas.value.iny, showP = P && capas.value.per
    return {
      ...e, P, I, T,
      fill: showI ? '#2563eb' : showP ? '#f59e0b' : '#ffffff',
      stroke: showI ? '#1e3a8a' : showP ? '#92400e' : '#64748b',
      hoy: (p === d && capas.value.per) || (i === d && capas.value.iny),
      pt: T && capas.value.pt,
      op: enSector(e.sector_codigo) ? 1 : 0.12,
      tip: `${e.codigo_rdc || e.codigo} · ${e.descripcion || ''}${p ? ' · perforado ' + p.slice(8, 10) + '/' + p.slice(5, 7) : ''}${i ? ' · inyectado ' + i.slice(8, 10) + '/' + i.slice(5, 7) : ''}`,
    }
  }),
)
const panos = computed(() =>
  (props.sketch?.elementos ?? []).filter((e) => e.tipo === 'pano').map((e) => {
    const f = fechas.value.mal.get(`${(e.codigo_rdc || e.codigo).toUpperCase()}|${(e.malla_tipo || '').toLowerCase()}`)
    const on = !!(f && f.ini <= props.dia)
    const es3 = (e.malla_tipo || '').includes('80/3')
    const vis = capas.value.mal && enSector(e.sector_codigo)
    const g = e.geo?.[0] ?? []
    const cx = g.reduce((a, p) => a + p[0], 0) / (g.length || 1)
    const cy = g.reduce((a, p) => a + p[1], 0) / (g.length || 1)
    return {
      ...e, on, vis, cx, cy,
      fill: es3 ? '#a855f7' : '#06b6d4', stroke: es3 ? '#6b21a8' : '#0e7490',
      hoy: !!(f && (f.ini === props.dia || f.fin === props.dia)) && vis,
      polys: (e.geo ?? []).map((poly) => poly.map((p) => p.join(',')).join(' ')),
    }
  }),
)
const marcas = computed(() => (props.sketch?.elementos ?? []).filter((e) => e.tipo === 'marca'))
const marcaReportada = (m) => {
  const c = (m.codigo_rdc || '').toUpperCase()
  const p = fechas.value.per.get(c)?.ini ?? fechas.value.iny.get(c)?.ini
  return p && p <= props.dia ? p : null
}

const vis = computed(() => pernos.value.filter((p) => enSector(p.sector_codigo)))
const nP = computed(() => vis.value.filter((p) => p.P).length)
const nI = computed(() => vis.value.filter((p) => p.I).length)
const nT = computed(() => vis.value.filter((p) => p.T).length)
const m2 = computed(() => panos.value.filter((p) => p.on && enSector(p.sector_codigo)).reduce((a, p) => a + Number(p.area_m2 || 0), 0))
const secLabel = computed(() => props.sector === 'all' ? 'Todo el frente' : props.sectores.find((s) => s.codigo === props.sector)?.nombre ?? props.sector)
const opciones = computed(() => [{ codigo: 'all', nombre: 'Todo el frente' }, ...props.sectores])
const fmt = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

async function svgComoImagen() {
  const svg = svgRef.value
  const clon = svg.cloneNode(true)
  const img = clon.querySelector('image')
  if (img && props.sketch?.url) {
    const b = await (await fetch(props.sketch.url)).blob()
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b) })
    img.setAttribute('href', data)
  }
  const [, , w, h] = (props.sketch.viewbox || '0 0 1000 400').split(' ').map(Number)
  clon.setAttribute('width', w * 1.5); clon.setAttribute('height', h * 1.5)
  const txt = new XMLSerializer().serializeToString(clon)
  const url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }))
  const im = new Image()
  await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = url })
  const cv = document.createElement('canvas'); cv.width = w * 1.5; cv.height = h * 1.5
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#eef0f2'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(im, 0, 0)
  URL.revokeObjectURL(url)
  return cv.toDataURL('image/png')
}
async function exportarPng() {
  const a = document.createElement('a')
  a.href = await svgComoImagen()
  a.download = `sketch_${props.sketch?.plano || 'plano'}_${props.dia}.png`.replace(/\s+/g, '_')
  a.click()
}
async function exportarPdf() {
  const png = await svgComoImagen()
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<html><head><title>Sketch ${props.sketch?.plano} ${fmt(props.dia)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:sans-serif}img{width:100%}</style></head><body><h3>Sketch de avance · ${props.sketch?.plano} · ${secLabel.value} · al ${fmt(props.dia)}</h3><p>Perforados ${nP.value} · Inyectados ${nI.value} · Malla ${m2.value.toFixed(1)} m² · Pull test ${nT.value}</p><img src="${png}" onload="setTimeout(()=>print(),300)"></body></html>`)
  w.document.close()
}
</script>

<template>
  <section class="v5-card">
    <div class="top">
      <div>
        <h2>Sketch de avance · plano {{ sketch?.plano || '—' }} · {{ secLabel }}</h2>
        <p>Hoy: {{ fmt(dia) }} · {{ sketch?.nota }}</p>
      </div>
      <div class="chips">
        <span class="chip">Perforados <b style="color: #fbbf24">{{ nP }}</b> / {{ vis.length }}</span>
        <span class="chip">Inyectados <b style="color: #93c5fd">{{ nI }}</b> / {{ vis.length }}</span>
        <span class="chip">Malla <b style="color: #67e8f9">{{ m2.toLocaleString('es-PE', { maximumFractionDigits: 1 }) }}</b> m²</span>
        <span class="chip">Pull test <b style="color: #fb7185">{{ nT }}</b> / {{ pullRequeridos }}</span>
      </div>
    </div>
    <div class="bar2">
      <div class="izq">
        <div class="seg" role="group" aria-label="Sector">
          <button v-for="o in opciones" :key="o.codigo" type="button" :class="{ on: sector === o.codigo }" :aria-pressed="sector === o.codigo" @click="emit('update:sector', o.codigo)">{{ o.nombre }}</button>
        </div>
        <div class="capas" role="group" aria-label="Capas del sketch">
          <button v-for="c in CAPAS" :key="c.k" type="button" :class="{ on: capas[c.k] }" :aria-pressed="capas[c.k]" @click="capas[c.k] = !capas[c.k]">
            <span class="pt" :style="{ background: c.c, opacity: capas[c.k] ? 1 : 0.25 }"></span>{{ c.t }}
          </button>
        </div>
      </div>
      <div class="acc">
        <button type="button" class="pr" :disabled="!sketch" @click="exportarPdf">Exportar PDF</button>
        <button type="button" class="gh" :disabled="!sketch" @click="exportarPng">PNG</button>
      </div>
    </div>

    <p v-if="!sketch" class="vacio">Este frente todavía no tiene plano de sketch cargado.</p>
    <svg v-else ref="svgRef" xmlns="http://www.w3.org/2000/svg" :viewBox="sketch.viewbox" class="plano" role="img" :aria-label="`Plano ${sketch.plano} con el avance al ${fmt(dia)}`">
      <image v-if="sketch.url" :href="sketch.url" x="20" y="25" :width="sketch.ancho" :height="sketch.alto" preserveAspectRatio="none" opacity="0.92" />
      <g v-for="p in panos" :key="p.id">
        <polygon v-for="(pts, k) in p.polys" :key="k" :points="pts" :fill="p.fill" :fill-opacity="p.on && p.vis ? 0.55 : 0" :stroke="p.stroke" :stroke-opacity="p.on && p.vis ? 1 : 0" stroke-width="3">
          <title>{{ p.codigo }} · {{ p.malla_tipo }} · {{ p.area_m2 }} m²</title>
        </polygon>
        <polygon v-for="(pts, k) in p.polys" :key="'h' + k" :points="pts" fill="none" stroke="#facc15" stroke-width="6" :stroke-opacity="p.hoy ? 1 : 0" />
        <text :x="p.cx" :y="p.cy + 7" text-anchor="middle" font-size="22" font-weight="700" fill="#0f172a" stroke="#ffffff" stroke-width="5" paint-order="stroke" :opacity="p.on && p.vis ? 1 : 0">{{ p.codigo }}</text>
      </g>
      <g v-for="a in pernos" :key="a.id" :opacity="a.op">
        <circle :cx="a.x" :cy="a.y" r="21" fill="none" stroke="#facc15" stroke-width="6" :stroke-opacity="a.hoy ? 1 : 0" />
        <circle :cx="a.x" :cy="a.y" r="16" fill="none" stroke="#e11d48" stroke-width="5" :stroke-opacity="a.pt ? 1 : 0" />
        <circle :cx="a.x" :cy="a.y" r="10.5" :fill="a.fill" :stroke="a.stroke" stroke-width="3"><title>{{ a.tip }}</title></circle>
      </g>
      <g v-for="m in marcas" :key="m.id" :opacity="marcaReportada(m) ? 1 : 0.6">
        <path :d="`M${m.x - 13},${m.y - 13} L${+m.x + 13},${+m.y + 13} M${+m.x + 13},${m.y - 13} L${m.x - 13},${+m.y + 13}`" stroke="#dc2626" stroke-width="6" />
        <text :x="m.x - 24" :y="+m.y + 40" text-anchor="end" font-size="19" font-weight="700" fill="#b91c1c" stroke="#fff" stroke-width="5" paint-order="stroke">
          {{ m.codigo }} {{ m.descripcion?.toLowerCase() }}{{ marcaReportada(m) ? ' · reportado ' + fmt(marcaReportada(m)) : '' }}
        </text>
      </g>
    </svg>
    <div class="ley">
      <span><i class="c" style="background: #fff; border: 2.5px solid #64748b"></i>Por ejecutar</span>
      <span><i class="c" style="background: #f59e0b"></i>Perforado</span>
      <span><i class="c" style="background: #2563eb"></i>Inyectado</span>
      <span><i class="c" style="border: 3px solid #e11d48"></i>Pull test</span>
      <span><i class="s" style="background: #06b6d4"></i>MINAX 80/4</span>
      <span><i class="s" style="background: #a855f7"></i>MINAX 80/3</span>
      <span><i class="c" style="border: 3px solid #facc15"></i>Ejecutado ese día</span>
    </div>
  </section>
</template>

<style scoped>
.v5-card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
h2 { margin: 0; font-size: 17px; font-weight: 700; }
.top p { margin: 4px 0 0; color: var(--p-muted); font-size: 12.5px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 7px 11px; border-radius: 8px; background: var(--p-chip); font-size: 13px; }
.chip b { font-size: 15px; }
.bar2 { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.izq { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: var(--p-chip); }
.seg button { min-height: 34px; padding: 0 14px; border-radius: 8px; border: 0; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; background: transparent; color: var(--p-muted); }
.seg button.on { background: #f5a800; color: #0d0f10; }
.capas { display: flex; flex-wrap: wrap; gap: 4px; }
.capas button { display: inline-flex; align-items: center; min-height: 34px; padding: 0 11px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--p-muted); border: 1px solid var(--p-line); }
.capas button.on { background: var(--p-chip); color: var(--p-text); }
.pt { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.acc { display: flex; gap: 8px; }
.acc button { min-height: 40px; padding: 0 16px; border-radius: 10px; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; }
.pr { background: #f5a800; color: #0d0f10; border: 0; }
.gh { background: transparent; color: var(--p-text); border: 1px solid var(--p-line); }
.plano { display: block; width: 100%; height: auto; background: #eef0f2; border-radius: 10px; }
.vacio { color: var(--p-muted); font-size: 14px; padding: 30px; text-align: center; }
.ley { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12px; color: var(--p-muted); }
.ley span { display: inline-flex; align-items: center; gap: 7px; }
.c { width: 12px; height: 12px; border-radius: 50%; box-sizing: border-box; display: inline-block; }
.s { width: 14px; height: 10px; display: inline-block; }
</style>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // [{ nombre, color, datos: [{ etiqueta, valor }] }] — todas las series comparten las mismas etiquetas de eje X.
  series: { type: Array, required: true },
})

const ANCHO = 600
const ALTO = 220
const MARGEN = { arriba: 24, abajo: 28, izq: 34, der: 8 }

const etiquetas = computed(() => props.series[0]?.datos.map((d) => d.etiqueta) ?? [])

const maximo = computed(() => {
  const valores = props.series.flatMap((s) => s.datos.map((d) => d.valor))
  const m = Math.max(1, ...valores)
  // redondea el techo a un número "lindo" para las líneas de grilla
  const paso = Math.pow(10, Math.floor(Math.log10(m || 1)))
  return Math.ceil((m * 1.15) / paso) * paso
})

const gridLineas = computed(() => {
  const pasos = 4
  return Array.from({ length: pasos + 1 }, (_, i) => Math.round((maximo.value / pasos) * i))
})

function x(i) {
  const n = etiquetas.value.length
  if (n <= 1) return MARGEN.izq
  return MARGEN.izq + (i / (n - 1)) * (ANCHO - MARGEN.izq - MARGEN.der)
}
function y(valor) {
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo
  return MARGEN.arriba + alto - (valor / maximo.value) * alto
}

/** Curva suave tipo Catmull-Rom, sin librerías. */
function rutaSuave(puntos) {
  if (puntos.length < 2) return ''
  let d = `M ${puntos[0].x} ${puntos[0].y}`
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1] ?? puntos[i]
    const p1 = puntos[i]
    const p2 = puntos[i + 1]
    const p3 = puntos[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

const trazos = computed(() =>
  props.series.map((s) => {
    const puntos = s.datos.map((d, i) => ({ x: x(i), y: y(d.valor) }))
    const linea = rutaSuave(puntos)
    const base = y(0)
    const area = puntos.length ? `${linea} L ${puntos[puntos.length - 1].x} ${base} L ${puntos[0].x} ${base} Z` : ''
    return { ...s, linea, area, puntos, id: s.nombre.replace(/\s+/g, '-') }
  })
)

const picoGlobal = computed(() => {
  let mejor = null
  for (const s of props.series) {
    s.datos.forEach((d, i) => {
      if (!mejor || d.valor > mejor.valor) mejor = { ...d, x: x(i), y: y(d.valor), serie: s.nombre }
    })
  }
  return mejor && mejor.valor > 0 ? mejor : null
})
</script>

<template>
  <div class="grafico-area">
    <div class="leyenda">
      <span v-for="s in series" :key="s.nombre" class="leyenda-item">
        <span class="punto" :style="{ background: s.color }"></span>{{ s.nombre }}
      </span>
    </div>

    <div class="lienzo-wrap">
    <svg :viewBox="`0 0 ${ANCHO} ${ALTO}`" class="lienzo" preserveAspectRatio="none">
      <defs>
        <linearGradient v-for="t in trazos" :key="t.id" :id="`grad-${t.id}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="t.color" stop-opacity="0.35" />
          <stop offset="100%" :stop-color="t.color" stop-opacity="0" />
        </linearGradient>
      </defs>

      <g v-for="g in gridLineas" :key="g">
        <line :x1="MARGEN.izq" :x2="ANCHO - MARGEN.der" :y1="y(g)" :y2="y(g)" class="linea-grilla" />
        <text :x="MARGEN.izq - 6" :y="y(g)" text-anchor="end" dominant-baseline="middle" class="texto-eje">{{ g }}</text>
      </g>

      <text v-for="(e, i) in etiquetas" :key="e + i" :x="x(i)" :y="ALTO - 8" text-anchor="middle" class="texto-eje">
        {{ e }}
      </text>

      <template v-for="t in trazos" :key="t.id">
        <path :d="t.area" :fill="`url(#grad-${t.id})`" stroke="none" />
        <path :d="t.linea" fill="none" :stroke="t.color" stroke-width="2.5" stroke-linecap="round" />
        <circle v-for="(p, i) in t.puntos" :key="i" :cx="p.x" :cy="p.y" r="2.6" :fill="t.color" />
      </template>

      <g v-if="picoGlobal">
        <line :x1="picoGlobal.x" :x2="picoGlobal.x" :y1="MARGEN.arriba" :y2="ALTO - MARGEN.abajo" class="linea-pico" />
        <circle :cx="picoGlobal.x" :cy="picoGlobal.y" r="4" fill="var(--color-bg)" stroke="var(--color-primary)" stroke-width="2.5" />
      </g>
    </svg>

    <div
      v-if="picoGlobal"
      class="etiqueta-pico"
      :style="{ left: (picoGlobal.x / ANCHO) * 100 + '%', top: (picoGlobal.y / ALTO) * 100 + '%' }"
    >
      {{ picoGlobal.valor }} {{ picoGlobal.serie.toLowerCase() }}
    </div>
    </div>
  </div>
</template>

<style scoped>
.grafico-area {
  position: relative;
}
.leyenda {
  display: flex;
  gap: 1.1rem;
  margin-bottom: 0.75rem;
}
.leyenda-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.punto {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}
.lienzo-wrap {
  position: relative;
}
.lienzo {
  width: 100%;
  height: 230px;
  display: block;
  overflow: visible;
}
.linea-grilla {
  stroke: var(--color-border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.linea-pico {
  stroke: var(--color-border);
  stroke-dasharray: 3 3;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.texto-eje {
  font-size: 9px;
  fill: var(--color-text-muted);
  font-family: var(--font-principal);
}
.etiqueta-pico {
  position: absolute;
  top: 0;
  transform: translate(-50%, -100%);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-control);
  white-space: nowrap;
}
</style>

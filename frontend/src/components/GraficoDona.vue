<script setup>
import { computed } from 'vue'

const props = defineProps({
  // [{ etiqueta, valor, color }]
  datos: { type: Array, required: true },
  etiquetaTotal: { type: String, default: 'Total' },
})

const RADIO = 40
const CIRCUNFERENCIA = 2 * Math.PI * RADIO
const HUECO = 1.6 // separación visual entre porciones, en unidades de arco

const total = computed(() => props.datos.reduce((acc, d) => acc + d.valor, 0))

const segmentos = computed(() => {
  let acumulado = 0
  const conValor = props.datos.filter((d) => d.valor > 0)
  return conValor.map((d) => {
    const proporcion = total.value > 0 ? d.valor / total.value : 0
    const largoBruto = proporcion * CIRCUNFERENCIA
    const offset = -acumulado * CIRCUNFERENCIA
    acumulado += proporcion
    return {
      ...d,
      proporcion,
      largo: conValor.length > 1 ? Math.max(largoBruto - HUECO, 0) : largoBruto,
      offset,
    }
  })
})

function pct(d) {
  return total.value > 0 ? Math.round((d.valor / total.value) * 100) : 0
}
</script>

<template>
  <div class="grafico-dona">
    <svg viewBox="0 0 100 100" class="dona">
      <circle cx="50" cy="50" :r="RADIO" fill="none" stroke="var(--color-border)" stroke-width="13" />
      <circle
        v-for="(s, i) in segmentos"
        :key="i"
        cx="50"
        cy="50"
        :r="RADIO"
        fill="none"
        :stroke="s.color"
        stroke-width="13"
        stroke-linecap="round"
        :stroke-dasharray="`${s.largo} ${CIRCUNFERENCIA}`"
        :stroke-dashoffset="s.offset"
        transform="rotate(-90 50 50)"
        class="segmento"
      />
      <text x="50" y="46" text-anchor="middle" class="valor-total">{{ total }}</text>
      <text x="50" y="59" text-anchor="middle" class="etiqueta-total">{{ etiquetaTotal }}</text>
    </svg>

    <ul class="leyenda">
      <li v-for="(d, i) in datos" :key="i">
        <span class="punto" :style="{ background: d.color }"></span>
        <span class="texto">{{ d.etiqueta }}</span>
        <span class="porcentaje">{{ pct(d) }}%</span>
        <span class="numero">{{ d.valor }}</span>
      </li>
      <li v-if="!datos.length" class="vacio">Sin datos todavía.</li>
    </ul>
  </div>
</template>

<style scoped>
.grafico-dona {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.dona {
  width: 150px;
  height: 150px;
  flex-shrink: 0;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.18));
}
.segmento {
  transition: opacity 0.15s ease;
}
.grafico-dona:hover .segmento {
  opacity: 0.55;
}
.grafico-dona .segmento:hover {
  opacity: 1;
}
.valor-total {
  fill: var(--color-text);
  font-size: 17px;
  font-weight: 800;
  font-family: var(--font-principal);
}
.etiqueta-total {
  fill: var(--color-text-muted);
  font-size: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: var(--font-principal);
}
.leyenda {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
}
.leyenda li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.punto {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  flex-shrink: 0;
}
.texto {
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.porcentaje {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}
.numero {
  min-width: 1.6em;
  text-align: right;
  color: var(--color-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.vacio {
  color: var(--color-text-muted);
}
</style>

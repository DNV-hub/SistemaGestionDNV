<script setup>
import { num } from '../utils/calidad'

defineProps({ datos: { type: Object, required: true } })
const medida = (p) => (p.ancho && p.largo ? `${num(p.ancho, 2)} × ${num(p.largo, 2)} m` : null)
</script>

<template>
  <div class="cal-panel">
    <div class="cal-kp">
      <div>
        <div class="l">Paños instalados</div>
        <div class="v">{{ datos.n }}</div>
      </div>
      <div>
        <div class="l">Área instalada</div>
        <div class="v">{{ num(datos.area) }}<small> m²</small></div>
      </div>
      <div>
        <div class="l">Tipo</div>
        <div class="v txt" :class="{ vacio: !datos.tipos.length }">{{ datos.tipos.join(', ') || '—' }}</div>
      </div>
      <div>
        <div class="l">Zona</div>
        <div class="v txt" :class="{ vacio: !datos.zonas.length }">{{ datos.zonas.join(', ') || '—' }}</div>
      </div>
    </div>

    <div class="cal-card">
      <div class="cal-ch">
        <h3>Paños instalados</h3>
        <span v-if="datos.medidas.length === 1">paños de {{ datos.medidas[0] }}</span>
        <span v-else>{{ datos.n }}</span>
      </div>
      <div v-if="datos.n" class="cal-tiles">
        <div v-for="(p, i) in datos.panos" :key="p.codigo + i" class="cal-mt">
          <b>{{ p.codigo }}</b>
          <span class="dt">{{ p.etiqueta }}</span>
          <em><template v-if="medida(p)">{{ medida(p) }}<br /></template>{{ p.tipo }}</em>
        </div>
      </div>
      <p v-else class="cal-vacio">Sin paños de malla en este periodo.</p>
    </div>
  </div>
</template>

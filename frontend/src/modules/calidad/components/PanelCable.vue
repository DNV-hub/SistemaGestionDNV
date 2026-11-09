<script setup>
import { num } from '../utils/calidad'

defineProps({ datos: { type: Object, required: true } })
</script>

<template>
  <div class="cal-panel">
    <div class="cal-kp">
      <div v-for="d in datos.porDiametro" :key="d.diametro">
        <div class="l">Cable {{ d.diametro }}</div>
        <div class="v">{{ num(d.ml) }}<small> ML</small></div>
      </div>
      <div v-if="!datos.porDiametro.length">
        <div class="l">Cable</div>
        <div class="v">0<small> ML</small></div>
      </div>
      <div>
        <div class="l">Tramos</div>
        <div class="v">{{ datos.n }}</div>
      </div>
      <div>
        <div class="l">Zona</div>
        <div class="v txt" :class="{ vacio: !datos.zonas.length }">{{ datos.zonas.join(', ') || '—' }}</div>
      </div>
    </div>

    <div class="cal-card">
      <div class="cal-ch"><h3>Tramos instalados</h3><span>{{ datos.n }}</span></div>
      <template v-if="datos.n">
        <div class="cal-row h r-t"><span>DÍA</span><span>Ø</span><span>TRAMO</span><span class="cal-num">ML</span></div>
        <div v-for="(t, i) in datos.tramos" :key="i" class="cal-row r-t">
          <b>{{ t.etiqueta }}</b>
          <span><span class="cal-pill n">{{ t.diametro }}</span></span>
          <span class="cal-mut">{{ t.tramo }}</span>
          <span class="cal-num">{{ num(t.ml) }}</span>
        </div>
      </template>
      <p v-else class="cal-vacio">Sin cable instalado en este periodo.</p>
    </div>
  </div>
</template>

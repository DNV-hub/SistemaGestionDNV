<script setup>
import { num } from '../utils/calidad'

defineProps({
  filas: { type: Array, required: true },
  frenteActual: { type: String, default: null },
  periodoTodo: { type: Boolean, default: true },
})
const emit = defineEmits(['elegir'])
const o = (v, d = 1) => (v ? num(v, d) : '—')
</script>

<template>
  <div class="cal-panel">
    <div class="cal-card">
      <div class="cal-ch"><h3>Comparar frentes</h3><span>{{ periodoTodo ? 'registros acumulados' : 'registros del periodo' }}</span></div>
      <div class="cal-tbw">
        <div class="cal-row h r-cmp">
          <span>FRENTE</span><span class="cal-num">PERFORADOS</span><span class="cal-num">INYECTADOS</span>
          <span class="cal-num" style="color: var(--act)">BOLSAS CEMENTO</span><span class="cal-num">MALLA m²</span><span class="cal-num">CABLE ML</span>
          <span class="cal-num">PULL TEST</span>
        </div>
        <button
          v-for="f in filas"
          :key="f.id"
          type="button"
          class="cal-row r-cmp"
          :class="{ me: f.id === frenteActual }"
          :aria-label="`Abrir ${f.nombre}`"
          @click="emit('elegir', f.id)"
        >
          <b>{{ f.nombre }}</b>
          <span class="cal-num">{{ f.perforados }}<small v-if="f.total" class="cal-mut"> / {{ f.total }}</small></span>
          <span class="cal-num">{{ f.inyectados }}<small v-if="f.total" class="cal-mut"> / {{ f.total }}</small></span>
          <span class="cal-num">{{ o(f.bolsas) }}</span>
          <span class="cal-num">{{ o(f.malla, 0) }}</span>
          <span class="cal-num">{{ o(f.cable, 0) }}</span>
          <span class="cal-num">{{ f.pullTest || '—' }}</span>
        </button>
        <p v-if="!filas.length" class="cal-vacio">Ningún frente tiene registros en este periodo.</p>
      </div>
    </div>
    <p class="cal-nota">
      Tocar un frente abre su detalle. Los frentes sin biblioteca de pernos solo muestran lo reportado, sin «/ total». Solo cuentan reportes
      enviados.
    </p>
  </div>
</template>

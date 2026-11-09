<script setup>
defineProps({ datos: { type: Object, required: true } })
</script>

<template>
  <div class="cal-panel">
    <div class="cal-kp">
      <div>
        <div class="l">Ensayos realizados</div>
        <div class="v">{{ datos.n }}</div>
      </div>
      <div>
        <div class="l">Anclajes inyectados</div>
        <div class="v">{{ datos.anclajesInyectados }}</div>
      </div>
      <!-- El reporte no guarda el resultado del ensayo: solo que se ejecutó. -->
      <div>
        <div class="l">Ensayados / inyectados</div>
        <div v-if="datos.anclajesInyectados" class="v">{{ Math.round((datos.n / datos.anclajesInyectados) * 100) }}<small> %</small></div>
        <div v-else class="v vacio">—</div>
      </div>
      <div>
        <div class="l">Último ensayo</div>
        <div class="v txt" :class="{ vacio: !datos.ultimo }">{{ datos.ultimo ? `${datos.ultimo.codigo} · ${datos.ultimo.etiqueta}` : '—' }}</div>
      </div>
    </div>

    <div class="cal-card">
      <div class="cal-ch"><h3>Ensayos</h3><span>{{ datos.n }}</span></div>
      <template v-if="datos.n">
        <div class="cal-row h r-pt"><span>DÍA</span><span>ZONA</span><span>ANCLAJE · UBICACIÓN</span><span class="cal-num">ESTADO</span></div>
        <div v-for="(e, i) in datos.ensayos" :key="i" class="cal-row r-pt">
          <b>{{ e.etiqueta }}</b>
          <span class="cal-mut">{{ e.zona }}</span>
          <div class="cal-nm"><b>{{ e.codigo }}</b><em>{{ e.ubicacion }}</em></div>
          <span style="text-align: right"><span class="cal-pill ok">Ejecutado</span></span>
        </div>
      </template>
      <p v-else class="cal-vacio">Sin pull test en este periodo.</p>
    </div>
  </div>
</template>

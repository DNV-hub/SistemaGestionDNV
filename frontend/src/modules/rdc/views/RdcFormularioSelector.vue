<script setup>
import { defineAsyncComponent } from 'vue'
import { useEsMovil } from '../../../composables/useEsMovil'

// En celular el formulario del reporte vuelve al diseño de siempre (el que los
// supervisores ya conocen, RdcFormularioViewV1); en escritorio se usa el
// rediseño. La lógica (store, guardado, envío) es la misma en los dos.
const esMovil = useEsMovil()
const Rediseno = defineAsyncComponent(() => import('./RdcFormularioView.vue'))
const Clasico = defineAsyncComponent(() => import('./RdcFormularioViewV1.vue'))
</script>

<template>
  <component :is="esMovil ? Clasico : Rediseno" />
</template>

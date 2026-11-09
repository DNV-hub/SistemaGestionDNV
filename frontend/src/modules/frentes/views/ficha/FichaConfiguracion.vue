<script setup>
import { ref } from 'vue'
import SeccionGeneral from '../../components/configuracion/SeccionGeneral.vue'
import SeccionControl from '../../components/configuracion/SeccionControl.vue'
import SeccionZonasPrefijos from '../../components/configuracion/SeccionZonasPrefijos.vue'
import SeccionPartidasEdt from '../../components/configuracion/SeccionPartidasEdt.vue'
import SeccionPernosBiblioteca from '../../components/configuracion/SeccionPernosBiblioteca.vue'
import SeccionArchivos from '../../components/configuracion/SeccionArchivos.vue'

defineProps({
  frente: { type: Object, required: true },
})
// Cada sección guarda sus propios campos y emite el frente ya actualizado —
// se relaya tal cual hacia FichaFrenteView.vue para que las demás pestañas
// (Resumen, Control de sostenimiento) vean el cambio sin recargar la página.
defineEmits(['actualizado'])

// Lista maestra a la izquierda, detalle de la sección elegida a la derecha.
// Las secciones siguen montadas (v-show) para no volver a pedir sus datos al
// cambiar de una a otra.
const SECCIONES = [
  { clave: 'general', etiqueta: 'General' },
  { clave: 'control', etiqueta: 'Control de sostenimiento' },
  { clave: 'zonas', etiqueta: 'Zonas y prefijos' },
  { clave: 'edt', etiqueta: 'Partidas EDT', conteo: true },
  { clave: 'pernos', etiqueta: 'Biblioteca de pernos' },
  { clave: 'archivos', etiqueta: 'Archivos' },
]
const activa = ref('general')
const conteoEdt = ref(null)
</script>

<template>
  <div class="pl-md">
    <nav class="pl-nav" aria-label="Configuración del frente">
      <button
        v-for="s in SECCIONES"
        :key="s.clave"
        type="button"
        class="pl-cl"
        :class="{ on: activa === s.clave }"
        :aria-current="activa === s.clave ? 'true' : undefined"
        @click="activa = s.clave"
      >
        {{ s.etiqueta }}
        <span v-if="s.conteo && conteoEdt !== null" class="cnt">{{ conteoEdt }}</span>
      </button>
    </nav>

    <div class="detalle">
      <SeccionGeneral v-show="activa === 'general'" :frente="frente" @actualizado="$emit('actualizado', $event)" />
      <SeccionControl v-show="activa === 'control'" :frente="frente" @actualizado="$emit('actualizado', $event)" />
      <SeccionZonasPrefijos v-show="activa === 'zonas'" :frente-id="frente.id" />
      <SeccionPartidasEdt v-show="activa === 'edt'" :frente-id="frente.id" @contado="conteoEdt = $event" />
      <SeccionPernosBiblioteca v-show="activa === 'pernos'" :frente-id="frente.id" />
      <div v-show="activa === 'archivos'" class="grid-archivos">
        <SeccionArchivos :frente="frente" @actualizado="$emit('actualizado', $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.detalle {
  min-width: 0;
}
.grid-archivos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
}
</style>

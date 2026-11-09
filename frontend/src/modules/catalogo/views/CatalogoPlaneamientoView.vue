<script setup>
import { computed, onMounted, reactive } from 'vue'
import { useAuthStore } from '../../../store/auth'
import CatalogoView from './CatalogoView.vue'
import CatalogoRdcPanel from '../rdc/views/CatalogoRdcPanel.vue'
import { contarCatalogo } from '../rdc/services/catalogosRdcService'

// Una sola pantalla de Catálogo: lista maestra a la izquierda (agrupada) y el
// catálogo elegido a la derecha. Reemplaza las pestañas anidadas Materiales /
// Capataces / Catálogos RDC; esas rutas redirigen acá (ver planeamiento/routes.js).
const props = defineProps({
  seccion: { type: String, default: '' },
})
const auth = useAuthStore()

const PERMISO_RDC = 'rdc.catalogos_gestionar'
// `def` = clave en definicionesCatalogos.js (o 'capataces', que tiene su propia
// definición dentro de CatalogoRdcPanel). `tabla` solo para el contador.
const GRUPOS = [
  {
    titulo: 'PERSONAS',
    items: [
      { slug: 'capataces', etiqueta: 'Capataces', def: 'capataces', permiso: PERMISO_RDC, tabla: 'rdc_capataces' },
      { slug: 'supervisores', etiqueta: 'Supervisores', def: 'supervisores', permiso: PERMISO_RDC, tabla: 'rdc_supervisores' },
    ],
  },
  {
    titulo: 'OBRA',
    items: [
      { slug: 'sectores', etiqueta: 'Sectores', def: 'sectores', permiso: PERMISO_RDC, tabla: 'sectores' },
      { slug: 'frentes', etiqueta: 'Frentes', def: 'frentes', permiso: PERMISO_RDC },
    ],
  },
  {
    titulo: 'PARTIDAS',
    items: [
      { slug: 'partidas-estandar', etiqueta: 'Partidas estándar', def: 'partidasEstandar', permiso: PERMISO_RDC },
      { slug: 'edt', etiqueta: 'EDT', def: 'partidasEdt', permiso: PERMISO_RDC },
      { slug: 'prefijos', etiqueta: 'Prefijos', def: 'prefijos', permiso: PERMISO_RDC },
    ],
  },
  {
    titulo: 'TÉCNICO',
    items: [
      { slug: 'redline', etiqueta: 'Redline (contratista)', def: 'redline', permiso: PERMISO_RDC },
      { slug: 'pernos', etiqueta: 'Biblioteca de pernos', def: 'pernos', permiso: PERMISO_RDC },
    ],
  },
  {
    titulo: 'RECURSOS',
    items: [
      { slug: 'materiales', etiqueta: 'Materiales', permiso: 'catalogo.ver', tabla: 'materiales' },
      { slug: 'maquinaria', etiqueta: 'Maquinaria', def: 'maquinarias', permiso: PERMISO_RDC },
    ],
  },
]

const grupos = computed(() =>
  GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => auth.tienePermiso(i.permiso)) })).filter((g) => g.items.length)
)
const todosLosItems = computed(() => grupos.value.flatMap((g) => g.items))
const activo = computed(
  () =>
    todosLosItems.value.find((i) => i.slug === props.seccion) ??
    todosLosItems.value.find((i) => i.slug === 'materiales') ??
    todosLosItems.value[0] ??
    null
)

const conteos = reactive({})
onMounted(() => {
  for (const i of todosLosItems.value) {
    if (!i.tabla) continue
    contarCatalogo(i.tabla)
      .then((n) => (conteos[i.slug] = n))
      .catch(() => {})
  }
})
</script>

<template>
  <div class="pl-md">
    <nav class="pl-nav" aria-label="Catálogos">
      <template v-for="g in grupos" :key="g.titulo">
        <div class="pl-ng">{{ g.titulo }}</div>
        <router-link
          v-for="i in g.items"
          :key="i.slug"
          :to="`/planeamiento/catalogo/${i.slug}`"
          class="pl-cl"
          :class="{ on: activo?.slug === i.slug }"
          :aria-current="activo?.slug === i.slug ? 'page' : undefined"
        >
          {{ i.etiqueta }}
          <span v-if="conteos[i.slug] != null" class="cnt">{{ conteos[i.slug] }}</span>
        </router-link>
      </template>
    </nav>

    <div class="detalle">
      <CatalogoView v-if="activo?.slug === 'materiales'" />
      <CatalogoRdcPanel v-else-if="activo" :key="activo.slug" :clave="activo.def" />
      <p v-else class="pl-empty">No tienes acceso a ningún catálogo.</p>
    </div>
  </div>
</template>

<style scoped>
.detalle {
  min-width: 0;
}
</style>

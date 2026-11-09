<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../../store/auth'
import { cabeceraPlaneamiento } from '../composables/useCabeceraPlaneamiento'
import { useEsMovil } from '../../../composables/useEsMovil'
import '../../../styles/planeamiento-ui.css'

const route = useRoute()
const auth = useAuthStore()

// Orden exacto: Frentes | RDC | Catálogo. Cada pestaña solo aparece para
// quien tiene el permiso de su ruta (la ruta igual lo vuelve a exigir).
const TABS = [
  { to: '/planeamiento/frentes', etiqueta: 'Frentes', permiso: 'frentes.ver', excluidos: ['Almacen', 'Supervisor'] },
  { to: '/planeamiento/rdc', etiqueta: 'RDC', permiso: 'rdc.ver_propios', excluidos: ['Almacen'] },
  { to: '/planeamiento/catalogo', etiqueta: 'Catálogo', permiso: 'catalogo.ver', excluidos: ['Almacen'] },
]
// Campo (Supervisor/Residencia) entra a su Reporte diario sin la cabecera de
// Planeamiento: esa pantalla no se toca.
const esCampo = computed(() => ['Supervisor', 'Residencia'].includes(auth.nombreRol))
const esMovil = useEsMovil()
// En celular el orden es RDC | Frentes | Catálogo (se abre en RDC); en
// escritorio se queda Frentes | RDC | Catálogo.
const tabs = computed(() => {
  const visibles = TABS.filter((t) => auth.tienePermiso(t.permiso) && !t.excluidos.includes(auth.nombreRol))
  if (!esMovil.value) return visibles
  const orden = ['/planeamiento/rdc', '/planeamiento/frentes', '/planeamiento/catalogo']
  return [...visibles].sort((a, b) => orden.indexOf(a.to) - orden.indexOf(b.to))
})

const menuAbierto = ref(false)
const menuRef = ref(null)
const hayMenu = computed(() => cabeceraPlaneamiento.menu.length > 0)
const cta = computed(() => (cabeceraPlaneamiento.cta?.visible === false ? null : cabeceraPlaneamiento.cta))
// En celular el botón naranja es solo "Nuevo" (la pestaña ya dice qué se crea).
const ctaTexto = computed(() => (esMovil.value ? 'Nuevo' : cta.value?.texto))

function cerrarFuera(e) {
  if (menuAbierto.value && !menuRef.value?.contains(e.target)) menuAbierto.value = false
}
function cerrarConEscape(e) {
  if (e.key === 'Escape') menuAbierto.value = false
}
function elegir(item) {
  menuAbierto.value = false
  item.ejecutar()
}
onMounted(() => {
  document.addEventListener('click', cerrarFuera)
  document.addEventListener('keydown', cerrarConEscape)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', cerrarFuera)
  document.removeEventListener('keydown', cerrarConEscape)
})
</script>

<template>
  <div v-if="esCampo" class="campo">
    <router-view />
  </div>
  <div v-else class="pl">
    <div class="pl-top">
      <h1 class="pl-h1">Planeamiento</h1>
      <div class="pl-acts">
        <div v-if="hayMenu" ref="menuRef" class="pl-menu">
          <button type="button" class="pl-ghost ico" aria-label="Más acciones" aria-haspopup="menu"
            :aria-expanded="menuAbierto" @click.stop="menuAbierto = !menuAbierto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
          <div v-if="menuAbierto" class="pl-pop" role="menu">
            <button v-for="item in cabeceraPlaneamiento.menu" :key="item.texto" type="button" class="pl-mi" role="menuitem"
              :disabled="item.deshabilitado" @click="elegir(item)">{{ item.texto }}</button>
          </div>
        </div>
        <button v-if="cta" type="button" class="pl-cta" :disabled="cta.deshabilitado" @click="cta.ejecutar()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>{{ ctaTexto }}</span>
        </button>
      </div>
    </div>

    <nav class="pl-tabs" role="tablist" aria-label="Secciones de Planeamiento">
      <router-link
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        role="tab"
        class="pl-tab"
        :class="{ on: route.path.startsWith(t.to) }"
        :aria-selected="route.path.startsWith(t.to) ? 'true' : 'false'"
      >{{ t.etiqueta }}</router-link>
    </nav>

    <router-view />
  </div>
</template>

<style scoped>
/* Celular: las pestañas pasan a un segmentado de ancho completo. */
@media (max-width: 1024px) {
  /* Deja espacio para que la barra inferior flotante no tape el final. */
  .pl {
    padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  }
  .pl-top {
    position: sticky;
    top: 0;
    z-index: 4;
    flex-wrap: nowrap;
    gap: 10px;
    padding-bottom: 6px;
    background: var(--p-bg, var(--color-bg));
  }
  .pl-h1 {
    flex: 1;
    min-width: 0;
    font-size: 22px;
  }
  .pl-tabs {
    display: flex;
    gap: 0;
    padding: 3px;
    border: 0;
    border-radius: 14px;
    background: var(--color-surface-2);
  }
  .pl-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0;
    border-radius: 11px;
    font-weight: 800;
    font-size: 13.5px;
  }
  .pl-tab.on {
    background: var(--color-surface);
    box-shadow: 0 0 0 1px var(--color-border);
  }
  .pl-tab.on::after {
    display: none;
  }
}
.campo {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>

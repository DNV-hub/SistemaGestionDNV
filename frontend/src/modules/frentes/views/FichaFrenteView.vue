<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../../store/auth'
import { obtenerFrente } from '../services/frentesService'
import FichaResumen from './ficha/FichaResumen.vue'
import FichaProcura from './ficha/FichaProcura.vue'
import FichaControlSostenimiento from './ficha/FichaControlSostenimiento.vue'
import FichaSemanal from './ficha/FichaSemanal.vue'
import FichaReportes from './ficha/FichaReportes.vue'
import FichaConfiguracion from './ficha/FichaConfiguracion.vue'
import '../../../styles/planeamiento-ui.css'

const props = defineProps({
  id: { type: String, required: true },
  tab: { type: String, default: 'resumen' },
})

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const frente = ref(null)
const cargando = ref(true)
const error = ref('')

// Se carga una sola vez acá (no en cada pestaña) y se reparte por prop — las
// 5 pestañas comparten el mismo frente, no tiene sentido repetir la consulta
// cinco veces ni volver a pedirla al cambiar de pestaña.
async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    frente.value = await obtenerFrente(props.id)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cargar el frente${e?.message ? ': ' + e.message : '.'}`
  } finally {
    cargando.value = false
  }
}
watch(() => props.id, cargar, { immediate: true })

const TODAS_LAS_PESTANAS = [
  { clave: 'resumen', etiqueta: 'Resumen' },
  { clave: 'procura', etiqueta: 'Procura', permiso: 'procura.ver' },
  { clave: 'control', etiqueta: 'Control de sostenimiento' },
  { clave: 'semanal', etiqueta: 'Semanal', nuevo: true },
  { clave: 'reportes', etiqueta: 'Reportes' },
  { clave: 'configuracion', etiqueta: 'Configuración' },
]
// Procura es la única pestaña con permiso propio distinto de frentes.ver
// (el que ya exige la ruta completa) — quien ve la ficha pero no tiene
// procura.ver no debería ver esta pestaña ni poder forzarla por URL.
const PESTANAS = computed(() => TODAS_LAS_PESTANAS.filter((p) => !p.permiso || auth.tienePermiso(p.permiso)))
const pestanaActiva = computed(() => {
  const clave = props.tab || 'resumen'
  return PESTANAS.value.some((p) => p.clave === clave) ? clave : 'resumen'
})
function irAPestana(clave) {
  router.push({ name: 'ficha-frente', params: { id: props.id, tab: clave }, query: route.query })
}

// Si llegó desde el formulario del RDC («Ver avance»), se ofrece volver al
// reporte que estaba llenando. Solo se aceptan rutas internas del RDC.
const rutaVolver = computed(() => {
  const v = route.query.volver
  return typeof v === 'string' && v.startsWith('/rdc') ? v : null
})

// Exportar: por ahora descarga las tablas de Control de sostenimiento
// (Pernos, Malla, Cable) en un solo Excel; en las demás pestañas no aplica.
const controlRef = ref(null)
const exportando = ref(false)
const puedeExportar = computed(() => pestanaActiva.value === 'control' && !!controlRef.value?.listoParaExportar && !exportando.value)
async function exportar() {
  if (!puedeExportar.value) return
  exportando.value = true
  error.value = ''
  try {
    await controlRef.value.exportar(frente.value?.nombre)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo exportar${e?.message ? ': ' + e.message : '.'}`
  } finally {
    exportando.value = false
  }
}

const ETIQUETA_ESTADO = {
  planificado: 'Planificado',
  proximo: 'Próximo',
  activo: 'Activo',
  paralizado: 'Paralizado',
  cerrado: 'Cerrado',
}
</script>

<template>
  <div class="pl">
    <div v-if="rutaVolver" class="volver-rdc" role="status">
      <span>Estás viendo el avance del frente.</span>
      <button type="button" @click="router.push(rutaVolver)">‹ Volver al reporte</button>
    </div>
    <div class="pl-crumb">
      <router-link to="/planeamiento/frentes">Frentes</router-link>
      <template v-if="frente">
        <span>›</span>
        <span class="cur">{{ frente.nombre }}</span>
      </template>
    </div>

    <p v-if="error" class="pl-error">{{ error }}</p>
    <p v-if="cargando" class="pl-empty">Cargando…</p>

    <template v-else-if="frente">
      <header class="cabecera-ficha">
        <div>
          <div class="titulo-fila">
            <h1 class="pl-h1 sm">{{ frente.nombre }}</h1>
            <span class="pl-sx" :class="frente.estado"><span class="pl-sd" :class="frente.estado"></span>{{ ETIQUETA_ESTADO[frente.estado] ?? frente.estado }}</span>
          </div>
          <div class="chips-ficha">
            <span class="pl-chip">{{ frente.sector }}</span>
            <span class="pl-chip">{{ frente.area }}</span>
            <span v-if="frente.tipo_rd" class="pl-chip blue">RD tipo {{ frente.tipo_rd }}</span>
            <span v-if="frente.rdc_control_pernos" class="pl-chip green">Control de pernos activo</span>
          </div>
        </div>
        <div class="pl-acts">
          <button
            type="button"
            class="pl-ghost"
            :disabled="!puedeExportar"
            :title="pestanaActiva === 'control' ? 'Descargar pernos, malla y cable en Excel' : 'Abre Control de sostenimiento para exportar sus tablas'"
            @click="exportar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            {{ exportando ? 'Exportando…' : 'Exportar' }}
          </button>
          <button type="button" class="pl-cta" disabled title="Disponible próximamente">Emitir RD</button>
        </div>
      </header>

      <nav class="pl-tabs" role="tablist" aria-label="Secciones del frente">
        <button
          v-for="p in PESTANAS"
          :key="p.clave"
          type="button"
          role="tab"
          class="pl-tab"
          :class="{ on: pestanaActiva === p.clave, nuevo: p.nuevo }"
          :aria-selected="pestanaActiva === p.clave"
          @click="irAPestana(p.clave)"
        >
          {{ p.etiqueta }}
        </button>
      </nav>

      <div class="pl-col" role="tabpanel">
        <FichaResumen v-if="pestanaActiva === 'resumen'" :frente="frente" />
        <FichaProcura v-else-if="pestanaActiva === 'procura'" :frente-id="frente.id" :frente="frente" />
        <FichaControlSostenimiento v-else-if="pestanaActiva === 'control'" ref="controlRef" :frente-id="frente.id" />
        <FichaSemanal v-else-if="pestanaActiva === 'semanal'" :frente="frente" />
        <FichaReportes v-else-if="pestanaActiva === 'reportes'" :frente="frente" />
        <FichaConfiguracion
          v-else-if="pestanaActiva === 'configuracion'"
          :frente="frente"
          @actualizado="frente = $event"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.volver-rdc {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-warning, #f6a800) 18%, var(--color-surface, #fff));
  color: var(--color-text);
  font-size: 13.5px;
  font-weight: 600;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-warning, #f6a800) 40%, transparent);
}
.volver-rdc button {
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #f5a800;
  color: #1a1206;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.cabecera-ficha {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}
.titulo-fila {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.chips-ficha {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
/* Etiqueta "Nuevo" sobre la pestaña Semanal (se puede quitar más adelante). */
.pl-tabs {
  padding-top: 8px;
}
.pl-tab.nuevo {
  margin-right: 62px;
}
.pl-tab.nuevo::before {
  content: 'Nuevo';
  position: absolute;
  top: 2px;
  right: -40px;
  font-size: 10px;
  font-weight: 800;
  background: #f6a800;
  color: #111;
  border-radius: 6px;
  padding: 1px 5px;
}
.pl-error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
</style>

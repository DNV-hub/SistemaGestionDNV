<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { ESTADO } from '../services/rdcDb'
import { nombreDe } from '../services/rdcCalculos'
import PasoDatos from '../components/PasoDatos.vue'
import PasoJornada from '../components/PasoJornada.vue'
import PasoMetrados from '../components/PasoMetrados.vue'
import PasoObservaciones from '../components/PasoObservaciones.vue'
import PasoResumen from '../components/PasoResumen.vue'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'

const rdc = useRdcStore()
const route = useRoute()
const router = useRouter()

// Las mismas cinco pestañas, en el mismo orden y con los mismos iconos que el
// RDC que los supervisores ya usan.
const PASOS = [
  { clave: 'datos', titulo: 'Datos', icono: 'ti-id-badge', componente: PasoDatos },
  { clave: 'jornada', titulo: 'Jornada', icono: 'ti-checklist', componente: PasoJornada },
  { clave: 'metrados', titulo: 'Metrados', icono: 'ti-ruler-measure', componente: PasoMetrados },
  { clave: 'obs', titulo: 'Obs/Prog', icono: 'ti-note', componente: PasoObservaciones },
  { clave: 'resumen', titulo: 'Resumen', icono: 'ti-send', componente: PasoResumen },
]

const paso = ref(0)
const listo = ref(false)

onMounted(async () => {
  if (!rdc.catalogos) await rdc.iniciar()
  const id = route.params.id
  if (id) await rdc.abrir(id)
  if (!rdc.actual) {
    const nuevo = await rdc.nuevo()
    router.replace({ name: 'rdc-editar', params: { id: nuevo.id } })
  }
  listo.value = true
})

const componenteActual = computed(() => PASOS[paso.value].componente)
const supervisor = computed(() => nombreDe(rdc.catalogos, 'supervisores', rdc.actual?.supervisorId) || '—')

function ir(indice) {
  paso.value = indice
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// El deslizamiento lateral entre pestañas es parte de cómo se usa hoy en el
// frente: se pasa de paso con el pulgar, sin apuntar a un botón chico.
let inicioX = 0
let inicioY = 0
const alTocar = (e) => {
  inicioX = e.touches[0].clientX
  inicioY = e.touches[0].clientY
}
function alSoltar(e) {
  const dx = e.changedTouches[0].clientX - inicioX
  const dy = e.changedTouches[0].clientY - inicioY
  if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.75) return
  if (dx < 0 && paso.value < PASOS.length - 1) ir(paso.value + 1)
  else if (dx > 0 && paso.value > 0) ir(paso.value - 1)
}
</script>

<template>
  <div class="rdc-app" @touchstart.passive="alTocar" @touchend.passive="alSoltar">
    <div class="app">
      <div class="barra-superior">
        <button class="volver" @click="router.push({ name: 'rdc' })"><i class="ti ti-arrow-left" /> Mis reportes</button>
        <span v-if="rdc.actual?.esCorreccion" class="marca-correccion">Corrección</span>
      </div>

      <div class="supervisor-banner">
        <div class="sup-avatar"><i class="ti ti-user-shield sup-icon" /></div>
        <div class="sup-datos">
          <div class="sup-tipo-lbl">Reporte de Supervisor</div>
          <div class="sup-nombre">{{ supervisor }}</div>
        </div>
      </div>

      <p v-if="!listo" class="empty-msg">Cargando…</p>

      <template v-else-if="rdc.actual">
        <component :is="componenteActual" />
      </template>

      <nav class="bottom-nav">
        <button
          v-for="(p, i) in PASOS"
          :key="p.clave"
          class="bnav-item"
          :class="{ active: i === paso }"
          :id="p.clave === 'resumen' ? 'bnav-resumen' : null"
          @click="ir(i)"
        >
          <i class="ti" :class="p.icono" /><span>{{ p.titulo }}</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
/* La maqueta del RDC deja la barra inferior fija; hay que dejarle sitio para
   que el último bloque del formulario no quede debajo de ella. */
.app {
  padding: 0 12px calc(80px + env(safe-area-inset-bottom, 0px));
}
.barra-superior {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 4px;
}
.volver {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
}
.marca-correccion {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #fff;
  background: var(--amber);
  padding: 3px 9px;
  border-radius: 5px;
}
.supervisor-banner {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border-radius: var(--r-lg);
  padding: 14px 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.sup-avatar {
  width: 40px;
  height: 40px;
  background: rgb(255 255 255 / 0.18);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sup-icon {
  color: #fff;
  font-size: 21px;
}
.sup-datos {
  flex: 1;
  min-width: 0;
}
.sup-tipo-lbl {
  font-size: 10px;
  font-weight: 600;
  color: rgb(255 255 255 / 0.65);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.sup-nombre {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

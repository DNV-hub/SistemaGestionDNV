<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { ESTADO } from '../services/rdcDb'
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
const esUltimoPaso = computed(() => paso.value === PASOS.length - 1)

function ir(indice) {
  paso.value = indice
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cerrar() {
  router.push({ name: 'rdc' })
}

// La lista (docs/mockups/02-rdc-lista.html) ya no tiene un botón de borrar
// en cada tarjeta — el mockup no lo muestra ahí. Este es su lugar nuevo:
// solo tiene sentido borrar mientras el reporte sigue siendo un borrador
// (uno ya finalizado es registro histórico, no se borra).
async function borrar() {
  if (!rdc.actual) return
  if (!confirm('¿Borrar este borrador? No se puede deshacer.')) return
  try {
    await rdc.eliminarBorrador(rdc.actual.id)
    router.push({ name: 'rdc' })
  } catch (e) {
    console.error(e)
    alert(e?.message ?? 'No se pudo borrar el borrador.')
  }
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
  <div class="rdc-app formulario">
    <header class="appbar">
      <button type="button" class="icon-btn" aria-label="Cerrar y volver a mis reportes" @click="cerrar">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5.5 5.5l11 11M16.5 5.5l-11 11"/></svg>
      </button>
      <div class="appbar-title">
        Reporte diario
        <span v-if="rdc.actual?.esCorreccion" class="marca-correccion">Corrección</span>
      </div>
      <div class="save-state">
        <span class="save-dot"></span>
        <span>Guardado</span>
      </div>
      <button
        v-if="rdc.actual?.estado === ESTADO.BORRADOR"
        type="button"
        class="icon-btn"
        aria-label="Borrar este borrador"
        @click="borrar"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4.5a1 1 0 011-1h2a1 1 0 011 1V6m2 0-.7 10.5a1.5 1.5 0 01-1.5 1.4H7.2a1.5 1.5 0 01-1.5-1.4L5 6"/></svg>
      </button>
    </header>

    <div class="progress">
      <div class="seg-row">
        <div v-for="(p, i) in PASOS" :key="p.clave" class="seg" :class="{ done: i < paso, now: i === paso }"></div>
      </div>
      <div class="prog-labels">
        <span class="step">{{ PASOS[paso].titulo }}</span>
        <span class="of">Paso {{ paso + 1 }} de {{ PASOS.length }}</span>
      </div>
    </div>

    <main class="content" @touchstart.passive="alTocar" @touchend.passive="alSoltar">
      <p v-if="!listo" class="empty-msg">Cargando…</p>
      <component :is="componenteActual" v-else-if="rdc.actual" />
    </main>

    <!-- Anterior sigue disponible hasta enviar, incluso en el último paso
         (Resumen) — ahí no hay "Siguiente" porque ese paso ya tiene su
         propio botón "Terminado y Enviar" adentro. -->
    <div class="actionbar">
      <button type="button" class="btn btn-sec" :disabled="paso === 0" @click="ir(paso - 1)">Anterior</button>
      <button v-if="!esUltimoPaso" type="button" class="btn btn-pri" @click="ir(paso + 1)">
        Siguiente
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5h10M9.5 4.5l4 4-4 4"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Mismos nombres/valores que RdcListaView (docs/mockups/01-rdc-formulario.html):
   paleta propia, con guión para no chocar con las variables sin guión de
   rdc-tema.css. El formulario es un flujo de tarea: sin la píldora
   "Reporte Diario de Campo", sin barra de pestañas abajo (ya la oculta
   routes.js con ocultarTabbar), cabecera propia con una X que cierra el
   flujo entero (no es "paso atrás", eso lo hacen Anterior/Siguiente). */
.rdc-app.formulario {
  --bg: #f4f5f7;
  --card: #ffffff;
  --border-lista: #e4e7ec;
  --text-2: #667085;
  --text-3: #98a2b3;
  --ok: #059669;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: calc(100dvh - env(safe-area-inset-top));
  background: var(--bg);
  /* En el celular esto no hace nada (la pantalla ya es más angosta que
     720px); en escritorio evita que el formulario se estire de punta a
     punta de la ventana — mismo tratamiento que ya tiene RdcListaView. */
  max-width: 720px;
  margin: 0 auto;
}

.appbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border-lista);
  display: flex;
  align-items: center;
  padding: 0 8px 0 4px;
  gap: 4px;
}
.icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
}
.appbar-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.marca-correccion {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #fff;
  background: #f5a800;
  padding: 3px 9px;
  border-radius: 5px;
  flex-shrink: 0;
}
.save-state {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-right: 8px;
  flex-shrink: 0;
}
.save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.save-state span:last-child {
  font-size: 12px;
  font-weight: 500;
  color: var(--ok);
}

.progress {
  flex-shrink: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border-lista);
  padding: 11px 16px 12px;
}
.seg-row {
  display: flex;
  gap: 6px;
  margin-bottom: 9px;
}
.seg {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: #e4e7ec;
}
.seg.done,
.seg.now {
  background: #f5a800;
}
.prog-labels {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.prog-labels .step {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.prog-labels .of {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-3);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
}

.actionbar {
  flex-shrink: 0;
  background: var(--card);
  border-top: 1px solid var(--border-lista);
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  gap: 10px;
}
.btn {
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  flex: 1;
  border: none;
  cursor: pointer;
}
.btn-sec {
  background: var(--card);
  border: 1.5px solid var(--border-lista);
  color: var(--text-3);
}
.btn-sec:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn-pri {
  background: #f5a800;
  color: #1a1206;
}
</style>

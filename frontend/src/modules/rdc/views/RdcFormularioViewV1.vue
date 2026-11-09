<script setup>
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { ESTADO } from '../services/rdcDb'
import { hoyLocal } from '../services/rdcRepository'
import { rdcUi } from '../services/rdcUi'
import PasoDatos from '../components/PasoDatosV1.vue'
import PasoBitacora from '../components/PasoBitacoraV1.vue'
import PasoMetrados from '../components/PasoMetradosV1.vue'
import PasoObservaciones from '../components/PasoObservacionesV1.vue'
import PasoResumen from '../components/PasoResumenV1.vue'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'

const rdc = useRdcStore()
const route = useRoute()
const router = useRouter()

// Bitácora (hitos + línea del día) va antes que Metrado, pero ya conectados:
// lo que se reporta en Metrado aparece solo en la Bitácora. La navegación es
// libre: ningún paso se bloquea ni exige datos del anterior.
const PASOS = [
  { clave: 'datos', titulo: 'Datos', icono: 'ti-id-badge', componente: PasoDatos },
  { clave: 'bitacora', titulo: 'Día', icono: 'ti-notebook', componente: PasoBitacora },
  { clave: 'metrados', titulo: 'Met', icono: 'ti-ruler-measure', componente: PasoMetrados },
  { clave: 'obs', titulo: 'Obs', icono: 'ti-note', componente: PasoObservaciones },
  { clave: 'resumen', titulo: 'Resumen', icono: 'ti-send', componente: PasoResumen },
]

const paso = ref(0)
const listo = ref(false)

// Función, no un onMounted suelto: Vue Router reutiliza este componente al
// navegar entre dos rutas 'rdc-editar' con distinto :id (mismo registro de
// ruta, solo cambia el parámetro) — ej. el aviso de "ya existe un reporte
// duplicado" (ver PasoDatos.vue → irADuplicado) hace exactamente eso al
// adoptar el otro reporte. Sin esto, la URL cambiaba de verdad pero la
// pantalla se quedaba congelada mostrando el reporte VIEJO (mismo paso,
// mismo aviso de duplicado pegado) — parecía que el botón no hacía nada.
async function cargarReporte() {
  listo.value = false
  if (!rdc.catalogos) await rdc.iniciar()
  const id = route.params.id
  if (id) await rdc.abrir(id)
  if (!rdc.actual || rdc.actual.id !== id) {
    // /rdc/nuevo crea un borrador sin preguntar nada — hasta acá, siempre
    // uno nuevo. El problema: si el navegador recupera la pestaña quedada
    // en esa URL (Android mata pestañas en segundo plano todo el tiempo) y
    // ESTE dispositivo ya tenía un reporte de hoy (borrador o ya
    // finalizado), se creaba un SEGUNDO reporte para la misma fecha — el
    // primero en sincronizar se queda con el cupo (supervisor+frente+fecha
    // es único) y el otro falla para siempre con "ya existe un reporte",
    // sin que reintentar lo arregle. Reabrir lo que ya existe de hoy, en
    // vez de crear algo nuevo a ciegas, cierra esa puerta.
    const deHoy = rdc.reportes.find((r) => r.fecha === hoyLocal())
    if (deHoy?.estado === ESTADO.FINALIZADO) {
      router.replace({ name: 'rdc-detalle', params: { id: deHoy.id } })
      return
    }
    if (deHoy) await rdc.abrir(deHoy.id)
    else await rdc.nuevo()
    router.replace({ name: 'rdc-editar', params: { id: rdc.actual.id } })
    return
  }
  paso.value = rdcUi.pasoVolver ?? 0
  rdcUi.pasoVolver = null
  listo.value = true
}
onMounted(cargarReporte)
watch(() => route.params.id, cargarReporte)

const componenteActual = computed(() => PASOS[paso.value].componente)
const esUltimoPaso = computed(() => paso.value === PASOS.length - 1)

function ir(indice) {
  paso.value = indice
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
// Los pasos pueden mandar al supervisor a otro (p. ej. «Ir a Metrado»).
provide('irPaso', ir)

const esBitacora = computed(() => PASOS[paso.value].clave === 'bitacora')

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
      <div class="steps" role="tablist" aria-label="Pasos del reporte">
        <button
          v-for="(p, i) in PASOS"
          :key="p.clave"
          type="button"
          role="tab"
          class="stab"
          :class="{ now: i === paso, done: i < paso }"
          :aria-selected="i === paso"
          @click="ir(i)"
        >
          {{ p.titulo }}
        </button>
      </div>
    </div>

    <main class="content" :class="{ fit: esBitacora }" @touchstart.passive="alTocar" @touchend.passive="alSoltar">
      <p v-if="!listo" class="empty-msg">Cargando…</p>
      <component :is="componenteActual" v-else-if="rdc.actual" />
    </main>

    <!-- Anterior sigue disponible hasta enviar, incluso en el último paso
         (Resumen) — ahí no hay "Siguiente" porque ese paso ya tiene su
         propio botón "Terminado y Enviar" adentro. -->
    <div class="actionbar">
      <button type="button" class="btn btn-sec atras" :disabled="paso === 0" aria-label="Atrás" @click="ir(paso - 1)">‹ Atrás</button>
      <button v-if="!esUltimoPaso" type="button" class="btn btn-pri" @click="ir(paso + 1)">
        Continuar
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
}
/* Modo oscuro: mismo criterio que RdcListaView.vue/rdc-tema.css. */
:root[data-theme='dark'] .rdc-app.formulario {
  --bg: var(--color-bg);
  --card: var(--color-surface);
  --border-lista: var(--color-border);
  --text-2: var(--color-text-muted);
  --text-3: #6b7280;
  --ok: var(--color-success);
}
.rdc-app.formulario {
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
  background: var(--border-lista);
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

.content.fit {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.barra-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.barra-info b {
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.barra-info span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Pestañas de paso: tocables en cualquier momento. */
.steps {
  display: flex;
  gap: 6px;
}
.stab {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 0;
  border-radius: 12px;
  background: var(--border-lista);
  color: var(--text-2);
  font: inherit;
  font-weight: 800;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
}
.stab small {
  max-width: 100%;
  font-weight: 600;
  font-size: 10.5px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stab.done {
  color: var(--text);
}
.stab.now {
  background: #f5a800;
  color: #1a1206;
}
.btn-pri:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.actionbar {
  flex-shrink: 0;
  background: color-mix(in srgb, var(--card) 88%, transparent);
  -webkit-backdrop-filter: blur(18px) saturate(1.5);
  backdrop-filter: blur(18px) saturate(1.5);
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

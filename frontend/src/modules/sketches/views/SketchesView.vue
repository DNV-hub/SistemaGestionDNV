<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../../rdc/store/rdc'
import { useSketchesStore } from '../store/sketches'
import { etiquetaDesdeNombre } from '../services/sketchesService'
import '../../rdc/estilos/rdc-tema.css'
import '../../rdc/estilos/tabler-rdc.css'
import '../../rdc/estilos/complementos.css'

const rdc = useRdcStore()
const sketches = useSketchesStore()
const router = useRouter()

onMounted(() => sketches.iniciar())

const nombreFrenteActual = computed(() => sketches.nombreFrente(sketches.frenteId))
const editandoFrente = ref(!sketches.frenteId)

function alCambiarFrente(id) {
  editandoFrente.value = false
  sketches.elegirFrente(id)
}

// --- Lightbox: ver un sketch en grande, con zoom por pellizco/rueda y
// arrastre para desplazar. Réplica del comportamiento original — es lo que
// permite revisar el detalle de un plano en el celular sin tener que
// descargarlo primero.
const lightboxAbierto = ref(false)
const indiceActual = ref(null)
const fotoActual = computed(() => (indiceActual.value !== null ? sketches.fotos[indiceActual.value] : null))

const MAX_ZOOM = 5
const zoom = reactive({ scale: 1, panX: 0, panY: 0, arrastrando: false })
let mouseX0 = 0
let mouseY0 = 0
let pinchDist0 = null
let scale0 = 1
let panX0 = 0
let panY0 = 0
let touchDragId = null
let touchDragX0 = 0
let touchDragY0 = 0

function resetZoom() {
  zoom.scale = 1
  zoom.panX = 0
  zoom.panY = 0
  pinchDist0 = null
  zoom.arrastrando = false
  touchDragId = null
}

function aplicarZoom(scale, px, py) {
  const s = Math.min(MAX_ZOOM, Math.max(1, scale))
  zoom.scale = s
  zoom.panX = s <= 1 ? 0 : (px ?? zoom.panX)
  zoom.panY = s <= 1 ? 0 : (py ?? zoom.panY)
}

const transformImagen = computed(() => (zoom.scale <= 1 ? '' : `translate(${zoom.panX}px, ${zoom.panY}px) scale(${zoom.scale})`))
const cursorImagen = computed(() => (zoom.scale > 1 ? (zoom.arrastrando ? 'grabbing' : 'grab') : 'zoom-in'))

function abrirLightbox(idx) {
  indiceActual.value = idx
  lightboxAbierto.value = true
  resetZoom()
}
function cerrarLightbox() {
  lightboxAbierto.value = false
  resetZoom()
}

function alDobleClick() {
  aplicarZoom(zoom.scale > 1 ? 1 : 2.5, 0, 0)
}
function alRueda(e) {
  e.preventDefault()
  aplicarZoom(zoom.scale + (e.deltaY < 0 ? 0.3 : -0.3))
}
function alMouseDown(e) {
  if (zoom.scale <= 1) return
  e.preventDefault()
  zoom.arrastrando = true
  mouseX0 = e.clientX - zoom.panX
  mouseY0 = e.clientY - zoom.panY
}
function alMouseMove(e) {
  if (!zoom.arrastrando) return
  aplicarZoom(zoom.scale, e.clientX - mouseX0, e.clientY - mouseY0)
}
function alMouseUp() {
  zoom.arrastrando = false
}

function distanciaToque(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}
function alTouchStart(e) {
  if (e.touches.length === 2) {
    pinchDist0 = distanciaToque(e.touches)
    scale0 = zoom.scale
    panX0 = zoom.panX
    panY0 = zoom.panY
    touchDragId = null
  } else if (e.touches.length === 1 && zoom.scale > 1) {
    touchDragId = e.touches[0].identifier
    touchDragX0 = e.touches[0].clientX - zoom.panX
    touchDragY0 = e.touches[0].clientY - zoom.panY
  }
}
function alTouchMove(e) {
  if (e.touches.length === 2 && pinchDist0) {
    e.preventDefault()
    const factor = distanciaToque(e.touches) / pinchDist0
    aplicarZoom(scale0 * factor, panX0, panY0)
  } else if (e.touches.length === 1 && touchDragId !== null && zoom.scale > 1) {
    e.preventDefault()
    const t = e.touches[0]
    aplicarZoom(zoom.scale, t.clientX - touchDragX0, t.clientY - touchDragY0)
  }
}
function alTouchEnd(e) {
  if (e.touches.length < 2) pinchDist0 = null
  if (e.touches.length === 0) touchDragId = null
}

function descargarActual() {
  const s = fotoActual.value
  if (!s) return
  const a = document.createElement('a')
  a.href = `data:image/jpeg;base64,${s.contenidoArchivo}`
  a.download = s.nombre || 'sketch.jpg'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
</script>

<template>
  <div class="rdc-app">
    <div class="app">
      <header class="app-header" style="position: relative; padding-left: 44px; padding-right: 44px">
        <button class="volver-circular" aria-label="Volver" @click="router.back()"><i class="ti ti-arrow-left" /></button>
        <div class="app-logo"><i class="ti ti-photo" /><h1>Sketch's</h1></div>
        <p>Últimos sketches de avance por frente</p>
      </header>

      <div class="card">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px">
          <div class="card-title" style="margin: 0; flex: 1"><i class="ti ti-photo" />Últimos Sketches</div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text3)">
            <span v-if="!editandoFrente" style="font-size: 12px; color: var(--text2); font-weight: 500">{{ nombreFrenteActual }}</span>
            <button type="button" class="cambiar-frente" @click="editandoFrente = !editandoFrente">{{ nombreFrenteActual ? 'cambiar' : 'elegir frente' }}</button>
          </div>
        </div>

        <div v-if="editandoFrente" style="margin-bottom: 10px">
          <select :value="sketches.frenteId" style="width: 100%; font-size: 13px; padding: 6px" @change="alCambiarFrente($event.target.value)">
            <option value="">— Seleccionar frente —</option>
            <option v-for="f in rdc.catalogos?.frentes ?? []" :key="f.id" :value="f.id">{{ f.nombre }}</option>
          </select>
        </div>

        <p v-if="!sketches.frenteId" class="empty-msg">Selecciona un frente para ver sus sketches.</p>
        <p v-else-if="sketches.cargando" class="empty-msg"><i class="ti ti-loader-2" /> Cargando sketches anteriores…</p>
        <div v-else-if="sketches.error" class="alert alert-red"><i class="ti ti-alert-triangle" /><span>{{ sketches.error }}</span></div>
        <p v-else-if="!sketches.fotos.length" class="empty-msg">Aún no hay sketches registrados para este frente.</p>

        <template v-else>
          <div class="sketches-grid">
            <div v-for="(s, idx) in sketches.fotos" :key="idx" class="sketch-item">
              <div class="sketch-thumb" @click="abrirLightbox(idx)">
                <img :src="`data:image/jpeg;base64,${s.contenidoArchivo}`" :alt="s.nombre || ''" />
              </div>
              <div v-if="etiquetaDesdeNombre(s.nombre)" class="sketch-etiqueta">{{ etiquetaDesdeNombre(s.nombre) }}</div>
            </div>
          </div>

          <div v-if="sketches.hayMas" style="text-align: center; margin-top: 12px">
            <button type="button" class="secondary-btn" :disabled="sketches.cargandoMas" @click="sketches.cargarMas()">
              <i class="ti ti-clock-down" /> {{ sketches.cargandoMas ? 'Cargando…' : 'Ver más antiguos' }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Lightbox -->
    <div v-if="lightboxAbierto" class="lightbox" @click.self="cerrarLightbox">
      <button type="button" class="lightbox-cerrar" aria-label="Cerrar" @click="cerrarLightbox"><i class="ti ti-x" /></button>
      <img
        v-if="fotoActual"
        class="lightbox-img"
        :src="`data:image/jpeg;base64,${fotoActual.contenidoArchivo}`"
        :alt="fotoActual.nombre || ''"
        :style="{ transform: transformImagen, cursor: cursorImagen }"
        @dblclick.stop="alDobleClick"
        @wheel="alRueda"
        @mousedown="alMouseDown"
        @mousemove="alMouseMove"
        @mouseup="alMouseUp"
        @mouseleave="alMouseUp"
        @touchstart.passive="alTouchStart"
        @touchmove="alTouchMove"
        @touchend="alTouchEnd"
      />
      <div class="lightbox-pie">
        <span class="lightbox-nombre">{{ fotoActual?.nombre || '' }}</span>
        <button type="button" class="secondary-btn" @click="descargarActual"><i class="ti ti-download" /> Descargar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  padding: 0 12px 24px;
}
.volver-circular {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 38px;
  height: 38px;
  border: none;
  background: var(--blue);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  box-shadow: 0 2px 8px rgb(30 41 59 / 0.35);
  font-size: 19px;
}
.cambiar-frente {
  font-size: 11px;
  color: var(--blue);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  text-decoration: underline;
}
.sketches-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.sketch-thumb {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  aspect-ratio: 1 / 1;
  background: var(--surface2);
  cursor: pointer;
}
.sketch-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sketch-etiqueta {
  font-size: 10.5px;
  color: var(--text3);
  text-align: center;
  margin-top: 4px;
  line-height: 1.3;
}

.lightbox {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.92);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.lightbox-cerrar {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.15);
  color: #fff;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.lightbox-img {
  max-width: 92vw;
  max-height: 78vh;
  object-fit: contain;
  transition: transform 0.15s;
  touch-action: none;
  user-select: none;
}
.lightbox-pie {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  color: #fff;
  max-width: 92vw;
}
.lightbox-nombre {
  font-size: 12px;
  color: rgb(255 255 255 / 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

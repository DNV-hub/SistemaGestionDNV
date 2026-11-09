<script setup>
import { computed, reactive, watch } from 'vue'

// Visor a pantalla completa con zoom por pellizco/rueda y arrastre para
// desplazar (el mismo que tenía la pantalla Sketch's). Recibe la lista de
// imágenes ({ nombre, contenidoArchivo } en base64 JPEG) y la posición a abrir.
const props = defineProps({
  fotos: { type: Array, required: true },
  indice: { type: Number, default: null },
})
const emit = defineEmits(['cerrar'])

const foto = computed(() => (props.indice !== null ? props.fotos[props.indice] : null))

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
watch(() => props.indice, resetZoom)

function aplicarZoom(scale, px, py) {
  const s = Math.min(MAX_ZOOM, Math.max(1, scale))
  zoom.scale = s
  zoom.panX = s <= 1 ? 0 : (px ?? zoom.panX)
  zoom.panY = s <= 1 ? 0 : (py ?? zoom.panY)
}

const transformImagen = computed(() => (zoom.scale <= 1 ? '' : `translate(${zoom.panX}px, ${zoom.panY}px) scale(${zoom.scale})`))
const cursorImagen = computed(() => (zoom.scale > 1 ? (zoom.arrastrando ? 'grabbing' : 'grab') : 'zoom-in'))

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
    aplicarZoom(scale0 * (distanciaToque(e.touches) / pinchDist0), panX0, panY0)
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

function descargar() {
  const s = foto.value
  if (!s) return
  const a = document.createElement('a')
  a.href = `data:image/jpeg;base64,${s.contenidoArchivo}`
  a.download = s.nombre || 'imagen.jpg'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
</script>

<template>
  <div v-if="foto" class="lightbox" @click.self="emit('cerrar')">
    <button type="button" class="lightbox-cerrar" aria-label="Cerrar" @click="emit('cerrar')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
    <img
      class="lightbox-img"
      :src="`data:image/jpeg;base64,${foto.contenidoArchivo}`"
      :alt="foto.nombre || ''"
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
      <span class="lightbox-nombre">{{ foto.nombre || '' }}</span>
      <button type="button" class="lightbox-btn" @click="descargar">Descargar</button>
    </div>
  </div>
</template>

<style scoped>
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
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
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
.lightbox-btn {
  border: 0;
  border-radius: 12px;
  background: rgb(255 255 255 / 0.15);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 14px;
  cursor: pointer;
}
</style>

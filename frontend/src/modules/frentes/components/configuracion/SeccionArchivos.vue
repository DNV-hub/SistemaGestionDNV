<script setup>
import { ref, watch } from 'vue'
import { actualizarFrente } from '../../services/frentesService'
import { subirArchivoFrente, obtenerUrlFirmada } from '../../services/frentesArchivosService'

const props = defineProps({
  frente: { type: Object, required: true },
})
const emit = defineEmits(['actualizado'])

const carpetaFotos = ref(props.frente.carpeta_fotos ?? props.frente.nombre)
const guardandoCarpeta = ref(false)
const error = ref('')

async function guardarCarpeta() {
  guardandoCarpeta.value = true
  error.value = ''
  try {
    const actualizado = await actualizarFrente(props.frente.id, { carpeta_fotos: carpetaFotos.value.trim() || null })
    emit('actualizado', actualizado)
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo guardar el nombre de la carpeta.'
  } finally {
    guardandoCarpeta.value = false
  }
}

const urlMapa = ref('')
const urlFirma = ref('')
const subiendoMapa = ref(false)
const subiendoFirma = ref(false)

async function cargarUrls() {
  try {
    urlMapa.value = await obtenerUrlFirmada(props.frente.mapa_sector_url)
    urlFirma.value = await obtenerUrlFirmada(props.frente.firma_residente_url)
  } catch (e) {
    console.error(e)
  }
}
cargarUrls()
watch(() => [props.frente.mapa_sector_url, props.frente.firma_residente_url], cargarUrls)

async function subirMapa(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  subiendoMapa.value = true
  error.value = ''
  try {
    const ruta = await subirArchivoFrente(props.frente.id, 'mapa-sector', file)
    const actualizado = await actualizarFrente(props.frente.id, { mapa_sector_url: ruta })
    emit('actualizado', actualizado)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo subir el mapa${e?.message ? ': ' + e.message : '.'}`
  } finally {
    subiendoMapa.value = false
    ev.target.value = ''
  }
}

async function subirFirma(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  subiendoFirma.value = true
  error.value = ''
  try {
    const ruta = await subirArchivoFrente(props.frente.id, 'firma-residente', file)
    const actualizado = await actualizarFrente(props.frente.id, { firma_residente_url: ruta })
    emit('actualizado', actualizado)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo subir la firma${e?.message ? ': ' + e.message : '.'}`
  } finally {
    subiendoFirma.value = false
    ev.target.value = ''
  }
}
</script>

<template>
  <!-- 3 raíces a propósito (ver el comentario en FichaConfiguracion.vue):
       cada <section> cae como su propia celda en la grilla del padre. -->
  <section class="tarjeta">
    <h2>Carpeta de fotos</h2>
    <label class="campo">
      Nombre exacto de la carpeta en Fotos RDC
      <input v-model="carpetaFotos" type="text" :disabled="guardandoCarpeta" @blur="guardarCarpeta" />
    </label>
    <p class="nota">Ruta: 06 Reportes llenados de campo / Fotos RDC / &lt;fecha&gt; / {{ carpetaFotos || frente.nombre }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </section>

  <section class="tarjeta">
    <h2>Mapa del sector</h2>
    <div class="dropzone">
      <img v-if="urlMapa" :src="urlMapa" alt="Mapa del sector" class="preview" />
      <template v-else>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
        <div class="titulo-dz">Imagen del área de trabajo</div>
        <div class="subtitulo-dz">Se usa en la sección IV del RD</div>
      </template>
      <label class="boton-subir">
        {{ subiendoMapa ? 'Subiendo…' : urlMapa ? 'Reemplazar archivo' : 'Subir archivo' }}
        <input type="file" accept="image/*" :disabled="subiendoMapa" @change="subirMapa" />
      </label>
    </div>
  </section>

  <section class="tarjeta">
    <h2>Firma del residente</h2>
    <div class="dropzone">
      <img v-if="urlFirma" :src="urlFirma" alt="Firma del residente" class="preview" />
      <template v-else>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 10-10a2 2 0 00-3-3L5 16l-1 4z"/></svg>
        <div class="titulo-dz">Firma escaneada</div>
        <div class="subtitulo-dz">PNG con fondo transparente</div>
      </template>
      <label class="boton-subir">
        {{ subiendoFirma ? 'Subiendo…' : urlFirma ? 'Reemplazar archivo' : 'Subir archivo' }}
        <input type="file" accept="image/*" :disabled="subiendoFirma" @change="subirFirma" />
      </label>
    </div>
  </section>
</template>

<style scoped>
.tarjeta {
  background: var(--p-card);
  box-shadow: 0 0 0 1px var(--p-line);
  border-radius: 20px;
  padding: 24px;
}
h2 {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--p-text);
}
.error {
  color: var(--p-danger);
  font-size: 0.85rem;
  margin: 10px 0 0;
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  color: var(--p-muted);
}
.campo input {
  min-height: 44px;
  background: var(--p-hover);
  color: var(--p-text);
  border: 1px solid var(--p-line);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 13.5px;
}
.nota {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--p-muted);
}
.dropzone {
  border: 1.5px dashed var(--p-line);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  color: var(--p-muted);
}
.preview {
  max-width: 100%;
  max-height: 140px;
  object-fit: contain;
  border-radius: 10px;
  background: var(--p-hover);
}
.titulo-dz {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--p-text);
}
.subtitulo-dz {
  font-size: 12.5px;
}
.boton-subir {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--p-hover);
  color: var(--p-text);
  border: 1px solid var(--p-line);
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  overflow: hidden;
}
.boton-subir input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>

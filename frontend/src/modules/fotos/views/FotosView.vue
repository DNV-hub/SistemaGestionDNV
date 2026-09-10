<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../store/auth'
import { useRdcStore } from '../../rdc/store/rdc'
import { useFotosStore } from '../store/fotos'
import { FOTO_TIPOS } from '../services/fotosConstantes'
import { ENVIO } from '../services/fotosDb'
import '../../rdc/estilos/rdc-tema.css'
import '../../rdc/estilos/tabler-rdc.css'
import '../../rdc/estilos/complementos.css'

const auth = useAuthStore()
const rdc = useRdcStore()
const fotos = useFotosStore()
const router = useRouter()

onMounted(() => fotos.iniciar())

const nombreSupervisor = computed(() => {
  const supervisor = (rdc.catalogos?.supervisores ?? []).find((s) => s.usuario_id === auth.perfil?.id)
  return supervisor?.nombre ?? auth.perfil?.nombre ?? '—'
})
const nombreFrente = computed(() => (rdc.catalogos?.frentes ?? []).find((f) => f.id === fotos.frenteId)?.nombre ?? '')

// Un solo bloque abierto a la vez — mismo comportamiento que _togFotoBloque()
// en el original.
const bloqueAbierto = ref('diarias')
const alternarBloque = (b) => (bloqueAbierto.value = bloqueAbierto.value === b ? null : b)

// Un solo objeto (no refs sueltas) para guardar los <input type="file">: con
// varios inputs generados dinámicamente (los tres del sketch), una ref por
// clave con "function ref" es más simple que declarar cinco refs distintas.
const inputsFile = {}
const fijarInputRef = (clave) => (el) => {
  inputsFile[clave] = el
}
const abrirSelector = (clave) => inputsFile[clave]?.click()

async function alSeleccionar(tipo, event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  await fotos.agregarFotos(tipo, files)
}

const contador = (tipo) => fotos.seleccion[tipo].length
const sketchTotal = computed(() => contador('sketch_perf') + contador('sketch_iny') + contador('sketch_malla'))

const enviando = ref(false)
const error = ref('')
const exito = ref(false)

async function alEnviar() {
  error.value = ''
  exito.value = false
  enviando.value = true
  try {
    await fotos.enviar()
    exito.value = true
  } catch (e) {
    error.value = e.message ?? String(e)
  } finally {
    enviando.value = false
  }
}

function detalleEnvio(e) {
  const parte = e.estado === ENVIO.ENVIADO ? 'enviado' : e.estado === ENVIO.ERROR ? `error — ${e.error ?? 'sin detalle'}` : 'pendiente'
  return `${e.etiqueta}: ${parte}`
}
</script>

<template>
  <div class="rdc-app">
    <div class="app">
      <header class="app-header" style="position: relative; padding-left: 44px; padding-right: 44px">
        <button class="volver-circular" aria-label="Volver" @click="router.back()"><i class="ti ti-arrow-left" /></button>
        <div class="app-logo"><i class="ti ti-camera" /><h1>Registro Fotográfico</h1></div>
        <p>Evidencia fotográfica de campo</p>
      </header>

      <div class="supervisor-banner-fotos">
        <div style="flex: 1; min-width: 0">
          <div class="sup-tipo-lbl">Supervisor</div>
          <div class="sup-valor">{{ nombreSupervisor }}</div>
        </div>
        <div style="text-align: right; min-width: 0">
          <div class="sup-tipo-lbl">Frente</div>
          <div class="sup-valor-frente">{{ nombreFrente || '—' }}</div>
        </div>
      </div>

      <div class="card" style="padding: 10px 14px; margin-bottom: 12px">
        <div class="grid2">
          <div class="field" style="margin: 0">
            <label style="font-size: 11px">Fecha</label>
            <input v-model="fotos.fecha" type="date" />
          </div>
          <div class="field" style="margin: 0">
            <label style="font-size: 11px">Frente</label>
            <select v-model="fotos.frenteId">
              <option :value="null">— Seleccionar —</option>
              <option v-for="f in rdc.catalogos?.frentes ?? []" :key="f.id" :value="f.id">{{ f.nombre }}</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="fotos.hayPendientes" class="alert alert-amber">
        <i class="ti ti-cloud-off" />
        <span>
          Hay fotos esperando salir. Se enviarán solas en cuanto haya señal.
          <button class="secondary-btn" style="margin-top: 6px; padding: 6px 10px; font-size: 12px" @click="fotos.sincronizarAhora()">
            <i class="ti ti-refresh" /> Reintentar ahora
          </button>
        </span>
      </div>

      <!-- FOTOS DIARIAS -->
      <div class="card blq-card" style="border-left-color: #2563eb">
        <div class="blq-head" @click="alternarBloque('diarias')">
          <span class="blq-titulo" style="color: #2563eb; text-transform: none; font-size: 14px"><i class="ti ti-photo" />Fotos diarias</span>
          <span v-if="contador('diarias')" class="conteo-verde">{{ contador('diarias') }}</span>
          <i class="ti" :class="bloqueAbierto === 'diarias' ? 'ti-chevron-up' : 'ti-chevron-down'" />
        </div>
        <div v-if="bloqueAbierto === 'diarias'" style="margin-top: 12px">
          <div class="alert alert-red" style="margin-bottom: 10px">
            <span><strong>Obligatorio:</strong> una foto debe ser del inicio de la charla de seguridad.</span>
          </div>
          <input :ref="fijarInputRef('diarias')" type="file" accept="image/*" multiple style="display: none" @change="alSeleccionar('diarias', $event)" />
          <button type="button" class="add-btn" @click="abrirSelector('diarias')"><i class="ti ti-circle-plus" /> Seleccionar fotos</button>
          <div class="miniaturas">
            <div v-for="f in fotos.seleccion.diarias" :key="f.id" class="miniatura">
              <img :src="f.previewUrl" alt="" />
              <button type="button" aria-label="Quitar" @click="fotos.quitarFoto('diarias', f.id)"><i class="ti ti-x" /></button>
            </div>
          </div>
        </div>
      </div>

      <!-- REDLINE -->
      <div class="card blq-card" style="border-left-color: #dc2626">
        <div class="blq-head" @click="alternarBloque('redline')">
          <span class="blq-titulo" style="color: #dc2626; text-transform: none; font-size: 14px"><i class="ti ti-pencil-exclamation" />Redline</span>
          <span v-if="contador('redline')" class="conteo-verde">{{ contador('redline') }}</span>
          <i class="ti" :class="bloqueAbierto === 'redline' ? 'ti-chevron-up' : 'ti-chevron-down'" />
        </div>
        <div v-if="bloqueAbierto === 'redline'" style="margin-top: 12px">
          <p class="note" style="margin-bottom: 10px">Opcional. Fotos de planos con modificaciones marcadas en rojo.</p>
          <input :ref="fijarInputRef('redline')" type="file" accept="image/*" multiple style="display: none" @change="alSeleccionar('redline', $event)" />
          <button type="button" class="add-btn" @click="abrirSelector('redline')"><i class="ti ti-circle-plus" /> Seleccionar fotos</button>
          <div class="miniaturas">
            <div v-for="f in fotos.seleccion.redline" :key="f.id" class="miniatura">
              <img :src="f.previewUrl" alt="" />
              <button type="button" aria-label="Quitar" @click="fotos.quitarFoto('redline', f.id)"><i class="ti ti-x" /></button>
            </div>
          </div>
        </div>
      </div>

      <!-- SKETCH DE AVANCE -->
      <div class="card blq-card" style="border-left-color: #059669">
        <div class="blq-head" @click="alternarBloque('sketch')">
          <span class="blq-titulo" style="color: #059669; text-transform: none; font-size: 14px"><i class="ti ti-ruler-measure" />Sketch de avance</span>
          <span v-if="sketchTotal" class="conteo-verde">{{ sketchTotal }}</span>
          <i class="ti" :class="bloqueAbierto === 'sketch' ? 'ti-chevron-up' : 'ti-chevron-down'" />
        </div>
        <div v-if="bloqueAbierto === 'sketch'" style="margin-top: 12px">
          <p class="note" style="margin-bottom: 12px">Opcional. Toca el tipo para agregar fotos del sketch.</p>
          <div class="sketch-tipos">
            <div v-for="(t, clave) in { sketch_perf: 'Perforación', sketch_iny: 'Inyección', sketch_malla: 'Malla' }" :key="clave">
              <input :ref="fijarInputRef(clave)" type="file" accept="image/*" multiple style="display: none" @change="alSeleccionar(clave, $event)" />
              <button type="button" class="sketch-tipo-btn" :class="{ conFotos: contador(clave) }" @click="abrirSelector(clave)">
                <span>{{ t }}</span>
                <span v-if="contador(clave)" class="conteo-verde">{{ contador(clave) }}</span>
              </button>
              <div class="miniaturas miniaturas-chicas">
                <div v-for="f in fotos.seleccion[clave]" :key="f.id" class="miniatura">
                  <img :src="f.previewUrl" alt="" />
                  <button type="button" aria-label="Quitar" @click="fotos.quitarFoto(clave, f.id)"><i class="ti ti-x" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="error" class="alert alert-red" style="margin-top: 12px"><i class="ti ti-alert-triangle" /><span>{{ error }}</span></div>
      <div v-if="exito" class="alert alert-green" style="margin-top: 12px"><i class="ti ti-circle-check" /><span>Fotos enviadas correctamente.</span></div>

      <div class="bottom-actions" style="margin-top: 16px">
        <button type="button" class="nav-btn primary" :disabled="enviando || !fotos.seleccion.diarias.length" @click="alEnviar">
          <i class="ti ti-send" />{{ enviando ? 'Enviando…' : 'Enviar fotos' }}
        </button>
      </div>

      <div v-if="fotos.envios.length" class="card" style="margin-top: 16px">
        <div class="card-title"><i class="ti ti-history" />Envíos recientes</div>
        <ul class="lista-filas">
          <li v-for="e in fotos.envios" :key="e.id" :title="detalleEnvio(e)">
            <span>{{ e.etiqueta }} — {{ e.frenteNombre }} ({{ e.fecha }})</span>
            <span class="estado-pill" :class="e.estado">{{ e.estado === ENVIO.ENVIADO ? 'Enviado' : e.estado === ENVIO.ERROR ? 'Con problemas' : 'Pendiente' }}</span>
          </li>
        </ul>
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
.supervisor-banner-fotos {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border-radius: var(--r-lg);
  padding: 12px 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.sup-tipo-lbl {
  font-size: 10px;
  font-weight: 600;
  color: rgb(255 255 255 / 0.65);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 1px;
}
.sup-valor {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sup-valor-frente {
  font-size: 13px;
  font-weight: 600;
  color: rgb(255 255 255 / 0.9);
  max-width: 150px;
  line-height: 1.25;
  word-break: break-word;
}
.conteo-verde {
  font-size: 11px;
  font-weight: 700;
  color: var(--green-text);
  background: var(--green-bg);
  padding: 2px 8px;
  border-radius: 99px;
}
.miniaturas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.miniaturas-chicas {
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
  margin-top: 8px;
}
.miniatura {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  aspect-ratio: 1 / 1;
  background: var(--surface2);
}
.miniatura img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.miniatura button {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgb(17 24 39 / 0.65);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.sketch-tipos {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.sketch-tipo-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 14px 6px;
  border: 2px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text2);
  min-height: 72px;
}
.sketch-tipo-btn.conFotos {
  border-color: var(--green);
  background: var(--green-bg);
  color: var(--green-text);
}
.estado-pill {
  font-size: 10px;
  font-weight: 800;
  padding: 4px 9px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.estado-pill.pendiente {
  background: var(--amber-bg);
  color: var(--amber-text);
}
.estado-pill.enviado {
  background: var(--green-bg);
  color: var(--green-text);
}
.estado-pill.error {
  background: var(--red-bg);
  color: var(--red-text);
}
</style>

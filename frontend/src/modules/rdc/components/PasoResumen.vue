<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { ENVIO, ESTADO } from '../services/rdcDb'
import { hoyLocal } from '../services/rdcRepository'
import { descargarWorkbook } from '../services/rdcExcel'
import { fmtHm, nombreDe, partidasEjecutadas, textoWhatsapp, tiempoEfectivoMin, totalPersonal, totalStandbyMin } from '../services/rdcCalculos'

const rdc = useRdcStore()
const router = useRouter()
const reporte = computed(() => rdc.actual)
const enviando = ref(false)
const copiado = ref(false)

const ejecutadas = computed(() => partidasEjecutadas(reporte.value))
const texto = computed(() => textoWhatsapp(reporte.value, rdc.catalogos))

const metricas = computed(() => [
  { etiqueta: 'Personal', valor: totalPersonal(reporte.value) },
  { etiqueta: 'Partidas ejecutadas', valor: ejecutadas.value.length },
  { etiqueta: 'Elementos', valor: reporte.value.elementos.length },
  { etiqueta: 'Tiempo efectivo', valor: fmtHm(tiempoEfectivoMin(reporte.value)) },
  { etiqueta: 'Stand by', valor: fmtHm(totalStandbyMin(reporte.value)) },
])

const faltantes = computed(() => {
  const f = []
  if (!reporte.value.fecha) f.push('la fecha')
  if (!reporte.value.frenteId) f.push('el frente')
  if (!reporte.value.supervisorId) f.push('el supervisor responsable')
  return f
})

const cerrado = computed(() => reporte.value.estado === ESTADO.FINALIZADO)
const estadoEnvio = computed(() => {
  const r = reporte.value
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return 'enviado'
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return 'error'
  return 'pendiente'
})

function descargar() {
  descargarWorkbook(reporte.value, rdc.catalogos)
}

async function copiar() {
  await navigator.clipboard.writeText(texto.value)
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2000)
}

/** Igual que en el RDC actual: si la fecha no es la de hoy se pide
 * confirmación. Frena el error de dejar la fecha de ayer sin darse cuenta, sin
 * impedir el caso legítimo del reporte atrasado. */
function fechaConfirmada() {
  const hoy = hoyLocal()
  if (reporte.value.fecha === hoy) return true
  const anterior = reporte.value.fecha < hoy
  return confirm(
    anterior
      ? `La fecha de este reporte es ${reporte.value.fecha}, anterior a hoy (${hoy}).\n\n¿Es correcto? (por ejemplo, un reporte atrasado)`
      : `La fecha de este reporte es ${reporte.value.fecha}, posterior a hoy (${hoy}).\n\nNormalmente esto es un error de tipeo. ¿Confirmas la fecha?`,
  )
}

async function terminar() {
  if (faltantes.value.length) return
  if (!fechaConfirmada()) return
  enviando.value = true
  try {
    await rdc.finalizar()
  } finally {
    enviando.value = false
  }
}

function volverALista() {
  router.push({ name: 'rdc' })
}
</script>

<template>
  <div v-if="reporte">
    <div class="card">
      <div class="card-title">Resumen del día</div>
      <div class="metricas">
        <div v-for="m in metricas" :key="m.etiqueta" class="metrica">
          <span class="valor">{{ m.valor }}</span>
          <span class="etiqueta">{{ m.etiqueta }}</span>
        </div>
      </div>
      <p class="note">
        {{ nombreDe(rdc.catalogos, 'frentes', reporte.frenteId) || 'Sin frente' }} ·
        {{ nombreDe(rdc.catalogos, 'supervisores', reporte.supervisorId) || 'Sin supervisor' }}
      </p>
    </div>

    <div class="card">
      <div class="card-title">Metrados ejecutados</div>
      <ul v-if="ejecutadas.length" class="lista-filas">
        <li v-for="(p, i) in ejecutadas" :key="i">
          <span>{{ p.nombre }}<em v-if="p.manual"> (nueva)</em></span>
          <strong>{{ p.met }} {{ p.um }}</strong>
        </li>
      </ul>
      <p v-else class="empty-msg">Todavía no registraste metrados.</p>
    </div>

    <div class="card">
      <div class="card-title">Reporte para WhatsApp</div>
      <pre class="wsp">{{ texto }}</pre>
      <button type="button" class="secondary-btn" @click="copiar">{{ copiado ? 'Copiado ✓' : 'Copiar texto' }}</button>
    </div>

    <div class="card cierre">
      <div class="card-title">Cerrar el reporte</div>

      <p v-if="faltantes.length" class="aviso-error">Antes de cerrar falta completar: {{ faltantes.join(', ') }}.</p>

      <template v-else-if="!cerrado">
        <p class="note">
          Al cerrarlo se guarda y se manda solo en cuanto haya señal. No necesitas esperar con la aplicación abierta.
        </p>
        <div class="botones">
          <button type="button" class="secondary-btn" @click="descargar">Descargar mi copia</button>
          <button type="button" class="btn-primary" :disabled="enviando" @click="terminar">
            {{ enviando ? 'Cerrando…' : 'Terminar y enviar' }}
          </button>
        </div>
      </template>

      <template v-else>
        <p class="estado" :class="estadoEnvio">
          <template v-if="estadoEnvio === 'enviado'">Reporte enviado. Llegó al Sistema y a SharePoint.</template>
          <template v-else-if="estadoEnvio === 'error'">
            Hubo un problema al enviarlo. Está guardado y se reintentará solo; tu información no se perdió.
          </template>
          <template v-else>Guardado y en cola. Se enviará en cuanto haya señal.</template>
        </p>
        <div class="botones">
          <button type="button" class="secondary-btn" @click="descargar">Descargar mi copia</button>
          <button type="button" class="btn-primary" @click="volverALista">Volver a la lista</button>
        </div>
      </template>
    </div>
  </div>
</template>


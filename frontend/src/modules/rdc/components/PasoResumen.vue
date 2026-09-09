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
    <section class="tarjeta">
      <h2>Resumen del día</h2>
      <div class="metricas">
        <div v-for="m in metricas" :key="m.etiqueta" class="metrica">
          <span class="valor">{{ m.valor }}</span>
          <span class="etiqueta">{{ m.etiqueta }}</span>
        </div>
      </div>
      <p class="ayuda">
        {{ nombreDe(rdc.catalogos, 'frentes', reporte.frenteId) || 'Sin frente' }} ·
        {{ nombreDe(rdc.catalogos, 'supervisores', reporte.supervisorId) || 'Sin supervisor' }}
      </p>
    </section>

    <section class="tarjeta">
      <h2>Metrados ejecutados</h2>
      <ul v-if="ejecutadas.length" class="lista-filas">
        <li v-for="(p, i) in ejecutadas" :key="i">
          <span>{{ p.nombre }}<em v-if="p.manual"> (nueva)</em></span>
          <strong>{{ p.met }} {{ p.um }}</strong>
        </li>
      </ul>
      <p v-else class="vacio">Todavía no registraste metrados.</p>
    </section>

    <section class="tarjeta">
      <h2>Reporte para WhatsApp</h2>
      <pre class="wsp">{{ texto }}</pre>
      <button type="button" class="boton-secundario" @click="copiar">{{ copiado ? 'Copiado ✓' : 'Copiar texto' }}</button>
    </section>

    <section class="tarjeta cierre">
      <h2>Cerrar el reporte</h2>

      <p v-if="faltantes.length" class="aviso-error">Antes de cerrar falta completar: {{ faltantes.join(', ') }}.</p>

      <template v-else-if="!cerrado">
        <p class="ayuda">
          Al cerrarlo se guarda y se manda solo en cuanto haya señal. No necesitas esperar con la aplicación abierta.
        </p>
        <div class="botones">
          <button type="button" class="boton-secundario" @click="descargar">Descargar mi copia</button>
          <button type="button" class="boton-principal" :disabled="enviando" @click="terminar">
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
          <button type="button" class="boton-secundario" @click="descargar">Descargar mi copia</button>
          <button type="button" class="boton-principal" @click="volverALista">Volver a la lista</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
@import './formulario.css';

.metricas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.6rem;
}
.metrica {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.7rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
}
.metrica .valor {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text);
}
.metrica .etiqueta {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}
.wsp {
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  padding: 0.75rem;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
  margin: 0 0 0.6rem;
  font-family: inherit;
  color: var(--color-text);
}
.cierre .botones {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.aviso-error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-control);
  font-size: 0.85rem;
  margin: 0;
}
.estado {
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-control);
  font-size: 0.85rem;
  margin: 0;
}
.estado.enviado {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.estado.pendiente {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.estado.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .cierre .botones {
    flex-direction: column;
  }
  .cierre .botones button {
    width: 100%;
    padding: 0.85rem;
  }
}
</style>

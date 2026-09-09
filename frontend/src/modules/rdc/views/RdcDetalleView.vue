<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { obtenerReporteCompleto } from '../services/rdcService'
import { descargarWorkbook } from '../services/rdcExcel'
import { ENVIO } from '../services/rdcDb'
import { fmtHm, nombreDe, partidasEjecutadas, textoWhatsapp, tiempoEfectivoMin, totalPersonal, totalStandbyMin } from '../services/rdcCalculos'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'

const rdc = useRdcStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const reporte = ref(null)
const cargando = ref(true)
const error = ref('')

onMounted(async () => {
  if (!rdc.catalogos) await rdc.iniciar()

  // Primero el dispositivo: si el reporte se llenó acá, esa copia trae el
  // estado de envío más fresco. Si no está, se busca en el servidor — es el
  // caso de Planeamiento o Consulta, que ven reportes ajenos.
  reporte.value = await rdc.abrir(route.params.id)
  if (!reporte.value) {
    try {
      reporte.value = await obtenerReporteCompleto(route.params.id)
      if (!reporte.value) error.value = 'No se encontró el reporte.'
    } catch {
      error.value = 'El reporte no está en este dispositivo y no hay conexión para buscarlo.'
    }
  }
  cargando.value = false
})

const nombre = (clave, id) => nombreDe(rdc.catalogos, clave, id) || '—'
const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')

const ejecutadas = computed(() => (reporte.value ? partidasEjecutadas(reporte.value) : []))
const metricas = computed(() =>
  reporte.value
    ? [
        { etiqueta: 'Personal', valor: totalPersonal(reporte.value) },
        { etiqueta: 'Partidas', valor: ejecutadas.value.length },
        { etiqueta: 'Elementos', valor: reporte.value.elementos.length },
        { etiqueta: 'T. efectivo', valor: fmtHm(tiempoEfectivoMin(reporte.value)) },
        { etiqueta: 'Stand by', valor: fmtHm(totalStandbyMin(reporte.value)) },
      ]
    : [],
)

const estadoEnvio = computed(() => {
  const r = reporte.value
  if (!r) return 'pendiente'
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return 'enviado'
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return 'error'
  return 'pendiente'
})

// Solo se corrige un reporte propio que está en este dispositivo: la
// corrección se vuelve a enviar desde acá.
const puedeCorregir = computed(
  () => !!reporte.value && rdc.reportes.some((r) => r.id === reporte.value.id) && auth.tienePermiso('rdc.editar_propio'),
)

async function corregir() {
  const confirmado = confirm(
    'Vas a reabrir este reporte para corregirlo.\n\nNo se borra nada de lo que escribiste. El nuevo envío se guarda como archivo NUEVO, con "(C)" al final del nombre, así queda el original y la versión corregida.\n\n¿Continuar?',
  )
  if (!confirmado) return
  await rdc.corregir(reporte.value.id)
  router.push({ name: 'rdc-editar', params: { id: reporte.value.id } })
}
</script>

<template>
  <div class="rdc-app">
    <div class="app">
      <div class="barra-superior">
        <button class="volver" @click="router.push({ name: 'rdc' })"><i class="ti ti-arrow-left" /> Mis reportes</button>
      </div>

      <p v-if="cargando" class="empty-msg">Cargando…</p>
      <div v-else-if="error" class="alert alert-red"><i class="ti ti-alert-triangle" /><span>{{ error }}</span></div>

      <template v-else-if="reporte">
        <div class="card">
          <div class="reporte-fila">
            <div>
              <div class="reporte-frente">{{ nombre('frentes', reporte.frenteId) }}</div>
              <div class="reporte-meta">
                {{ fmtFecha(reporte.fecha) }} · {{ nombre('sectores', reporte.sectorId) }} ·
                {{ nombre('supervisores', reporte.supervisorId) }}
              </div>
            </div>
            <span class="estado-pill" :class="estadoEnvio">
              {{ estadoEnvio === 'enviado' ? 'Enviado' : estadoEnvio === 'error' ? 'Con problemas' : 'Pendiente' }}
            </span>
          </div>
          <p v-if="reporte.sharepointError" class="note" style="color: var(--red-text)">SharePoint: {{ reporte.sharepointError }}</p>
        </div>

        <div class="metricas" style="margin-bottom: 12px">
          <div v-for="m in metricas" :key="m.etiqueta" class="metrica">
            <span class="valor">{{ m.valor }}</span>
            <span class="etiqueta">{{ m.etiqueta }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><i class="ti ti-ruler" />Metrados ejecutados</div>
          <ul v-if="ejecutadas.length" class="lista-filas">
            <li v-for="(p, i) in ejecutadas" :key="i">
              <span>{{ p.nombre }}</span>
              <strong>{{ p.met }} {{ p.um }}</strong>
            </li>
          </ul>
          <p v-else class="empty-msg">Sin metrados registrados.</p>
        </div>

        <div class="card">
          <div class="card-title"><i class="ti ti-brand-whatsapp" />Reporte para WhatsApp</div>
          <pre class="wsp">{{ textoWhatsapp(reporte, rdc.catalogos) }}</pre>
        </div>

        <div class="botones">
          <button class="secondary-btn" @click="descargarWorkbook(reporte, rdc.catalogos)">
            <i class="ti ti-file-spreadsheet" /> Descargar Excel
          </button>
          <button v-if="puedeCorregir" class="btn-primary" @click="corregir"><i class="ti ti-pencil" /> Corregir y reenviar</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.app {
  padding: 0 12px 24px;
}
.barra-superior {
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
.reporte-fila {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.reporte-frente {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}
.reporte-meta {
  font-size: 12px;
  color: var(--text3);
  margin-top: 2px;
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

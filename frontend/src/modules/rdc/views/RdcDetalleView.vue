<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { obtenerReporteCompleto } from '../services/rdcService'
import { descargarWorkbook } from '../services/rdcExcel'
import { ENVIO } from '../services/rdcDb'
import { fmtHm, nombreDe, partidasEjecutadas, textoWhatsapp, tiempoEfectivoMin, totalPersonal, totalStandbyMin } from '../services/rdcCalculos'

const rdc = useRdcStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const reporte = ref(null)
const cargando = ref(true)
const error = ref('')

onMounted(async () => {
  if (!rdc.catalogos) await rdc.iniciar()
  const id = route.params.id

  // Primero el dispositivo: si el reporte se llenó acá, esa copia es la que
  // tiene el estado de envío más fresco. Si no está, se busca en el servidor
  // (es el caso de Planeamiento o Consulta, que ven reportes ajenos).
  reporte.value = await rdc.abrir(id)
  if (!reporte.value) {
    try {
      reporte.value = await obtenerReporteCompleto(id)
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
        { etiqueta: 'Tiempo efectivo', valor: fmtHm(tiempoEfectivoMin(reporte.value)) },
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

// Solo tiene sentido corregir un reporte propio que está en este dispositivo:
// la corrección se vuelve a enviar desde acá.
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
  <div class="detalle">
    <header class="cabecera">
      <button class="secundario chico" @click="router.push({ name: 'rdc' })">← Volver</button>
      <h1>Reporte</h1>
    </header>

    <p v-if="cargando">Cargando…</p>
    <p v-else-if="error" class="aviso-error">{{ error }}</p>

    <template v-else-if="reporte">
      <section class="tarjeta">
        <div class="titulo-fila">
          <div>
            <p class="frente">{{ nombre('frentes', reporte.frenteId) }}</p>
            <p class="meta">
              {{ fmtFecha(reporte.fecha) }} · {{ nombre('sectores', reporte.sectorId) }} ·
              {{ nombre('supervisores', reporte.supervisorId) }}
            </p>
          </div>
          <span class="badge" :class="estadoEnvio">
            {{ estadoEnvio === 'enviado' ? 'Enviado' : estadoEnvio === 'error' ? 'Con problemas' : 'Pendiente' }}
          </span>
        </div>
        <p v-if="reporte.sharepointError" class="detalle-error">SharePoint: {{ reporte.sharepointError }}</p>
      </section>

      <section class="tarjeta">
        <div class="metricas">
          <div v-for="m in metricas" :key="m.etiqueta" class="metrica">
            <span class="valor">{{ m.valor }}</span>
            <span class="etiqueta">{{ m.etiqueta }}</span>
          </div>
        </div>
      </section>

      <section class="tarjeta">
        <h2>Metrados ejecutados</h2>
        <ul v-if="ejecutadas.length" class="lista-filas">
          <li v-for="(p, i) in ejecutadas" :key="i">
            <span>{{ p.nombre }}</span>
            <strong>{{ p.met }} {{ p.um }}</strong>
          </li>
        </ul>
        <p v-else class="vacio">Sin metrados registrados.</p>
      </section>

      <section class="tarjeta">
        <h2>Reporte para WhatsApp</h2>
        <pre class="wsp">{{ textoWhatsapp(reporte, rdc.catalogos) }}</pre>
      </section>

      <div class="acciones">
        <button class="boton-secundario" @click="descargarWorkbook(reporte, rdc.catalogos)">Descargar Excel</button>
        <button v-if="puedeCorregir" class="boton-principal" @click="corregir">Corregir y reenviar</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
@import '../components/formulario.css';

.detalle {
  padding: 1.5rem 2rem 3rem;
  max-width: 900px;
}
.cabecera {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: var(--radius-control);
  cursor: pointer;
  font-family: inherit;
}
.chico {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}
.titulo-fila {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.frente {
  margin: 0;
  font-weight: 600;
  font-size: 1rem;
  color: var(--color-text);
}
.meta {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.detalle-error {
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
  color: var(--color-danger);
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.enviado {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.pendiente {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
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
  margin: 0;
  font-family: inherit;
  color: var(--color-text);
}
.acciones {
  display: flex;
  gap: 0.5rem;
}
.aviso-error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-card);
  font-size: 0.85rem;
}

@media (max-width: 640px) {
  .detalle {
    padding: 1rem 1rem 3rem;
  }
  .acciones {
    flex-direction: column;
  }
  .acciones button {
    width: 100%;
    padding: 0.85rem;
  }
}
</style>

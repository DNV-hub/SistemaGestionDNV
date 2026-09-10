<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { ENVIO, ESTADO } from '../services/rdcDb'
import { nombreDe } from '../services/rdcCalculos'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'

const rdc = useRdcStore()
const auth = useAuthStore()
const router = useRouter()

onMounted(async () => {
  await rdc.iniciar()
  rdc.cargarHistorico()
})

const enLinea = computed(() => navigator.onLine)

/** Un reporte muestra un solo estado: lo que el supervisor necesita saber es
 * si su trabajo está a salvo, no qué destino respondió qué. El desglose de los
 * dos envíos queda en el título emergente. */
function estadoDe(r) {
  if (r.estado === ESTADO.BORRADOR) return { clave: 'borrador', texto: 'Borrador' }
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return { clave: 'enviado', texto: 'Enviado' }
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return { clave: 'error', texto: 'Con problemas' }
  return { clave: 'pendiente', texto: 'Pendiente' }
}

function detalleEnvio(r) {
  if (r.estado === ESTADO.BORRADOR) return 'Todavía no se ha cerrado.'
  const parte = (nombre, estado, error) =>
    `${nombre}: ${estado === ENVIO.ENVIADO ? 'enviado' : estado === ENVIO.ERROR ? `error — ${error ?? 'sin detalle'}` : 'pendiente'}`
  return `${parte('Sistema', r.estadoSupabase, r.errorSupabase)}\n${parte('SharePoint', r.estadoSharepoint, r.sharepointError)}`
}

const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')
const nombre = (clave, id) => nombreDe(rdc.catalogos, clave, id) || '—'

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** "10 ago 26" — el título que pidió el usuario para cada tarjeta del historial. */
function fechaCorta(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_ABREV[m - 1]} ${String(y).slice(2)}`
}
const titulo = (fechaIso, frente) => `${fechaCorta(fechaIso)} - ${frente}`

async function nuevo() {
  const reporte = await rdc.nuevo()
  router.push({ name: 'rdc-editar', params: { id: reporte.id } })
}

function abrir(r) {
  if (r.estado === ESTADO.BORRADOR) router.push({ name: 'rdc-editar', params: { id: r.id } })
  else router.push({ name: 'rdc-detalle', params: { id: r.id } })
}

async function borrar(r) {
  if (!confirm(`¿Borrar el borrador del ${fmtFecha(r.fecha)}? No se puede deshacer.`)) return
  await rdc.eliminarBorrador(r.id)
}
</script>

<template>
  <div class="rdc-app">
    <div class="app">
      <header class="app-header">
        <div class="app-logo"><i class="ti ti-clipboard-list" /><h1>Reporte Diario de Campo</h1></div>
        <p>Sostenimiento y mantenimiento de talud</p>
      </header>

      <div v-if="rdc.sinCatalogos" class="alert alert-red">
        <i class="ti ti-alert-triangle" />
        <span>Todavía no se descargaron los catálogos. Conéctate una vez a internet para poder llenar reportes sin señal después.</span>
      </div>

      <div v-if="rdc.hayPendientes" class="alert alert-amber">
        <i class="ti ti-cloud-off" />
        <span style="flex: 1">
          Hay reportes esperando salir.
          {{ enLinea ? 'Se están enviando.' : 'Se enviarán solos en cuanto haya señal — puedes cerrar la aplicación.' }}
          <br v-if="enLinea" />
          <button v-if="enLinea" class="secondary-btn" style="margin-top: 6px; padding: 6px 10px; font-size: 12px" :disabled="rdc.sincronizando" @click="rdc.sincronizarAhora()">
            <i class="ti ti-refresh" /> {{ rdc.sincronizando ? 'Enviando…' : 'Reintentar ahora' }}
          </button>
        </span>
      </div>

      <button v-if="auth.tienePermiso('rdc.crear')" class="nav-btn primary" style="margin-bottom: 12px" @click="nuevo">
        <i class="ti ti-circle-plus" /> Nuevo reporte
      </button>

      <p v-if="rdc.cargando" class="empty-msg">Cargando…</p>

      <template v-else>
        <div v-for="r in rdc.reportes" :key="r.id" class="card reporte" @click="abrir(r)">
          <div class="reporte-fila">
            <div class="reporte-datos">
              <div class="reporte-frente">{{ titulo(r.fecha, nombre('frentes', r.frenteId)) }}</div>
            </div>
            <span class="estado-pill" :class="estadoDe(r).clave" :title="detalleEnvio(r)">{{ estadoDe(r).texto }}</span>
          </div>
          <div class="reporte-acciones" @click.stop>
            <button class="secondary-btn" @click="abrir(r)">
              <i class="ti" :class="r.estado === ESTADO.BORRADOR ? 'ti-pencil' : 'ti-file-description'" />
              {{ r.estado === ESTADO.BORRADOR ? 'Continuar' : 'Ver' }}
            </button>
            <button v-if="r.estado === ESTADO.BORRADOR" class="del-btn" aria-label="Borrar borrador" @click="borrar(r)">
              <i class="ti ti-x" />
            </button>
          </div>
        </div>

        <div v-for="r in rdc.historicoRemoto" :key="r.id" class="card reporte" @click="abrir(r)">
          <div class="reporte-fila">
            <div class="reporte-datos">
              <div class="reporte-frente">{{ titulo(r.fecha, r.rdc_frentes?.nombre ?? '—') }}</div>
              <div class="reporte-meta">{{ r.rdc_supervisores?.nombre ?? '—' }}</div>
            </div>
            <span class="estado-pill" :class="r.estado_sharepoint === 'enviado' ? 'enviado' : 'pendiente'">
              {{ r.estado_sharepoint === 'enviado' ? 'Enviado' : 'Pendiente' }}
            </span>
          </div>
        </div>

        <p v-if="!rdc.reportes.length && !rdc.historicoRemoto.length" class="empty-msg">
          Todavía no hay reportes. Toca «Nuevo reporte» para empezar.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.app {
  padding: 0 12px 24px;
}
.reporte {
  cursor: pointer;
}
.reporte-fila {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.reporte-datos {
  min-width: 0;
}
.reporte-frente {
  font-size: 15px;
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
  letter-spacing: 0.03em;
  padding: 4px 9px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.estado-pill.borrador {
  background: var(--neutral-bg);
  color: var(--neutral-text);
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
.reporte-acciones {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.reporte-acciones .secondary-btn {
  padding: 7px 13px;
  font-size: 13px;
}
</style>

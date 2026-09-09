<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { ENVIO, ESTADO } from '../services/rdcDb'
import { nombreDe } from '../services/rdcCalculos'

const rdc = useRdcStore()
const auth = useAuthStore()
const router = useRouter()

onMounted(async () => {
  await rdc.iniciar()
  rdc.cargarHistorico()
})

const enLinea = computed(() => navigator.onLine)

/** Un reporte tiene un solo estado visible, que resume las dos colas: lo que
 * el supervisor necesita saber es si su trabajo está a salvo, no el detalle de
 * qué destino respondió qué. El detalle está en el tooltip. */
function estadoDe(r) {
  if (r.estado === ESTADO.BORRADOR) return { clave: 'borrador', texto: 'Borrador' }
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return { clave: 'enviado', texto: 'Enviado' }
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return { clave: 'error', texto: 'Con problemas' }
  return { clave: 'pendiente', texto: 'Pendiente de envío' }
}

function detalleEnvio(r) {
  if (r.estado === ESTADO.BORRADOR) return 'Todavía no se ha cerrado.'
  const parte = (nombre, estado, error) =>
    `${nombre}: ${estado === ENVIO.ENVIADO ? 'enviado' : estado === ENVIO.ERROR ? `error — ${error ?? 'sin detalle'}` : 'pendiente'}`
  return `${parte('Sistema', r.estadoSupabase, r.errorSupabase)}\n${parte('SharePoint', r.estadoSharepoint, r.sharepointError)}`
}

const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')

const nombre = (clave, id) => nombreDe(rdc.catalogos, clave, id) || '—'

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
  <div class="rdc">
    <header class="cabecera">
      <h1>Reporte Diario de Campo</h1>
      <button v-if="auth.tienePermiso('rdc.crear')" @click="nuevo">Nuevo reporte</button>
    </header>

    <p v-if="rdc.sinCatalogos" class="aviso aviso-error">
      Todavía no se descargaron los catálogos. Conéctate una vez a internet para poder llenar reportes sin señal después.
    </p>

    <div v-if="rdc.hayPendientes" class="aviso aviso-pendiente">
      <span>
        Hay reportes esperando salir.
        {{ enLinea ? 'Se están enviando.' : 'Se enviarán solos en cuanto haya señal — puedes cerrar la aplicación.' }}
      </span>
      <button v-if="enLinea" class="secundario" :disabled="rdc.sincronizando" @click="rdc.sincronizarAhora()">
        {{ rdc.sincronizando ? 'Enviando…' : 'Enviar ahora' }}
      </button>
    </div>

    <p v-if="rdc.cargando">Cargando…</p>

    <template v-else>
      <ul class="lista">
        <li v-for="r in rdc.reportes" :key="r.id" class="tarjeta" @click="abrir(r)">
          <div class="fila-principal">
            <div>
              <p class="frente">{{ nombre('frentes', r.frenteId) }}</p>
              <p class="meta">{{ fmtFecha(r.fecha) }} · {{ nombre('supervisores', r.supervisorId) }}</p>
            </div>
            <span class="badge" :class="estadoDe(r).clave" :title="detalleEnvio(r)">{{ estadoDe(r).texto }}</span>
          </div>
          <div class="acciones" @click.stop>
            <button v-if="r.estado === ESTADO.BORRADOR" class="secundario chico" @click="abrir(r)">Continuar</button>
            <button v-else class="secundario chico" @click="abrir(r)">Ver</button>
            <button v-if="r.estado === ESTADO.BORRADOR" class="secundario chico peligro" @click="borrar(r)">Borrar</button>
          </div>
        </li>

        <li v-for="r in rdc.historicoRemoto" :key="r.id" class="tarjeta" @click="abrir(r)">
          <div class="fila-principal">
            <div>
              <p class="frente">{{ r.rdc_frentes?.nombre ?? '—' }}</p>
              <p class="meta">{{ fmtFecha(r.fecha) }} · {{ r.rdc_supervisores?.nombre ?? '—' }}</p>
            </div>
            <span class="badge" :class="r.estado_sharepoint === 'enviado' ? 'enviado' : 'pendiente'">
              {{ r.estado_sharepoint === 'enviado' ? 'Enviado' : 'Pendiente de envío' }}
            </span>
          </div>
        </li>
      </ul>

      <p v-if="!rdc.reportes.length && !rdc.historicoRemoto.length" class="vacio">
        Todavía no hay reportes. Toca «Nuevo reporte» para empezar.
      </p>
    </template>
  </div>
</template>

<style scoped>
.rdc {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.chico {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}
.peligro {
  color: var(--color-danger);
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.aviso {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-card);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.aviso-pendiente {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.aviso-error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}
.tarjeta {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 0.8rem 0.9rem;
  cursor: pointer;
}
.fila-principal {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.frente {
  margin: 0;
  font-weight: 600;
  color: var(--color-text);
}
.meta {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.acciones {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.borrador {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.badge.pendiente {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.enviado {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
  padding: 2rem 0;
}

/* El RDC es el módulo que más se usa en celular: en pantalla chica la
   cabecera se apila y el botón principal ocupa todo el ancho, que es más
   fácil de tocar con guantes. */
@media (max-width: 640px) {
  .rdc {
    padding: 1rem;
  }
  .cabecera {
    flex-direction: column;
    align-items: stretch;
  }
  .cabecera button {
    width: 100%;
    padding: 0.8rem;
  }
}
</style>

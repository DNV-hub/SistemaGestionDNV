<script setup>
import { computed, onMounted, ref } from 'vue'
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
  if (r.estado === ESTADO.BORRADOR) {
    return r.errorSupabase ? `No se pudo guardar en la nube todavía: ${r.errorSupabase}` : 'Todavía no se ha cerrado.'
  }
  const parte = (nombre, estado, error) =>
    `${nombre}: ${estado === ENVIO.ENVIADO ? 'enviado' : estado === ENVIO.ERROR ? `error — ${error ?? 'sin detalle'}` : 'pendiente'}`
  return `${parte('Sistema', r.estadoSupabase, r.errorSupabase)}\n${parte('SharePoint', r.estadoSharepoint, r.sharepointError)}`
}

const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')
const nombre = (clave, id) => nombreDe(rdc.catalogos, clave, id) || '—'

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]
/** "10 set." — fecha corta para el título de cada tarjeta del historial. */
function fechaCorta(iso) {
  if (!iso) return '—'
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_ABREV[m - 1]}.`
}

/** Cuenta y arma el "N personas" del meta de una tarjeta. Solo existe para
 * los reportes locales — el histórico remoto no trae el detalle (traerlo
 * fila por fila sería una consulta pesada solo para una lista). */
function totalPersonal(r) {
  const total = (r.personal ?? []).reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0)
  return total > 0 ? total : null
}

/** El id del supervisor del catálogo RDC vinculado a la cuenta que está
 * mirando la lista, si tiene uno — la misma cuenta con la que `nuevo()`
 * decide de qué supervisor sale un reporte nuevo. Sirve para saber si un
 * borrador remoto (de otro dispositivo, o que esta cuenta nunca adoptó) es
 * "propio" y por lo tanto se puede ofrecer borrarlo: los locales ya vienen
 * filtrados a la propia cuenta desde el store, pero los remotos no traen
 * esa garantía en la interfaz — solo en RLS. */
const propioSupervisorId = computed(
  () => rdc.catalogos?.supervisores?.find((s) => s.usuario_id === auth.perfil?.id)?.id ?? null,
)

function esBorradorPropio(item) {
  if (item.esLocal) return true
  return item.raw.creado_por === auth.perfil?.id || item.raw.supervisor_id === propioSupervisorId.value
}

/** Historial local y remoto combinados en una sola lista cronológica
 * (más reciente primero), agrupada por mes — como pide el mockup. Cada
 * fila se normaliza a la misma forma para que la tarjeta no tenga que
 * distinguir de dónde vino. */
const historialAgrupado = computed(() => {
  const locales = rdc.reportes.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    frenteNombre: nombre('frentes', r.frenteId),
    esLocal: true,
    personas: totalPersonal(r),
    partidas: r.estado === ESTADO.FINALIZADO ? (r.metrados?.length ?? 0) : null,
    estado: estadoDe(r),
    detalleEnvio: detalleEnvio(r),
    raw: r,
  }))
  const remotos = rdc.historicoRemoto.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    frenteNombre: r.frentes?.nombre ?? '—',
    esLocal: false,
    supervisorNombre: r.rdc_supervisores?.nombre ?? '—',
    // Un borrador que llegó de otro dispositivo (ahora también se
    // sincronizan en segundo plano) tiene que decir "Borrador", no
    // "Pendiente" — ese texto es para un reporte YA cerrado que todavía no
    // salió a SharePoint, algo completamente distinto.
    estado:
      r.estado === ESTADO.BORRADOR
        ? { clave: 'borrador', texto: 'Borrador' }
        : { clave: r.estado_sharepoint === 'enviado' ? 'enviado' : 'pendiente', texto: r.estado_sharepoint === 'enviado' ? 'Enviado' : 'Pendiente' },
    raw: r,
  }))

  const todos = [...locales, ...remotos].sort((a, b) => b.fecha.localeCompare(a.fecha))

  const grupos = new Map()
  for (const item of todos) {
    const [y, m] = item.fecha.split('-')
    const clave = `${y}-${m}`
    if (!grupos.has(clave)) grupos.set(clave, { etiqueta: `${MESES_LARGOS[Number(m) - 1].toUpperCase()} ${y}`, items: [] })
    grupos.get(clave).items.push(item)
  }
  return [...grupos.values()]
})

async function nuevo() {
  const reporte = await rdc.nuevo()
  router.push({ name: 'rdc-editar', params: { id: reporte.id } })
}

function abrir(r) {
  if (r.estado === ESTADO.BORRADOR) router.push({ name: 'rdc-editar', params: { id: r.id } })
  else router.push({ name: 'rdc-detalle', params: { id: r.id } })
}

const adoptando = ref(false)

/** Un borrador remoto (viene de OTRO dispositivo) no se puede abrir en modo
 * lectura como un reporte finalizado: hay que traerlo entero y adoptarlo acá
 * para seguir editándolo. Los ya finalizados sí quedan como antes, en la
 * vista de solo lectura. */
async function abrirItem(item) {
  if (item.esLocal) {
    abrir(item.raw)
    return
  }
  if (item.raw.estado === ESTADO.BORRADOR) {
    if (adoptando.value) return
    adoptando.value = true
    try {
      const reporte = await rdc.adoptarRemoto(item.id)
      if (reporte) router.push({ name: 'rdc-editar', params: { id: reporte.id } })
    } catch (e) {
      console.error(e)
      alert('No se pudo traer ese borrador. Revisa tu conexión e intenta de nuevo.')
    } finally {
      adoptando.value = false
    }
    return
  }
  router.push({ name: 'rdc-detalle', params: { id: item.id } })
}

async function borrar(r) {
  if (!confirm(`¿Borrar el borrador del ${fmtFecha(r.fecha)}? No se puede deshacer.`)) return
  try {
    await rdc.eliminarBorrador(r.id)
  } catch (e) {
    console.error(e)
    alert(e?.message ?? 'No se pudo borrar el borrador.')
  }
}
</script>

<template>
  <div class="rdc-app">
    <header class="appbar">
      <h1>Reporte diario</h1>
      <div class="conn">
        <span class="conn-dot" :class="{ off: !enLinea }"></span>
        <span>{{ enLinea ? 'En línea' : 'Sin conexión' }}</span>
      </div>
      <button type="button" class="icon-btn" aria-label="Filtrar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h15L12 11v5.5L8 14.5V11L2.5 4.5z"/></svg>
      </button>
    </header>

    <main class="content">
      <div v-if="adoptando" class="alert alert-amber">
        <i class="ti ti-cloud-download" />
        <span>Trayendo el borrador desde el otro dispositivo…</span>
      </div>

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

      <button v-if="auth.tienePermiso('rdc.crear')" type="button" class="new-report" @click="nuevo">
        <svg width="19" height="19" viewBox="0 0 19 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9.5 4v11M4 9.5h11"/></svg>
        Nuevo reporte
      </button>

      <p v-if="rdc.cargando" class="empty-msg">Cargando…</p>

      <template v-else>
        <template v-for="grupo in historialAgrupado" :key="grupo.etiqueta">
          <div class="grp">
            <span class="grp-label">{{ grupo.etiqueta }}</span>
            <span class="grp-rule"></span>
          </div>

          <div v-for="item in grupo.items" :key="item.id" class="tarjeta" @click="abrirItem(item)">
            <div class="card-main">
              <div class="card-top">
                <span class="card-date">{{ fechaCorta(item.fecha) }}</span>
                <span class="badge" :class="item.estado.clave" :title="item.detalleEnvio">
                  <svg v-if="item.estado.clave === 'pendiente'" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 8.2a2.4 2.4 0 011.2-4.5A3.4 3.4 0 019.6 4.6a2 2 0 01.1 3.9"/><path d="M1 1l10 10"/></svg>
                  {{ item.estado.texto }}
                </span>
              </div>
              <div class="card-frente">{{ item.frenteNombre }}</div>
              <div class="card-meta">
                <template v-if="item.esLocal">
                  <span v-if="item.personas">{{ item.personas }} personas</span>
                  <span v-if="item.personas && item.partidas !== null" class="dot-sep"></span>
                  <span v-if="item.partidas !== null">{{ item.partidas }} partidas</span>
                </template>
                <span v-else>{{ item.supervisorNombre }}</span>
              </div>
              <div v-if="item.esLocal && item.raw.estado === ESTADO.BORRADOR && item.raw.errorSupabase" class="card-error">
                {{ item.raw.errorSupabase }}
              </div>
            </div>
            <button
              v-if="item.raw.estado === ESTADO.BORRADOR && esBorradorPropio(item)"
              type="button"
              class="card-borrar"
              aria-label="Borrar este borrador"
              @click.stop="borrar(item.raw)"
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5h10M6.5 5V3.5a1 1 0 011-1h2a1 1 0 011 1V5m1.5 0-.6 8.7a1.3 1.3 0 01-1.3 1.2H6.9a1.3 1.3 0 01-1.3-1.2L5 5"/></svg>
            </button>
            <svg v-else class="chev" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5L12 9l-5.5 5.5"/></svg>
          </div>
        </template>

        <p v-if="!historialAgrupado.length" class="empty-msg">
          Todavía no hay reportes. Toca «Nuevo reporte» para empezar.
        </p>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* Paleta exacta del mockup (docs/mockups/02-rdc-lista.html) — nombres
   propios (con guión) para no chocar con las variables sin guión que ya
   usa rdc-tema.css (--text2, --border, etc.), así que declarar esto acá no
   afecta a ningún otro componente del módulo. --bg sí comparte nombre con
   rdc-tema.css a propósito: es el fondo general de página, y queremos que
   ESTA pantalla (y solo esta, por ahora) use el tono nuevo. */
.rdc-app {
  /* En el celular la pantalla ya es angosta y esto no hace nada; en
     escritorio evita que las tarjetas del historial se estiren de punta a
     punta de la ventana, que es como se ve hoy — igual que ya hace
     rdc-tema.css con FotosView (`.rdc-app .app{max-width:720px}`), pero acá
     directo en la raíz porque esta pantalla no tiene ese wrapper `.app`. */
  max-width: 720px;
  margin: 0 auto;
  --bg: #f4f5f7;
  --card: #ffffff;
  --border-lista: #e4e7ec;
  --text-2: #667085;
  --text-3: #98a2b3;
  --amber-soft: #fff7e5;
  --amber-ink: #b45309;
  --ok: #059669;
  --ok-bg: #ecfdf5;
  --gray-bg: #f2f4f7;
}

.appbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border-lista);
  display: flex;
  align-items: center;
  padding: 0 8px 0 16px;
  gap: 8px;
}
.appbar h1 {
  flex: 1;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}
.icon-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
}
.conn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-right: 6px;
  flex-shrink: 0;
}
.conn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.conn-dot.off {
  background: var(--text-3);
}
.conn span {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-2);
}

.content {
  padding: 14px 16px 108px;
  background: var(--bg);
  min-height: 100%;
}

.new-report {
  width: 100%;
  height: 54px;
  /* #F5A800 hardcodeado, no var(--amber): esa variable ya la usa otra
     parte del módulo (RDC "gran maestro", el toggle admin) con el tono
     viejo (#D97706) y no la tocamos para no correrles el color. */
  background: #f5a800;
  border: none;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1206;
  letter-spacing: -0.01em;
  margin-bottom: 18px;
  cursor: pointer;
}

.grp {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
}
.grp-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: var(--text-3);
  white-space: nowrap;
}
.grp-rule {
  flex: 1;
  height: 1px;
  background: var(--border-lista);
}

.tarjeta {
  background: var(--card);
  border: 1px solid var(--border-lista);
  border-radius: 12px;
  padding: 13px 10px 13px 14px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.card-main {
  flex: 1;
  min-width: 0;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}
.card-date {
  flex: 1;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
}
.badge {
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}
.badge.enviado {
  background: var(--ok-bg);
  color: var(--ok);
}
.badge.pendiente {
  background: var(--amber-soft);
  color: var(--amber-ink);
}
.badge.borrador {
  background: var(--gray-bg);
  color: var(--text-2);
}
.badge.error {
  background: var(--red-bg);
  color: var(--red-text);
}
.card-frente {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.3;
  margin-bottom: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-meta {
  font-size: 12px;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 6px;
}
.card-error {
  margin-top: 4px;
  font-size: 11.5px;
  color: #dc2626;
  line-height: 1.35;
}
.dot-sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-3);
  flex-shrink: 0;
}
.chev {
  color: var(--text-3);
  flex-shrink: 0;
}
.card-borrar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dc2626;
  background: #fef2f2;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
</style>

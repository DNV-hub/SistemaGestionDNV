<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import { useValeNuevoStore } from '../store/valeNuevo'
import ValeFormModal from '../components/ValeFormModal.vue'

const vales = useValesStore()
const auth = useAuthStore()
const valeNuevo = useValeNuevoStore()
const router = useRouter()

const mostrarModal = ref(false)
const aviso = ref('')

const puedeCrear = computed(() => auth.tienePermiso('vales.crear'))
const puedeVerTodos = computed(() => auth.tienePermiso('vales.ver_todos'))
// Solo Almacén/Administrador cargan vales a nombre de otro (lo que llega por
// WhatsApp mientras no todos los supervisores usan la app); un supervisor
// que crea su propio vale nunca ve el selector de "a nombre de quién".
const puedeCrearParaOtro = computed(() => auth.tienePermiso('vales.crear_para_otro'))
const puedeDevolver = computed(() => auth.tienePermiso('devoluciones.crear'))

// Bandeja de entrada: los vales que todavía necesitan una decisión suben
// arriba, ordenados por hora de envío (el más antiguo esperando primero,
// para que ninguno se quede olvidado); el resto (ya resueltos, o borradores
// que aún no se enviaron) queda abajo, más reciente primero.
const ESTADOS_ACCIONABLES = ['Enviado', 'En revision']

const valesOrdenados = computed(() => {
  const accionables = vales.vales.filter((v) => ESTADOS_ACCIONABLES.includes(v.estado))
  const resto = vales.vales.filter((v) => !ESTADOS_ACCIONABLES.includes(v.estado))
  accionables.sort((a, b) => new Date(a.fecha_envio ?? a.created_at) - new Date(b.fecha_envio ?? b.created_at))
  resto.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return [...accionables, ...resto]
})

function tiempoDesde(fechaIso) {
  if (!fechaIso) return null
  const minutos = Math.floor((Date.now() - new Date(fechaIso).getTime()) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

function fechaHoraEnvio(vale) {
  const iso = vale.fecha_envio ?? vale.created_at
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

// ---------------------------------------------------------------------------
// Lista en tarjetas para celular/tablet (<1024px) — la tabla de arriba sigue
// intacta para escritorio. Mismo dato (valesOrdenados), presentado distinto.
// ---------------------------------------------------------------------------
const MESES_ABREV = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'set.', 'oct.', 'nov.', 'dic.']
function fechaLarga(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MESES_ABREV[d.getMonth()]} ${d.getFullYear()}`
}
function horaCorta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })
}

// Mismo criterio de color que ya usaba la tabla de escritorio (.badge.*),
// llevado a las 4 categorías visuales del mockup — el texto del badge
// siempre es el estado real, nunca uno inventado.
const CATEGORIA_BADGE = {
  Borrador: 'draft',
  Enviado: 'wait',
  'En revision': 'wait',
  Aprobado: 'wait',
  Reservado: 'wait',
  'Parcialmente atendido': 'wait',
  Atendido: 'ok',
  Rechazado: 'err',
  Cancelado: 'err',
  Cerrado: 'draft',
}
const categoriaBadge = (estado) => CATEGORIA_BADGE[estado] ?? 'draft'

onMounted(async () => {
  await vales.cargarLista()
  if (puedeCrearParaOtro.value) await vales.cargarSupervisores()
})

const esSupervisor = computed(() => auth.nombreRol === 'Supervisor')

async function crear(payload) {
  aviso.value = ''
  // "Nuevo vale" siempre manda directo a la cola de revisión: el formulario
  // ya pide todas las líneas de una vez, así que no hay ninguna razón para
  // dejarlo en Borrador esperando un segundo paso de "Enviar" que además,
  // para lo que carga Almacén a nombre de otro supervisor, nadie más podría
  // disparar (no es el dueño del vale). Antes esto dejaba el vale creado por
  // un supervisor en Borrador para siempre si no volvía a entrar al detalle
  // a tocar "Enviar para revisión".
  const datos = {
    ...payload,
    supervisor_id: esSupervisor.value ? auth.session.user.id : payload.supervisor_id,
    creado_por: esSupervisor.value ? null : auth.session.user.id,
  }
  const vale = await vales.crearYEnviar(datos)
  mostrarModal.value = false
  router.push(`/vales/${vale.id}`)
}

function abrir(vale) {
  router.push(`/vales/${vale.id}`)
}

// Celular: hoja a pantalla completa (docs/mockups/04-vale-nuevo.html), no el
// modal centrado — ese sigue siendo solo para escritorio.
function nuevoMovil() {
  valeNuevo.reiniciar()
  router.push('/vales/nuevo')
}
</script>

<template>
  <div class="vales">
    <!-- Escritorio (≥1024px): tabla, sin tocar. -->
    <header class="cabecera solo-escritorio">
      <div>
        <h1>Vales</h1>
        <p v-if="puedeVerTodos" class="subtitulo">Los que esperan una decisión aparecen primero, del más antiguo al más nuevo.</p>
      </div>
      <div class="acciones-header">
        <button type="button" class="secundario" @click="router.push('/vales/stock')">Stock en vivo</button>
        <button v-if="puedeDevolver" type="button" class="secundario" @click="router.push('/vales/devolucion')">Devolver material</button>
        <button v-if="puedeCrear" @click="mostrarModal = true">+ Nuevo vale</button>
      </div>
    </header>

    <p v-if="aviso" class="aviso solo-escritorio">{{ aviso }}</p>
    <p v-if="vales.error" class="error solo-escritorio">{{ vales.error }}</p>
    <p v-if="vales.cargando" class="solo-escritorio">Cargando vales…</p>

    <table v-else class="tabla solo-escritorio">
      <thead>
        <tr>
          <th>Número</th>
          <th>Enviado</th>
          <th>Frente</th>
          <th v-if="puedeVerTodos">Supervisor</th>
          <th>Estado</th>
          <th v-if="puedeVerTodos">Esperando</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="v in valesOrdenados"
          :key="v.id"
          class="fila-clicable"
          :class="{ accionable: ESTADOS_ACCIONABLES.includes(v.estado) }"
          @click="abrir(v)"
        >
          <td>{{ v.numero }}</td>
          <td>{{ fechaHoraEnvio(v) }}</td>
          <td>{{ v.frentes?.codigo ? v.frentes.codigo + ' — ' : '' }}{{ v.frentes?.nombre }}</td>
          <td v-if="puedeVerTodos">{{ v.usuarios?.nombre ?? '—' }}</td>
          <td>
            <span class="badge" :class="v.estado.toLowerCase().replace(/\s+/g, '-')">{{ v.estado }}</span>
          </td>
          <td v-if="puedeVerTodos" class="tiempo-espera">
            {{ ESTADOS_ACCIONABLES.includes(v.estado) ? tiempoDesde(v.fecha_envio ?? v.created_at) : '—' }}
          </td>
        </tr>
        <tr v-if="!valesOrdenados.length">
          <td :colspan="puedeVerTodos ? 6 : 4" class="vacio">No hay vales para mostrar.</td>
        </tr>
      </tbody>
    </table>

    <!-- Celular/tablet (<1024px): tarjetas (docs/mockups/03-vales-lista.html). -->
    <div class="solo-movil movil-vales">
      <header class="appbar">
        <h1>Vales</h1>
        <button v-if="puedeCrear" type="button" class="new-btn" @click="nuevoMovil">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M7.5 3.5v8M3.5 7.5h8"/></svg>
          Nuevo
        </button>
      </header>

      <div class="accesos-rapidos">
        <button type="button" class="chip" @click="router.push('/vales/stock')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4.2 7 1.5l5.5 2.7L7 6.9 1.5 4.2Z"/><path d="M1.5 4.2v5.6L7 12.5l5.5-2.7V4.2M7 6.9v5.6"/></svg>
          Stock en vivo
        </button>
        <button v-if="puedeDevolver" type="button" class="chip" @click="router.push('/vales/devolucion')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 4.5 1.5 7l3 2.5M1.5 7h7a3 3 0 0 1 0 6h-1"/></svg>
          Devolver material
        </button>
      </div>

      <main class="content">
        <p v-if="aviso" class="aviso">{{ aviso }}</p>
        <p v-if="vales.error" class="error">{{ vales.error }}</p>
        <p v-if="vales.cargando" class="empty-msg">Cargando vales…</p>

        <template v-else>
          <div v-for="v in valesOrdenados" :key="v.id" class="tarjeta" @click="abrir(v)">
            <div class="card-top">
              <span class="card-id">{{ v.numero }}</span>
              <span class="badge-movil" :class="categoriaBadge(v.estado)">
                <svg v-if="categoriaBadge(v.estado) === 'wait'" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 8.2a2.4 2.4 0 011.2-4.5A3.4 3.4 0 019.6 4.6a2 2 0 01.1 3.9"/><path d="M1 1l10 10"/></svg>
                {{ v.estado }}
              </span>
            </div>
            <div class="card-frente">{{ v.frentes?.codigo ? v.frentes.codigo + ' — ' : '' }}{{ v.frentes?.nombre }}</div>
            <div class="card-meta">
              <span>{{ fechaLarga(v.fecha_envio ?? v.created_at) }}</span>
              <span class="dot-sep"></span>
              <span>{{ horaCorta(v.fecha_envio ?? v.created_at) }}</span>
              <span class="dot-sep"></span>
              <span>{{ v.vale_detalle?.length ?? 0 }} materiales</span>
            </div>
          </div>
          <p v-if="!valesOrdenados.length" class="empty-msg">No hay vales para mostrar.</p>
        </template>
      </main>
    </div>

    <ValeFormModal
      v-if="mostrarModal"
      :frentes-activos="vales.frentesActivos"
      :materiales-activos="vales.materialesActivos"
      :supervisores-activos="puedeCrearParaOtro ? vales.supervisoresActivos : null"
      @guardar="crear"
      @cerrar="mostrarModal = false"
    />
  </div>
</template>

<style scoped>
.vales {
  padding: 1.5rem 2rem;
}
.cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.subtitulo {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: var(--color-text-muted);
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
.acciones-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.acciones-header .secundario {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
}
.tabla th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.fila-clicable {
  cursor: pointer;
}
.fila-clicable:hover {
  background: var(--color-surface-2);
}
.fila-clicable.accionable {
  box-shadow: inset 3px 0 0 var(--color-info);
}
.tiempo-espera {
  color: var(--color-warning);
  font-size: 0.8rem;
  white-space: nowrap;
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
.badge.enviado,
.badge.en-revision {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.aprobado,
.badge.reservado {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.parcialmente-atendido {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.atendido {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.rechazado,
.badge.cancelado {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge.cerrado {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
}
.aviso {
  color: var(--color-success);
  font-size: 0.9rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}

/* ---------------------------------------------------------------------
   Celular/tablet (<1024px): tarjetas (docs/mockups/03-vales-lista.html).
   Paleta propia, igual criterio que el módulo RDC — este "modo campo" es
   siempre claro, no seguía el tema oscuro/claro del Sistema tampoco antes.
   --------------------------------------------------------------------- */
.movil-vales {
  --bg: #f4f5f7;
  --card: #ffffff;
  --border-lista: #e4e7ec;
  --text: #1e293b;
  --text-2: #667085;
  --text-3: #98a2b3;
  --amber-soft: #fff7e5;
  --amber-ink: #b45309;
  --ok: #059669;
  --ok-bg: #ecfdf5;
  --err: #dc2626;
  --err-bg: #fef2f2;
  --gray-bg: #f2f4f7;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  background: var(--bg);
}
/* .solo-escritorio no necesita una regla acá: sin ninguna, cada elemento
   usa el display que ya le da su propia clase (.cabecera es flex, .tabla
   es tabla, un <p> es block…) — se oculta explícitamente recién en la
   media query de abajo. Forzar "display: revert" acá volvería al default
   del navegador para la etiqueta, no al de estas reglas, y rompería el
   flex de .cabecera en escritorio. */
.solo-movil {
  display: none;
}

.movil-vales .appbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border-lista);
  display: flex;
  align-items: center;
  padding: 0 12px 0 16px;
  gap: 10px;
}
.movil-vales .appbar h1 {
  flex: 1;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
}
.new-btn {
  height: 38px;
  background: #f5a800;
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: #1a1206;
  flex-shrink: 0;
  cursor: pointer;
}

.accesos-rapidos {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: 12px 16px 0;
  overflow-x: auto;
}
.chip {
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 20px;
  border: 1.5px solid var(--border-lista);
  background: var(--card);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.movil-vales .content {
  padding: 14px 16px 108px;
}
.movil-vales .empty-msg {
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  padding: 12px 0;
}
.movil-vales .aviso,
.movil-vales .error {
  font-size: 13px;
  margin-bottom: 10px;
}

.movil-vales .tarjeta {
  background: var(--card);
  border: 1px solid var(--border-lista);
  border-radius: 12px;
  padding: 13px 14px;
  margin-bottom: 10px;
  cursor: pointer;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
}
.card-id {
  flex: 1;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-movil {
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}
.badge-movil.ok {
  background: var(--ok-bg);
  color: var(--ok);
}
.badge-movil.wait {
  background: var(--amber-soft);
  color: var(--amber-ink);
}
.badge-movil.draft {
  background: var(--gray-bg);
  color: var(--text-2);
}
.badge-movil.err {
  background: var(--err-bg);
  color: var(--err);
}
.movil-vales .card-frente {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 3px;
}
.movil-vales .card-meta {
  font-size: 12px;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 6px;
}
.movil-vales .dot-sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-3);
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .vales {
    padding: 0;
  }
  .solo-escritorio {
    display: none !important;
  }
  .solo-movil {
    display: block;
  }
}
</style>

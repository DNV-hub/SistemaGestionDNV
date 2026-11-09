<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import { useValeNuevoStore } from '../store/valeNuevo'
import ValeFormModal from '../components/ValeFormModal.vue'
import DevolucionNuevaView from './DevolucionNuevaView.vue'
import TransferenciaNuevaView from './TransferenciaNuevaView.vue'

const vales = useValesStore()
const auth = useAuthStore()
const valeNuevo = useValeNuevoStore()
const router = useRouter()

const mostrarModal = ref(false)
const aviso = ref('')
// Escritorio: Devolver/Transferir se abren como ventana (como Nuevo vale).
const modalDevolucion = ref(false)
const modalTransferencia = ref(false)
function movimientoCreado(mensaje) {
  modalDevolucion.value = false
  modalTransferencia.value = false
  aviso.value = mensaje
}

const puedeCrear = computed(() => auth.tienePermiso('vales.crear'))
const tituloPagina = computed(() => (esSupervisor.value ? 'Almacén' : 'Vales'))
const puedeVerTodos = computed(() => auth.tienePermiso('vales.ver_todos'))
// Solo Almacén/Administrador cargan vales a nombre de otro (lo que llega por
// WhatsApp mientras no todos los supervisores usan la app); un supervisor
// que crea su propio vale nunca ve el selector de "a nombre de quién".
const puedeCrearParaOtro = computed(() => auth.tienePermiso('vales.crear_para_otro'))
const puedeDevolver = computed(() => auth.tienePermiso('devoluciones.crear'))
const puedeTransferir = computed(() => auth.tienePermiso('transferencias.crear'))

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

// ---------------------------------------------------------------------------
// Buscador + filtros: "pongo malla y me salen los vales que la están
// pidiendo", o acoto por frente/supervisor — sobre el mismo historial que ya
// se cargó completo (sin paginar), nada nuevo que traer del servidor.
// ---------------------------------------------------------------------------
const busqueda = ref('')
const filtroFrenteId = ref('')
const filtroSupervisorId = ref('')

const opcionesFrente = computed(() => {
  const mapa = new Map()
  for (const v of vales.vales) {
    if (v.frentes?.id && !mapa.has(v.frentes.id)) {
      mapa.set(v.frentes.id, v.frentes.codigo ? `${v.frentes.codigo} — ${v.frentes.nombre}` : v.frentes.nombre)
    }
  }
  return [...mapa.entries()].map(([id, etiqueta]) => ({ id, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
})
const opcionesSupervisor = computed(() => {
  const mapa = new Map()
  for (const v of vales.vales) {
    if (v.usuarios?.id && !mapa.has(v.usuarios.id)) mapa.set(v.usuarios.id, v.usuarios.nombre)
  }
  return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
})

// El mismo cuadro de búsqueda cubre las tres cosas que alguien intenta
// ubicar acá: qué se pidió (material), dónde (frente) y quién lo pidió
// (supervisor) — no hace falta usar los selects si ya sabe el nombre.
function valeCoincideTexto(v, q) {
  if (v.numero?.toLowerCase().includes(q)) return true
  if (v.frentes?.nombre?.toLowerCase().includes(q) || v.frentes?.codigo?.toLowerCase().includes(q)) return true
  if (v.usuarios?.nombre?.toLowerCase().includes(q)) return true
  return (v.vale_detalle ?? []).some(
    (d) => d.materiales?.descripcion?.toLowerCase().includes(q)
  )
}

// Chips de estado de la lista del Supervisor en celular.
const CHIPS_ESTADO = ['Todos', 'Enviado', 'Aprobado', 'Atendido', 'Parcial', 'Rechazado', 'Cancelado']
const ESTADOS_DEL_CHIP = {
  Enviado: ['Enviado', 'En revision'],
  Aprobado: ['Aprobado', 'Reservado'],
  Atendido: ['Atendido', 'Cerrado'],
  Parcial: ['Parcialmente atendido'],
  Rechazado: ['Rechazado'],
  Cancelado: ['Cancelado'],
}
const chipEstado = ref('Todos')

const valesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return valesOrdenados.value.filter((v) => {
    if (chipEstado.value !== 'Todos' && !ESTADOS_DEL_CHIP[chipEstado.value].includes(v.estado)) return false
    if (filtroFrenteId.value && v.frente_id !== filtroFrenteId.value) return false
    if (filtroSupervisorId.value && v.supervisor_id !== filtroSupervisorId.value) return false
    if (q && !valeCoincideTexto(v, q)) return false
    return true
  })
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

// Lista compacta del Supervisor (móvil): color de la pastilla por estado y
// punto naranja en los vales que almacén ya respondió y todavía no se abrieron.
const PILL_ESTADO = {
  Aprobado: 'am',
  Reservado: 'am',
  Enviado: 'am',
  'En revision': 'am',
  Atendido: 'ok',
  Cerrado: 'ok',
  'Parcialmente atendido': 'bl',
  Rechazado: 're',
  Cancelado: 'gr',
  Borrador: 'gr',
}
const ESTADOS_RESPONDIDOS = ['Aprobado', 'Rechazado', 'Parcialmente atendido', 'Atendido', 'Cerrado']
const tieneNovedad = (v) => ESTADOS_RESPONDIDOS.includes(v.estado) && (!v.visto_supervisor_en || v.visto_supervisor_en < v.updated_at)
const fechaHoraCorta = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const dia = `${d.getDate()} ${MESES_ABREV[d.getMonth()].replace('.', '')}`
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia} · ${hora}`
}
const textoMateriales = (v) => {
  const n = v.vale_detalle?.length ?? 0
  return `${n} material${n === 1 ? '' : 'es'}`
}

onMounted(async () => {
  await vales.cargarLista()
  if (puedeCrearParaOtro.value) await vales.cargarSupervisores()
  vales.cargarStockDisponible()
})

// id de material -> disponible ahora, para el modal "Nuevo vale" (mismo
// dato que ya usa el supervisor en su propio panel, solo que acá se
// necesita como mapa para consultarlo material por material).
const stockPorMaterialMapa = computed(() => new Map(vales.stockPorMaterial.map((m) => [m.id, m.disponible])))

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
        <h1>{{ tituloPagina }}</h1>
        <p v-if="esSupervisor" class="subtitulo">Vales de material</p>
        <p v-else-if="puedeVerTodos" class="subtitulo">Los que esperan una decisión aparecen primero, del más antiguo al más nuevo.</p>
      </div>
      <div class="acciones-header">
        <button v-if="puedeDevolver" type="button" class="secundario" @click="modalDevolucion = true">Devolver material</button>
        <button v-if="puedeTransferir" type="button" class="secundario" @click="modalTransferencia = true">Transferir material</button>
        <button v-if="puedeCrear" @click="mostrarModal = true">+ Nuevo vale</button>
      </div>
    </header>

    <p v-if="aviso" class="aviso solo-escritorio">{{ aviso }}</p>
    <p v-if="vales.error" class="error solo-escritorio">{{ vales.error }}</p>
    <p v-if="vales.cargando" class="solo-escritorio">Cargando vales…</p>

    <template v-else>
      <div class="filtros-vales solo-escritorio">
        <div class="busqueda-vales">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
          <input v-model="busqueda" type="search" placeholder="Buscar por material, frente, supervisor o número…" />
        </div>
        <select v-model="filtroFrenteId" class="filtro">
          <option value="">Frente: Todos</option>
          <option v-for="f in opcionesFrente" :key="f.id" :value="f.id">{{ f.etiqueta }}</option>
        </select>
        <select v-if="puedeVerTodos" v-model="filtroSupervisorId" class="filtro">
          <option value="">Supervisor: Todos</option>
          <option v-for="s in opcionesSupervisor" :key="s.id" :value="s.id">{{ s.nombre }}</option>
        </select>
      </div>

      <table class="tabla solo-escritorio">
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
            v-for="v in valesFiltrados"
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
          <tr v-if="!valesFiltrados.length">
            <td :colspan="puedeVerTodos ? 6 : 4" class="vacio">
              {{ vales.vales.length ? 'Ningún vale coincide con la búsqueda o el filtro.' : 'No hay vales para mostrar.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Celular/tablet (<1024px): tarjetas (docs/mockups/03-vales-lista.html). -->
    <!-- Supervisor (celular): lista compacta de Almacén -->
    <div v-if="esSupervisor" class="solo-movil movil-sup">
      <header class="ms-top">
        <div class="ms-tit">
          <h1>{{ tituloPagina }}</h1>
          <div class="ms-sub">Vales de material</div>
        </div>
        <button v-if="puedeCrear" type="button" class="ms-cta" @click="nuevoMovil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo
        </button>
      </header>

      <label class="ms-busca">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input v-model="busqueda" type="search" placeholder="Buscar material, frente o número…" aria-label="Buscar vale" />
      </label>

      <div class="ms-chips" role="group" aria-label="Estado">
        <button v-for="c in CHIPS_ESTADO" :key="c" type="button" class="ms-chip" :class="{ on: chipEstado === c }" :aria-pressed="chipEstado === c" @click="chipEstado = c">{{ c }}</button>
      </div>

      <div v-if="puedeDevolver || puedeTransferir" class="ms-acc">
        <button v-if="puedeDevolver" type="button" class="ms-gh" @click="router.push('/vales/devolucion')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-2" /></svg>
          Devolver
        </button>
        <button v-if="puedeTransferir" type="button" class="ms-gh" @click="router.push('/vales/transferencia')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h13l-3-3M17 17H4l3 3" /></svg>
          Transferir
        </button>
      </div>

      <p v-if="aviso" class="ms-msg">{{ aviso }}</p>
      <p v-if="vales.error" class="ms-msg err">{{ vales.error }}</p>
      <p v-if="vales.cargando" class="ms-msg">Cargando vales…</p>
      <div v-else class="ms-lista">
        <button v-for="v in valesFiltrados" :key="v.id" type="button" class="ms-fila" @click="abrir(v)">
          <span class="ms-t">
            <span class="ms-l1">
              <span v-if="tieneNovedad(v)" class="ms-punto" aria-label="Respuesta nueva"></span>
              <b>{{ v.numero }}</b>
              <span class="ms-fecha">{{ fechaHoraCorta(v.fecha_envio ?? v.created_at) }}</span>
            </span>
            <span class="ms-l2">{{ v.frentes?.codigo || v.frentes?.nombre }} <span class="ms-mu">· {{ textoMateriales(v) }}</span></span>
          </span>
          <span class="ms-pill" :class="PILL_ESTADO[v.estado] ?? 'gr'">{{ v.estado }}</span>
        </button>
        <p v-if="!valesFiltrados.length" class="ms-vacio">
          {{ vales.vales.length ? 'Ningún vale coincide con la búsqueda o el filtro.' : 'No hay vales para mostrar.' }}
        </p>
      </div>
    </div>

    <div v-else class="solo-movil movil-vales">
      <header class="appbar">
        <h1>{{ tituloPagina }}</h1>
        <button v-if="puedeCrear" type="button" class="new-btn" @click="nuevoMovil">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M7.5 3.5v8M3.5 7.5h8"/></svg>
          Nuevo
        </button>
      </header>

      <div class="accesos-rapidos">
        <button v-if="puedeDevolver" type="button" class="chip" @click="router.push('/vales/devolucion')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 4.5 1.5 7l3 2.5M1.5 7h7a3 3 0 0 1 0 6h-1"/></svg>
          Devolver material
        </button>
        <button v-if="puedeTransferir" type="button" class="chip" @click="router.push('/vales/transferencia')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4.5h9M8 2l2.5 2.5L8 7M12.5 9.5h-9M6 12l-2.5-2.5L6 7"/></svg>
          Transferir material
        </button>
      </div>

      <div class="filtros-movil">
        <div class="busqueda-movil">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
          <input v-model="busqueda" type="search" placeholder="Buscar por material, frente, supervisor o número…" />
        </div>
        <div class="selects-movil">
          <select v-model="filtroFrenteId" class="filtro-movil">
            <option value="">Frente: Todos</option>
            <option v-for="f in opcionesFrente" :key="f.id" :value="f.id">{{ f.etiqueta }}</option>
          </select>
          <select v-if="puedeVerTodos" v-model="filtroSupervisorId" class="filtro-movil">
            <option value="">Supervisor: Todos</option>
            <option v-for="s in opcionesSupervisor" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
        </div>
      </div>

      <main class="content">
        <p v-if="aviso" class="aviso">{{ aviso }}</p>
        <p v-if="vales.error" class="error">{{ vales.error }}</p>
        <p v-if="vales.cargando" class="empty-msg">Cargando vales…</p>

        <template v-else>
          <div v-for="v in valesFiltrados" :key="v.id" class="tarjeta" @click="abrir(v)">
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
          <p v-if="!valesFiltrados.length" class="empty-msg">
            {{ vales.vales.length ? 'Ningún vale coincide con la búsqueda o el filtro.' : 'No hay vales para mostrar.' }}
          </p>
        </template>
      </main>
    </div>

    <DevolucionNuevaView v-if="modalDevolucion" como-modal @cerrar="modalDevolucion = false" @creado="movimientoCreado" />
    <TransferenciaNuevaView v-if="modalTransferencia" como-modal @cerrar="modalTransferencia = false" @creado="movimientoCreado" />

    <ValeFormModal
      v-if="mostrarModal"
      :frentes-activos="vales.frentesActivos"
      :materiales-activos="vales.materialesActivos"
      :stock-por-material="stockPorMaterialMapa"
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
.filtros-vales {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.busqueda-vales {
  flex: 1;
  min-width: 220px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0.5rem 0.7rem;
}
.busqueda-vales svg {
  width: 14px;
  height: 14px;
  stroke: var(--color-text-muted);
  stroke-width: 2;
  fill: none;
  flex-shrink: 0;
}
.busqueda-vales input {
  border: none;
  background: none;
  outline: none;
  font: inherit;
  color: var(--color-text);
  width: 100%;
}
.filtro {
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0.5rem 0.7rem;
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
   Paleta propia, igual criterio que el módulo RDC. Ya sigue el tema
   oscuro/claro del Sistema (ver el bloque :root[data-theme='dark'] más
   abajo) — antes era siempre claro a propósito, pero el equipo real
   trabaja a diario en este "modo campo" y pidió que respete su tema.
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
  /* .vales (el padre) mide min-height:100% del alto real de .contenido en
     celular — sin esto, esta tarjeta de fondo claro solo ocupa lo que
     ocupan sus hijos (appbar + 2 tarjetas de vale, por ejemplo) y el resto
     del alto disponible hasta la barra de pestañas queda mostrando el
     fondo oscuro de .contenido por debajo. En Android no se nota porque
     ahí no se estaba viendo el problema; en un iPhone con más alto de
     pantalla disponible (o pocos vales) la franja vacía es grande. */
  min-height: 100%;
}
/* Modo oscuro: mismo criterio que RdcListaView.vue — redefine estas mismas
   variables con los tokens del resto del Sistema, sin tocar ninguna otra
   regla de este archivo (todas ya usan var(--xxx)). */
:root[data-theme='dark'] .movil-vales {
  --bg: var(--color-bg);
  --card: var(--color-surface);
  --border-lista: var(--color-border);
  --text: var(--color-text);
  --text-2: var(--color-text-muted);
  --text-3: #6b7280;
  --amber-soft: var(--color-primary-soft);
  --amber-ink: var(--color-primary);
  --ok: var(--color-success);
  --ok-bg: var(--color-success-soft);
  --err: var(--color-danger);
  --err-bg: var(--color-danger-soft);
  --gray-bg: var(--color-surface-2);
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

.filtros-movil {
  flex-shrink: 0;
  padding: 10px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.busqueda-movil {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--card);
  border: 1px solid var(--border-lista);
  border-radius: 10px;
  padding: 9px 12px;
}
.busqueda-movil svg {
  width: 15px;
  height: 15px;
  stroke: var(--text-3);
  stroke-width: 2;
  fill: none;
  flex-shrink: 0;
}
.busqueda-movil input {
  border: none;
  background: none;
  outline: none;
  font: inherit;
  color: var(--text);
  width: 100%;
  font-size: 14px;
}
.selects-movil {
  display: flex;
  gap: 8px;
}
.filtro-movil {
  flex: 1;
  min-width: 0;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--card);
  border: 1.5px solid var(--border-lista);
  border-radius: 10px;
  padding: 8px 10px;
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
    /* height, no min-height: un min-height no cuenta como "alto explícito"
       para que .movil-vales pueda resolver su propio min-height:100% contra
       este elemento — con min-height acá, el de abajo simplemente no hacía
       nada y por eso el primer intento de este arreglo no cambió nada. */
    height: 100%;
  }
  .solo-escritorio {
    display: none !important;
  }
  .solo-movil {
    display: block;
  }
}

/* ---- Supervisor, celular: lista compacta ---- */
.movil-sup {
  padding: 0 16px calc(104px + env(safe-area-inset-bottom, 0px));
  min-height: 100%;
}
.movil-sup * {
  box-sizing: border-box;
}
.ms-top {
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--color-bg);
  margin: 0 -16px;
  padding: 12px 16px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
}
.ms-tit {
  flex: 1;
  min-width: 0;
}
.ms-tit h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-text);
}
.ms-sub {
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 600;
}
.ms-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: #f6a800;
  color: #111;
  font-size: 14px;
  font-weight: 800;
  touch-action: manipulation;
}
.ms-busca {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px;
  margin-bottom: 10px;
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-border);
  color: var(--color-text-muted);
}
.ms-busca input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}
.ms-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -16px 10px;
  padding: 0 16px;
  scrollbar-width: none;
}
.ms-chips::-webkit-scrollbar {
  display: none;
}
.ms-chip {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  touch-action: manipulation;
}
.ms-chip.on {
  background: var(--color-text);
  color: var(--color-bg);
}
.ms-acc {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.ms-gh {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border: 0;
  border-radius: 11px;
  background: var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-border);
  color: var(--color-text-muted);
  font-size: 12.5px;
  font-weight: 700;
  touch-action: manipulation;
}
.ms-msg {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.ms-msg.err {
  color: var(--color-danger);
}
.ms-lista {
  background: var(--color-surface);
  border-radius: 18px;
  box-shadow: 0 0 0 1px var(--color-border);
  padding: 2px 14px;
}
.ms-fila {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  touch-action: manipulation;
}
.ms-fila:last-of-type {
  border-bottom: 0;
}
.ms-t {
  flex: 1;
  min-width: 0;
}
.ms-l1 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14.5px;
}
.ms-punto {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f6a800;
  flex: 0 0 auto;
}
.ms-fecha {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.ms-l2 {
  display: block;
  margin-top: 2px;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ms-mu {
  color: var(--color-text-muted);
}
.ms-pill {
  flex: 0 0 auto;
  font-size: 11.5px;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 9px;
  white-space: nowrap;
}
.ms-pill.ok { background: rgba(34, 197, 94, 0.16); color: #22a05b; }
.ms-pill.am { background: rgba(246, 168, 0, 0.18); color: #d98e00; }
.ms-pill.gr { background: rgba(141, 146, 155, 0.2); color: #8d929b; }
.ms-pill.re { background: rgba(239, 68, 68, 0.16); color: #e5484d; }
.ms-pill.bl { background: rgba(76, 141, 246, 0.16); color: #4c8df6; }
.ms-vacio {
  margin: 0;
  padding: 16px 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
</style>

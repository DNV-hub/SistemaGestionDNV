<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import ValeFormModal from '../components/ValeFormModal.vue'

const vales = useValesStore()
const auth = useAuthStore()
const router = useRouter()

const mostrarModal = ref(false)
const aviso = ref('')

const puedeCrear = computed(() => auth.tienePermiso('vales.crear'))
const puedeVerTodos = computed(() => auth.tienePermiso('vales.ver_todos'))
// Solo Almacén/Administrador cargan vales a nombre de otro (lo que llega por
// WhatsApp mientras no todos los supervisores usan la app); un supervisor
// que crea su propio vale nunca ve el selector de "a nombre de quién".
const puedeCrearParaOtro = computed(() => auth.tienePermiso('vales.crear_para_otro'))

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

onMounted(async () => {
  await vales.cargarLista()
  if (puedeCrearParaOtro.value) await vales.cargarSupervisores()
})

const esSupervisor = computed(() => auth.nombreRol === 'Supervisor')

async function crear(payload) {
  aviso.value = ''
  // Un supervisor crea su propio vale (queda en Borrador, lo envía él
  // cuando quiera); Almacén cargando algo que llegó por WhatsApp lo manda
  // directo a la cola de revisión — nadie más podría "enviarlo" después,
  // porque no es el dueño del vale.
  const datos = {
    ...payload,
    supervisor_id: esSupervisor.value ? auth.session.user.id : payload.supervisor_id,
    creado_por: esSupervisor.value ? null : auth.session.user.id,
  }
  const vale = esSupervisor.value ? await vales.crear(datos) : await vales.crearYEnviar(datos)
  mostrarModal.value = false
  router.push(`/vales/${vale.id}`)
}

function abrir(vale) {
  router.push(`/vales/${vale.id}`)
}
</script>

<template>
  <div class="vales">
    <header class="cabecera">
      <div>
        <h1>Vales</h1>
        <p v-if="puedeVerTodos" class="subtitulo">Los que esperan una decisión aparecen primero, del más antiguo al más nuevo.</p>
      </div>
      <button v-if="puedeCrear" @click="mostrarModal = true">+ Nuevo vale</button>
    </header>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="vales.error" class="error">{{ vales.error }}</p>
    <p v-if="vales.cargando">Cargando vales…</p>

    <table v-else class="tabla">
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
</style>

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

onMounted(() => vales.cargarLista())

async function crear(payload) {
  aviso.value = ''
  const vale = await vales.crear({ ...payload, supervisor_id: auth.session.user.id })
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
      <h1>Vales</h1>
      <button v-if="puedeCrear" @click="mostrarModal = true">+ Nuevo vale</button>
    </header>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="vales.error" class="error">{{ vales.error }}</p>
    <p v-if="vales.cargando">Cargando vales…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>Número</th>
          <th>Fecha</th>
          <th>Frente</th>
          <th v-if="puedeVerTodos">Supervisor</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="v in vales.vales" :key="v.id" class="fila-clicable" @click="abrir(v)">
          <td>{{ v.numero }}</td>
          <td>{{ v.fecha }}</td>
          <td>{{ v.frentes?.codigo }} — {{ v.frentes?.nombre }}</td>
          <td v-if="puedeVerTodos">{{ v.usuarios?.nombre ?? '—' }}</td>
          <td>
            <span class="badge" :class="v.estado.toLowerCase().replace(/\s+/g, '-')">{{ v.estado }}</span>
          </td>
        </tr>
        <tr v-if="!vales.vales.length">
          <td :colspan="puedeVerTodos ? 5 : 4" class="vacio">No hay vales para mostrar.</td>
        </tr>
      </tbody>
    </table>

    <ValeFormModal
      v-if="mostrarModal"
      :frentes-activos="vales.frentesActivos"
      :materiales-activos="vales.materialesActivos"
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
  color: #111827;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.9rem;
}
.tabla th {
  background: #f3f4f6;
  color: #374151;
  font-weight: 600;
}
.fila-clicable {
  cursor: pointer;
}
.fila-clicable:hover {
  background: #f9fafb;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.borrador {
  background: #f3f4f6;
  color: #6b7280;
}
.badge.enviado,
.badge.en-revision {
  background: #dbeafe;
  color: #1e40af;
}
.badge.aprobado,
.badge.reservado {
  background: #e0e7ff;
  color: #3730a3;
}
.badge.parcialmente-atendido {
  background: #fef3c7;
  color: #92400e;
}
.badge.atendido {
  background: #dcfce7;
  color: #166534;
}
.badge.rechazado,
.badge.cancelado {
  background: #fee2e2;
  color: #991b1b;
}
.badge.cerrado {
  background: #f3f4f6;
  color: #6b7280;
}
.vacio {
  text-align: center;
  color: #6b7280;
}
.aviso {
  color: #166534;
  font-size: 0.9rem;
}
.error {
  color: #b91c1c;
  font-size: 0.9rem;
}
</style>

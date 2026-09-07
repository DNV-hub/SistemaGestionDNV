<script setup>
import { computed, onMounted, ref } from 'vue'
import { useFrentesStore } from '../store/frentes'
import { useAuthStore } from '../../../store/auth'
import FrenteFormModal from '../components/FrenteFormModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'

const frentes = useFrentesStore()
const auth = useAuthStore()

const busqueda = ref('')
const mostrarModal = ref(false)
const frenteEnEdicion = ref(null)
const aviso = ref('')

const puedeCrear = computed(() => auth.tienePermiso('frentes.crear'))
const puedeEditar = computed(
  () => auth.tienePermiso('frentes.editar') || auth.tienePermiso('frentes.cerrar')
)
const mostrarColumnaAcciones = computed(() => puedeEditar.value)

const frentesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return frentes.frentes
  return frentes.frentes.filter(
    (f) =>
      f.codigo.toLowerCase().includes(q) ||
      f.nombre.toLowerCase().includes(q) ||
      (f.area ?? '').toLowerCase().includes(q)
  )
})

onMounted(() => frentes.cargar())

function abrirCrear() {
  frenteEnEdicion.value = null
  mostrarModal.value = true
}

function abrirEditar(frente) {
  frenteEnEdicion.value = frente
  mostrarModal.value = true
}

function cerrarModal() {
  mostrarModal.value = false
  frenteEnEdicion.value = null
}

async function guardar(payload) {
  aviso.value = ''
  if (frenteEnEdicion.value) {
    await frentes.actualizar(frenteEnEdicion.value.id, payload)
    aviso.value = 'Frente actualizado.'
  } else {
    await frentes.crear(payload)
    aviso.value = 'Frente creado.'
  }
  cerrarModal()
}

async function eliminar(frente) {
  if (!confirm(`¿Eliminar el frente "${frente.codigo} — ${frente.nombre}"?`)) return
  aviso.value = ''
  const resultado = await frentes.eliminar(frente.id)
  aviso.value = resultado.eliminado
    ? 'Frente eliminado.'
    : 'Este frente ya tiene vales, salidas o metrados asociados, así que no se puede eliminar: se cerró en su lugar.'
}
</script>

<template>
  <div class="frentes">
    <header class="cabecera">
      <h1>Frentes</h1>
      <button v-if="puedeCrear" @click="abrirCrear">+ Nuevo frente</button>
    </header>

    <div class="filtros">
      <input v-model="busqueda" type="search" placeholder="Buscar por código, nombre o área…" />
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="frentes.error" class="error">{{ frentes.error }}</p>

    <p v-if="frentes.cargando">Cargando frentes…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>N°</th>
          <th>Código</th>
          <th>Nombre</th>
          <th>Área</th>
          <th>Fecha inicio</th>
          <th>Fecha cierre</th>
          <th>Estado</th>
          <th v-if="mostrarColumnaAcciones"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(f, i) in frentesFiltrados" :key="f.id">
          <td>{{ i + 1 }}</td>
          <td>{{ f.codigo }}</td>
          <td>{{ f.nombre }}</td>
          <td>{{ f.area ?? '—' }}</td>
          <td>{{ f.fecha_inicio }}</td>
          <td>{{ f.fecha_cierre ?? '—' }}</td>
          <td>
            <span class="badge" :class="f.estado">{{ f.estado }}</span>
          </td>
          <td v-if="mostrarColumnaAcciones" class="acciones-fila">
            <BotonIcono variante="editar" titulo="Editar" @click="abrirEditar(f)" />
            <BotonIcono variante="eliminar" titulo="Eliminar" @click="eliminar(f)" />
          </td>
        </tr>
        <tr v-if="!frentesFiltrados.length">
          <td colspan="8" class="vacio">No hay frentes para mostrar.</td>
        </tr>
      </tbody>
    </table>

    <FrenteFormModal
      v-if="mostrarModal"
      :frente="frenteEnEdicion"
      :puede-editar-estado="auth.tienePermiso('frentes.cerrar') || auth.tienePermiso('frentes.editar')"
      @guardar="guardar"
      @cerrar="cerrarModal"
    />
  </div>
</template>

<style scoped>
.frentes {
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
.filtros {
  margin-bottom: 1rem;
}
.filtros input {
  width: 320px;
  max-width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
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
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.activo {
  background: #dcfce7;
  color: #166534;
}
.badge.cerrado {
  background: #f3f4f6;
  color: #6b7280;
}
.acciones-fila {
  display: flex;
  gap: 0.25rem;
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

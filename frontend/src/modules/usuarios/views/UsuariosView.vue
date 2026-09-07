<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUsuariosStore } from '../store/usuarios'
import { useAuthStore } from '../../../store/auth'
import UsuarioFormModal from '../components/UsuarioFormModal.vue'
import PasswordTemporalModal from '../components/PasswordTemporalModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'

const usuarios = useUsuariosStore()
const auth = useAuthStore()

const busqueda = ref('')
const mostrarModal = ref(false)
const usuarioEnEdicion = ref(null)
const usuarioCreado = ref(null) // { usuario, passwordTemporal }
const aviso = ref('')

const puedeCrear = computed(() => auth.tienePermiso('usuarios.crear'))
const puedeEditar = computed(
  () => auth.tienePermiso('usuarios.editar') || auth.tienePermiso('usuarios.desactivar')
)

const usuariosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return usuarios.usuarios
  return usuarios.usuarios.filter(
    (u) => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

onMounted(() => usuarios.cargar())

function abrirCrear() {
  usuarioEnEdicion.value = null
  mostrarModal.value = true
}

function abrirEditar(usuario) {
  usuarioEnEdicion.value = usuario
  mostrarModal.value = true
}

function cerrarModal() {
  mostrarModal.value = false
  usuarioEnEdicion.value = null
}

async function guardar(payload) {
  aviso.value = ''
  if (usuarioEnEdicion.value) {
    await usuarios.actualizar(usuarioEnEdicion.value.id, payload)
    aviso.value = 'Usuario actualizado.'
    cerrarModal()
  } else {
    const { usuario, passwordTemporal } = await usuarios.crear(payload)
    cerrarModal()
    usuarioCreado.value = { usuario, passwordTemporal }
  }
}
</script>

<template>
  <div class="usuarios">
    <header class="cabecera">
      <h1>Usuarios y roles</h1>
      <button v-if="puedeCrear" @click="abrirCrear">+ Nuevo usuario</button>
    </header>

    <div class="filtros">
      <input v-model="busqueda" type="search" placeholder="Buscar por nombre o correo…" />
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="usuarios.error" class="error">{{ usuarios.error }}</p>

    <p v-if="usuarios.cargando">Cargando usuarios…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Rol</th>
          <th>Frente</th>
          <th>Estado</th>
          <th v-if="puedeEditar"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in usuariosFiltrados" :key="u.id">
          <td>{{ u.nombre }}</td>
          <td>{{ u.email }}</td>
          <td>{{ u.roles?.nombre ?? '—' }}</td>
          <td>{{ u.frentes ? `${u.frentes.codigo} — ${u.frentes.nombre}` : '—' }}</td>
          <td>
            <span class="badge" :class="u.estado">{{ u.estado }}</span>
          </td>
          <td v-if="puedeEditar">
            <BotonIcono variante="editar" titulo="Editar" @click="abrirEditar(u)" />
          </td>
        </tr>
        <tr v-if="!usuariosFiltrados.length">
          <td colspan="6" class="vacio">No hay usuarios para mostrar.</td>
        </tr>
      </tbody>
    </table>

    <UsuarioFormModal
      v-if="mostrarModal"
      :usuario="usuarioEnEdicion"
      :roles="usuarios.roles"
      :frentes="usuarios.frentes"
      @guardar="guardar"
      @cerrar="cerrarModal"
    />

    <PasswordTemporalModal
      v-if="usuarioCreado"
      :usuario="usuarioCreado.usuario"
      :password-temporal="usuarioCreado.passwordTemporal"
      @cerrar="usuarioCreado = null"
    />
  </div>
</template>

<style scoped>
.usuarios {
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
.badge.inactivo {
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

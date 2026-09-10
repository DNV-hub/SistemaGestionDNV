<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUsuariosStore } from '../store/usuarios'
import { useAuthStore } from '../../../store/auth'
import { diagnosticarBloqueoUsuario } from '../services/usuariosService'
import UsuarioFormModal from '../components/UsuarioFormModal.vue'
import PasswordTemporalModal from '../components/PasswordTemporalModal.vue'
import RestablecerPasswordModal from '../components/RestablecerPasswordModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'

// Todo lo que puede seguir atado a una cuenta (ver
// fn_diagnosticar_bloqueo_usuario): lo "limpiable" son restos de prueba que
// Developer puede borrar (vales, reportes del RDC, el vínculo con el
// catálogo de supervisores); lo "permanente" es historial real — auditoría,
// kardex, movimientos de Almacén, devoluciones, procura — que nunca debe
// borrarse aunque la cuenta se haya creado solo para probar.
const CATEGORIAS_LIMPIABLES = {
  vales: 'vale(s)',
  rdc_reportes: 'reporte(s) del RDC',
  rdc_supervisores_vinculado: 'vínculo con el catálogo de supervisores del RDC',
}
const CATEGORIAS_PERMANENTES = {
  auditoria: 'fila(s) de auditoría',
  reservas: 'reserva(s) de stock',
  ingresos: 'ingreso(s) de Almacén',
  ajustes: 'ajuste(s) de Almacén',
  salidas: 'entrega(s) física(s)',
  kardex: 'movimiento(s) de kardex',
  metrados_procura: 'metrado(s) de Procura',
  alertas_resueltas: 'alerta(s) resuelta(s)',
  devoluciones: 'devolución(es)',
  configuracion: 'cambio(s) de configuración',
}

function detalleDiagnostico(diagnostico, categorias) {
  return Object.entries(categorias)
    .filter(([clave]) => diagnostico[clave])
    .map(([clave, etiqueta]) => (typeof diagnostico[clave] === 'number' ? `${diagnostico[clave]} ${etiqueta}` : etiqueta))
}

const usuarios = useUsuariosStore()
const auth = useAuthStore()

const busqueda = ref('')
// Muchas cuentas de prueba se quedan "inactivo" para siempre a propósito
// (tienen historial real — auditoría, kardex, etc. — que nunca se borra),
// así que ocultarlas por defecto evita que llenen la lista.
const mostrarInactivos = ref(false)
const mostrarModal = ref(false)
const usuarioEnEdicion = ref(null)
const usuarioCreado = ref(null) // { usuario, passwordTemporal }
const usuarioParaRestablecer = ref(null)
const passwordRestablecida = ref(null) // { usuario, passwordTemporal }
const aviso = ref('')
const errorAccion = ref('')

const puedeCrear = computed(() => auth.tienePermiso('usuarios.crear'))
const puedeEliminar = computed(() => auth.tienePermiso('usuarios.desactivar'))
const puedeForzarBorrado = computed(() => auth.tienePermiso('sistema.borrar_pruebas'))
const puedeRestablecerPassword = computed(() => auth.tienePermiso('usuarios.editar'))
const puedeEditar = computed(() => auth.tienePermiso('usuarios.editar') || puedeEliminar.value)

const usuariosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return usuarios.usuarios.filter((u) => {
    if (!mostrarInactivos.value && u.estado === 'inactivo') return false
    if (!q) return true
    return u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })
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

function abrirRestablecer(usuario) {
  errorAccion.value = ''
  usuarioParaRestablecer.value = usuario
}

async function confirmarRestablecer(password) {
  const { usuario, password: passwordUsada } = await usuarios.restablecerPassword(usuarioParaRestablecer.value.id, password)
  usuarioParaRestablecer.value = null
  passwordRestablecida.value = { usuario, passwordTemporal: passwordUsada }
}

async function eliminar(usuario) {
  if (!confirm(`¿Eliminar a "${usuario.nombre}"?`)) return
  aviso.value = ''
  errorAccion.value = ''
  try {
    const resultado = await usuarios.eliminar(usuario.id)
    if (resultado.eliminado) {
      aviso.value = 'Usuario eliminado.'
      return
    }

    if (!puedeForzarBorrado.value) {
      aviso.value = 'Este usuario ya generó movimientos (ingresos, vales, etc.), así que no se puede eliminar: se desactivó en su lugar.'
      return
    }

    // En vez de adivinar con el mensaje genérico de Postgres, se pregunta
    // tabla por tabla qué sigue atado a esta cuenta, para saber si lo que
    // falta es limpiable (vales/reportes de prueba) o es historial real
    // que nunca debe borrarse (auditoría, kardex, movimientos de Almacén…).
    const diagnostico = await diagnosticarBloqueoUsuario(usuario.id)
    const permanentes = detalleDiagnostico(diagnostico, CATEGORIAS_PERMANENTES)
    const limpiables = detalleDiagnostico(diagnostico, CATEGORIAS_LIMPIABLES)

    if (permanentes.length) {
      aviso.value =
        `No se puede eliminar del todo — tiene historial real que nunca se borra: ${permanentes.join(', ')}. ` +
        'Quedó desactivado, que es el estado correcto para esta cuenta (ya no puede iniciar sesión).'
      return
    }

    if (!limpiables.length) {
      aviso.value = `No se pudo eliminar por un motivo no identificado${resultado.motivo ? `: ${resultado.motivo}` : '.'}`
      return
    }

    const forzar = confirm(`Se puede limpiar y borrar del todo: ${limpiables.join(', ')}. ¿Forzar el borrado?`)
    if (!forzar) return

    const resultadoForzado = await usuarios.forzarEliminacion(usuario.id)
    aviso.value = resultadoForzado.eliminado
      ? 'Usuario eliminado.'
      : `No se pudo terminar de eliminar${resultadoForzado.motivo ? `: ${resultadoForzado.motivo}` : '.'} Quedó desactivado.`
  } catch (e) {
    console.error(e)
    errorAccion.value = e.message || 'No se pudo eliminar el usuario.'
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
      <label class="check-inactivos">
        <input v-model="mostrarInactivos" type="checkbox" />
        Mostrar inactivos
      </label>
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="errorAccion" class="error">{{ errorAccion }}</p>
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
          <td v-if="puedeEditar" class="acciones-fila">
            <BotonIcono variante="editar" titulo="Editar" @click="abrirEditar(u)" />
            <BotonIcono
              v-if="puedeRestablecerPassword"
              variante="corregir"
              titulo="Restablecer contraseña"
              @click="abrirRestablecer(u)"
            />
            <BotonIcono
              v-if="puedeEliminar && u.id !== auth.session?.user?.id"
              variante="eliminar"
              titulo="Eliminar"
              @click="eliminar(u)"
            />
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

    <RestablecerPasswordModal
      v-if="usuarioParaRestablecer"
      :usuario="usuarioParaRestablecer"
      @confirmar="confirmarRestablecer"
      @cerrar="usuarioParaRestablecer = null"
    />

    <PasswordTemporalModal
      v-if="passwordRestablecida"
      titulo="Contraseña restablecida"
      :usuario="passwordRestablecida.usuario"
      :password-temporal="passwordRestablecida.passwordTemporal"
      @cerrar="passwordRestablecida = null"
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
  color: var(--color-text);
}
.filtros {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.filtros input[type='search'] {
  width: 320px;
  max-width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.check-inactivos {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  cursor: pointer;
}
.check-inactivos input {
  width: auto;
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
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.activo {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.inactivo {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.acciones-fila {
  display: flex;
  gap: 0.25rem;
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

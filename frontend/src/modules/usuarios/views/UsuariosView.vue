<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useUsuariosStore } from '../store/usuarios'
import { useAuthStore } from '../../../store/auth'
import { diagnosticarBloqueoUsuario } from '../services/usuariosService'
import { listarAsignaciones } from '../../configuracion/services/rolesPermisosService'
import PasswordTemporalModal from '../components/PasswordTemporalModal.vue'
import RestablecerPasswordModal from '../components/RestablecerPasswordModal.vue'

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

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------
const DESCRIPCION_ROL = {
  Developer: 'Acceso total y herramientas de prueba',
  Administrador: 'Control total, incluye usuarios y roles',
  Coordinador: 'Opera casi todo el sistema',
  Planeamiento: 'Metrados Procura, consumo y frentes',
  Almacen: 'Ingresos, ajustes, vales y entregas',
  Residencia: 'Vales y reportes de su obra',
  Supervisor: 'Crea y sigue los vales de su frente',
  Consulta: 'Solo lectura y exportación',
}
const ORDEN_ROLES = ['Developer', 'Administrador', 'Coordinador', 'Planeamiento', 'Almacen', 'Residencia', 'Supervisor', 'Consulta']
const CORREO_SERVICIO = 'mantenimiento@invalid.local'
const nombreRol = (n) => (n === 'Almacen' ? 'Almacén' : n)
const claseRol = (n) => (ORDEN_ROLES.includes(n) ? `r-${n}` : 'r-otro')
const iniciales = (n) =>
  (n ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase()
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const etiquetaContrato = (c) => (c ? `${c.codigo ? c.codigo + ' — ' : ''}${c.nombre}` : 'Sin contrato')

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------
const puedeCrear = computed(() => auth.tienePermiso('usuarios.crear'))
const puedeDesactivar = computed(() => auth.tienePermiso('usuarios.desactivar'))
const puedeForzarBorrado = computed(() => auth.tienePermiso('sistema.borrar_pruebas'))
const puedeRestablecerPassword = computed(() => auth.tienePermiso('usuarios.editar'))
const puedeEditar = computed(() => auth.tienePermiso('usuarios.editar') || puedeDesactivar.value)
const puedeVerRoles = computed(() => auth.tienePermiso('roles.gestionar'))

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------
const permisosPorRol = ref({}) // { rolId: n } contado en vivo de rol_permisos

onMounted(async () => {
  usuarios.cargar()
  try {
    const asignaciones = await listarAsignaciones()
    const conteo = {}
    for (const a of asignaciones) conteo[a.rol_id] = (conteo[a.rol_id] ?? 0) + 1
    permisosPorRol.value = conteo
  } catch (e) {
    console.error('No se pudo contar los permisos por rol', e)
  }
  document.addEventListener('keydown', alTeclear)
})
onUnmounted(() => document.removeEventListener('keydown', alTeclear))

const rolesOrdenados = computed(() => {
  const pos = (n) => {
    const i = ORDEN_ROLES.indexOf(n)
    return i === -1 ? ORDEN_ROLES.length : i
  }
  return [...usuarios.roles].sort((a, b) => pos(a.nombre) - pos(b.nombre) || a.nombre.localeCompare(b.nombre))
})
const rolPorId = computed(() => new Map(usuarios.roles.map((r) => [r.id, r])))
const descripcionRol = (r) => r.descripcion || DESCRIPCION_ROL[r.nombre] || ''
const permisosDeRol = (rolId) => permisosPorRol.value[rolId] ?? 0

// ---------------------------------------------------------------------------
// Lista y filtros
// ---------------------------------------------------------------------------
const busqueda = ref('')
const filtroEstado = ref('todos')
const filtroRol = ref('todos')

const usuariosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return usuarios.usuarios.filter(
    (u) =>
      (filtroEstado.value === 'todos' || u.estado === filtroEstado.value) &&
      (filtroRol.value === 'todos' || u.rol_id === filtroRol.value) &&
      (!q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
  )
})
const activos = computed(() => usuarios.usuarios.filter((u) => u.estado === 'activo').length)
const conteoRol = (rolId) => usuarios.usuarios.filter((u) => u.rol_id === rolId).length

// ---------------------------------------------------------------------------
// Panel de edición
// ---------------------------------------------------------------------------
const panelAbierto = ref(false)
const esNuevo = ref(false)
const usuarioSel = ref(null)
const borrador = reactive({
  nombre: '',
  email: '',
  rol_id: '',
  contrato_id: '',
  frente_id: '',
  estado: 'activo',
  heredar: false,
  password: '',
})
const guardando = ref(false)
const errorPanel = ref('')
const preguntaDesactivar = ref(false)

const esCuentaPropia = computed(() => !esNuevo.value && usuarioSel.value?.id === auth.session?.user?.id)
const esCuentaServicio = computed(() => usuarioSel.value?.email === CORREO_SERVICIO)
// Solo lectura: sin permiso de editar, o la cuenta de servicio.
const soloLectura = computed(() => !esNuevo.value && (!puedeEditar.value || esCuentaServicio.value))
const bloqueaRolYEstado = computed(() => esCuentaPropia.value)

const rolBorrador = computed(() => rolPorId.value.get(borrador.rol_id) ?? null)
const esSupervisor = computed(() => rolBorrador.value?.nombre === 'Supervisor')

function llenarBorrador(u) {
  borrador.nombre = u?.nombre ?? ''
  borrador.email = u?.email ?? ''
  borrador.rol_id = u?.rol_id ?? rolesOrdenados.value.find((r) => r.nombre === 'Supervisor')?.id ?? rolesOrdenados.value[0]?.id ?? ''
  borrador.contrato_id = u?.contrato_id ?? ''
  borrador.frente_id = u?.frente_id ?? ''
  borrador.estado = u?.estado ?? 'activo'
  borrador.heredar = !!u?.rdc_heredar_reporte_completo
  borrador.password = ''
}

function abrirEditar(u) {
  usuarioSel.value = u
  esNuevo.value = false
  llenarBorrador(u)
  errorPanel.value = ''
  preguntaDesactivar.value = false
  panelAbierto.value = true
}
function abrirNuevo() {
  usuarioSel.value = null
  esNuevo.value = true
  llenarBorrador(null)
  errorPanel.value = ''
  preguntaDesactivar.value = false
  panelAbierto.value = true
}
function cerrarPanel() {
  panelAbierto.value = false
  usuarioSel.value = null
  esNuevo.value = false
  preguntaDesactivar.value = false
}

const hayCambios = computed(() => {
  if (esNuevo.value) return !!(borrador.nombre.trim() || borrador.email.trim())
  const u = usuarioSel.value
  if (!u) return false
  return (
    borrador.nombre !== u.nombre ||
    borrador.rol_id !== u.rol_id ||
    (borrador.contrato_id || '') !== (u.contrato_id || '') ||
    (borrador.frente_id || '') !== (u.frente_id || '') ||
    borrador.estado !== u.estado ||
    borrador.heredar !== !!u.rdc_heredar_reporte_completo
  )
})
const correoValido = computed(() => /.+@.+\..+/.test(borrador.email.trim()))
const puedeGuardar = computed(() => {
  if (guardando.value) return false
  if (esNuevo.value) return !!borrador.nombre.trim() && correoValido.value && !!borrador.rol_id && (!borrador.password || borrador.password.length >= 8)
  return hayCambios.value && !!borrador.nombre.trim()
})

// Tocar el fondo cierra solo si no hay nada escrito: perder lo tipeado por un
// toque accidental fue un problema real en otros formularios.
function tocarFondo() {
  if (!hayCambios.value) cerrarPanel()
}
function alTeclear(e) {
  if (e.key === 'Escape' && panelAbierto.value && !dialogo.value) tocarFondo()
}

function elegirRol(rolId) {
  if (soloLectura.value || bloqueaRolYEstado.value) return
  borrador.rol_id = rolId
  if (rolPorId.value.get(rolId)?.nombre !== 'Supervisor') borrador.heredar = false
}
const notaCambioRol = computed(() => {
  const u = usuarioSel.value
  if (esNuevo.value || !u || u.rol_id === borrador.rol_id) return ''
  return `Pasa de ${permisosDeRol(u.rol_id)} a ${permisosDeRol(borrador.rol_id)} permisos. El cambio se aplica al guardar y al volver a iniciar sesión.`
})

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
const aviso = ref('')
let temporizador = null
function avisar(texto) {
  aviso.value = texto
  clearTimeout(temporizador)
  temporizador = setTimeout(() => (aviso.value = ''), 2400)
}
const mensaje = ref('') // textos largos de resultado (borrado de cuentas de prueba)
const errorAccion = ref('')

// Confirmación propia (no confirm()): devuelve una promesa con la respuesta.
const dialogo = ref(null)
function pedir({ titulo, texto, textoOk }) {
  return new Promise((resolver) => {
    dialogo.value = { titulo, texto, textoOk, resolver }
  })
}
function responderDialogo(valor) {
  const d = dialogo.value
  dialogo.value = null
  d?.resolver(valor)
}

// ---------------------------------------------------------------------------
// Guardar / crear / desactivar
// ---------------------------------------------------------------------------
const usuarioCreado = ref(null) // { usuario, passwordTemporal }

async function guardar() {
  if (!puedeGuardar.value) return
  errorPanel.value = ''
  guardando.value = true
  try {
    if (esNuevo.value) {
      const { usuario, passwordTemporal } = await usuarios.crear({
        email: borrador.email.trim(),
        nombre: borrador.nombre.trim(),
        rol_id: borrador.rol_id,
        frente_id: borrador.frente_id || null,
        contrato_id: borrador.contrato_id || null,
        password: borrador.password.trim() || undefined,
      })
      // El alta no recibe este dato: se marca justo después, con la misma
      // función de actualizar que usa la edición.
      if (borrador.heredar && esSupervisor.value) {
        await usuarios.actualizar(usuario.id, { rdc_heredar_reporte_completo: true })
      }
      cerrarPanel()
      avisar('Usuario creado')
      usuarioCreado.value = { usuario, passwordTemporal }
    } else {
      await usuarios.actualizar(usuarioSel.value.id, {
        nombre: borrador.nombre.trim(),
        rol_id: borrador.rol_id,
        frente_id: borrador.frente_id || null,
        contrato_id: borrador.contrato_id || null,
        estado: borrador.estado,
        rdc_heredar_reporte_completo: esSupervisor.value ? borrador.heredar : false,
      })
      cerrarPanel()
      avisar('Cambios guardados')
    }
  } catch (e) {
    console.error(e)
    errorPanel.value = e?.message || 'No se pudo guardar el usuario.'
  } finally {
    guardando.value = false
  }
}

/** Desactivar solo cambia `estado`: la cuenta deja de poder entrar y no se borra nada. */
async function desactivar() {
  const u = usuarioSel.value
  errorPanel.value = ''
  guardando.value = true
  try {
    await usuarios.actualizar(u.id, { estado: 'inactivo' })
    cerrarPanel()
    avisar(`${u.nombre} desactivado`)
  } catch (e) {
    console.error(e)
    errorPanel.value = e?.message || 'No se pudo desactivar el usuario.'
  } finally {
    guardando.value = false
  }
}

// ---------------------------------------------------------------------------
// Restablecer contraseña (igual que antes)
// ---------------------------------------------------------------------------
const usuarioParaRestablecer = ref(null)
const passwordRestablecida = ref(null)
function abrirRestablecer() {
  usuarioParaRestablecer.value = usuarioSel.value
}
async function confirmarRestablecer(password) {
  const { usuario, password: passwordUsada } = await usuarios.restablecerPassword(usuarioParaRestablecer.value.id, password)
  usuarioParaRestablecer.value = null
  passwordRestablecida.value = { usuario, passwordTemporal: passwordUsada }
}

// ---------------------------------------------------------------------------
// Borrar una cuenta de prueba (solo con 'sistema.borrar_pruebas'): misma
// lógica de siempre, con confirmaciones dentro de la página.
// ---------------------------------------------------------------------------
async function eliminarCuentaPrueba() {
  const usuario = usuarioSel.value
  const ok = await pedir({
    titulo: `Eliminar la cuenta de prueba "${usuario.nombre}"`,
    texto: 'Se borra la cuenta si no tiene historial; si lo tiene, solo queda desactivada.',
    textoOk: 'Intentar eliminar',
  })
  if (!ok) return
  mensaje.value = ''
  errorAccion.value = ''
  try {
    const resultado = await usuarios.eliminar(usuario.id)
    cerrarPanel()
    if (resultado.eliminado) {
      mensaje.value = 'Usuario eliminado.'
      return
    }

    // Se pregunta tabla por tabla qué sigue atado a esta cuenta, para saber si
    // lo que falta es limpiable (vales/reportes de prueba) o historial real.
    const diagnostico = await diagnosticarBloqueoUsuario(usuario.id)
    const permanentes = detalleDiagnostico(diagnostico, CATEGORIAS_PERMANENTES)
    const limpiables = detalleDiagnostico(diagnostico, CATEGORIAS_LIMPIABLES)

    if (permanentes.length) {
      mensaje.value =
        `No se puede eliminar del todo — tiene historial real que nunca se borra: ${permanentes.join(', ')}. ` +
        'Quedó desactivado, que es el estado correcto para esta cuenta (ya no puede iniciar sesión).'
      return
    }
    if (!limpiables.length) {
      mensaje.value = `No se pudo eliminar por un motivo no identificado${resultado.motivo ? `: ${resultado.motivo}` : '.'}`
      return
    }

    const forzar = await pedir({
      titulo: 'Limpiar y borrar del todo',
      texto: `Se puede limpiar y borrar del todo: ${limpiables.join(', ')}.`,
      textoOk: 'Forzar el borrado',
    })
    if (!forzar) return

    const forzado = await usuarios.forzarEliminacion(usuario.id)
    mensaje.value = forzado.eliminado
      ? 'Usuario eliminado.'
      : `No se pudo terminar de eliminar${forzado.motivo ? `: ${forzado.motivo}` : '.'} Quedó desactivado.`
  } catch (e) {
    console.error(e)
    errorAccion.value = e.message || 'No se pudo eliminar el usuario.'
  }
}
</script>

<template>
  <div class="us">
    <header class="us-head">
      <div class="us-head-t">
        <h1>Usuarios y roles</h1>
        <p v-if="!usuarios.cargando">{{ plural(usuarios.usuarios.length, 'usuario', 'usuarios') }} · {{ plural(activos, 'activo', 'activos') }} · {{ plural(usuarios.roles.length, 'rol', 'roles') }}</p>
      </div>
      <router-link v-if="puedeVerRoles" to="/configuracion/roles" class="ghost">Roles y permisos</router-link>
      <button v-if="puedeCrear" type="button" class="cta" @click="abrirNuevo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Nuevo usuario
      </button>
    </header>

    <div class="tools">
      <label class="srch">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input v-model="busqueda" type="search" placeholder="Buscar por nombre o correo…" aria-label="Buscar usuario" />
      </label>
      <div class="seg" role="group" aria-label="Estado">
        <button v-for="e in [['todos', 'Todos'], ['activo', 'Activos'], ['inactivo', 'Inactivos']]" :key="e[0]" type="button" :aria-pressed="filtroEstado === e[0]" @click="filtroEstado = e[0]">{{ e[1] }}</button>
      </div>
    </div>

    <div class="hs" role="group" aria-label="Filtrar por rol">
      <button type="button" class="chip" :aria-pressed="filtroRol === 'todos'" @click="filtroRol = 'todos'">Todos los roles</button>
      <button v-for="r in rolesOrdenados" :key="r.id" type="button" class="chip" :aria-pressed="filtroRol === r.id" @click="filtroRol = r.id">
        {{ nombreRol(r.nombre) }}<i>{{ conteoRol(r.id) }}</i>
      </button>
    </div>

    <p v-if="mensaje" class="us-msg">{{ mensaje }} <button type="button" class="cerrar-msg" aria-label="Cerrar aviso" @click="mensaje = ''">✕</button></p>
    <p v-if="errorAccion" class="us-error" role="alert">{{ errorAccion }}</p>
    <p v-if="usuarios.error" class="us-error" role="alert">{{ usuarios.error }}</p>
    <p v-if="usuarios.cargando" class="us-vacio">Cargando usuarios…</p>

    <div v-else class="card">
      <div class="th"><span>USUARIO</span><span>ROL</span><span>CONTRATO</span><span>ESTADO</span><span></span></div>
      <button
        v-for="u in usuariosFiltrados"
        :key="u.id"
        type="button"
        class="ur"
        :aria-current="panelAbierto && usuarioSel?.id === u.id"
        @click="abrirEditar(u)"
      >
        <span class="who">
          <span class="av" aria-hidden="true">{{ iniciales(u.nombre) }}</span>
          <span class="who-t"><b>{{ u.nombre }}</b><small>{{ u.email }}</small></span>
        </span>
        <span class="rol"><span class="pill" :class="claseRol(u.roles?.nombre)">{{ nombreRol(u.roles?.nombre ?? '—') }}</span></span>
        <span class="ct mu">{{ etiquetaContrato(u.contratos) }}</span>
        <span class="est"><span class="es" :class="{ off: u.estado !== 'activo' }">{{ u.estado === 'activo' ? 'Activo' : 'Inactivo' }}</span></span>
        <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        <span class="mob">
          <span class="es" :class="{ off: u.estado !== 'activo' }">{{ u.estado === 'activo' ? 'Activo' : 'Inactivo' }}</span>
          <span>{{ etiquetaContrato(u.contratos) }}</span>
        </span>
      </button>
      <div v-if="!usuariosFiltrados.length" class="us-vacio caja">Ningún usuario coincide con los filtros.</div>
    </div>

    <!-- ============================ PANEL LATERAL ============================ -->
    <template v-if="panelAbierto">
      <div class="scrim" @click="tocarFondo"></div>
      <section class="panel" role="dialog" aria-modal="true" :aria-label="esNuevo ? 'Nuevo usuario' : borrador.nombre">
        <div class="ph">
          <span v-if="!esNuevo" class="av" aria-hidden="true">{{ iniciales(borrador.nombre) }}</span>
          <h2>{{ esNuevo ? 'Nuevo usuario' : borrador.nombre }}</h2>
          <button type="button" class="x" aria-label="Cerrar" @click="cerrarPanel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <form class="pb" @submit.prevent="guardar">
          <p v-if="esCuentaServicio" class="note">Cuenta de servicio del sistema: solo se puede consultar.</p>
          <p v-else-if="esCuentaPropia" class="note">No puedes cambiar tu propia cuenta (rol ni estado).</p>

          <div class="fl">
            <label class="lab" for="u-nombre">NOMBRE</label>
            <input id="u-nombre" v-model="borrador.nombre" class="fld" autocomplete="off" :readonly="soloLectura" />
          </div>
          <div class="fl">
            <label class="lab" for="u-correo">CORREO</label>
            <input id="u-correo" v-model="borrador.email" class="fld" type="email" inputmode="email" autocomplete="off" :readonly="!esNuevo" />
          </div>
          <div v-if="esNuevo" class="fl">
            <label class="lab" for="u-pass">CONTRASEÑA INICIAL <em>(opcional)</em></label>
            <input id="u-pass" v-model="borrador.password" class="fld" type="text" autocomplete="off" placeholder="En blanco: se genera una automática" />
            <small class="ayuda">Mínimo 8 caracteres. Al crear, verás la contraseña para entregársela.</small>
          </div>

          <div class="fl">
            <span id="u-rol" class="lab">ROL</span>
            <div class="rg" role="radiogroup" aria-labelledby="u-rol">
              <button
                v-for="r in rolesOrdenados"
                :key="r.id"
                type="button"
                class="ro"
                role="radio"
                :aria-checked="borrador.rol_id === r.id"
                :disabled="soloLectura || bloqueaRolYEstado"
                @click="elegirRol(r.id)"
              >
                <span class="dot"></span>
                <span class="ro-t"><b>{{ nombreRol(r.nombre) }}</b><small>{{ descripcionRol(r) }}</small></span>
                <span class="pill num">{{ permisosDeRol(r.id) }}</span>
              </button>
            </div>
          </div>
          <p v-if="notaCambioRol" class="note">{{ notaCambioRol }}</p>

          <div class="fl">
            <label class="lab" for="u-contrato">CONTRATO</label>
            <select id="u-contrato" v-model="borrador.contrato_id" class="fld" :disabled="soloLectura">
              <option value="">Sin contrato</option>
              <option v-for="c in usuarios.contratos" :key="c.id" :value="c.id">{{ c.codigo ? c.codigo + ' — ' : '' }}{{ c.nombre }}</option>
            </select>
            <small class="ayuda">Define qué stock puede ver un Supervisor. No cambia aunque rote de frente.</small>
          </div>
          <div class="fl">
            <label class="lab" for="u-frente">FRENTE <em>(opcional)</em></label>
            <select id="u-frente" v-model="borrador.frente_id" class="fld" :disabled="soloLectura">
              <option value="">Ninguno</option>
              <option v-for="f in usuarios.frentes" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
            </select>
          </div>

          <div v-if="esSupervisor" class="row2">
            <div class="t"><b>Ve el reporte completo de su frente</b><small>Hereda el reporte diario completo en lugar de solo los suyos.</small></div>
            <button type="button" class="sw" role="switch" :aria-checked="borrador.heredar" aria-label="Ve el reporte completo de su frente" :disabled="soloLectura" @click="borrador.heredar = !borrador.heredar"></button>
          </div>

          <div v-if="!esNuevo" class="row2">
            <div class="t">
              <b>Cuenta activa</b>
              <small>{{ borrador.estado === 'activo' ? 'Puede iniciar sesión.' : 'No puede iniciar sesión. Sus datos se conservan.' }}</small>
            </div>
            <button
              type="button"
              class="sw"
              role="switch"
              :aria-checked="borrador.estado === 'activo'"
              aria-label="Cuenta activa"
              :disabled="soloLectura || bloqueaRolYEstado"
              @click="borrador.estado = borrador.estado === 'activo' ? 'inactivo' : 'activo'"
            ></button>
          </div>

          <div v-if="!esNuevo && !soloLectura && puedeRestablecerPassword" class="enlaces">
            <button type="button" class="enlace" @click="abrirRestablecer">Restablecer contraseña</button>
          </div>

          <template v-if="!esNuevo && !soloLectura && !bloqueaRolYEstado && usuarioSel.estado === 'activo' && puedeDesactivar">
            <div v-if="preguntaDesactivar" class="conf">
              <div>¿Desactivar a {{ usuarioSel.nombre }}? Deja de poder entrar, pero no se borra nada.</div>
              <div class="b">
                <button type="button" class="no" @click="preguntaDesactivar = false">Volver</button>
                <button type="button" class="yes" :disabled="guardando" @click="desactivar">Sí, desactivar</button>
              </div>
            </div>
            <button v-else type="button" class="danger" @click="preguntaDesactivar = true">Desactivar usuario</button>
          </template>

          <button v-if="!esNuevo && !soloLectura && !bloqueaRolYEstado && puedeForzarBorrado" type="button" class="enlace tenue" @click="eliminarCuentaPrueba">
            Eliminar cuenta de prueba…
          </button>

          <p v-if="errorPanel" class="us-error" role="alert">{{ errorPanel }}</p>
        </form>

        <div class="pf">
          <button type="button" class="ghost" @click="cerrarPanel">{{ soloLectura ? 'Cerrar' : 'Cancelar' }}</button>
          <button v-if="!soloLectura" type="button" class="cta" :disabled="!puedeGuardar" @click="guardar">
            {{ guardando ? 'Guardando…' : esNuevo ? 'Crear usuario' : 'Guardar cambios' }}
          </button>
        </div>
      </section>
    </template>

    <div class="toast" :class="{ on: aviso }" role="status">{{ aviso }}</div>

    <!-- Confirmación dentro de la página -->
    <div v-if="dialogo" class="dlg-fondo">
      <div class="dlg" role="alertdialog" aria-modal="true" :aria-label="dialogo.titulo">
        <h3>{{ dialogo.titulo }}</h3>
        <p>{{ dialogo.texto }}</p>
        <div class="dlg-acc">
          <button type="button" class="ghost" autofocus @click="responderDialogo(false)">Cancelar</button>
          <button type="button" class="cta peligro" @click="responderDialogo(true)">{{ dialogo.textoOk }}</button>
        </div>
      </div>
    </div>

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
.us {
  --bg: var(--color-bg);
  --sf: var(--color-surface);
  --so: var(--color-surface-2);
  --ln: var(--color-border);
  --tx: var(--color-text);
  --mu: var(--color-text-muted);
  --am: var(--color-primary);
  --amb: color-mix(in srgb, var(--color-primary) 16%, transparent);
  --amt: color-mix(in srgb, var(--color-primary) 62%, var(--color-text));
  --gr: color-mix(in srgb, var(--color-success) 70%, var(--color-text));
  --grv: var(--color-success);
  --grb: color-mix(in srgb, var(--color-success) 15%, transparent);
  --rd: color-mix(in srgb, var(--color-danger) 75%, var(--color-text));
  --rdb: color-mix(in srgb, var(--color-danger) 13%, transparent);
  --bl: color-mix(in srgb, var(--color-info) 70%, var(--color-text));
  --blb: color-mix(in srgb, var(--color-info) 14%, transparent);
  --vi: color-mix(in srgb, #7c5cff 70%, var(--color-text));
  --vib: color-mix(in srgb, #7c5cff 15%, transparent);
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--tx);
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px max(16px, env(safe-area-inset-left, 0px)) 24px max(16px, env(safe-area-inset-right, 0px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 14px;
  line-height: 1.4;
}
button,
input,
select {
  font: inherit;
  color: inherit;
}
button {
  cursor: pointer;
}
:focus-visible {
  outline: 2px solid var(--am);
  outline-offset: 2px;
}
.us-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.us-head-t {
  flex: 1 1 220px;
}
h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.us-head p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--mu);
  font-weight: 600;
}
.cta {
  border: 0;
  background: var(--am);
  color: var(--color-primary-ink);
  height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  font-weight: 800;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.cta:hover {
  filter: brightness(0.95);
}
.cta:disabled {
  opacity: 0.45;
  cursor: default;
}
.cta.peligro {
  background: var(--color-danger);
  color: #fff;
}
.ghost {
  border: 0;
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 13.5px;
  color: var(--tx);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.srch {
  flex: 1 1 260px;
  position: relative;
  min-width: 0;
}
.srch svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--mu);
}
.srch input {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 12px;
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  padding: 0 12px 0 36px;
  font-size: 14px;
  font-weight: 600;
}
.seg {
  display: inline-flex;
  background: var(--so);
  border-radius: 13px;
  padding: 3px;
}
.seg button {
  border: 0;
  background: none;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 13px;
  color: var(--mu);
  white-space: nowrap;
}
.seg button[aria-pressed='true'] {
  background: var(--sf);
  color: var(--tx);
  box-shadow: 0 0 0 1px var(--ln);
}
.hs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.hs::-webkit-scrollbar {
  display: none;
}
.chip {
  border: 0;
  background: var(--so);
  color: var(--mu);
  height: 36px;
  padding: 0 14px;
  border-radius: 99px;
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  flex: 0 0 auto;
}
.chip[aria-pressed='true'] {
  background: var(--tx);
  color: var(--bg);
}
.chip i {
  font-style: normal;
  margin-left: 6px;
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
}
.us-msg {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--so);
  font-size: 13.5px;
  font-weight: 600;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}
.cerrar-msg {
  border: 0;
  background: none;
  color: var(--mu);
  flex: none;
}
.us-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 13.5px;
  font-weight: 600;
}
.us-vacio {
  margin: 0;
  color: var(--mu);
  font-weight: 600;
}
.us-vacio.caja {
  padding: 30px 16px;
  text-align: center;
}
.card {
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  border-radius: 18px;
  overflow: hidden;
}
.th,
.ur {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) minmax(0, 1.1fr) minmax(0, 1.2fr) 110px 36px;
  gap: 12px;
  align-items: center;
  padding: 0 16px;
}
.th {
  height: 42px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
  color: var(--mu);
  border-bottom: 1px solid var(--ln);
}
.ur {
  width: 100%;
  min-height: 64px;
  border: 0;
  border-top: 1px solid var(--ln);
  background: none;
  text-align: left;
}
.th + .ur {
  border-top: 0;
}
.ur:hover,
.ur[aria-current='true'] {
  background: var(--so);
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.who-t {
  min-width: 0;
}
.av {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex: none;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  font-weight: 800;
  background: var(--so);
  color: var(--tx);
  box-shadow: inset 0 0 0 1px var(--ln);
}
.ur[aria-current='true'] .av {
  background: var(--sf);
}
.who b {
  display: block;
  font-size: 14px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who small {
  display: block;
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill {
  font-size: 12px;
  font-weight: 800;
  border-radius: 99px;
  padding: 3px 10px;
  white-space: nowrap;
  display: inline-block;
}
.pill.num {
  background: var(--so);
  color: var(--mu);
}
.r-Developer,
.r-Administrador {
  background: var(--rdb);
  color: var(--rd);
}
.r-Coordinador {
  background: var(--vib);
  color: var(--vi);
}
.r-Planeamiento {
  background: var(--blb);
  color: var(--bl);
}
.r-Almacen {
  background: var(--amb);
  color: var(--amt);
}
.r-Residencia {
  background: var(--grb);
  color: var(--gr);
}
.r-Supervisor {
  background: var(--so);
  color: var(--tx);
  box-shadow: inset 0 0 0 1px var(--ln);
}
.r-Consulta,
.r-otro {
  background: var(--so);
  color: var(--mu);
}
.mu {
  font-size: 13px;
  color: var(--mu);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.es {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
}
.es::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--grv);
}
.es.off {
  color: var(--mu);
}
.es.off::before {
  background: var(--mu);
  opacity: 0.6;
}
.chev {
  color: var(--mu);
  justify-self: end;
}
.mob {
  display: none;
}

/* ----- Panel lateral ----- */
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 30;
}
.panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 100%);
  background: var(--sf);
  z-index: 31;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top, 0px);
}
.ph {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--ln);
}
.ph h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.x {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 0;
  background: var(--so);
  display: grid;
  place-items: center;
}
.pb {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.fl {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lab {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
  color: var(--mu);
}
.lab em {
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0;
}
.fld {
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--so);
  box-shadow: inset 0 0 0 1px var(--ln);
  padding: 0 12px;
  font-size: 16px; /* iOS no hace zoom al enfocar */
  font-weight: 600;
  width: 100%;
  min-width: 0;
}
.fld[readonly],
.fld:disabled {
  color: var(--mu);
}
.ayuda {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
}
.rg {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ro {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--so);
  box-shadow: inset 0 0 0 1px var(--ln);
  text-align: left;
  width: 100%;
}
.ro:disabled {
  opacity: 0.6;
  cursor: default;
}
.ro-t {
  flex: 1;
  min-width: 0;
}
.ro b {
  font-size: 14px;
  font-weight: 800;
  display: block;
}
.ro small {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
}
.ro[aria-checked='true'] {
  background: var(--sf);
  box-shadow: inset 0 0 0 2px var(--tx);
}
.dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px var(--ln);
  flex: none;
}
.ro[aria-checked='true'] .dot {
  background: var(--tx);
  box-shadow: inset 0 0 0 5px var(--sf), 0 0 0 2px var(--tx);
}
.row2 {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 8px 0;
  border-top: 1px solid var(--ln);
}
.row2 .t {
  flex: 1;
  min-width: 0;
}
.row2 b {
  display: block;
  font-size: 14px;
  font-weight: 700;
}
.row2 small {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
}
.sw {
  position: relative;
  flex: none;
  width: 48px;
  height: 28px;
  border-radius: 99px;
  border: 0;
  background: var(--ln);
  transition: background 0.15s;
}
.sw::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s;
}
.sw[aria-checked='true'] {
  background: var(--grv);
}
.sw[aria-checked='true']::after {
  transform: translateX(20px);
}
.sw:disabled {
  opacity: 0.5;
  cursor: default;
}
.note {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--amb);
  color: var(--amt);
}
.enlaces {
  display: flex;
  gap: 14px;
}
.enlace {
  border: 0;
  background: none;
  color: var(--bl);
  font-weight: 800;
  font-size: 13.5px;
  padding: 10px 0;
  align-self: flex-start;
}
.enlace.tenue {
  color: var(--mu);
  font-weight: 700;
  font-size: 12.5px;
}
.danger {
  border: 0;
  background: none;
  color: var(--rd);
  font-weight: 800;
  font-size: 13.5px;
  padding: 10px 0;
  align-self: flex-start;
}
.conf {
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: inset 0 0 0 1px var(--rd);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-weight: 700;
  font-size: 13.5px;
}
.conf .b {
  display: flex;
  gap: 8px;
}
.conf button {
  flex: 1;
  height: 40px;
  border: 0;
  border-radius: 12px;
  font-weight: 800;
}
.conf .no {
  background: var(--so);
}
.conf .yes {
  background: var(--color-danger);
  color: #fff;
}
.pf {
  display: flex;
  gap: 10px;
  padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--ln);
}
.pf .ghost,
.pf .cta {
  flex: 1;
  height: 44px;
}
.toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  background: var(--tx);
  color: var(--bg);
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 13px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 60;
}
.toast.on {
  opacity: 1;
}
.dlg-fondo {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 14, 0.6);
  display: grid;
  place-items: center;
  z-index: 70;
  padding: 16px;
}
.dlg {
  width: min(460px, 100%);
  background: var(--sf);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
}
.dlg h3 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 800;
}
.dlg p {
  margin: 0 0 16px;
  white-space: pre-line;
  color: var(--mu);
  font-size: 13.5px;
  font-weight: 600;
}
.dlg-acc {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 760px) {
  .th {
    display: none;
  }
  .ur {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'w r' 'm m';
    row-gap: 2px;
    padding: 10px 14px;
    min-height: 74px;
  }
  .ur .who {
    grid-area: w;
  }
  .ur .rol {
    grid-area: r;
  }
  .ur .ct,
  .ur .est,
  .ur .chev {
    display: none;
  }
  .ur .mob {
    grid-area: m;
    display: flex;
    gap: 10px;
    align-items: center;
    padding-left: 50px;
    font-size: 12px;
    color: var(--mu);
    font-weight: 600;
  }
  .panel {
    width: 100%;
  }
  .srch input {
    font-size: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>

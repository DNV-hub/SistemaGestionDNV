<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './store/auth'
import { useTemaStore } from './store/tema'
import IconoNav from './components/IconoNav.vue'
import IconoBarra from './components/IconoBarra.vue'
import { contarValesPendientes, contarAlertasActivas } from './modules/dashboard/services/dashboardService'
import { contarValesNovedades } from './modules/vales/services/valesService'
import { suplantandoAOtraCuenta, volverAMiCuenta } from './modules/developer/services/developerService'
import { hayActualizacionSW, aplicarActualizacionSW } from './actualizacionSW'
import { pendientes as rdcPendientes, fallidos as rdcFallidos } from './modules/rdc/services/rdcRepository'
import { pendientes as fotosPendientes } from './modules/fotos/services/fotosRepository'

const auth = useAuthStore()
const tema = useTemaStore()
const router = useRouter()
const route = useRoute()

// Si Developer está "viendo como" otra cuenta, la sesión real cambió del
// todo (no es una simulación) — lo único que queda de rastro es esta marca
// en sessionStorage, que es lo que activa el cartel para volver.
const viendoComoOtraCuenta = ref(suplantandoAOtraCuenta())
const volviendo = ref(false)

async function volver() {
  volviendo.value = true
  try {
    await volverAMiCuenta()
    window.location.assign('/')
  } catch (e) {
    console.error(e)
    volviendo.value = false
  }
}

// signOut() solo cambia el estado reactivo (deja de haber sesión) — eso
// hace que este componente muestre la rama sin sidebar, pero el router
// nunca se entera y se queda en la ruta en la que estabas (ej. /vales),
// así que router-view sigue intentando pintarla sin sesión. Por eso hay
// que navegar a /login explícitamente acá, no alcanza con el cambio de
// estado.
async function cerrarSesion() {
  await auth.signOut()
  router.push('/login')
}

const badgeVales = ref(0)
const badgeAlertas = ref(0)
const badgeRdc = ref(0)
const badgeRdcFallidos = ref(0)
const badgeFotos = ref(0)
const mostrarMenu = ref(false)
// Videos de soporte: se abre en otra pestaña (no se sale de la app).
const URL_SOPORTE = 'https://www.youtube.com/watch?v=GBIIQ0kP15E'
const mostrarMas = ref(false)
const usuarioFilaRef = ref(null)
const posMenuConfig = ref({ left: '0px', bottom: '0px' })

/** El menú se renderiza con <Teleport to="body"> (ver más abajo): directo
 * dentro de .nav/.pie se veía tapado por .contenido pese a tener z-index
 * más alto — .contenido tiene scroll propio y el navegador lo pinta en su
 * propia capa por encima, sin importar z-index (comprobado en vivo con
 * agent-browser, subir el z-index a 999 no lo arreglaba). Al vivir fuera
 * de esa jerarquía ya no compite por capas, pero pierde el anclaje
 * CSS relativo a .usuario-fila — por eso se calcula la posición en JS. */
function alternarMenuUsuario() {
  if (!mostrarMenu.value && usuarioFilaRef.value) {
    const r = usuarioFilaRef.value.getBoundingClientRect()
    posMenuConfig.value = { left: `${r.right + 10}px`, bottom: `${window.innerHeight - r.bottom}px` }
  }
  mostrarMenu.value = !mostrarMenu.value
}

// Mismo problema y misma solución que el menú de arriba, pero para el
// tooltip de "pasar el mouse" (solo aplica contraído — expandido ya se ve
// el nombre/rol como texto, no hace falta). Antes era un ::after en CSS
// puro; se vuelve un elemento de verdad porque un ::after no se puede
// teletransportar.
const mostrarTooltipUsuario = ref(false)
const posTooltipUsuario = ref({ left: '0px', bottom: '0px' })
function mostrarTooltip() {
  if (!usuarioFilaRef.value) return
  const r = usuarioFilaRef.value.getBoundingClientRect()
  posTooltipUsuario.value = { left: `${r.right + 10}px`, bottom: `${window.innerHeight - r.bottom}px` }
  mostrarTooltipUsuario.value = true
}

async function cerrarSesionDesdeMenu() {
  mostrarMenu.value = false
  await cerrarSesion()
}

async function cerrarSesionDesdeMas() {
  mostrarMas.value = false
  await cerrarSesion()
}

// Las cuentitas del sidebar (Vales/Alertas) se cargan una vez que ya
// sabemos qué puede ver este usuario — si no tiene el permiso, la consulta
// ni se intenta (evita un error de RLS innecesario).
function cargarContadores() {
  // Quien aprueba/rechaza necesita saber "cuántos de todos están esperando
  // una decisión" (eso ya existía). Un supervisor no aprueba nada — lo que
  // necesita saber es "cuántos de los MÍOS tuvieron una novedad que todavía
  // no vi" (se aprobó, se rechazó, se atendió). Son preguntas distintas,
  // por eso el badge cambia de fuente según el permiso, no solo el número.
  if (auth.tienePermiso('vales.aprobar_rechazar')) {
    contarValesPendientes()
      .then((v) => (badgeVales.value = v))
      .catch(() => {})
  } else if (auth.tienePermiso('vales.ver_propios')) {
    contarValesNovedades(auth.session?.user?.id)
      .then((v) => (badgeVales.value = v))
      .catch(() => {})
  }
  if (auth.tienePermiso('alertas.ver')) {
    contarAlertasActivas()
      .then((v) => (badgeAlertas.value = v.total))
      .catch(() => {})
  }
  // RDC y Fotos son locales (IndexedDB) — el badge cuenta lo que todavía no
  // terminó de sincronizar, no lo pendiente de aprobación como Vales. Se lee
  // directo del repositorio, sin esperar a que se visite el módulo primero.
  if (auth.tienePermiso('rdc.ver_propios')) {
    rdcPendientes()
      .then((filas) => (badgeRdc.value = filas.length))
      .catch(() => {})
    rdcFallidos()
      .then((filas) => (badgeRdcFallidos.value = filas.length))
      .catch(() => {})
  }
  if (auth.tienePermiso('rdc.crear')) {
    fotosPendientes()
      .then((filas) => (badgeFotos.value = filas.length))
      .catch(() => {})
  }
}

// auth ya está inicializada cuando este componente se monta (ver main.js:
// se espera auth.init() antes de app.mount para que el guard del router
// resuelva la primera navegación con la sesión ya cargada).
if (auth.estaAutenticado) cargarContadores()

// Sin esto, los badges quedaban pegados al número de cuando se inició
// sesión — una alerta resuelta (o borrada, como con "Vaciar el catálogo"
// en Developer) desde OTRA pantalla nunca se reflejaba hasta recargar la
// página entera. Recargar en cada cambio de ruta es barato (unos conteos)
// y cubre cualquier acción que haya cambiado algo, sin tener que acordarse
// de llamar a cargarContadores() desde cada pantalla que podría afectarlos.
router.afterEach(() => {
  if (auth.estaAutenticado) cargarContadores()
})

// Los módulos se agrupan por área operativa, no solo por tabla — así se ve
// de un vistazo quién es dueño de qué (Planeamiento define qué existe y qué
// se prevé; Almacén ejecuta el movimiento físico día a día).
//
// catalogo.ver / frentes.ver también autorizan leer esas tablas para las
// pantallas que las incrustan (Vales, Kardex, Almacén) — Almacén los
// necesita para eso pero no gestiona esos módulos, así que se le oculta el
// link acá (rolesExcluidos) en vez de quitarle el permiso de verdad.
// Un supervisor ve solo lo suyo: el Reporte Diario de Campo, Fotografías,
// Vales y Sketch's (este último cuando exista). No es una cuestión de
// permisos — necesita catalogo.ver, frentes.ver y stock.ver para que Vales y
// el propio RDC funcionen por dentro— sino de a qué módulos entra: su trabajo
// pasa en el frente, y un menú con Almacén, Procura o Kardex es ruido que
// además invita a tocar donde no corresponde. Se resuelve con
// rolesExcluidos, igual que ya se hacía con Almacén en Catálogo y Frentes.
const SOLO_CAMPO = ['Supervisor']
// Residencia también pisa terreno (reporta RDC y sube fotos, igual que
// Supervisor) pero además necesita los módulos de oficina (Almacén,
// Catálogo, Frentes…) que a Supervisor se le ocultan — por eso no entra en
// SOLO_CAMPO general, solo se suma puntualmente a los 3 accesos de campo
// de abajo (Reporte diario/Fotografías/Sketch's) y se excluye del "RDC"
// genérico de Planeamiento para no mostrarle el mismo módulo dos veces.
const CAMPO_MAS_RESIDENCIA = [...SOLO_CAMPO, 'Residencia']

// labelMovil: la pestaña flotante es angosta y solo tiene lugar para una
// palabra — el sidebar de escritorio (label) no se toca, sigue con el
// nombre completo.
// Reporte diario / Fotografías / Sketch's quedan SOLO acá, como 3 accesos
// sueltos, para Supervisor — es exactamente su tabbar de celular (ver
// tabsMoviles) y tocarlo sería empeorar la pantalla que mejor le funciona.
// Para cualquier otro rol que los vea (Planeamiento, Administrador,
// Consulta), las mismas tres pantallas se agrupan en un solo ítem "RDC" más
// abajo, en Planeamiento — con pestañas propias arriba del contenido (ver
// RdcTabs.vue) en vez de tres líneas sueltas mezcladas con Dashboard/Reportes.
// `color` es solo estético (el fondo del ícono en la hoja "Más" del
// celular, ver hoja-mas) — nada que ver con permisos ni con el sidebar de
// escritorio, que sigue siendo monocromo.
// `prioridadMovil` decide qué 4 módulos ganan un lugar fijo en la barra de
// pestañas del celular (tabsMoviles, más abajo): cuanto más bajo el
// número, más prioridad. Sin este campo, un módulo nunca compite por esos
// 4 lugares — se queda directo en la hoja "Más". Se le puso número solo a
// los 4 que de verdad importa fijar (Dashboard/RDC/Almacén/Vales); el
// resto usa las 4 pestañas de Supervisor tal cual estaban (sin marcar
// prioridad, no hace falta: ahí ya son exactamente 4 en total).
// Dashboard/RDC/Almacén (prioridad 1/2/3) y Reporte diario/Fotografías/
// Sketch's (prioridad 1/2/3 también) nunca aparecen juntos para la misma
// cuenta — son mutuamente excluyentes por rolesExcluidos/rolesIncluidos
// (SOLO_CAMPO ve el segundo grupo, todos los demás ven el primero) — así
// que pueden compartir el mismo número de prioridad sin pisarse: cada
// rol arma sus propias 4 pestañas fijas con el mismo esquema 1-2-3-4.
// Antes Vales (prioridad 4, es de los dos grupos) tenía la única
// prioridad marcada del lado de Supervisor, así que terminaba
// colándose ADELANTE de Reporte/Fotos/Sketch's al ordenar — se
// reportó como "en el celular ahora aparece primero Vales".
// Para el Supervisor, "Vales" se presenta como "Almacén" (casita): sigue
// siendo la misma pantalla y la misma ruta (/vales), solo cambia el nombre.
const esSupervisor = computed(() => auth.nombreRol === 'Supervisor')
const etiquetaVales = computed(() => (esSupervisor.value ? 'Almacén' : 'Vales'))
const iconoVales = computed(() => (esSupervisor.value ? 'almacen' : 'vales'))
const navPrincipal = computed(() => [
  { to: '/', label: 'Dashboard', icono: 'dashboard', color: 'amber', permiso: 'dashboard.ver', prioridadMovil: 1 },
  { to: '/rdc', label: 'Reporte diario', labelMovil: 'Reporte', icono: 'rdc', color: 'teal', permiso: 'rdc.ver_propios', badge: badgeRdc.value, rolesIncluidos: CAMPO_MAS_RESIDENCIA, prioridadMovil: 2 },
  // Fotos y Sketch's se unieron en una sola pantalla (/fotos); /sketches
  // redirige para no romper enlaces guardados.
  { to: '/fotos', label: 'Fotos y sketch', labelMovil: 'Fotos', icono: 'camara', color: 'teal', permiso: 'rdc.crear', badge: badgeFotos.value, rolesIncluidos: CAMPO_MAS_RESIDENCIA, prioridadMovil: 3 },
])

const navPlaneamiento = computed(() => [
  { to: '/catalogo', label: 'Catálogo', icono: 'catalogo', color: 'slate', permiso: 'catalogo.ver', rolesExcluidos: ['Almacen', ...SOLO_CAMPO] },
  { to: '/frentes', label: 'Frentes', icono: 'frentes', color: 'violet', permiso: 'frentes.ver', rolesExcluidos: ['Almacen', ...SOLO_CAMPO] },
  // "Confirmación" dejó de tener entrada propia en el menú (no le sirvió al
  // usuario tal como estaba) — la ruta /confirmacion y su vista siguen
  // existiendo tal cual (nadie más las enlaza, ver grep antes de este
  // cambio), así que nada se rompe si alguien todavía tiene la URL guardada.
  // "Procura" dejó de tener entrada propia en el menú: ahora se entra por
  // la pestaña "Procura" de la ficha de cada frente (frentes/views/ficha/
  // FichaProcura.vue). La ruta /procura y sus vistas siguen existiendo tal
  // cual (nadie más las enlaza — ver grep antes de este cambio), así que
  // nada se rompe si alguien todavía tiene la URL vieja guardada.
  { to: '/rdc', label: 'RDC', icono: 'rdc', color: 'teal', permiso: 'rdc.ver_propios', rolesExcluidos: CAMPO_MAS_RESIDENCIA, prioridadMovil: 2 },
])

const navAlmacen = computed(() => [
  { to: '/almacen', label: 'Almacén', icono: 'almacen', color: 'blue', permiso: 'stock.ver', rolesExcluidos: SOLO_CAMPO, prioridadMovil: 3 },
  { to: '/vales', label: etiquetaVales.value, icono: iconoVales.value, color: 'amber', permiso: 'vales.ver_propios', badge: badgeVales.value, prioridadMovil: 4 },
  { to: '/reservas', label: 'Reservas', icono: 'reservas', color: 'green', permiso: 'reservas.ver', rolesExcluidos: SOLO_CAMPO },
  { to: '/alertas', label: 'Alertas', icono: 'alertas', color: 'pink', permiso: 'alertas.ver', badge: badgeAlertas.value, rolesExcluidos: SOLO_CAMPO },
])

// "Usuarios y roles" asigna qué rol tiene cada persona; "Roles y permisos"
// (nuevo) decide qué puede hacer cada rol — son dos herramientas distintas,
// aunque las dos viven en este mismo cajón del menú porque ambas son
// configuración de acceso y ninguna la toca un supervisor en el día a día.
const navSistema = [
  { to: '/usuarios', label: 'Usuarios y roles', icono: 'usuarios', permiso: 'usuarios.ver' },
  { to: '/configuracion/roles', label: 'Roles y permisos', icono: 'engranaje', permiso: 'roles.gestionar' },
  { to: '/developer', label: 'Developer', icono: 'developer', permiso: 'sistema.borrar_pruebas' },
]

function visibles(items) {
  return items.filter(
    (item) =>
      auth.tienePermiso(item.permiso) &&
      !item.rolesExcluidos?.includes(auth.nombreRol) &&
      (!item.rolesIncluidos || item.rolesIncluidos.includes(auth.nombreRol))
  )
}

// En celular no entran todos los módulos en una barra: se muestran los 4
// con más prioridad (prioridadMovil, ver arriba) como pestañas fijas — con
// sort estable, quien no tiene prioridad marcada mantiene su orden natural
// (Principal → Planeamiento → Almacén), que es justo lo que necesita
// Supervisor: sus 4 módulos no tienen prioridad puesta y ya son exactamente
// 4 en total, así que quedan igual que siempre. El resto va a la hoja "Más".
const navTodos = computed(() => [
  ...visibles(navPrincipal.value),
  ...visibles(navPlaneamiento.value),
  ...visibles(navAlmacen.value),
])
const tabsMoviles = computed(() =>
  [...navTodos.value].sort((a, b) => (a.prioridadMovil ?? 99) - (b.prioridadMovil ?? 99)).slice(0, 4)
)
// Agrupados igual que el sidebar de escritorio (Principal/Planeamiento/
// Almacén), para que la hoja "Más" se vea como un mini directorio de
// módulos y no una lista plana — excluye lo que ya tiene pestaña fija, para
// no mostrar dos veces el mismo acceso.
function extrasDe(grupo) {
  const enTabbar = new Set(tabsMoviles.value.map((i) => i.to))
  return visibles(grupo).filter((item) => !enTabbar.has(item.to))
}
const extrasPrincipal = computed(() => extrasDe(navPrincipal.value))
const extrasPlaneamiento = computed(() => extrasDe(navPlaneamiento.value))
const extrasAlmacen = computed(() => extrasDe(navAlmacen.value))

const inicialesUsuario = computed(() => {
  const nombre = auth.perfil?.nombre ?? ''
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
})

// Rail flotante de escritorio: estructura distinta al sidebar antiguo.
// Mobile sigue usando navTodos/tabsMoviles (no se toca).
const navRailTop = computed(() => [
  // Al Supervisor el Dashboard ya no le sale en la barra: se llega desde el
  // menú de su usuario ("Dashboard general").
  { to: '/', label: 'Dashboard', icono: 'dashboard', permiso: 'dashboard.ver', rolesExcluidos: SOLO_CAMPO },
  { to: '/rdc', label: 'Reporte diario', icono: 'rdc', permiso: 'rdc.ver_propios', badge: badgeRdc.value, rolesIncluidos: CAMPO_MAS_RESIDENCIA },
  { to: '/fotos', label: 'Fotos y sketch', icono: 'camara', permiso: 'rdc.crear', badge: badgeFotos.value, rolesIncluidos: CAMPO_MAS_RESIDENCIA },
  { to: '/planeamiento', label: 'Planeamiento', icono: 'planeamiento', permiso: 'catalogo.ver', rolesExcluidos: ['Almacen', ...SOLO_CAMPO] },
  { to: '/calidad', label: 'Calidad', icono: 'calidad', permiso: 'rdc.ver_todos', rolesExcluidos: ['Almacen', ...SOLO_CAMPO] },
  { label: 'Equipos y maquinaria', icono: 'equipos', deshabilitado: true, rolesExcluidos: SOLO_CAMPO },
  { to: '/almacen', label: 'Almacén', icono: 'almacen', permiso: 'stock.ver', rolesExcluidos: SOLO_CAMPO, badge: badgeVales.value },
  {
    to: '/vales',
    label: etiquetaVales.value,
    tooltip: badgeVales.value ? `${etiquetaVales.value} · ${badgeVales.value} sin responder` : etiquetaVales.value,
    icono: iconoVales.value,
    permiso: 'vales.ver_propios',
    badge: badgeVales.value,
    rolesIncluidos: SOLO_CAMPO,
  },
])

const navRailBottom = computed(() => [
  { to: '/alertas', label: 'Alertas', icono: 'alertas', permiso: 'alertas.ver', badge: badgeAlertas.value, rolesExcluidos: SOLO_CAMPO },
])

function visiblesRail(items) {
  return items.filter(
    (item) =>
      !item.rolesExcluidos?.includes(auth.nombreRol) &&
      (!item.rolesIncluidos || item.rolesIncluidos.includes(auth.nombreRol)) &&
      (item.deshabilitado || auth.tienePermiso(item.permiso))
  )
}

// El ítem Planeamiento en el rail debe marcarse activo también cuando el
// usuario está en sub-rutas que no empiezan con /planeamiento (ej. /rdc/123).
const activoPlaneamiento = computed(() =>
  route.path.startsWith('/planeamiento') ||
  route.path.startsWith('/catalogo') ||
  route.path.startsWith('/frentes') ||
  route.path.startsWith('/rdc')
)

// ---- Barra inferior del Supervisor (celular) ---------------------------------
// Solo íconos: Reporte · Fotos · Almacén · avatar. Alertas únicamente en
// Reporte (rojo: reportes cuyo envío falló) y Almacén (vales que ya
// respondieron y todavía no se han visto). Fotos y avatar nunca llevan.
const tabsSup = computed(() => {
  const p = route.path
  return [
    {
      clave: 'reporte',
      to: '/rdc',
      label: 'Reporte',
      activo: p.startsWith('/rdc') || p.startsWith('/planeamiento/rdc'),
      permiso: 'rdc.ver_propios',
      badge: badgeRdcFallidos.value,
      rojo: true,
      aria: badgeRdcFallidos.value ? `Reporte: ${badgeRdcFallidos.value} envío fallido` : 'Reporte',
    },
    { clave: 'fotos', to: '/fotos', label: 'Fotos', activo: p.startsWith('/fotos'), permiso: 'rdc.crear', badge: 0, aria: 'Fotos' },
    {
      clave: 'almacen',
      to: '/vales',
      label: 'Almacén',
      activo: p.startsWith('/vales'),
      permiso: 'vales.ver_propios',
      badge: badgeVales.value,
      aria: badgeVales.value ? `Almacén: ${badgeVales.value} vales respondidos` : 'Almacén',
    },
  ].filter((t) => auth.tienePermiso(t.permiso))
})
const avatarActivo = computed(() => mostrarMas.value || route.path === '/')

// ---- Barra inferior de Administración (celular) ------------------------------
// Developer, Administrador, Coordinador y Planeamiento comparten la misma
// navegación: Dashboard · Planeamiento · Almacén · avatar, solo íconos. Vales y
// Reservas viven dentro de Almacén; RDC, Frentes y Catálogo dentro de Planeamiento.
const ROLES_ADMIN_MOVIL = ['Developer', 'Administrador', 'Coordinador', 'Planeamiento']
const esAdminMovil = computed(() => ROLES_ADMIN_MOVIL.includes(auth.nombreRol))
const tabsAdm = computed(() => {
  const p = route.path
  return [
    { clave: 'dashboard', to: '/', label: 'Dashboard', activo: p === '/', permiso: 'dashboard.ver', badge: 0, aria: 'Dashboard' },
    { clave: 'planeamiento', to: '/planeamiento', label: 'Planeamiento', activo: activoPlaneamiento.value, permiso: 'catalogo.ver', badge: 0, aria: 'Planeamiento' },
    {
      clave: 'almacen',
      to: '/almacen',
      label: 'Almacén',
      activo: p.startsWith('/almacen') || p.startsWith('/vales') || p.startsWith('/reservas'),
      permiso: 'stock.ver',
      badge: badgeVales.value,
      aria: badgeVales.value ? `Almacén: ${badgeVales.value} ${badgeVales.value === 1 ? 'vale' : 'vales'} por responder` : 'Almacén',
    },
    { clave: 'calidad', to: '/calidad', label: 'Calidad', activo: p.startsWith('/calidad'), permiso: 'rdc.ver_todos', badge: 0, aria: 'Calidad' },
  ].filter((t) => auth.tienePermiso(t.permiso))
})
// "Developer" del menú: con cualquiera de los dos permisos de sistema.
const verDeveloper = computed(() => auth.tienePermiso('sistema.borrar_pruebas') || auth.tienePermiso('sistema.suplantar_usuario'))
const itemsMenuAdm = computed(() =>
  navSistema.filter((i) => (i.to === '/developer' ? verDeveloper.value : auth.tienePermiso(i.permiso)))
)

// Con el teclado abierto la barra inferior estorba (iOS no reduce el
// viewport, así que quedaría flotando sobre el campo): se oculta mientras un
// campo de texto tiene el foco.
const tecladoAbierto = ref(false)
const esCampoTexto = (el) =>
  el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !['checkbox', 'radio', 'button', 'file', 'submit'].includes(el.type)
const alEnfocar = (e) => {
  if (esCampoTexto(e.target)) tecladoAbierto.value = true
}
const alDesenfocar = () => {
  tecladoAbierto.value = false
}
onMounted(() => {
  document.addEventListener('focusin', alEnfocar)
  document.addEventListener('focusout', alDesenfocar)
})
onBeforeUnmount(() => {
  document.removeEventListener('focusin', alEnfocar)
  document.removeEventListener('focusout', alDesenfocar)
})

const mensajeProximamente = ref(null)
let _timerProximamente = null
function notificarProximamente(nombre) {
  mensajeProximamente.value = `${nombre} — Próximamente`
  clearTimeout(_timerProximamente)
  _timerProximamente = setTimeout(() => { mensajeProximamente.value = null }, 2500)
}
</script>

<template>
  <div v-if="hayActualizacionSW" class="toast-actualizacion">
    <span>Hay una versión nueva de la aplicación.</span>
    <button type="button" @click="aplicarActualizacionSW">Actualizar</button>
  </div>

  <div v-if="viendoComoOtraCuenta" class="banner-suplantacion">
    <span class="banner-texto">Developer: viendo como <strong>{{ auth.perfil?.nombre }}</strong> ({{ auth.nombreRol }})</span>
    <button type="button" :disabled="volviendo" @click="volver">{{ volviendo ? 'Volviendo…' : 'Volver a mi cuenta' }}</button>
  </div>

  <div v-if="auth.cargando" class="cargando">Cargando…</div>

  <div v-else-if="!auth.estaAutenticado" class="sin-sesion">
    <router-view />
  </div>

  <div
    v-else
    class="shell"
    :class="{ 'shell-suplantacion': viendoComoOtraCuenta }"
    :style="
      viendoComoOtraCuenta
        ? { marginTop: 'calc(40px + env(safe-area-inset-top))', height: 'calc(100vh - 40px - env(safe-area-inset-top))' }
        : null
    "
  >
    <aside class="nav">
      <!-- Logo -->
      <div class="marca-rail" aria-hidden="true">D</div>

      <div class="rail-sep"></div>

      <!-- Ítems superiores del rail -->
      <template v-for="item in visiblesRail(navRailTop)" :key="item.to ?? item.label">
        <router-link
          v-if="!item.deshabilitado"
          :to="item.to"
          class="rail-item"
          :class="{ 'rail-activo': item.to === '/planeamiento' && activoPlaneamiento && !route.path.startsWith('/planeamiento') }"
          :title="item.tooltip ?? item.label"
          :aria-label="item.tooltip ?? item.label"
        >
          <IconoNav :nombre="item.icono" />
          <span v-if="item.badge" class="rail-badge"></span>
        </router-link>
        <button
          v-else
          type="button"
          class="rail-item rail-item-off"
          :title="item.label"
          :aria-label="item.label + ' — Próximamente'"
          @click="notificarProximamente(item.label)"
        >
          <IconoNav :nombre="item.icono" />
        </button>
      </template>

      <!-- Spacer empuja Alertas al fondo -->
      <div class="rail-spacer"></div>

      <!-- Ítems inferiores (Alertas) -->
      <template v-for="item in visiblesRail(navRailBottom)" :key="item.to">
        <router-link :to="item.to" class="rail-item" :title="item.label" :aria-label="item.label">
          <IconoNav :nombre="item.icono" />
          <span v-if="item.badge" class="rail-badge"></span>
        </router-link>
      </template>

      <div class="rail-sep"></div>

      <!-- Avatar / configuración de usuario -->
      <Teleport to="body">
        <div v-if="mensajeProximamente" class="toast-proximamente">{{ mensajeProximamente }}</div>

        <div v-if="mostrarMenu" class="backdrop-menu" @click="mostrarMenu = false"></div>
        <div v-if="mostrarMenu" class="menu-config" :style="posMenuConfig">
          <button type="button" class="menu-item" @click="tema.alternar">
            <IconoNav :nombre="tema.modo === 'dark' ? 'sol' : 'luna'" />
            <span>{{ tema.modo === 'dark' ? 'Modo claro' : 'Modo oscuro' }}</span>
          </button>
          <router-link v-if="esSupervisor && auth.tienePermiso('dashboard.ver')" to="/" class="menu-item" @click="mostrarMenu = false">
            <IconoNav nombre="dashboard" />
            <span>Dashboard general</span>
          </router-link>
          <router-link
            v-for="item in visibles(navSistema)"
            :key="item.to"
            :to="item.to"
            class="menu-item"
            @click="mostrarMenu = false"
          >
            <IconoNav :nombre="item.icono" />
            <span>{{ item.label }}</span>
          </router-link>
          <a :href="URL_SOPORTE" target="_blank" rel="noopener noreferrer" class="menu-item" @click="mostrarMenu = false">
            <IconoNav nombre="soporte" />
            <span>Soporte</span>
          </a>
          <button type="button" class="menu-item peligro" @click="cerrarSesionDesdeMenu">
            <IconoNav nombre="salir" />
            <span>Cerrar sesión</span>
          </button>
        </div>

        <div v-if="mostrarTooltipUsuario" class="tooltip-usuario" :style="posTooltipUsuario">
          {{ auth.perfil?.nombre ?? '' }} — {{ auth.nombreRol ?? '' }}
        </div>
      </Teleport>

      <button
        ref="usuarioFilaRef"
        type="button"
        class="rail-avatar"
        :aria-label="`${auth.perfil?.nombre ?? ''} — ${auth.nombreRol ?? ''}`"
        @click="alternarMenuUsuario"
        @mouseenter="mostrarTooltip"
        @mouseleave="mostrarTooltipUsuario = false"
      >
        {{ inicialesUsuario }}
      </button>
    </aside>
    <main class="contenido">
      <router-view />
    </main>

    <!-- Supervisor: barra de solo íconos + avatar (reemplaza a "Más") -->
    <nav v-if="esSupervisor && !$route.meta.ocultarTabbar && !tecladoAbierto" class="tabbar-sup" aria-label="Menú del supervisor">
      <router-link
        v-for="t in tabsSup"
        :key="t.clave"
        :to="t.to"
        class="nv"
        :class="{ on: t.activo }"
        :aria-label="t.aria"
        :aria-current="t.activo ? 'page' : undefined"
      >
        <IconoBarra :nombre="t.clave" />
        <span v-if="t.badge" class="bd" :class="{ rojo: t.rojo }">{{ t.badge }}</span>
      </router-link>
      <button type="button" class="nv" :class="{ on: avatarActivo }" :aria-label="`Menú de ${auth.perfil?.nombre ?? 'usuario'}`" @click="mostrarMas = true">
        <span class="nv-avatar">{{ inicialesUsuario }}</span>
      </button>
    </nav>

    <!-- Developer / Administrador / Coordinador / Planeamiento: 3 módulos + avatar -->
    <nav v-if="esAdminMovil && !$route.meta.ocultarTabbar && !tecladoAbierto" class="tabbar-adm" aria-label="Menú principal">
      <router-link
        v-for="t in tabsAdm"
        :key="t.clave"
        :to="t.to"
        class="nv"
        :class="{ on: t.activo }"
        :aria-label="t.aria"
        :aria-current="t.activo ? 'page' : undefined"
      >
        <IconoBarra :nombre="t.clave" />
        <span v-if="t.badge" class="bd">{{ t.badge }}</span>
      </router-link>
      <button type="button" class="nv" :class="{ on: mostrarMas }" :aria-label="`Menú de ${auth.perfil?.nombre ?? 'usuario'}`" @click="mostrarMas = true">
        <span class="nv-avatar">{{ inicialesUsuario }}</span>
      </button>
    </nav>

    <nav v-if="!esSupervisor && !esAdminMovil && !$route.meta.ocultarTabbar" class="tabbar">
      <router-link v-for="item in tabsMoviles" :key="item.to" :to="item.to" class="tab">
        <span class="tab-inner">
          <span class="tab-icon">
            <IconoNav :nombre="item.icono" />
            <span v-if="item.badge" class="badge-n">{{ item.badge }}</span>
          </span>
          <span>{{ item.labelMovil ?? item.label }}</span>
        </span>
      </router-link>
      <button type="button" class="tab" :class="{ 'router-link-active': mostrarMas }" @click="mostrarMas = true">
        <span class="tab-inner">
          <span class="tab-icon"><IconoNav nombre="mas" /></span>
          <span>Más</span>
        </span>
      </button>
    </nav>

    <div v-if="mostrarMas" class="hoja-backdrop" @click="mostrarMas = false"></div>
    <!-- Menú del avatar del Supervisor -->
    <div v-if="mostrarMas && esSupervisor" class="hoja-mas hoja-sup" role="dialog" aria-label="Menú de usuario">
      <div class="hoja-manija"></div>
      <div class="hoja-perfil">
        <span class="avatar">{{ inicialesUsuario }}</span>
        <div class="usuario-info">
          <div class="usuario-nombre">{{ auth.perfil?.nombre }}</div>
          <div class="usuario-rol">{{ auth.nombreRol }}</div>
        </div>
      </div>
      <router-link v-if="auth.tienePermiso('dashboard.ver')" to="/" class="hoja-item" @click="mostrarMas = false">
        <IconoNav nombre="dashboard" />
        <span>Dashboard general</span>
      </router-link>
      <button type="button" class="hoja-item" @click="tema.alternar">
        <IconoNav :nombre="tema.modo === 'dark' ? 'sol' : 'luna'" />
        <span>{{ tema.modo === 'dark' ? 'Modo claro' : 'Modo oscuro' }}</span>
      </button>
      <a :href="URL_SOPORTE" target="_blank" rel="noopener noreferrer" class="hoja-item" @click="mostrarMas = false">
        <IconoNav nombre="soporte" />
        <span>Soporte</span>
      </a>
      <button type="button" class="hoja-item peligro" @click="cerrarSesionDesdeMas">
        <IconoNav nombre="salir" />
        <span>Cerrar sesión</span>
      </button>
    </div>
    <!-- Menú del avatar de Administración -->
    <div v-if="mostrarMas && esAdminMovil" class="hoja-mas hoja-adm" role="dialog" aria-label="Menú de usuario">
      <div class="hoja-manija"></div>
      <div class="hoja-perfil">
        <span class="avatar">{{ inicialesUsuario }}</span>
        <div class="usuario-info">
          <div class="usuario-nombre">{{ auth.perfil?.nombre }}</div>
          <div class="usuario-rol">{{ auth.nombreRol }}</div>
        </div>
      </div>
      <router-link v-if="auth.tienePermiso('alertas.ver')" to="/alertas" class="hoja-item" @click="mostrarMas = false">
        <IconoNav nombre="alertas" />
        <span>Alertas de stock</span>
        <span v-if="badgeAlertas" class="hoja-contador">{{ badgeAlertas }}</span>
      </router-link>
      <router-link v-for="item in itemsMenuAdm" :key="item.to" :to="item.to" class="hoja-item" @click="mostrarMas = false">
        <IconoNav :nombre="item.icono" />
        <span>{{ item.label }}</span>
      </router-link>
      <button type="button" class="hoja-item" @click="tema.alternar">
        <IconoNav :nombre="tema.modo === 'dark' ? 'sol' : 'luna'" />
        <span>{{ tema.modo === 'dark' ? 'Modo claro' : 'Modo oscuro' }}</span>
      </button>
      <a :href="URL_SOPORTE" target="_blank" rel="noopener noreferrer" class="hoja-item" @click="mostrarMas = false">
        <IconoNav nombre="soporte" />
        <span>Soporte</span>
      </a>
      <button type="button" class="hoja-item peligro" @click="cerrarSesionDesdeMas">
        <IconoNav nombre="salir" />
        <span>Cerrar sesión</span>
      </button>
    </div>
    <div v-if="mostrarMas && !esSupervisor && !esAdminMovil" class="hoja-mas">
      <div class="hoja-manija"></div>

      <div class="hoja-perfil">
        <span class="avatar">{{ inicialesUsuario }}</span>
        <div class="usuario-info">
          <div class="usuario-nombre">{{ auth.perfil?.nombre }}</div>
          <div class="usuario-rol">{{ auth.nombreRol }}</div>
        </div>
      </div>

      <div v-if="extrasPrincipal.length" class="hoja-grupo">
        <p class="hoja-grupo-titulo">Principal</p>
        <div class="mod-grid">
          <router-link v-for="item in extrasPrincipal" :key="item.to" :to="item.to" class="mod-item" @click="mostrarMas = false">
            <span class="mod-icono" :class="item.color">
              <IconoNav :nombre="item.icono" />
              <span v-if="item.badge" class="mod-badge">{{ item.badge }}</span>
            </span>
            <span class="mod-etiqueta">{{ item.label }}</span>
          </router-link>
        </div>
      </div>

      <div v-if="extrasPlaneamiento.length" class="hoja-grupo">
        <p class="hoja-grupo-titulo">Planeamiento</p>
        <div class="mod-grid">
          <router-link v-for="item in extrasPlaneamiento" :key="item.to" :to="item.to" class="mod-item" @click="mostrarMas = false">
            <span class="mod-icono" :class="item.color">
              <IconoNav :nombre="item.icono" />
              <span v-if="item.badge" class="mod-badge">{{ item.badge }}</span>
            </span>
            <span class="mod-etiqueta">{{ item.label }}</span>
          </router-link>
        </div>
      </div>

      <div v-if="extrasAlmacen.length" class="hoja-grupo">
        <p class="hoja-grupo-titulo">Almacén</p>
        <div class="mod-grid">
          <router-link v-for="item in extrasAlmacen" :key="item.to" :to="item.to" class="mod-item" @click="mostrarMas = false">
            <span class="mod-icono" :class="item.color">
              <IconoNav :nombre="item.icono" />
              <span v-if="item.badge" class="mod-badge">{{ item.badge }}</span>
            </span>
            <span class="mod-etiqueta">{{ item.label }}</span>
          </router-link>
        </div>
      </div>

      <hr class="hoja-separador" />

      <button type="button" class="hoja-item" @click="tema.alternar">
        <IconoNav :nombre="tema.modo === 'dark' ? 'sol' : 'luna'" />
        <span>{{ tema.modo === 'dark' ? 'Modo claro' : 'Modo oscuro' }}</span>
      </button>
      <router-link
        v-for="item in visibles(navSistema)"
        :key="item.to"
        :to="item.to"
        class="hoja-item"
        @click="mostrarMas = false"
      >
        <IconoNav :nombre="item.icono" />
        <span>{{ item.label }}</span>
      </router-link>
      <a :href="URL_SOPORTE" target="_blank" rel="noopener noreferrer" class="hoja-item" @click="mostrarMas = false">
        <IconoNav nombre="soporte" />
        <span>Soporte</span>
      </a>
      <button type="button" class="hoja-item peligro" @click="cerrarSesionDesdeMas">
        <IconoNav nombre="salir" />
        <span>Cerrar sesión</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toast-actualizacion {
  position: fixed;
  right: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.75rem 0.7rem 1rem;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-size: 0.85rem;
  max-width: calc(100vw - 2rem);
}
.toast-actualizacion button {
  padding: 0.4rem 0.8rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 700;
  font-size: 0.8rem;
  white-space: nowrap;
  cursor: pointer;
}
.banner-suplantacion {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: calc(40px + env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding-left: 1rem;
  padding-right: 1rem;
  background: var(--color-warning);
  color: #1a1300;
  font-size: 0.82rem;
  font-weight: 600;
  box-sizing: border-box;
}
.banner-texto {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.banner-suplantacion button {
  flex: 0 0 auto;
  white-space: nowrap;
  padding: 0.3rem 0.75rem;
  border: none;
  border-radius: var(--radius-control);
  background: #1a1300;
  color: var(--color-warning);
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
}
.banner-suplantacion button:disabled {
  opacity: 0.6;
  cursor: default;
}
.cargando {
  display: grid;
  place-items: center;
  min-height: 100vh;
  color: var(--color-text-muted);
  background: var(--color-bg);
}
.sin-sesion {
  background: var(--color-bg);
  min-height: 100vh;
}
.shell {
  display: block;
  height: 100vh;
  background: var(--color-bg);
}

/* Rail flotante de escritorio — 88px fijo, siempre visible, sin modo expandido */
.nav {
  position: fixed;
  left: 12px;
  top: 12px;
  bottom: 12px;
  width: 72px;
  background: #0e0f12;
  border-radius: 26px;
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 35;
  /* overflow: visible permite que los tooltips (::after) se dibujen fuera
     del borde redondeado sin ser recortados. El fondo redondeado lo da
     el background + border-radius del propio elemento, no un clip. */
}
.marca-rail {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #f6a800;
  color: #111;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 1.1rem;
  flex-shrink: 0;
  margin-bottom: 2px;
  user-select: none;
}
.rail-sep {
  width: 40px;
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
  margin: 6px 0;
}
.rail-spacer {
  flex: 1;
}
.rail-item {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8d929b;
  text-decoration: none;
  flex-shrink: 0;
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  transition: background 150ms, color 150ms;
}
.rail-item:hover {
  background: #1c1e24;
  color: #fff;
}
.rail-item.router-link-active,
.rail-item.rail-activo {
  background: #f6a800;
  color: #111;
}
/* Tooltip con ::after — position: absolute respecto al ítem (que tiene
   position: relative). El rail no tiene overflow:hidden, así que el tooltip
   se dibuja fuera del riel sin ser recortado. */
.rail-item:hover::after,
.rail-item:focus-visible::after {
  content: attr(title);
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background: #1c1e24;
  color: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 50;
  pointer-events: none;
}
.rail-item-off {
  opacity: 0.38;
}
.rail-item-off:hover {
  background: none;
  color: #8d929b;
  opacity: 0.5;
}
.rail-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  pointer-events: none;
}
.rail-item :deep(.icono-nav) {
  width: 20px;
  height: 20px;
}
.rail-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #d1d5db;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.78rem;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 150ms;
  font-family: inherit;
  margin-top: 2px;
}
.rail-avatar:hover {
  background: #1c1e24;
}
.toast-proximamente {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #1c1e24;
  color: #fff;
  border-radius: 10px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 200;
  pointer-events: none;
}
.tooltip-usuario {
  position: fixed;
  background: #1c1e24;
  color: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 37;
  pointer-events: none;
}
.backdrop-menu {
  position: fixed;
  inset: 0;
  z-index: 36;
}
.menu-config {
  position: fixed;
  width: 200px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  z-index: 37;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.6rem;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: none;
  border: none;
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.menu-item:hover {
  background: var(--color-surface-2);
}
.menu-item.peligro {
  color: var(--color-danger);
}
.contenido {
  background: var(--color-bg);
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  /* 12px margen + 72px riel + 12px separación = 96px */
  margin-left: 96px;
}

/* Barra de pestañas flotante — solo existe en celular/tablet (ver media
   query). En escritorio el sidebar de la izquierda cubre toda la
   navegación. */
.tabbar {
  display: none;
}
.tabbar-sup {
  display: none;
}
.tabbar-adm {
  display: none;
}
.hoja-backdrop,
.hoja-mas {
  display: none;
}

/* Debajo de 1024px el sidebar desaparece del todo y la navegación pasa a
   una barra de pestañas flotante abajo, como en las apps de celular: más
   cómoda con el pulgar y dedicada solo a los módulos más usados — el resto
   y "Cerrar sesión" viven en la hoja "Más". No pegada al borde (12px de
   margen lateral, 20px + safe-area del fondo): por eso el contenido de
   cada pantalla necesita su propio padding inferior (108px) para no
   quedar tapado, esta barra ya no le resta alto al contenedor. */
@media (max-width: 1024px) {
  .shell {
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }
  .nav {
    display: none;
  }
  .contenido {
    margin-left: 0;
    height: 100%;
    overflow-x: hidden;
    padding-top: env(safe-area-inset-top);
  }
  .shell-suplantacion .contenido {
    padding-top: 0;
  }

  .tabbar {
    display: flex;
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(20px + env(safe-area-inset-bottom));
    height: 64px;
    border-radius: 32px;
    background: rgba(20, 20, 23, 0.88);
    backdrop-filter: blur(22px) saturate(150%);
    -webkit-backdrop-filter: blur(22px) saturate(150%);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    align-items: center;
    padding: 0 5px;
    z-index: 20;
  }
  /* Barra del Supervisor: solo íconos, 64px, radio 24, margen 10px. */
  .tabbar-sup {
    display: flex;
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 6px);
    height: 64px;
    border-radius: 24px;
    background: #0e0f12;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    align-items: center;
    justify-content: space-around;
    z-index: 20;
  }
  :root[data-theme='dark'] .tabbar-sup {
    background: #17191e;
    box-shadow: 0 0 0 1px #262930, 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .tabbar-sup .nv {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 52px;
    border: 0;
    border-radius: 16px;
    background: transparent;
    color: #8d929b;
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .tabbar-sup .nv.on {
    background: #f6a800;
    color: #111;
  }
  .tabbar-sup .bd {
    position: absolute;
    top: 5px;
    right: 18px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: #f6a800;
    color: #111;
    font-size: 10px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #0e0f12;
  }
  :root[data-theme='dark'] .tabbar-sup .bd {
    border-color: #17191e;
  }
  .tabbar-sup .bd.rojo {
    background: #e5484d;
    color: #fff;
  }
  .tabbar-sup .nv.on .bd {
    background: #111;
    color: #f6a800;
    border-color: #f6a800;
  }
  .tabbar-sup .nv.on .bd.rojo {
    background: #e5484d;
    color: #fff;
  }
  .nv-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #1c1e24;
    color: #fff;
    font-size: 11.5px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 1.5px #3a3d45;
  }
  .tabbar-sup .nv.on .nv-avatar {
    background: #111;
    color: #f6a800;
    box-shadow: 0 0 0 1.5px #111;
  }
  /* Barra de Administración: vidrio delgado (56px, radio 22, margen 10px),
     solo íconos. El activo lleva fondo ámbar suave y el ícono en ámbar. */
  .tabbar-adm {
    display: flex;
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 6px);
    height: 56px;
    padding: 0 6px;
    border-radius: 22px;
    align-items: center;
    justify-content: space-around;
    z-index: 20;
    background: rgba(20, 20, 23, 0.88);
    -webkit-backdrop-filter: blur(22px) saturate(1.6);
    backdrop-filter: blur(22px) saturate(1.6);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  }
  :root[data-theme='light'] .tabbar-adm {
    background: rgba(255, 255, 255, 0.62);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .tabbar-adm {
      background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    }
  }
  .tabbar-adm .nv {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 1 64px;
    min-width: 0;
    height: 44px;
    border: 0;
    border-radius: 16px;
    background: transparent;
    color: var(--color-text-muted);
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s, color 0.15s;
  }
  .tabbar-adm .nv.on {
    background: rgba(246, 168, 0, 0.18);
    color: #f6a800;
  }
  :root[data-theme='light'] .tabbar-adm .nv.on {
    background: rgba(217, 142, 0, 0.16);
    color: #c98200;
  }
  .tabbar-adm .bd {
    position: absolute;
    top: 2px;
    right: 14px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: #f6a800;
    color: #111;
    font-size: 10px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 2px var(--color-bg);
  }
  .tabbar-adm .nv-avatar {
    background: var(--color-surface-2);
    color: var(--color-text);
    box-shadow: inset 0 0 0 1.5px var(--color-border);
  }
  .tabbar-adm .nv.on .nv-avatar {
    background: rgba(246, 168, 0, 0.18);
    color: #f6a800;
    box-shadow: inset 0 0 0 1.5px #f6a800;
  }
  :root[data-theme='light'] .tabbar-adm .nv.on .nv-avatar {
    color: #c98200;
    box-shadow: inset 0 0 0 1.5px #c98200;
  }
  .hoja-contador {
    margin-left: auto;
    min-width: 22px;
    padding: 1px 8px;
    border-radius: 99px;
    background: #e5484d;
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    text-align: center;
  }
  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    text-decoration: none;
    cursor: pointer;
  }
  .tab-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 7px 8px;
    border-radius: 18px;
    color: #6b7280;
  }
  .tab-inner span {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: -0.015em;
  }
  .tab.router-link-active .tab-inner {
    background: rgba(245, 168, 0, 0.17);
    color: var(--color-primary);
  }
  .tab.router-link-active .tab-inner span {
    font-weight: 600;
  }
  .tab-icon {
    position: relative;
    display: flex;
  }
  .badge-n {
    position: absolute;
    top: -3px;
    right: -7px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--color-primary);
    color: #1a1206;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hoja-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 29;
  }
  .hoja-mas {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 75vh;
    overflow-y: auto;
    padding: 0.6rem 0.9rem calc(1rem + env(safe-area-inset-bottom));
    background: var(--sidebar-bg);
    border-top: 1px solid var(--sidebar-border);
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    z-index: 30;
  }
  .hoja-manija {
    width: 36px;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--sidebar-border);
    margin: 0.2rem auto 0.6rem;
  }
  .hoja-perfil {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.4rem 0.9rem;
  }
  .hoja-grupo {
    margin-bottom: 0.9rem;
  }
  .hoja-grupo-titulo {
    padding: 0 0.4rem;
    margin: 0 0 0.6rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--sidebar-text-muted);
  }
  .mod-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.9rem 0.5rem;
  }
  .mod-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    text-decoration: none;
  }
  .mod-icono {
    width: 50px;
    height: 50px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .mod-icono :deep(svg) {
    width: 21px;
    height: 21px;
  }
  .mod-etiqueta {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--sidebar-text);
    text-align: center;
    line-height: 1.2;
  }
  .mod-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--color-danger);
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Colores decorativos de los íconos de módulo — no tienen significado
     semántico (a diferencia de success/warning/danger en el resto del
     Sistema), son solo para distinguir cada módulo a simple vista en la
     hoja, como en el mockup. */
  .mod-icono.amber {
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }
  .mod-icono.violet {
    background: rgba(139, 92, 246, 0.16);
    color: #a78bfa;
  }
  .mod-icono.blue {
    background: var(--color-info-soft);
    color: var(--color-info);
  }
  .mod-icono.teal {
    background: rgba(20, 184, 166, 0.16);
    color: #2dd4bf;
  }
  .mod-icono.green {
    background: var(--color-success-soft);
    color: var(--color-success);
  }
  .mod-icono.pink {
    background: rgba(236, 72, 153, 0.16);
    color: #f472b6;
  }
  .mod-icono.slate {
    background: rgba(156, 163, 175, 0.16);
    color: var(--sidebar-text-muted);
  }
  .hoja-separador {
    border: none;
    border-top: 1px solid var(--sidebar-border);
    margin: 0.4rem 0 0.6rem;
  }
  .hoja-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.75rem 0.5rem;
    border-radius: var(--radius-control);
    color: var(--sidebar-text);
    background: none;
    border: none;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }
  .hoja-item:active {
    background: var(--sidebar-hover-bg);
  }
  .hoja-item.peligro {
    color: var(--color-danger);
  }
}
</style>

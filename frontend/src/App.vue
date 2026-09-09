<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './store/auth'
import { useTemaStore } from './store/tema'
import IconoNav from './components/IconoNav.vue'
import { contarValesPendientes, contarAlertasActivas } from './modules/dashboard/services/dashboardService'

const auth = useAuthStore()
const tema = useTemaStore()
const router = useRouter()

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
const mostrarMenu = ref(false)
const mostrarMas = ref(false)

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
  if (auth.tienePermiso('vales.ver_propios')) {
    contarValesPendientes()
      .then((v) => (badgeVales.value = v))
      .catch(() => {})
  }
  if (auth.tienePermiso('alertas.ver')) {
    contarAlertasActivas()
      .then((v) => (badgeAlertas.value = v.total))
      .catch(() => {})
  }
}

// auth ya está inicializada cuando este componente se monta (ver main.js:
// se espera auth.init() antes de app.mount para que el guard del router
// resuelva la primera navegación con la sesión ya cargada).
if (auth.estaAutenticado) cargarContadores()

// Los módulos se agrupan por área operativa, no solo por tabla — así se ve
// de un vistazo quién es dueño de qué (Planeamiento define qué existe y qué
// se prevé; Almacén ejecuta el movimiento físico día a día).
//
// catalogo.ver / frentes.ver también autorizan leer esas tablas para las
// pantallas que las incrustan (Vales, Kardex, Almacén) — Almacén los
// necesita para eso pero no gestiona esos módulos, así que se le oculta el
// link acá (rolesExcluidos) en vez de quitarle el permiso de verdad.
const navPrincipal = [
  { to: '/', label: 'Dashboard', icono: 'dashboard', permiso: 'dashboard.ver' },
  { to: '/reportes', label: 'Reportes', icono: 'reportes', permiso: 'reportes.exportar' },
]

const navPlaneamiento = computed(() => [
  { to: '/catalogo', label: 'Catálogo', icono: 'catalogo', permiso: 'catalogo.ver', rolesExcluidos: ['Almacen'] },
  { to: '/frentes', label: 'Frentes', icono: 'frentes', permiso: 'frentes.ver', rolesExcluidos: ['Almacen'] },
  { to: '/procura', label: 'Procura', icono: 'procura', permiso: 'procura.ver' },
])

const navAlmacen = computed(() => [
  { to: '/almacen', label: 'Almacén', icono: 'almacen', permiso: 'stock.ver' },
  { to: '/vales', label: 'Vales', icono: 'vales', permiso: 'vales.ver_propios', badge: badgeVales.value },
  { to: '/reservas', label: 'Reservas', icono: 'reservas', permiso: 'reservas.ver' },
  { to: '/kardex', label: 'Kardex', icono: 'kardex', permiso: 'kardex.ver' },
  { to: '/alertas', label: 'Alertas', icono: 'alertas', permiso: 'alertas.ver', badge: badgeAlertas.value },
])

const navSistema = [{ to: '/usuarios', label: 'Usuarios', icono: 'usuarios', permiso: 'usuarios.ver' }]

function visibles(items) {
  return items.filter((item) => auth.tienePermiso(item.permiso) && !item.rolesExcluidos?.includes(auth.nombreRol))
}

// En celular no entran todos los módulos en una barra: se muestran los 4
// más usados como pestañas fijas (siguiendo el orden Principal → Planeamiento
// → Almacén) y el resto queda dentro de "Más", junto con tema/usuarios/salir.
const navTodos = computed(() => [
  ...visibles(navPrincipal),
  ...visibles(navPlaneamiento.value),
  ...visibles(navAlmacen.value),
])
const tabsMoviles = computed(() => navTodos.value.slice(0, 4))
const modulosExtra = computed(() => navTodos.value.slice(4))

const inicialesUsuario = computed(() => {
  const nombre = auth.perfil?.nombre ?? ''
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
})
</script>

<template>
  <div v-if="auth.cargando" class="cargando">Cargando…</div>

  <div v-else-if="!auth.estaAutenticado" class="sin-sesion">
    <router-view />
  </div>

  <div v-else class="shell">
    <aside class="nav">
      <div class="marca">
        <span class="marca-icono">D</span>
        <div>
          <div class="marca-nombre">Grupo Desnivel</div>
          <div class="marca-sub">Sistema de Almacén</div>
        </div>
      </div>

      <div class="nav-scroll">
        <nav class="grupo">
          <p class="grupo-titulo">Principal</p>
          <router-link v-for="item in visibles(navPrincipal)" :key="item.to" :to="item.to" class="item">
            <IconoNav :nombre="item.icono" />
            <span>{{ item.label }}</span>
          </router-link>
        </nav>

        <nav v-if="visibles(navPlaneamiento).length" class="grupo">
          <p class="grupo-titulo">Planeamiento</p>
          <router-link v-for="item in visibles(navPlaneamiento)" :key="item.to" :to="item.to" class="item">
            <IconoNav :nombre="item.icono" />
            <span>{{ item.label }}</span>
          </router-link>
        </nav>

        <nav v-if="visibles(navAlmacen).length" class="grupo">
          <p class="grupo-titulo">Almacén</p>
          <router-link v-for="item in visibles(navAlmacen)" :key="item.to" :to="item.to" class="item">
            <IconoNav :nombre="item.icono" />
            <span>{{ item.label }}</span>
            <span v-if="item.badge" class="badge-contador">{{ item.badge }}</span>
          </router-link>
        </nav>
      </div>

      <div class="pie">
        <div v-if="mostrarMenu" class="backdrop-menu" @click="mostrarMenu = false"></div>

        <div v-if="mostrarMenu" class="menu-config">
          <button type="button" class="menu-item" @click="tema.alternar">
            <IconoNav :nombre="tema.modo === 'dark' ? 'sol' : 'luna'" />
            <span>{{ tema.modo === 'dark' ? 'Modo claro' : 'Modo oscuro' }}</span>
          </button>
          <router-link
            v-if="visibles(navSistema).length"
            :to="navSistema[0].to"
            class="menu-item"
            @click="mostrarMenu = false"
          >
            <IconoNav :nombre="navSistema[0].icono" />
            <span>{{ navSistema[0].label }} y roles</span>
          </router-link>
          <button type="button" class="menu-item peligro" @click="cerrarSesionDesdeMenu">
            <IconoNav nombre="salir" />
            <span>Cerrar sesión</span>
          </button>
        </div>

        <button type="button" class="usuario-fila" @click="mostrarMenu = !mostrarMenu">
          <span class="avatar">{{ inicialesUsuario }}</span>
          <div class="usuario-info">
            <div class="usuario-nombre">{{ auth.perfil?.nombre }}</div>
            <div class="usuario-rol">{{ auth.nombreRol }}</div>
          </div>
          <IconoNav nombre="engranaje" class="icono-engranaje" />
        </button>
      </div>
    </aside>
    <main class="contenido">
      <router-view />
    </main>

    <nav class="tabbar">
      <router-link v-for="item in tabsMoviles" :key="item.to" :to="item.to" class="tab">
        <IconoNav :nombre="item.icono" />
        <span>{{ item.label }}</span>
        <span v-if="item.badge" class="tab-badge">{{ item.badge }}</span>
      </router-link>
      <button type="button" class="tab" :class="{ 'router-link-active': mostrarMas }" @click="mostrarMas = true">
        <IconoNav nombre="mas" />
        <span>Más</span>
      </button>
    </nav>

    <div v-if="mostrarMas" class="hoja-backdrop" @click="mostrarMas = false"></div>
    <div v-if="mostrarMas" class="hoja-mas">
      <div class="hoja-manija"></div>
      <div class="hoja-usuario">
        <span class="avatar">{{ inicialesUsuario }}</span>
        <div class="usuario-info">
          <div class="usuario-nombre">{{ auth.perfil?.nombre }}</div>
          <div class="usuario-rol">{{ auth.nombreRol }}</div>
        </div>
      </div>

      <router-link
        v-for="item in modulosExtra"
        :key="item.to"
        :to="item.to"
        class="hoja-item"
        @click="mostrarMas = false"
      >
        <IconoNav :nombre="item.icono" />
        <span>{{ item.label }}</span>
        <span v-if="item.badge" class="badge-contador">{{ item.badge }}</span>
      </router-link>

      <hr v-if="modulosExtra.length" class="hoja-separador" />

      <button type="button" class="hoja-item" @click="tema.alternar">
        <IconoNav :nombre="tema.modo === 'dark' ? 'sol' : 'luna'" />
        <span>{{ tema.modo === 'dark' ? 'Modo claro' : 'Modo oscuro' }}</span>
      </button>
      <router-link
        v-if="visibles(navSistema).length"
        :to="navSistema[0].to"
        class="hoja-item"
        @click="mostrarMas = false"
      >
        <IconoNav :nombre="navSistema[0].icono" />
        <span>{{ navSistema[0].label }} y roles</span>
      </router-link>
      <button type="button" class="hoja-item peligro" @click="cerrarSesionDesdeMas">
        <IconoNav nombre="salir" />
        <span>Cerrar sesión</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
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
  display: grid;
  grid-template-columns: 240px 1fr;
  height: 100vh;
  background: var(--color-bg);
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  padding: 1.1rem 0.9rem;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  overflow: hidden;
}
.marca {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.35rem;
  flex-shrink: 0;
}
/* Único que se desplaza si los enlaces no caben — la marca de arriba y el
   usuario de abajo (con "Cerrar sesión") quedan siempre visibles, sin
   necesidad de bajar la pantalla. */
.nav-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
}
.marca-icono {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.95rem;
  flex-shrink: 0;
}
.marca-nombre {
  color: var(--sidebar-text);
  font-weight: 700;
  font-size: 0.82rem;
  line-height: 1.15;
}
.marca-sub {
  color: var(--sidebar-text-muted);
  font-size: 0.68rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.grupo {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.grupo-titulo {
  margin: 0 0 0.35rem;
  padding: 0 0.55rem;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sidebar-text-muted);
}
.item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--sidebar-text-muted);
  text-decoration: none;
  padding: 0.5rem 0.6rem;
  border-radius: var(--radius-control);
  font-size: 0.87rem;
  font-weight: 500;
}
.item:hover {
  background: var(--sidebar-hover-bg);
  color: var(--sidebar-text);
}
.item.router-link-active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  font-weight: 600;
}
.badge-contador {
  margin-left: auto;
  min-width: 1.2rem;
  text-align: center;
  padding: 0.05rem 0.4rem;
  border-radius: var(--radius-pill);
  background: var(--color-danger);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}
.item.router-link-active .badge-contador {
  background: var(--color-primary-ink);
  color: var(--color-primary);
}
.pie {
  flex-shrink: 0;
  display: flex;
  padding-top: 0.75rem;
  border-top: 1px solid var(--sidebar-border);
  position: relative;
}
.usuario-fila {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  background: none;
  border: none;
  padding: 0.3rem 0.15rem;
  border-radius: var(--radius-control);
  cursor: pointer;
  text-align: left;
}
.usuario-fila:hover {
  background: var(--sidebar-hover-bg);
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control);
  background: var(--color-surface-2);
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-text);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.78rem;
  flex-shrink: 0;
}
.usuario-info {
  min-width: 0;
  flex: 1;
}
.usuario-nombre {
  color: var(--sidebar-text);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.usuario-rol {
  color: var(--sidebar-text-muted);
  font-size: 0.72rem;
}
.icono-engranaje {
  color: var(--sidebar-text-muted);
  flex-shrink: 0;
}
.backdrop-menu {
  position: fixed;
  inset: 0;
  z-index: 30;
}
.menu-config {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  right: 0;
  width: 200px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  z-index: 31;
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
}

/* Barra de pestañas inferior — solo existe en celular (ver media query).
   En escritorio el sidebar de la izquierda cubre toda la navegación. */
.tabbar {
  display: none;
}
.hoja-backdrop,
.hoja-mas {
  display: none;
}

/* Debajo de 640px el sidebar desaparece del todo y la navegación pasa a una
   barra de pestañas fija abajo, como en las apps de celular: más cómoda con
   el pulgar y dedicada solo a los módulos más usados — el resto y "Cerrar
   sesión" viven en la hoja "Más". */
@media (max-width: 640px) {
  .shell {
    display: block;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }
  .nav {
    display: none;
  }
  .contenido {
    height: calc(100vh - 60px);
    height: calc(100dvh - 60px);
    overflow-x: hidden;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .tabbar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 60px;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--sidebar-bg);
    border-top: 1px solid var(--sidebar-border);
    z-index: 20;
  }
  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    background: none;
    border: none;
    color: var(--sidebar-text-muted);
    text-decoration: none;
    font-size: 0.64rem;
    font-weight: 600;
    position: relative;
    cursor: pointer;
  }
  .tab.router-link-active {
    color: var(--sidebar-active-text);
  }
  .tab-badge {
    position: absolute;
    top: 2px;
    right: calc(50% - 16px);
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.25rem;
    border-radius: var(--radius-pill);
    background: var(--color-danger);
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    display: grid;
    place-items: center;
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
  .hoja-usuario {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.4rem 0.75rem;
  }
  .hoja-separador {
    border: none;
    border-top: 1px solid var(--sidebar-border);
    margin: 0.4rem 0;
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

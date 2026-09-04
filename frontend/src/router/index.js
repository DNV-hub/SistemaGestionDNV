import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../store/auth'
import LoginView from '../modules/auth/views/LoginView.vue'
import ModuloPendiente from '../components/ModuloPendiente.vue'

// Todos los módulos salvo login quedan como placeholder hasta que se
// implementen (docs/ARQUITECTURA.md §4). `permiso` es el código que la
// matriz de docs/MODELO_DATOS_Y_FLUJOS.md §2 exige para ver el módulo —
// la app lo revisa aquí (experiencia de usuario) y RLS lo vuelve a
// revisar en la base de datos (seguridad real, spec §18).
const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { publica: true } },
  {
    path: '/',
    name: 'dashboard',
    component: ModuloPendiente,
    props: { titulo: 'Dashboard' },
    meta: { permiso: 'dashboard.ver' },
  },
  {
    path: '/catalogo',
    name: 'catalogo',
    component: ModuloPendiente,
    props: { titulo: 'Catálogo de materiales' },
    meta: { permiso: 'catalogo.ver' },
  },
  {
    path: '/frentes',
    name: 'frentes',
    component: ModuloPendiente,
    props: { titulo: 'Frentes' },
    meta: { permiso: 'frentes.ver' },
  },
  {
    path: '/almacen',
    name: 'almacen',
    component: ModuloPendiente,
    props: { titulo: 'Almacén (stock, ingresos, ajustes)' },
    meta: { permiso: 'stock.ver' },
  },
  {
    path: '/vales',
    name: 'vales',
    component: ModuloPendiente,
    props: { titulo: 'Vales' },
    meta: { permiso: 'vales.ver_propios' },
  },
  {
    path: '/reservas',
    name: 'reservas',
    component: ModuloPendiente,
    props: { titulo: 'Reservas' },
    meta: { permiso: 'reservas.ver' },
  },
  {
    path: '/kardex',
    name: 'kardex',
    component: ModuloPendiente,
    props: { titulo: 'Kardex' },
    meta: { permiso: 'kardex.ver' },
  },
  {
    path: '/procura',
    name: 'procura',
    component: ModuloPendiente,
    props: { titulo: 'Metrados Procura' },
    meta: { permiso: 'procura.ver' },
  },
  {
    path: '/alertas',
    name: 'alertas',
    component: ModuloPendiente,
    props: { titulo: 'Alertas' },
    meta: { permiso: 'alertas.ver' },
  },
  {
    path: '/usuarios',
    name: 'usuarios',
    component: ModuloPendiente,
    props: { titulo: 'Usuarios y roles' },
    meta: { permiso: 'usuarios.ver' },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.publica) return true
  if (!auth.estaAutenticado) return { name: 'login' }
  if (to.meta.permiso && !auth.tienePermiso(to.meta.permiso)) return { name: 'dashboard' }
  return true
})

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../store/auth'
import LoginView from '../modules/auth/views/LoginView.vue'
import ModuloPendiente from '../components/ModuloPendiente.vue'
import { catalogoRoutes } from '../modules/catalogo/routes'
import { almacenRoutes } from '../modules/almacen/routes'
import { frentesRoutes } from '../modules/frentes/routes'
import { valesRoutes } from '../modules/vales/routes'
import { kardexRoutes } from '../modules/kardex/routes'
import { reservasRoutes } from '../modules/reservas/routes'
import { usuariosRoutes } from '../modules/usuarios/routes'

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
  ...catalogoRoutes,
  ...frentesRoutes,
  ...almacenRoutes,
  ...valesRoutes,
  ...reservasRoutes,
  ...kardexRoutes,
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
  ...usuariosRoutes,
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

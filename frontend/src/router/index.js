import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../store/auth'
import LoginView from '../modules/auth/views/LoginView.vue'
import { dashboardRoutes } from '../modules/dashboard/routes'
import { catalogoRoutes } from '../modules/catalogo/routes'
import { almacenRoutes } from '../modules/almacen/routes'
import { frentesRoutes } from '../modules/frentes/routes'
import { valesRoutes } from '../modules/vales/routes'
import { kardexRoutes } from '../modules/kardex/routes'
import { reservasRoutes } from '../modules/reservas/routes'
import { usuariosRoutes } from '../modules/usuarios/routes'
import { procuraRoutes } from '../modules/procura/routes'
import { alertasRoutes } from '../modules/alertas/routes'
import { reportesRoutes } from '../modules/reportes/routes'

// `permiso` es el código que la matriz de docs/MODELO_DATOS_Y_FLUJOS.md §2
// exige para ver el módulo — la app lo revisa aquí (experiencia de usuario)
// y RLS lo vuelve a revisar en la base de datos (seguridad real, spec §18).
const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { publica: true } },
  ...dashboardRoutes,
  ...catalogoRoutes,
  ...frentesRoutes,
  ...almacenRoutes,
  ...valesRoutes,
  ...reservasRoutes,
  ...kardexRoutes,
  ...procuraRoutes,
  ...alertasRoutes,
  ...reportesRoutes,
  ...usuariosRoutes,
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  // Sin esto, refrescar la página estando logueado y con la URL en /login
  // (típico si el refresh pasa justo antes del router.push('/') del login)
  // deja el panel montado sobre la ruta de login en vez de redirigir.
  if (to.meta.publica) return auth.estaAutenticado ? { name: 'dashboard' } : true
  if (!auth.estaAutenticado) return { name: 'login' }
  if (to.meta.permiso && !auth.tienePermiso(to.meta.permiso)) return { name: 'dashboard' }
  if (to.meta.rolesExcluidos?.includes(auth.nombreRol)) return { name: 'dashboard' }
  return true
})

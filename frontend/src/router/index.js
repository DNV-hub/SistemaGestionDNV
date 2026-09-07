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

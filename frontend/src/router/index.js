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
import { planeamientoRoutes } from '../modules/planeamiento/routes'
import { rdcRoutes } from '../modules/rdc/routes'
import { confirmacionRoutes } from '../modules/confirmacion/routes'
import { avanceRoutes } from '../modules/avance/routes'
import { calidadRoutes } from '../modules/calidad/routes'
import { fotosRoutes } from '../modules/fotos/routes'
import { sketchesRoutes } from '../modules/sketches/routes'
import { developerRoutes } from '../modules/developer/routes'
import { configuracionRoutes } from '../modules/configuracion/routes'

// `permiso` es el código que la matriz de docs/MODELO_DATOS_Y_FLUJOS.md §2
// exige para ver el módulo — la app lo revisa aquí (experiencia de usuario)
// y RLS lo vuelve a revisar en la base de datos (seguridad real, spec §18).
const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { publica: true } },
  ...dashboardRoutes,
  ...planeamientoRoutes,
  ...rdcRoutes,
  ...confirmacionRoutes,
  ...avanceRoutes,
  ...calidadRoutes,
  ...fotosRoutes,
  ...sketchesRoutes,
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
  ...configuracionRoutes,
  ...developerRoutes,
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Dónde cae cada quien al entrar, y a dónde se lo devuelve si intenta ir a un
// módulo que no le toca. El Dashboard ahora es la pantalla principal de
// todos los roles, Supervisor incluido — ya no hay un caso especial acá.
// El Supervisor abre en Reporte diario (el Dashboard general queda en el menú
// de su avatar).
const rutaInicial = () => (useAuthStore().nombreRol === 'Supervisor' ? { name: 'rdc' } : { name: 'dashboard' })

router.beforeEach((to) => {
  const auth = useAuthStore()

  // Sin esto, refrescar la página estando logueado y con la URL en /login
  // (típico si el refresh pasa justo antes del router.push('/') del login)
  // deja el panel montado sobre la ruta de login en vez de redirigir.
  if (to.meta.publica) return auth.estaAutenticado ? rutaInicial() : true
  if (!auth.estaAutenticado) return { name: 'login' }
  if (to.meta.permiso && !auth.tienePermiso(to.meta.permiso)) return rutaInicial()
  // Quien ve todos los vales trabaja en Almacén (bandeja + detalle): el módulo
  // antiguo /vales y su detalle ya no se usan para ellos. Los enlaces viejos
  // (y el que arma "Nuevo vale" al terminar) aterrizan en la pestaña Vales.
  const veTodosLosVales = auth.tienePermiso('vales.ver_todos') && auth.nombreRol !== 'Supervisor'
  if (veTodosLosVales && to.name === 'vales') return { path: '/almacen', query: { tab: 'vales' }, replace: true }
  if (veTodosLosVales && to.name === 'vale-detalle') return { path: '/almacen', query: { tab: 'vales', vale: to.params.id }, replace: true }
  if (to.meta.rolesExcluidos?.includes(auth.nombreRol)) return rutaInicial()
  return true
})

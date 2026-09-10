import DeveloperView from './views/DeveloperView.vue'

export const developerRoutes = [
  { path: '/developer', name: 'developer', component: DeveloperView, meta: { permiso: 'sistema.borrar_pruebas' } },
]

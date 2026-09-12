export const developerRoutes = [
  { path: '/developer', name: 'developer', component: () => import('./views/DeveloperView.vue'), meta: { permiso: 'sistema.borrar_pruebas' } },
]

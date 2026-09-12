export const alertasRoutes = [
  {
    path: '/alertas',
    name: 'alertas',
    component: () => import('./views/AlertasView.vue'),
    meta: { permiso: 'alertas.ver' },
  },
]

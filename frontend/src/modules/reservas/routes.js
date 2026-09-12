export const reservasRoutes = [
  {
    path: '/reservas',
    name: 'reservas',
    component: () => import('./views/ReservasView.vue'),
    meta: { permiso: 'reservas.ver' },
  },
]

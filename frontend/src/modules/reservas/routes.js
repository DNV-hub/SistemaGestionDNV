import ReservasView from './views/ReservasView.vue'

export const reservasRoutes = [
  {
    path: '/reservas',
    name: 'reservas',
    component: ReservasView,
    meta: { permiso: 'reservas.ver' },
  },
]

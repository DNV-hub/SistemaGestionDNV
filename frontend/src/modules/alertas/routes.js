import AlertasView from './views/AlertasView.vue'

export const alertasRoutes = [
  {
    path: '/alertas',
    name: 'alertas',
    component: AlertasView,
    meta: { permiso: 'alertas.ver' },
  },
]

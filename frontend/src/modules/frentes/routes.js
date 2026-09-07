import FrentesView from './views/FrentesView.vue'

export const frentesRoutes = [
  {
    path: '/frentes',
    name: 'frentes',
    component: FrentesView,
    meta: { permiso: 'frentes.ver' },
  },
]

import KardexView from './views/KardexView.vue'

export const kardexRoutes = [
  {
    path: '/kardex',
    name: 'kardex',
    component: KardexView,
    meta: { permiso: 'kardex.ver' },
  },
]

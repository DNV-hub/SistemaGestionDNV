export const kardexRoutes = [
  {
    path: '/kardex',
    name: 'kardex',
    component: () => import('./views/KardexView.vue'),
    meta: { permiso: 'kardex.ver' },
  },
]

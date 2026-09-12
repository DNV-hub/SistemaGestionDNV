export const almacenRoutes = [
  {
    path: '/almacen',
    name: 'almacen',
    component: () => import('./views/AlmacenView.vue'),
    meta: { permiso: 'stock.ver' },
  },
]

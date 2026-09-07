import AlmacenView from './views/AlmacenView.vue'

export const almacenRoutes = [
  {
    path: '/almacen',
    name: 'almacen',
    component: AlmacenView,
    meta: { permiso: 'stock.ver' },
  },
]

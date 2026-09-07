import ValesView from './views/ValesView.vue'
import ValeDetalleView from './views/ValeDetalleView.vue'

export const valesRoutes = [
  {
    path: '/vales',
    name: 'vales',
    component: ValesView,
    meta: { permiso: 'vales.ver_propios' },
  },
  {
    path: '/vales/:id',
    name: 'vale-detalle',
    component: ValeDetalleView,
    meta: { permiso: 'vales.ver_propios' },
  },
]

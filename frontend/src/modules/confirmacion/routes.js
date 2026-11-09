export const confirmacionRoutes = [
  {
    path: '/confirmacion',
    name: 'confirmacion',
    component: () => import('./views/BandejaConfirmacionView.vue'),
    meta: { permiso: 'rdc.confirmar_metrados' },
  },
]

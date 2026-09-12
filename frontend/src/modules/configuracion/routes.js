export const configuracionRoutes = [
  {
    path: '/configuracion/roles',
    name: 'configuracion-roles',
    component: () => import('./views/RolesPermisosView.vue'),
    meta: { permiso: 'roles.gestionar' },
  },
]

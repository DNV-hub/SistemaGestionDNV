import RolesPermisosView from './views/RolesPermisosView.vue'

export const configuracionRoutes = [
  {
    path: '/configuracion/roles',
    name: 'configuracion-roles',
    component: RolesPermisosView,
    meta: { permiso: 'roles.gestionar' },
  },
]

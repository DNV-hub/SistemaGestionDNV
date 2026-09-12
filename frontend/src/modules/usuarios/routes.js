export const usuariosRoutes = [
  {
    path: '/usuarios',
    name: 'usuarios',
    component: () => import('./views/UsuariosView.vue'),
    meta: { permiso: 'usuarios.ver' },
  },
]

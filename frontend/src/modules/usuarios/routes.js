import UsuariosView from './views/UsuariosView.vue'

export const usuariosRoutes = [
  {
    path: '/usuarios',
    name: 'usuarios',
    component: UsuariosView,
    meta: { permiso: 'usuarios.ver' },
  },
]

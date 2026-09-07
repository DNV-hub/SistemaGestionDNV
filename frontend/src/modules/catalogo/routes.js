import CatalogoView from './views/CatalogoView.vue'

export const catalogoRoutes = [
  {
    path: '/catalogo',
    name: 'catalogo',
    component: CatalogoView,
    meta: { permiso: 'catalogo.ver' },
  },
]

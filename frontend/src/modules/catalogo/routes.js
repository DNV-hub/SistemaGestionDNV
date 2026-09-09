import CatalogoView from './views/CatalogoView.vue'

export const catalogoRoutes = [
  {
    path: '/catalogo',
    name: 'catalogo',
    component: CatalogoView,
    // catalogo.ver también autoriza la lectura de `materiales` para las
    // pantallas que lo incrustan (Vales, Kardex, Almacén) — Almacén sí lo
    // necesita para eso, pero no debe gestionar el catálogo, así que la
    // pantalla se le oculta acá (frontend) en vez de quitarle el permiso.
    meta: { permiso: 'catalogo.ver', rolesExcluidos: ['Almacen'] },
  },
]

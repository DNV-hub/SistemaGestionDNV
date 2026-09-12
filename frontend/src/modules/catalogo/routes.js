export const catalogoRoutes = [
  {
    path: '/catalogo',
    name: 'catalogo',
    component: () => import('./views/CatalogoView.vue'),
    // catalogo.ver también autoriza la lectura de `materiales` para las
    // pantallas que lo incrustan (Vales, Kardex, Almacén) — Almacén sí lo
    // necesita para eso, pero no debe gestionar el catálogo, así que la
    // pantalla se le oculta acá (frontend) en vez de quitarle el permiso.
    meta: { permiso: 'catalogo.ver', rolesExcluidos: ['Almacen'] },
  },
  // Capataces y "Catálogos RDC" viven bajo /catalogo como pestañas del mismo
  // módulo (así lo pidió el usuario), pero su permiso es otro: administrar
  // estos catálogos no depende de catalogo.ver (ese es del catálogo de
  // materiales) sino de rdc.catalogos_gestionar.
  {
    path: '/catalogo/capataces',
    name: 'catalogo-capataces',
    component: () => import('./rdc/views/CapatacesView.vue'),
    meta: { permiso: 'rdc.catalogos_gestionar' },
  },
  {
    path: '/catalogo/rdc',
    name: 'catalogo-rdc',
    component: () => import('./rdc/views/CatalogosRdcView.vue'),
    meta: { permiso: 'rdc.catalogos_gestionar' },
  },
]

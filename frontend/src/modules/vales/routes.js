export const valesRoutes = [
  {
    path: '/vales',
    name: 'vales',
    component: () => import('./views/ValesView.vue'),
    meta: { permiso: 'vales.ver_propios' },
  },
  // Hoja a pantalla completa para celular (docs/mockups/04-vale-nuevo.html +
  // 05-selector-material.html); el modal centrado sigue siendo el flujo de
  // escritorio, sin tocar. Oculta la barra flotante mientras se está adentro,
  // igual que el formulario de RDC.
  {
    path: '/vales/nuevo',
    name: 'vale-nuevo',
    component: () => import('./views/ValeNuevoView.vue'),
    meta: { permiso: 'vales.crear', ocultarTabbar: true },
  },
  {
    path: '/vales/nuevo/material',
    name: 'vale-nuevo-material',
    component: () => import('./views/SelectorMaterialView.vue'),
    meta: { permiso: 'vales.crear', ocultarTabbar: true },
  },
  // Accesos rápidos dentro de "Vales" (antes vivían en el panel de escritorio
  // del supervisor, que en celular ya no tiene forma de alcanzarse).
  {
    path: '/vales/stock',
    name: 'vales-stock',
    component: () => import('./views/StockEnVivoView.vue'),
    meta: { permiso: 'vales.ver_propios', ocultarTabbar: true },
  },
  {
    path: '/vales/devolucion',
    name: 'vales-devolucion',
    component: () => import('./views/DevolucionNuevaView.vue'),
    meta: { permiso: 'devoluciones.crear', ocultarTabbar: true },
  },
  {
    path: '/vales/:id',
    name: 'vale-detalle',
    component: () => import('./views/ValeDetalleView.vue'),
    meta: { permiso: 'vales.ver_propios' },
  },
]

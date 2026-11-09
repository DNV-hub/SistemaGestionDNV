// `rdc.ver_propios` es el permiso que marca "este módulo existe para mí".
// Quien además tenga `rdc.ver_todos` verá los reportes de todos, pero eso lo
// decide RLS en la base, no la ruta.
export const rdcRoutes = [
  // La pantalla principal del RDC vive ahora en /planeamiento/rdc (un solo
  // componente para todos los roles); el nombre 'rdc' sigue existiendo para
  // los router.push({ name: 'rdc' }) del resto del módulo.
  { path: '/rdc', name: 'rdc', redirect: '/planeamiento/rdc' },
  // El historial completo (antes vivía junto a "Nuevo reporte" en la misma
  // pantalla) ahora es su propia ruta, reachable desde el botón "Historial
  // de reportes" del Dashboard.
  { path: '/rdc/historial', name: 'rdc-historial', component: () => import('./views/RdcListaView.vue'), meta: { permiso: 'rdc.ver_propios' } },
  // Detalle por tipo de elemento (Perforación/Inyección/Malla/Cable) del
  // frente actual — se llega acá tocando una tarjeta de Control de
  // sostenimiento en el Dashboard.
  {
    path: '/rdc/control/:tipo(perforacion|inyeccion|malla|cable)',
    name: 'rdc-control-detalle',
    component: () => import('./views/RdcControlDetalleView.vue'),
    props: true,
    meta: { permiso: 'rdc.ver_propios' },
  },
  // El formulario trae su propia barra inferior de pasos, la misma que el RDC
  // de siempre. En celular se oculta la del Sistema mientras se está adentro:
  // dos barras apiladas se comen la pantalla y confunden cuál es cuál.
  {
    path: '/rdc/nuevo',
    name: 'rdc-nuevo',
    component: () => import('./views/RdcFormularioSelector.vue'),
    meta: { permiso: 'rdc.crear', ocultarTabbar: true },
  },
  {
    path: '/rdc/:id/editar',
    name: 'rdc-editar',
    component: () => import('./views/RdcFormularioSelector.vue'),
    meta: { permiso: 'rdc.editar_propio', ocultarTabbar: true },
  },
  { path: '/rdc/:id', name: 'rdc-detalle', component: () => import('./views/RdcDetalleView.vue'), meta: { permiso: 'rdc.ver_propios' } },
]

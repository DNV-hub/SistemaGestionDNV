// Mismo motivo que Fotos: es una consulta de solo lectura contra SharePoint,
// sin tabla propia en Supabase, así que reutiliza rdc.ver_propios en vez de
// un permiso dedicado — es el mismo grupo (supervisores y quien vea el RDC)
// y no hay ninguna fila que proteger con RLS.
export const sketchesRoutes = [
  { path: '/sketches', name: 'sketches', component: () => import('./views/SketchesView.vue'), meta: { permiso: 'rdc.ver_propios' } },
]

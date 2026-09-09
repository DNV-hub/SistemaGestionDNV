import RdcListaView from './views/RdcListaView.vue'
import RdcFormularioView from './views/RdcFormularioView.vue'
import RdcDetalleView from './views/RdcDetalleView.vue'

// `rdc.ver_propios` es el permiso que marca "este módulo existe para mí".
// Quien además tenga `rdc.ver_todos` verá los reportes de todos, pero eso lo
// decide RLS en la base, no la ruta.
export const rdcRoutes = [
  { path: '/rdc', name: 'rdc', component: RdcListaView, meta: { permiso: 'rdc.ver_propios' } },
  // El formulario trae su propia barra inferior de pasos, la misma que el RDC
  // de siempre. En celular se oculta la del Sistema mientras se está adentro:
  // dos barras apiladas se comen la pantalla y confunden cuál es cuál.
  { path: '/rdc/nuevo', name: 'rdc-nuevo', component: RdcFormularioView, meta: { permiso: 'rdc.crear', ocultarTabbar: true } },
  { path: '/rdc/:id/editar', name: 'rdc-editar', component: RdcFormularioView, meta: { permiso: 'rdc.editar_propio', ocultarTabbar: true } },
  { path: '/rdc/:id', name: 'rdc-detalle', component: RdcDetalleView, meta: { permiso: 'rdc.ver_propios' } },
]

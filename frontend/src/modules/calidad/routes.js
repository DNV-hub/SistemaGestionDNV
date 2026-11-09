// Calidad lee los reportes de todos los frentes: pide rdc.ver_todos (el mismo
// permiso con el que RLS deja leer rdc_reportes y sus elementos). El
// Supervisor no lo usa.
export const calidadRoutes = [
  {
    path: '/calidad',
    name: 'calidad',
    component: () => import('./views/CalidadView.vue'),
    meta: { permiso: 'rdc.ver_todos', rolesExcluidos: ['Almacen', 'Supervisor'] },
  },
]

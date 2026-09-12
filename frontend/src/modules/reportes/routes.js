export const reportesRoutes = [
  {
    path: '/reportes',
    name: 'reportes',
    component: () => import('./views/ReportesView.vue'),
    meta: { permiso: 'reportes.exportar' },
  },
]

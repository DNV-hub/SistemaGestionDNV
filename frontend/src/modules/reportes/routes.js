import ReportesView from './views/ReportesView.vue'

export const reportesRoutes = [
  {
    path: '/reportes',
    name: 'reportes',
    component: ReportesView,
    meta: { permiso: 'reportes.exportar' },
  },
]

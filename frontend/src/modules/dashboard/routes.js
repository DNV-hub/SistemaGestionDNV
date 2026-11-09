export const dashboardRoutes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('./views/DashboardView.vue'),
    meta: { permiso: 'dashboard.ver' },
  },
]

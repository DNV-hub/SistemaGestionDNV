export const dashboardRoutes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('./views/DashboardView.vue'),
    // Un supervisor conserva el permiso (otras pantallas lo dan por sentado)
    // pero no entra acá: al iniciar sesión o al pedir "/" se lo lleva a su
    // reporte de campo, que es su pantalla de trabajo.
    meta: { permiso: 'dashboard.ver', rolesExcluidos: ['Supervisor'] },
  },
]

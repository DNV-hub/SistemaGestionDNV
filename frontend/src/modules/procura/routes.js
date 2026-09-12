export const procuraRoutes = [
  {
    path: '/procura',
    name: 'procura',
    component: () => import('./views/ProcuraView.vue'),
    meta: { permiso: 'procura.ver' },
  },
  {
    path: '/procura/:frenteId',
    name: 'procura-frente',
    component: () => import('./views/ProcuraFrenteView.vue'),
    meta: { permiso: 'procura.ver' },
  },
]

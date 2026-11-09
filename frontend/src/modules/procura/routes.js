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
    // La edición del metrado (con zonas) vive en la pestaña Procura de la
    // ficha del frente; esta ruta queda solo para enlaces viejos.
    redirect: (to) => `/frentes/${to.params.frenteId}/procura`,
    meta: { permiso: 'procura.ver' },
  },
]

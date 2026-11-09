export const frentesRoutes = [
  {
    path: '/frentes',
    name: 'frentes',
    component: () => import('./views/FrentesView.vue'),
    // Mismo caso que catalogo.ver: Almacén necesita frentes.ver para que
    // Vales/Kardex/Reservas muestren el nombre del frente, pero no gestiona
    // frentes — se le oculta la pantalla acá en vez de quitarle el permiso.
    // Supervisor igual: necesita frentes.ver para que el RDC funcione por
    // dentro, pero la ficha/lista no son para su rol — su trabajo pasa en
    // el frente, no en administrarlo (ver App.vue, mismo criterio SOLO_CAMPO).
    meta: { permiso: 'frentes.ver', rolesExcluidos: ['Almacen', 'Supervisor'] },
  },
  // "Metrados" pasó a ser "Semanal": los enlaces guardados a la ruta vieja
  // siguen funcionando.
  {
    path: '/frentes/:id/metrados',
    redirect: (to) => ({ path: `/frentes/${to.params.id}/semanal`, query: to.query }),
  },
  {
    path: '/frentes/:id/:tab(resumen|procura|control|semanal|reportes|configuracion)?',
    name: 'ficha-frente',
    component: () => import('./views/FichaFrenteView.vue'),
    props: true,
    meta: { permiso: 'frentes.ver', rolesExcluidos: ['Almacen', 'Supervisor'] },
  },
]

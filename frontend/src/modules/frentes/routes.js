import FrentesView from './views/FrentesView.vue'

export const frentesRoutes = [
  {
    path: '/frentes',
    name: 'frentes',
    component: FrentesView,
    // Mismo caso que catalogo.ver: Almacén necesita frentes.ver para que
    // Vales/Kardex/Reservas muestren el nombre del frente, pero no gestiona
    // frentes — se le oculta la pantalla acá en vez de quitarle el permiso.
    meta: { permiso: 'frentes.ver', rolesExcluidos: ['Almacen'] },
  },
]

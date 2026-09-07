import ProcuraView from './views/ProcuraView.vue'
import ProcuraFrenteView from './views/ProcuraFrenteView.vue'

export const procuraRoutes = [
  {
    path: '/procura',
    name: 'procura',
    component: ProcuraView,
    meta: { permiso: 'procura.ver' },
  },
  {
    path: '/procura/:frenteId',
    name: 'procura-frente',
    component: ProcuraFrenteView,
    meta: { permiso: 'procura.ver' },
  },
]

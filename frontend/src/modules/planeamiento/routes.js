export const planeamientoRoutes = [
  {
    path: '/planeamiento',
    component: () => import('./views/PlaneamientoView.vue'),
    meta: { permiso: 'catalogo.ver', rolesExcluidos: ['Almacen', 'Supervisor'] },
    children: [
      // La pantalla inicial de Planeamiento es Frentes; en celular, RDC.
      {
        path: '',
        redirect: () => ({
          name: window.matchMedia('(max-width: 1024px)').matches ? 'planeamiento-rdc' : 'planeamiento-frentes',
        }),
      },
      {
        path: 'frentes',
        name: 'planeamiento-frentes',
        component: () => import('../frentes/views/FrentesView.vue'),
        meta: { permiso: 'frentes.ver', rolesExcluidos: ['Almacen', 'Supervisor'] },
      },
      {
        path: 'rdc',
        name: 'planeamiento-rdc',
        // Un solo componente para todos los roles (administrador: revisión
        // de todos los frentes; supervisor: lo suyo). Campo entra aquí también,
        // así que se le quita la exclusión heredada del padre.
        component: () => import('../rdc/views/RdcPanelView.vue'),
        meta: { permiso: 'rdc.ver_propios', rolesExcluidos: ['Almacen'] },
      },
      {
        path: 'catalogo/:seccion?',
        name: 'planeamiento-catalogo',
        component: () => import('../catalogo/views/CatalogoPlaneamientoView.vue'),
        props: true,
        meta: { permiso: 'catalogo.ver', rolesExcluidos: ['Almacen'] },
      },
    ],
  },
  // Las rutas raíz históricas redirigen al hub de Planeamiento.
  // Las sub-rutas (/frentes/:id, /rdc/nuevo, etc.) se mantienen intactas en
  // sus módulos — solo el raíz cambia.
  { path: '/catalogo', redirect: '/planeamiento/catalogo' },
  { path: '/catalogo/capataces', redirect: '/planeamiento/catalogo/capataces' },
  {
    path: '/catalogo/rdc',
    redirect: (to) => {
      // La pestaña vieja (?tab=prefijos) pasa a ser el ítem de la lista maestra.
      const TAB_A_SECCION = {
        sectores: 'sectores',
        frentes: 'frentes',
        supervisores: 'supervisores',
        redline: 'redline',
        maquinarias: 'maquinaria',
        partidasEstandar: 'partidas-estandar',
        prefijos: 'prefijos',
        partidasEdt: 'edt',
        pernos: 'pernos',
      }
      const seccion = TAB_A_SECCION[to.query.tab] ?? 'partidas-estandar'
      return `/planeamiento/catalogo/${seccion}`
    },
  },
  { path: '/frentes', redirect: '/planeamiento/frentes' },
  { path: '/rdc', redirect: '/planeamiento/rdc' },
]

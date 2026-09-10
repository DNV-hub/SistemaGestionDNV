import FotosView from './views/FotosView.vue'

// El módulo Fotos no tiene tabla propia en Supabase — como en el RDC
// original, las fotos van directo a SharePoint vía Power Automate, nunca a
// la base de datos. Por eso reutiliza `rdc.crear` en vez de tener un
// permiso propio: es exactamente el mismo grupo de personas (los
// supervisores) y no hay ninguna fila que proteger con RLS.
export const fotosRoutes = [
  { path: '/fotos', name: 'fotos', component: FotosView, meta: { permiso: 'rdc.crear' } },
]

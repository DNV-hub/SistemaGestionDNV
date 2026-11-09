import { supabase } from '../../services/supabaseClient'

// "Avance de sostenimiento" dejó de ser una pantalla aparte — ahora vive
// como la pestaña "Control de sostenimiento" de la ficha de cada frente
// (frentes/views/ficha/FichaControlSostenimiento.vue). Esta ruta solo
// queda como redirección para quien tenga el enlace viejo guardado
// (favorito, mensaje de WhatsApp, etc.): resuelve el primer frente
// disponible para la cuenta y la manda directo a esa pestaña.
export const avanceRoutes = [
  {
    path: '/avance-sostenimiento',
    name: 'avance-sostenimiento',
    beforeEnter: async (_to, _from, next) => {
      try {
        const { data, error } = await supabase.rpc('fn_rdc_frentes_disponibles')
        if (error) throw error
        next(data?.length ? `/frentes/${data[0].id}/control` : '/frentes')
      } catch {
        next('/frentes')
      }
    },
    component: { render: () => null },
  },
]

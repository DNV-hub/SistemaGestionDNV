import { createClient } from '@supabase/supabase-js'
import { humanizarError } from '../utils/mensajeError'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y completa los valores del proyecto Supabase.'
  )
}

// Todos los errores de la base (tablas, RPC, storage) pasan por acá: se
// reescribe su `message` a una frase clara en español, sin ids ni códigos.
// El texto original queda en `error.details` ("Técnico: …").
async function fetchConMensajesClaros(entrada, opciones) {
  const respuesta = await fetch(entrada, opciones)
  if (respuesta.ok) return respuesta
  const url = typeof entrada === 'string' ? entrada : entrada?.url ?? ''
  // Solo errores de PostgREST (/rest/v1): los de auth y storage tienen otra forma.
  if (!url.includes('/rest/v1/')) return respuesta
  try {
    const cuerpo = await respuesta.clone().json()
    const nuevo = humanizarError(cuerpo)
    if (nuevo === cuerpo) return respuesta
    return new Response(JSON.stringify(nuevo), {
      status: respuesta.status,
      statusText: respuesta.statusText,
      headers: respuesta.headers,
    })
  } catch {
    return respuesta
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
  },
  global: { fetch: fetchConMensajesClaros },
})

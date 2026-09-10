// Genera una sesión real para OTRA cuenta, a nombre de quien la pide (rol
// Developer, permiso sistema.suplantar_usuario). No hace falta conocer ni
// tocar la contraseña de la cuenta destino: se usa la Admin API de Supabase
// Auth para generar un magic link y devolver solo el `hashed_token`, que el
// navegador cambia por una sesión real con `auth.verifyOtp`. Como es una
// sesión real (no una simulación de la interfaz), todo — RLS, permisos,
// listas filtradas — se comporta exactamente igual que si esa cuenta hubiera
// iniciado sesión ella misma.
//
// El frontend es responsable de guardar la sesión ORIGINAL (access/refresh
// token) antes de cambiar, para poder volver sin pedir contraseña de nuevo —
// acá no hace falta saber nada de eso, esta función solo entrega el acceso a
// la cuenta destino.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respuesta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return respuesta({ error: 'Falta el encabezado Authorization.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const clienteLlamador = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: tienePermiso, error: errorPermiso } = await clienteLlamador.rpc('has_permission', {
    p_codigo: 'sistema.suplantar_usuario',
  })
  if (errorPermiso) return respuesta({ error: 'No se pudo verificar el permiso.' }, 500)
  if (!tienePermiso) return respuesta({ error: 'No tiene permiso para ver el sistema como otra cuenta.' }, 403)

  let body: { usuario_id?: string }
  try {
    body = await req.json()
  } catch {
    return respuesta({ error: 'Cuerpo de la solicitud inválido.' }, 400)
  }

  const { usuario_id } = body
  if (!usuario_id) return respuesta({ error: 'usuario_id es obligatorio.' }, 400)

  const clienteAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: usuario, error: errorUsuario } = await clienteAdmin
    .from('usuarios')
    .select('id, email, nombre, estado')
    .eq('id', usuario_id)
    .single()
  if (errorUsuario || !usuario) return respuesta({ error: 'El usuario no existe.' }, 404)
  if (usuario.estado !== 'activo') return respuesta({ error: 'Esa cuenta está inactiva.' }, 400)

  const { data: link, error: errorLink } = await clienteAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: usuario.email,
  })
  if (errorLink || !link) return respuesta({ error: `No se pudo generar el acceso: ${errorLink?.message ?? 'error desconocido'}` }, 400)

  return respuesta({
    email: usuario.email,
    nombre: usuario.nombre,
    token_hash: link.properties.hashed_token,
  })
})

// Restablece la contraseña de un usuario existente (el admin la define o
// se genera una temporal). Nunca se puede "ver" una contraseña ya
// existente —los hashes de Supabase Auth no son reversibles— así que esto
// es la manera real de ayudar a alguien que la perdió: se define una
// nueva, se muestra una sola vez a quien la restablece, y se le comparte
// por un canal seguro a la persona dueña de la cuenta.
//
// Igual que crear-usuario, necesita la Admin API de Supabase Auth (service
// role), que nunca debe exponerse al navegador.
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

function generarPasswordTemporal() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let clave = ''
  for (let i = 0; i < 12; i++) clave += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return clave
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
    p_codigo: 'usuarios.editar',
  })
  if (errorPermiso) return respuesta({ error: 'No se pudo verificar el permiso.' }, 500)
  if (!tienePermiso) return respuesta({ error: 'No tiene permiso para restablecer contraseñas.' }, 403)

  let body: { id?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return respuesta({ error: 'Cuerpo de la solicitud inválido.' }, 400)
  }

  const { id, password } = body
  if (!id) return respuesta({ error: 'id es obligatorio.' }, 400)
  if (password && password.length < 8) {
    return respuesta({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
  }

  const clienteAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: usuario, error: errorUsuario } = await clienteAdmin
    .from('usuarios')
    .select('id, email, nombre')
    .eq('id', id)
    .single()
  if (errorUsuario || !usuario) return respuesta({ error: 'El usuario no existe.' }, 404)

  const nuevaPassword = password || generarPasswordTemporal()
  const { error: errorUpdate } = await clienteAdmin.auth.admin.updateUserById(id, { password: nuevaPassword })
  if (errorUpdate) return respuesta({ error: `No se pudo restablecer la contraseña: ${errorUpdate.message}` }, 400)

  return respuesta({ usuario, password: nuevaPassword })
})

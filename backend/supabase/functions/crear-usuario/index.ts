// Crea un usuario nuevo: cuenta de acceso (auth.users) + perfil (public.usuarios).
// Tiene que vivir en una Edge Function porque crear una cuenta de acceso
// requiere la Admin API de Supabase Auth (service role), que nunca debe
// exponerse al navegador. La autorización real ocurre acá adentro
// (comprobamos el permiso del que llama contra la base con su propio JWT
// antes de usar el cliente con privilegios), no solo en el frontend.
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

  // Cliente "como el que llama": respeta RLS, se usa solo para verificar el
  // permiso real contra la base (nunca confiar en el rol que manda el front).
  const clienteLlamador = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: tienePermiso, error: errorPermiso } = await clienteLlamador.rpc('has_permission', {
    p_codigo: 'usuarios.crear',
  })
  if (errorPermiso) return respuesta({ error: 'No se pudo verificar el permiso.' }, 500)
  if (!tienePermiso) return respuesta({ error: 'No tiene permiso para crear usuarios.' }, 403)

  let body: { email?: string; nombre?: string; rol_id?: string; frente_id?: string | null; password?: string }
  try {
    body = await req.json()
  } catch {
    return respuesta({ error: 'Cuerpo de la solicitud inválido.' }, 400)
  }

  const { email, nombre, rol_id, frente_id, password } = body
  if (!email || !nombre || !rol_id) {
    return respuesta({ error: 'email, nombre y rol_id son obligatorios.' }, 400)
  }
  if (password && password.length < 8) {
    return respuesta({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
  }

  const clienteAdmin = createClient(supabaseUrl, serviceRoleKey)
  // Si el admin no escribió una contraseña propia, se genera una temporal
  // (igual que antes) que hay que compartirle a la persona por un canal
  // seguro; si la escribió, esa es la que queda.
  const passwordTemporal = password || generarPasswordTemporal()

  const { data: nuevoAuth, error: errorAuth } = await clienteAdmin.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true,
  })
  if (errorAuth) return respuesta({ error: `No se pudo crear la cuenta: ${errorAuth.message}` }, 400)

  const { data: usuario, error: errorPerfil } = await clienteAdmin
    .from('usuarios')
    .insert({ id: nuevoAuth.user.id, email, nombre, rol_id, frente_id: frente_id || null })
    .select('*, roles(nombre)')
    .single()

  if (errorPerfil) {
    // Sin perfil el login queda huérfano — se revierte la cuenta de auth
    // para no dejar un usuario a medio crear.
    await clienteAdmin.auth.admin.deleteUser(nuevoAuth.user.id)
    return respuesta({ error: `No se pudo crear el perfil: ${errorPerfil.message}` }, 400)
  }

  return respuesta({ usuario, passwordTemporal })
})

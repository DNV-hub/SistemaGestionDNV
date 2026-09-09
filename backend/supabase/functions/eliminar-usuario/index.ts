// Elimina un usuario: intenta borrar la cuenta de acceso (auth.users, que
// arrastra por cascade el perfil en public.usuarios); si ya generó
// historial (ingresos, vales, ajustes, procura, etc. lo referencian como
// usuario_id/responsable_id/supervisor_id sin "on delete cascade", a
// propósito, para no perder ese rastro) el borrado falla y en su lugar se
// desactiva — mismo criterio que ya usa el resto de la app para
// frentes/materiales/almacenes con historial asociado.
//
// Igual que crear-usuario, esto tiene que vivir en una Edge Function porque
// borrar una cuenta de acceso requiere la Admin API de Supabase Auth
// (service role), que nunca debe exponerse al navegador.
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
    p_codigo: 'usuarios.desactivar',
  })
  if (errorPermiso) return respuesta({ error: 'No se pudo verificar el permiso.' }, 500)
  if (!tienePermiso) return respuesta({ error: 'No tiene permiso para eliminar usuarios.' }, 403)

  const { data: quienLlama } = await clienteLlamador.auth.getUser()

  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return respuesta({ error: 'Cuerpo de la solicitud inválido.' }, 400)
  }

  const { id } = body
  if (!id) return respuesta({ error: 'id es obligatorio.' }, 400)
  if (id === quienLlama.user?.id) {
    return respuesta({ error: 'No puedes eliminar tu propia cuenta.' }, 400)
  }

  const clienteAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { error: errorBorrado } = await clienteAdmin.auth.admin.deleteUser(id)
  if (!errorBorrado) return respuesta({ eliminado: true })

  const { error: errorDesactivar } = await clienteAdmin.from('usuarios').update({ estado: 'inactivo' }).eq('id', id)
  if (errorDesactivar) return respuesta({ error: `No se pudo eliminar ni desactivar: ${errorDesactivar.message}` }, 400)

  return respuesta({ eliminado: false, desactivado: true })
})

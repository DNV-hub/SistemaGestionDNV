import { supabase } from '../../../services/supabaseClient'

// Herramientas exclusivas del rol Developer: borrar datos de prueba y abrir
// una sesión real como otra cuenta. Todo pasa por sistema.borrar_pruebas /
// sistema.suplantar_usuario en el servidor (RPC y Edge Function) — este
// archivo es solo el cliente, no repite la validación.

export async function listarValesParaBorrar() {
  const { data, error } = await supabase
    .from('vales')
    .select('id, numero, fecha, estado, frentes(codigo, nombre), usuarios!supervisor_id(nombre)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data
}

export async function borrarVale(id) {
  const { error } = await supabase.rpc('fn_borrar_vale_prueba', { p_vale_id: id })
  if (error) throw error
}

export async function listarReportesRdcParaBorrar() {
  const { data, error } = await supabase
    .from('rdc_reportes')
    .select('id, fecha, estado, rdc_frentes(nombre), rdc_supervisores(nombre)')
    .order('fecha', { ascending: false })
    .limit(500)
  if (error) throw error
  return data
}

export async function borrarReporteRdc(id) {
  const { error } = await supabase.rpc('fn_borrar_reporte_rdc_prueba', { p_reporte_id: id })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Ver como otra cuenta: sesión real, no una simulación de interfaz. Se
// guarda la sesión propia ANTES de cambiar (en sessionStorage, que se borra
// sola al cerrar la pestaña) para poder volver sin pedir contraseña.
// ---------------------------------------------------------------------------
const CLAVE_SESION_ORIGINAL = 'dnv_sesion_developer'

export function suplantandoAOtraCuenta() {
  return !!sessionStorage.getItem(CLAVE_SESION_ORIGINAL)
}

export async function suplantarUsuario(usuarioId) {
  const { data: actual } = await supabase.auth.getSession()
  if (!actual?.session) throw new Error('No hay sesión activa.')

  const { data, error } = await supabase.functions.invoke('suplantar-usuario', { body: { usuario_id: usuarioId } })
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null)
    throw new Error(detalle?.error || error.message)
  }
  if (data?.error) throw new Error(data.error)

  sessionStorage.setItem(
    CLAVE_SESION_ORIGINAL,
    JSON.stringify({
      access_token: actual.session.access_token,
      refresh_token: actual.session.refresh_token,
    })
  )

  const { error: errorVerify } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
  if (errorVerify) {
    sessionStorage.removeItem(CLAVE_SESION_ORIGINAL)
    throw errorVerify
  }
}

export async function volverAMiCuenta() {
  const cruda = sessionStorage.getItem(CLAVE_SESION_ORIGINAL)
  if (!cruda) return
  sessionStorage.removeItem(CLAVE_SESION_ORIGINAL)
  const { error } = await supabase.auth.setSession(JSON.parse(cruda))
  if (error) throw error
}

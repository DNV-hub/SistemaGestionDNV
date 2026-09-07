import { supabase } from '../../../services/supabaseClient'

export async function contarAlertasActivas() {
  const { data, error } = await supabase.from('alertas').select('nivel').eq('estado', 'activa')
  if (error) throw error
  return { total: data.length, criticas: data.filter((a) => a.nivel === 'critica').length }
}

export async function contarValesPendientes() {
  const { count, error } = await supabase
    .from('vales')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['Enviado', 'En revision'])
  if (error) throw error
  return count ?? 0
}

export async function contarReservasActivas() {
  const { count, error } = await supabase
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['Activa', 'Parcial'])
  if (error) throw error
  return count ?? 0
}

export async function contarFrentesActivos() {
  const { count, error } = await supabase
    .from('frentes')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'activo')
  if (error) throw error
  return count ?? 0
}

/** No usa la tabla `alertas` (puede estar desactualizada si nadie la refrescó): calcula el umbral directo desde stock. */
export async function contarStockBajo() {
  const { data, error } = await supabase
    .from('stock')
    .select('cantidad_disponible, stock_minimo, materiales(stock_minimo_default)')
  if (error) throw error
  return data.filter((s) => {
    const minimo = s.stock_minimo ?? s.materiales?.stock_minimo_default
    return minimo !== null && minimo !== undefined && Number(s.cantidad_disponible) <= Number(minimo)
  }).length
}

export async function listarAlertasCriticasRecientes() {
  const { data, error } = await supabase
    .from('alertas')
    .select('id, tipo, nivel, mensaje, created_at')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return data
}

export async function listarValesPendientesRecientes() {
  const { data, error } = await supabase
    .from('vales')
    .select('id, numero, estado, frentes(codigo), usuarios(nombre)')
    .in('estado', ['Enviado', 'En revision'])
    .order('fecha', { ascending: true })
    .limit(5)
  if (error) throw error
  return data
}

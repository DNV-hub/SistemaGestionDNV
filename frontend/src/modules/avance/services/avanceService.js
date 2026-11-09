import { supabase } from '../../../services/supabaseClient'

// Único punto del módulo que habla con Supabase — mismo criterio que
// rdcService.js. "Avance de sostenimiento" es de solo lectura: no hay
// inserts/updates acá, todo sale de las funciones security definer que ya
// usa PasoMetrados.vue (fn_rdc_pernos_estado/fn_rdc_malla_estado/
// fn_rdc_cable_estado/fn_rdc_avance_conteo), más el selector de frentes
// (fn_rdc_frentes_disponibles) que es exclusivo de esta pantalla.

export async function obtenerConteo(frenteId) {
  const { data, error } = await supabase.rpc('fn_rdc_avance_conteo', { p_frente_id: frenteId })
  if (error) throw error
  return data
}

export async function listarPernos(frenteId) {
  const { data, error } = await supabase.rpc('fn_rdc_pernos_estado', { p_frente_id: frenteId })
  if (error) throw error
  return data
}

export async function listarMalla(frenteId) {
  const { data, error } = await supabase.rpc('fn_rdc_malla_estado', { p_frente_id: frenteId })
  if (error) throw error
  return data
}

export async function listarCable(frenteId) {
  const { data, error } = await supabase.rpc('fn_rdc_cable_estado', { p_frente_id: frenteId })
  if (error) throw error
  return data
}

/** Catálogo de pernos considerados en el plano de este frente (subido en
 * Configuración → Catálogo de pernos). Además de ser el denominador de
 * "28/78" en Control de sostenimiento, la lista completa permite calcular
 * qué códigos del plano TODAVÍA no tienen ni una perforación reportada —
 * algo que antes no se podía saber porque no existía ningún catálogo con el
 * que comparar lo reportado. [] si el frente no subió ninguno todavía. */
export async function listarPernosBiblioteca(frenteId) {
  const { data, error } = await supabase
    .from('rdc_pernos_biblioteca')
    .select('id, codigo, zona, sistema, ubicacion, diametro, longitud, angulo, plano')
    .eq('frente_id', frenteId)
  if (error) throw error
  return data
}

/** Cambia el código de un perno ya reportado (todas sus filas: perforación,
 * inyección, pull test) y rellena ubicación, zona, sistema, plano y diámetro
 * desde la biblioteca de pernos. `intercambiar: true` permite que el código
 * nuevo ya lo tenga otro perno: se intercambian los dos. Solo con
 * rdc.editar_todos (lo valida la función en la base). */
export async function renombrarPerno({ frenteId, codigoActual, codigoNuevo, intercambiar = false }) {
  const { data, error } = await supabase.rpc('fn_rdc_renombrar_perno', {
    p_frente_id: frenteId,
    p_codigo_actual: codigoActual,
    p_codigo_nuevo: codigoNuevo,
    p_intercambiar: intercambiar,
  })
  if (error) throw error
  return data
}

/** Umbrales de antigüedad (días) para resaltar un perno pendiente en
 * ámbar/rojo. Cada frente puede tener los suyos (Configuración › Control);
 * fn_rdc_umbrales devuelve los del frente y, donde no puso nada, los globales
 * de `configuracion`. Sin frente, o si la función falla, se leen los globales. */
export async function obtenerUmbrales(frenteId = null) {
  if (frenteId) {
    const { data, error } = await supabase.rpc('fn_rdc_umbrales', { p_frente_id: frenteId })
    const fila = Array.isArray(data) ? data[0] : data
    if (!error && fila?.dias_ambar != null && fila?.dias_rojo != null) {
      return { diasAmbar: Number(fila.dias_ambar), diasRojo: Number(fila.dias_rojo) }
    }
  }
  const { data, error } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['rdc_avance_dias_ambar', 'rdc_avance_dias_rojo'])
  if (error) throw error
  const porClave = Object.fromEntries((data ?? []).map((f) => [f.clave, Number(f.valor)]))
  return {
    diasAmbar: porClave.rdc_avance_dias_ambar ?? 3,
    diasRojo: porClave.rdc_avance_dias_rojo ?? 7,
  }
}

import { supabase } from '../../../../services/supabaseClient'

// Servicio genérico para los catálogos del RDC: como las nueve tablas
// comparten la misma forma de fondo (id, unas columnas propias, casi todas
// con activo/orden), no hace falta una función por tabla — el nombre de la
// tabla es un parámetro, no algo distinto en cada caso.
//
// A propósito NO filtra por `activo`, a diferencia de `descargarCatalogos()`
// (rdcDb.js), que sí lo hace para el formulario del supervisor: acá, quien
// administra el catálogo necesita ver también lo desactivado, para poder
// reactivarlo si fue un error.

export async function listarCatalogo(tabla, { orderBy = 'orden' } = {}) {
  const { data, error } = await supabase.from(tabla).select('*').order(orderBy, { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function crearFilaCatalogo(tabla, datos) {
  const { data, error } = await supabase.from(tabla).insert(datos).select().single()
  if (error) throw error
  return data
}

export async function actualizarFilaCatalogo(tabla, id, cambios) {
  const { data, error } = await supabase.from(tabla).update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function eliminarFilaCatalogo(tabla, id) {
  const { error } = await supabase.from(tabla).delete().eq('id', id)
  if (error) throw error
}

/** Inserta las filas nuevas y ACTUALIZA las que ya existen (misma clave
 * única, p. ej. 'frente_id,codigo'): sirve para importar sin que un código
 * repetido tumbe toda la carga. */
export async function guardarFilasCatalogoEnLote(tabla, payloads, onConflict) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from(tabla).upsert(payloads, { onConflict }).select()
  if (error) throw error
  return data
}

/** Borra varias filas por id (reemplazar una biblioteca completa). En tandas
 * de 100 para no armar una URL gigante. */
export async function eliminarFilasCatalogoPorIds(tabla, ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from(tabla).delete().in('id', ids.slice(i, i + 100))
    if (error) throw error
  }
}

/** Insert masivo (importar Excel/CSV) — una sola llamada en vez de una por
 * fila, mismo patrón que crearVersionesMetradoEnLote (Procura). */
export async function crearFilasCatalogoEnLote(tabla, payloads) {
  if (!payloads.length) return []
  const { data, error } = await supabase.from(tabla).insert(payloads).select()
  if (error) throw error
  return data
}

/** Cuentas que se pueden vincular a un supervisor del catálogo RDC. Pasa por
 * la función rdc_usuarios_vinculables() (RPC) y no por un select directo a
 * `usuarios`: esa tabla exige 'usuarios.ver' para leer filas ajenas, permiso
 * que no todo el que administra catálogos del RDC tiene ni necesita — ver
 * rdc_usuarios_vinculables() en la migración 20260911160000 para el detalle.
 *
 * Trae también las cuentas inactivas (no solo las de alta): un supervisor ya
 * vinculado a una cuenta que después se desactivó tiene que seguir
 * mostrando esa opción en su fila, o el desplegable la haría desaparecer
 * como si el vínculo se hubiera borrado solo. La pantalla es quien decide
 * cómo distinguir una cuenta inactiva en la etiqueta. */
export async function listarUsuariosVinculables() {
  const { data, error } = await supabase.rpc('rdc_usuarios_vinculables')
  if (error) throw error
  return data
}

/** Solo el conteo de filas de una tabla (para los contadores de la lista
 * maestra del Catálogo) — sin traer las filas. */
export async function contarCatalogo(tabla) {
  const { count, error } = await supabase.from(tabla).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

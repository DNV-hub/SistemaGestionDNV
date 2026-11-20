// Lienzo 6 · pestaña Redline. Supervisión / oficina técnica suben el redline;
// la IA (agente de planeamiento) lee los cambios; Planeamiento confirma o
// corrige cada uno y recién al aprobar cambian el metrado vigente, la procura,
// el sketch y la curva S. La valorización sigue la firma de BBA.
import { supabase } from '../../../services/supabaseClient'

const BUCKET = 'frentes-archivos'

async function firmar(ruta) {
  if (!ruta) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 3600)
  return data?.signedUrl ?? null
}

export async function cargarRedlines(frenteId) {
  const [r, c, m, pi] = await Promise.all([
    supabase.from('ctl_redline').select('*').eq('frente_id', frenteId).order('fecha', { ascending: false }),
    supabase.from('ctl_redline_cambio').select('*').eq('frente_id', frenteId).order('item_codigo'),
    supabase.from('ctl_metrado_plano').select('item_codigo, sector_codigo, descripcion, unidad, cantidad_constructivo, plano_origen').eq('frente_id', frenteId),
    supabase.from('ctl_partida_item').select('edt, item_codigo').eq('frente_id', frenteId),
  ])
  for (const x of [r, c, m]) if (x.error) throw x.error
  const M = new Map((m.data ?? []).map((x) => [x.item_codigo, x]))
  const redlines = await Promise.all((r.data ?? []).map(async (x) => ({
    ...x,
    urlCampo: await firmar(x.imagen_campo),
    urlPlano: await firmar(x.imagen_plano),
  })))
  const cambios = (c.data ?? []).map((x) => {
    const p = M.get(x.item_codigo) || {}
    return { ...x, descripcion: p.descripcion || x.item_codigo, unidad: p.unidad || '', constructivo: p.cantidad_constructivo != null ? Number(p.cantidad_constructivo) : Number(x.cantidad_antes) }
  })
  const planoBase = (m.data ?? [])[0]?.plano_origen || null
  return { redlines, cambios, planoBase, partidaItem: pi.data ?? [] }
}

export async function confirmarCambio(id) {
  const { error } = await supabase.from('ctl_redline_cambio').update({ estado: 'confirmado', cantidad_corregida: null }).eq('id', id)
  if (error) throw error
}

export async function corregirCambio(id, cantidad, nota) {
  const fila = { estado: 'corregido', cantidad_corregida: cantidad }
  if (nota) fila.nota = nota
  const { error } = await supabase.from('ctl_redline_cambio').update(fila).eq('id', id)
  if (error) throw error
}

export async function aprobarRedline(id) {
  const { error } = await supabase.rpc('ctl_aprobar_redline', { p_redline_id: id })
  if (error) throw error
}

export async function devolverRedline(id, nota) {
  const { error } = await supabase.rpc('ctl_devolver_redline', { p_redline_id: id, p_nota: nota })
  if (error) throw error
}

/** Sube un redline nuevo (foto de campo o plano RL) y lo deja en revisión. */
export async function subirRedline(frenteId, { codigo, titulo, fecha, origen, archivo }) {
  let ruta = null
  if (archivo) {
    const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase()
    ruta = `${frenteId}/redline-${codigo.toLowerCase()}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type || 'image/jpeg' })
    if (error) throw error
  }
  const { error } = await supabase.from('ctl_redline').insert({ frente_id: frenteId, codigo, titulo, fecha, origen, estado: 'en_revision', imagen_campo: ruta })
  if (error) throw error
}

// Lienzo 6 · Bandeja del agente e Informe semanal: lo que el agente de
// planeamiento revisó en la bandeja de entrada y los planes semanales (PTS).
import { supabase } from '../../../services/supabaseClient'

export async function cargarBandejaAgente() {
  const [c, h] = await Promise.all([
    supabase.from('ctl_agente_corrida').select('*').order('ejecutado_en', { ascending: false }).limit(1),
    supabase.from('ctl_agente_hallazgo').select('*').order('categoria').order('orden'),
  ])
  if (c.error) throw c.error
  if (h.error) throw h.error
  return { corrida: c.data?.[0] ?? null, hallazgos: h.data ?? [] }
}

export async function resolverHallazgo(id, accion) {
  const { error } = await supabase.from('ctl_agente_hallazgo')
    .update({ estado: 'resuelto', resuelto_en: new Date().toISOString(), ...(accion ? { accion } : {}) }).eq('id', id)
  if (error) throw error
}

export async function reabrirHallazgo(id) {
  const { error } = await supabase.from('ctl_agente_hallazgo').update({ estado: 'abierto', resuelto_en: null }).eq('id', id)
  if (error) throw error
}

export async function cargarPts(semanas) {
  const { data, error } = await supabase.from('ctl_pts').select('*').in('semana', semanas)
  if (error) throw error
  return data ?? []
}

const DNV = /DESNIVEL|\bDNV\b|CONTRATISTA|LOG[IÍ]STICA DNV|ALMAC[EÉ]N/i
const AJENA = /CLIENTE|AAQ|ANGLO|BBA|CLIMA|LLUVIA|TORMENTA|TERCERO|ENAEX|COMUNIDAD|SUPERVISI[OÓ]N/i
const iso = (d) => d.toISOString().slice(0, 10)
// Relleno "de color" (barra programada): sólido, ni blanco ni el tema claro 0.
const conColor = (st) => !!st && st.patternType && st.patternType !== 'none' &&
  (st.fgColor?.rgb ? !/^(FF)?FFFFFF$/i.test(st.fgColor.rgb) : st.fgColor?.theme != null && st.fgColor.theme !== 0)

/** Lee el Excel PLAN DE TRABAJO (hoja "Formato Supervisor"): fechas de la
 * semana, actividades con días programados (celdas con relleno) y
 * restricciones con su responsable. Aplica las reglas aprobadas el 20/11:
 * fechas solo de la semana jueves–miércoles; restricción imputable a
 * DESNIVEL → anulada. */
export async function leerPts(archivo, semana) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await archivo.arrayBuffer(), { cellDates: true, cellStyles: true })
  const nombreHoja = wb.SheetNames.find((n) => /formato\s*supervisor/i.test(n)) || wb.SheetNames[0]
  const ws = wb.Sheets[nombreHoja]
  const obs = []
  const rango = XLSX.utils.decode_range(ws['!ref'])
  const celda = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]
  // Fila de fechas: la primera con 7 fechas seguidas.
  let filaF = -1, colF = -1
  for (let r = rango.s.r; r <= Math.min(rango.e.r, 40) && filaF < 0; r++) {
    for (let c = rango.s.c; c <= rango.e.c - 6; c++) {
      const v = [...Array(7)].map((_, k) => celda(r, c + k)?.v)
      if (v.every((x) => x instanceof Date)) { filaF = r; colF = c; break }
    }
  }
  let fechas = []
  let estado = 'recibido'
  if (filaF < 0) { obs.push('No se encontró la fila de fechas de la semana (jueves a miércoles).'); estado = 'rechazado' } else {
    fechas = [...Array(7)].map((_, k) => iso(new Date(celda(filaF, colF + k).v.getTime() + 12 * 3600000)))
    if (fechas[0] !== semana.desde || fechas[6] !== semana.hasta) {
      obs.push(`Las fechas del PTS (${fechas[0]} a ${fechas[6]}) no son de la semana ${semana.clave} (${semana.desde} a ${semana.hasta}): se rechaza.`)
      estado = 'rechazado'
    }
  }
  // Columnas de restricción y responsable: por encabezado.
  let colR = -1, colResp = -1
  for (let r = rango.s.r; r <= Math.min(rango.e.r, 40); r++) {
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const t = String(celda(r, c)?.v ?? '').trim().toLowerCase()
      if (t === 'restricción' || t === 'restriccion') colR = c
      if (t === 'responsable') colResp = c
    }
  }
  const actividades = []
  const restricciones = []
  if (filaF >= 0) {
    const filasAct = []
    let seccion = ''
    for (let r = filaF + 1; r <= rango.e.r; r++) {
      const item = celda(r, colF - 2)?.v
      const act = celda(r, colF - 1)?.v
      if (!act || typeof act !== 'string' || (item && String(item).length > 3)) continue
      if (!item && act.trim() === act.trim().toUpperCase()) { seccion = act.trim(); continue } // títulos de sección (frente)
      if (conColor(celda(r, colF - 1)?.s)) continue // filas de sección pintadas (p. ej. "Trabajos Auxiliares")
      filasAct.push({ r, item: item ? String(item) : '', act: act.trim(), seccion })
    }
    filasAct.forEach((fa, i) => {
      const fin = Math.min(fa.r + 3, filasAct[i + 1]?.r ?? fa.r + 3) // cada actividad ocupa hasta 3 filas
      const dias = new Set()
      for (let rr = fa.r; rr < fin; rr++) {
        for (let k = 0; k < 7; k++) {
          if (conColor(celda(rr, colF + k)?.s)) dias.add(k)
        }
      }
      actividades.push({ item: fa.item, actividad: fa.act, seccion: fa.seccion, dias: [...dias].sort() })
      for (let rr = fa.r; rr < fin; rr++) {
        const rest = colR >= 0 ? String(celda(rr, colR)?.v ?? '').trim() : ''
        if (!rest) continue
        const resp = colResp >= 0 ? String(celda(rr, colResp)?.v ?? '').trim() : ''
        const anulada = DNV.test(resp) || (!AJENA.test(resp) && DNV.test(rest))
        restricciones.push({ seccion: fa.seccion, actividad: fa.act, restriccion: rest, responsable: resp, anulada })
      }
    })
  }
  const anuladas = restricciones.filter((x) => x.anulada).length
  if (anuladas) obs.push(`${anuladas} restricción(es) con responsable DESNIVEL anuladas: solo cuentan clima, cliente y terceros.`)
  if (!actividades.some((a) => a.dias.length)) obs.push('No se detectaron días programados (barras de color) en las actividades.')
  // Fuerza laboral proyectada (hoja "Fuerza Laboral"), si sus fechas son de la semana.
  let fuerza = null
  const hf = wb.SheetNames.find((n) => /fuerza\s*laboral/i.test(n))
  if (hf) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hf], { header: 1, raw: true })
    const fila = filas.find((f) => f.filter((x) => x instanceof Date).length >= 5)
    if (fila) {
      const fs = fila.filter((x) => x instanceof Date).map((d) => iso(new Date(d.getTime() + 12 * 3600000)))
      if (fs[0] !== semana.desde) obs.push(`La hoja Fuerza Laboral tiene fechas de otra semana (${fs[0]}): se usa lo real del RDC.`)
      else fuerza = { fechas: fs }
    }
  }
  if (estado !== 'rechazado' && obs.length) estado = 'observado'
  return { fechas, actividades, restricciones, observaciones: obs, estado, fuerza_laboral: fuerza }
}

/** Sube el PTS: la semana se toma de las fechas del propio Excel (deben ser
 * jueves a miércoles); si no lo son, queda rechazado en la semana sugerida. */
export async function subirPts(frenteId, semanaSugerida, archivo, semanaDe) {
  let leido = await leerPts(archivo, semanaSugerida)
  let semana = semanaSugerida
  if (leido.fechas.length === 7) {
    const s = semanaDe(leido.fechas[0])
    if (s.desde === leido.fechas[0] && s.hasta === leido.fechas[6] && s.clave !== semanaSugerida.clave) {
      semana = s
      leido = await leerPts(archivo, s)
    }
  }
  const ruta = `${frenteId}/pts/${semana.clave}-${Date.now()}.xlsx`
  const { error: e1 } = await supabase.storage.from('frentes-archivos').upload(ruta, archivo, { contentType: archivo.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  if (e1) throw e1
  const fila = {
    frente_id: frenteId, semana: semana.clave, desde: semana.desde, hasta: semana.hasta, archivo: ruta, nombre_archivo: archivo.name,
    actividades: leido.actividades, restricciones: leido.restricciones, fuerza_laboral: leido.fuerza_laboral,
    observaciones: leido.observaciones, estado: leido.estado,
  }
  const { error } = await supabase.from('ctl_pts').upsert(fila, { onConflict: 'frente_id,semana' })
  if (error) throw error
  return { ...leido, semana: semana.clave }
}

/** Frentes que entran al informe de la semana: con RDC finalizado en la semana o con curva S cargada. */
export async function cargarFrentesInforme(desde, hasta) {
  const [f, r, c] = await Promise.all([
    supabase.from('frentes').select('id, nombre, estado, fecha_inicio').in('estado', ['activo', 'proximo', 'paralizado']).order('nombre'),
    supabase.from('rdc_reportes').select('frente_id, fecha').eq('estado', 'Finalizado').is('eliminado_at', null).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('ctl_curva_param').select('frente_id'),
  ])
  for (const x of [f, r, c]) if (x.error) throw x.error
  const rdc = new Map()
  for (const x of r.data ?? []) { if (!rdc.has(x.frente_id)) rdc.set(x.frente_id, new Set()); rdc.get(x.frente_id).add(x.fecha) }
  const conCurva = new Set((c.data ?? []).map((x) => x.frente_id))
  return (f.data ?? []).filter((x) => rdc.has(x.id) || conCurva.has(x.id))
    .map((x) => ({ ...x, diasRdc: [...(rdc.get(x.id) ?? [])].sort(), conCurva: conCurva.has(x.id) }))
}

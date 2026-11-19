// PRUEBA · Control de obra v5. Solo lectura sobre tablas/vistas ctl_ y las
// tablas del RDC que ya existen. No escribe nada.
import { supabase } from '../../../services/supabaseClient'

export async function cargarSectores(frenteId) {
  const { data, error } = await supabase
    .from('ctl_sectores')
    .select('codigo, nombre, tipo, orden')
    .eq('frente_id', frenteId)
    .order('orden')
  if (error) throw error
  return data ?? []
}

export async function cargarCurva(frenteId) {
  const [p, c] = await Promise.all([
    supabase.from('ctl_curva_param').select('*').eq('frente_id', frenteId).maybeSingle(),
    supabase.from('ctl_curva_s').select('fecha, programado_pct, ejecutado_pct').eq('frente_id', frenteId).order('fecha'),
  ])
  if (p.error) throw p.error
  if (c.error) throw c.error
  return { param: p.data, puntos: c.data ?? [] }
}

/** Stand By del frente entre dos fechas, con horas calculadas desde/hasta
 * cuando el RDC no trae el total. */
export async function cargarStandBy(frenteId, desde, hasta) {
  const { data, error } = await supabase
    .from('rdc_reportes')
    .select('fecha, rdc_reporte_standby(actividad, desde, hasta, causa, causa_otro, total_horas, total_minutos)')
    .eq('frente_id', frenteId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
  if (error) throw error
  const filas = []
  for (const r of data ?? []) {
    for (const s of r.rdc_reporte_standby ?? []) {
      let min = (Number(s.total_horas) || 0) * 60 + (Number(s.total_minutos) || 0)
      if (!min && s.desde && s.hasta) {
        const [h1, m1] = s.desde.split(':').map(Number)
        const [h2, m2] = s.hasta.split(':').map(Number)
        min = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1))
      }
      filas.push({ fecha: r.fecha, actividad: s.actividad, causa: s.causa === 'OTRO' ? s.causa_otro || 'Otro' : s.causa, minutos: min, desde: s.desde, hasta: s.hasta })
    }
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Fotos enviadas desde campo (bucket privado rdc-fotos) con URL temporal. */
export async function cargarFotos(frenteId, desde, hasta, maximo = 9) {
  const { data, error } = await supabase
    .from('rdc_fotos_envios')
    .select('id, fecha, rol, categoria, etiqueta, archivos')
    .eq('frente_id', frenteId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  if (error) throw error
  const items = []
  for (const e of data ?? []) {
    for (const a of e.archivos ?? []) {
      if (items.length >= maximo) break
      items.push({ fecha: e.fecha, etiqueta: e.etiqueta || e.categoria, path: a.path })
    }
  }
  if (!items.length) return []
  const { data: urls, error: e2 } = await supabase.storage.from('rdc-fotos').createSignedUrls(items.map((i) => i.path), 3600)
  if (e2) throw e2
  return items.map((i, k) => ({ ...i, url: urls?.[k]?.signedUrl ?? null })).filter((i) => i.url)
}

export async function cargarMetradoVigente(frenteId) {
  const { data, error } = await supabase
    .from('ctl_metrado_vigente')
    .select('*')
    .eq('frente_id', frenteId)
    .order('item_codigo')
  if (error) throw error
  return data ?? []
}

/** Sector de un código de perno del plano: "Z6/P1-A1" → "P1". */
export function sectorDeCodigo(codigo, codigosSector) {
  const m = String(codigo || '').match(/\/([A-Z]+\d+)-/i)
  const c = m ? m[1].toUpperCase() : null
  return c && codigosSector.includes(c) ? c : 'GEN'
}

// Semana de control: jueves a miércoles. Se nombra con la semana ISO del
// miércoles que la cierra (S47 = jueves 12/11 a miércoles 18/11/2026).
const iso = (d) => d.toISOString().slice(0, 10)
export function semanaDe(fechaIso) {
  const d = new Date(`${fechaIso}T00:00:00Z`)
  const dow = d.getUTCDay() // 0 dom … 4 jue
  const back = (dow - 4 + 7) % 7
  const ini = new Date(d); ini.setUTCDate(d.getUTCDate() - back)
  const fin = new Date(ini); fin.setUTCDate(ini.getUTCDate() + 6)
  const t = new Date(fin); t.setUTCDate(fin.getUTCDate() + 3 - ((fin.getUTCDay() + 6) % 7))
  const y1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const n = 1 + Math.round(((t - y1) / 86400000 - 3 + ((y1.getUTCDay() + 6) % 7)) / 7)
  return { clave: `S${n}`, desde: iso(ini), hasta: iso(fin) }
}

export const fechaCorta = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '—')
export const num = (x, dec = 2) => {
  const v = Number(x) || 0
  return v.toLocaleString('es-PE', { maximumFractionDigits: dec })
}
export const horasTexto = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

/** Avance por código desde el RDC (perforación, inyección, pull test,
 * malla), sin depender del interruptor "control de pernos" del frente. */
export async function cargarAvanceElementos(frenteId) {
  const { data, error } = await supabase.rpc('ctl_avance_elementos', { p_frente_id: frenteId })
  if (error) throw error
  return data ?? []
}

/** Plano del sketch (imagen + geometría de pernos y paños). */
export async function cargarSketch(frenteId) {
  const [s, el] = await Promise.all([
    supabase.from('ctl_plano_sketch').select('*').eq('frente_id', frenteId).maybeSingle(),
    supabase.from('ctl_plano_elemento').select('*').eq('frente_id', frenteId).order('orden'),
  ])
  if (s.error) throw s.error
  if (el.error) throw el.error
  if (!s.data) return null
  let url = null
  if (s.data.imagen_ruta) {
    const { data } = await supabase.storage.from('frentes-archivos').createSignedUrl(s.data.imagen_ruta, 3600)
    url = data?.signedUrl ?? null
  }
  return { ...s.data, url, elementos: el.data ?? [] }
}

/** Línea base por partida y avance APROBADO por día (carga inicial del
 * Control diario + lo confirmado en la bandeja). También trae lo que falta
 * aprobar y los ajustes manuales de la curva (opcionales). */
export async function cargarCronograma(frenteId) {
  const [p, a, pend, band, aj] = await Promise.all([
    supabase.from('ctl_cronograma_partida').select('*').eq('frente_id', frenteId).order('edt'),
    supabase.rpc('ctl_avance_aprobado', { p_frente_id: frenteId }),
    supabase.from('ctl_avance_partida').select('edt, fecha, cantidad, fuente').eq('frente_id', frenteId).eq('estado', 'por_aprobar'),
    supabase.from('rdc_metrados_confirmacion').select('id', { count: 'exact', head: true }).eq('frente_id', frenteId).eq('estado', 'por_confirmar'),
    supabase.from('ctl_curva_ajuste').select('*').eq('frente_id', frenteId).eq('activo', true).order('fecha'),
  ])
  if (p.error) throw p.error
  if (a.error) throw a.error
  return {
    partidas: p.data ?? [],
    avance: (a.data ?? []).map((x) => ({ ...x, cantidad: Number(x.cantidad) })),
    porAprobar: pend.data ?? [],
    bandejaPendientes: band.count ?? 0,
    ajustes: aj.data ?? [],
  }
}

export async function guardarAjusteCurva(frenteId, fecha, ejecutadoPct, motivo) {
  const { error } = await supabase.from('ctl_curva_ajuste').insert({ frente_id: frenteId, fecha, ejecutado_pct: ejecutadoPct, motivo })
  if (error) throw error
}
export async function anularAjusteCurva(id) {
  const { error } = await supabase.from('ctl_curva_ajuste').update({ activo: false }).eq('id', id)
  if (error) throw error
}

/** Curva ejecutada ponderada por HH desde el avance aprobado:
 * Σ min(acum, metrado)/metrado × HH / Σ HH. Un ajuste manual activo en una
 * fecha reemplaza el valor calculado de esa fecha. */
export function curvaEjecutada(puntos, partidas, avance, ajustes = []) {
  const BAC = partidas.reduce((a, p) => a + Number(p.hh || 0), 0)
  const ultima = avance.reduce((m, a) => (a.fecha > m ? a.fecha : m), '')
  const aj = new Map(ajustes.map((x) => [x.fecha, Number(x.ejecutado_pct)]))
  const acum = new Map()
  const porDia = new Map()
  for (const a of avance) {
    if (!porDia.has(a.fecha)) porDia.set(a.fecha, [])
    porDia.get(a.fecha).push(a)
  }
  const fechas = [...new Set([...puntos.map((p) => p.fecha), ...avance.map((a) => a.fecha)])].sort()
  const P = new Map(partidas.map((p) => [p.edt, p]))
  const calc = new Map()
  for (const f of fechas) {
    for (const a of porDia.get(f) ?? []) acum.set(a.edt, (acum.get(a.edt) || 0) + a.cantidad)
    let s = 0
    for (const [edt, q] of acum) {
      const p = P.get(edt)
      if (p && Number(p.metrado)) s += (Math.min(q, Number(p.metrado)) / Number(p.metrado)) * Number(p.hh)
    }
    calc.set(f, BAC ? (s / BAC) * 100 : 0)
  }
  return {
    ultima,
    puntos: puntos.map((p) => {
      const v = p.fecha <= ultima ? (aj.has(p.fecha) ? aj.get(p.fecha) : Math.round((calc.get(p.fecha) ?? 0) * 100) / 100) : null
      return { ...p, ejecutado_pct: v, ajustado: aj.has(p.fecha) }
    }),
  }
}

/** RDC de un rango: Stand By por día, personal y redline. */
export async function cargarRdcRango(frenteId, desde, hasta) {
  const { data, error } = await supabase
    .from('rdc_reportes')
    .select('fecha, redline, redline_descripcion, rdc_reporte_standby(actividad, desde, hasta, causa, causa_otro, total_horas, total_minutos), rdc_reporte_personal(cantidad)')
    .eq('frente_id', frenteId)
    .is('eliminado_at', null)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
  if (error) throw error
  return data ?? []
}

export function minutosStandBy(s) {
  let min = (Number(s.total_horas) || 0) * 60 + (Number(s.total_minutos) || 0)
  if (!min && s.desde && s.hasta) {
    const [h1, m1] = s.desde.split(':').map(Number)
    const [h2, m2] = s.hasta.split(':').map(Number)
    min = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1))
  }
  return min
}

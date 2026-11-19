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

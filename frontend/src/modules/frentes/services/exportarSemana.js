// Lienzo 6 · exportaciones de la semana (jueves a miércoles):
//  - Stand By (criterio aprobado 20/11/2026): solo causas ajenas a DESNIVEL,
//    sin duplicados, con personal afectado y HH de stand-by.
//  - Fuerza laboral: formato de la Tabla 10 del informe y cuadrilla.
//  - Fotos de la semana en un .zip.
import { descargarExcel } from '../../../utils/exportarExcel'
import { cargarSemanaRdc, causaStandBy, minutosStandBy, semanaDe } from './controlObraService'

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fechaPe = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const DL = ['Jue', 'Vie', 'Sáb', 'Dom', 'Lun', 'Mar', 'Mié']

/** Eventos de Stand By listos para el informe. Duplicado = mismo frente, fecha,
 * causa, actividad y horario (o mismo total sin horario): se cuenta una vez.
 * "Otro" no entra al informe hasta que Planeamiento lo revise. */
export function eventosStandBy(rdc, frente) {
  const vistos = new Set()
  const informe = []
  const porRevisar = []
  for (const r of rdc) {
    const personal = (r.rdc_reporte_personal ?? []).filter((p) => (p.tipo || 'directa') === 'directa').reduce((a, p) => a + Number(p.cantidad || 0), 0)
    for (const s of [...(r.rdc_reporte_standby ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))) {
      const c = causaStandBy(s)
      let act = s.actividad
      if (!act && s.responsable && s.responsable.length > 12) act = s.responsable
      const min = minutosStandBy(s)
      const clave = [frente, r.fecha, c.k, (act || '').trim().toLowerCase(), s.desde || '', s.hasta || '', s.desde ? '' : min].join('|')
      if (vistos.has(clave)) continue
      vistos.add(clave)
      const ev = { frente, fecha: r.fecha, act: act || 'Sin actividad en el RDC', causa: c.t, resp: c.r, horario: s.desde && s.hasta ? `${s.desde.slice(0, 5)}–${s.hasta.slice(0, 5)}` : 'acumulado del día', min, personal, hh: Math.round((min / 60) * personal * 100) / 100, nota: s.comentario || '' }
      if (c.k === 'ot') porRevisar.push(ev)
      else informe.push(ev)
    }
  }
  return { informe, porRevisar }
}

export async function exportarStandBy(frenteId, nombre, semana) {
  const rdc = await cargarSemanaRdc(frenteId, semana.desde, semana.hasta)
  const { informe, porRevisar } = eventosStandBy(rdc, nombre)
  const tot = informe.reduce((a, e) => a + e.min, 0)
  const totHH = informe.reduce((a, e) => a + e.hh, 0)
  const causas = new Map()
  for (const e of informe) { const x = causas.get(e.causa) || { min: 0, hh: 0, n: 0, resp: e.resp }; x.min += e.min; x.hh += e.hh; x.n++; causas.set(e.causa, x) }
  const dias = new Map()
  for (const e of informe) { const x = dias.get(e.fecha) || { min: 0, n: 0 }; x.min += e.min; x.n++; dias.set(e.fecha, x) }
  const titulo = `Stand-by por causas ajenas a DESNIVEL — ${semana.clave} (jue ${fechaPe(semana.desde)} al mié ${fechaPe(semana.hasta)})`
  await descargarExcel(`StandBy_${nombre}_${semana.clave}.xlsx`.replace(/\s+/g, '_'), [
    { nombre: 'Stand By (informe)', anchos: [5, 12, 12, 52, 30, 18, 12, 10, 12], filas: [
      ...informe.map((e, i) => ({ 'N°': i + 1, Frente: e.frente, Fecha: fechaPe(e.fecha), 'Actividad afectada': e.act, Causa: e.causa, Horario: e.horario, 'Total hh:mm': hhmm(e.min), 'Personal afectado': e.personal, 'HH stand-by': e.hh })),
      { 'N°': '', Frente: 'TOTAL', Fecha: '', 'Actividad afectada': `${informe.length} eventos`, Causa: '', Horario: '', 'Total hh:mm': hhmm(tot), 'Personal afectado': '', 'HH stand-by': Math.round(totHH * 100) / 100 },
      {}, { 'N°': titulo },
      { 'N°': 'Fuente: RDC finalizados. Solo causas ajenas a DESNIVEL (cliente, clima y terceros). Eventos repetidos (mismo frente, fecha, causa, actividad y horario) se cuentan una vez. HH stand-by = horas × mano de obra directa del RDC del día.' },
    ] },
    { nombre: 'Resumen por causa', anchos: [32, 30, 10, 12, 12], filas: [...causas.entries()].map(([k, x]) => ({ Causa: k, Responsable: x.resp, Eventos: x.n, 'Total hh:mm': hhmm(x.min), 'HH stand-by': Math.round(x.hh * 100) / 100 })) },
    { nombre: 'Por día', anchos: [14, 10, 12], filas: [...dias.entries()].sort().map(([d, x]) => ({ Fecha: fechaPe(d), Eventos: x.n, 'Total hh:mm': hhmm(x.min) })) },
    { nombre: 'Restricciones escritas', anchos: [14, 90], filas: rdc.filter((r) => r.restricciones || r.restriccion_descripcion).map((r) => ({ Fecha: fechaPe(r.fecha), Restricción: [r.restriccion_descripcion, r.restricciones].filter(Boolean).join(' · ') })) },
    { nombre: 'Por revisar', anchos: [14, 52, 40, 12], filas: porRevisar.length ? porRevisar.map((e) => ({ Fecha: fechaPe(e.fecha), 'Actividad afectada': e.act, Causa: e.causa, 'Total hh:mm': hhmm(e.min) })) : [{ Fecha: 'Sin eventos "Otro" por revisar.' }] },
  ])
}

/** Fuerza laboral de la semana con el formato de la Tabla 10 del informe. */
export function fuerzaLaboral(rdc, semana) {
  const SOP = ['camioneta', 'minibús', 'minibus', 'camión grúa', 'camion grua', 'camión baranda', 'camion baranda', 'cisterna', 'volquete']
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${semana.desde}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10) })
  const por = new Map()
  for (const r of rdc) {
    const x = por.get(r.fecha) || { mod: {}, veh: {} }
    for (const p of r.rdc_reporte_personal ?? []) if ((p.tipo || 'directa') === 'directa') x.mod[p.categoria] = (x.mod[p.categoria] || 0) + Number(p.cantidad || 0)
    for (const q of r.rdc_reporte_maquinaria ?? []) if (q.categoria === 'soporte' || SOP.includes((q.tipo || '').toLowerCase())) { const t = q.tipo.charAt(0).toUpperCase() + q.tipo.slice(1).toLowerCase(); x.veh[t] = (x.veh[t] || 0) + Number(q.cantidad || 0) }
    por.set(r.fecha, x)
  }
  return { dias, por }
}

export async function exportarFuerzaLaboral(frenteId, nombre, semana) {
  const rdc = await cargarSemanaRdc(frenteId, semana.desde, semana.hasta)
  const { dias, por } = fuerzaLaboral(rdc, semana)
  const PL = { Capataz: 'Capataces', Operario: 'Operarios', Oficial: 'Oficiales', Peón: 'Peones', Vigía: 'Vigías' }
  const cats = [...new Set([...por.values()].flatMap((x) => Object.keys(x.mod)))]
  const vehs = [...new Set([...por.values()].flatMap((x) => Object.keys(x.veh)))]
  const fila = (t, f) => { const o = { 'Cargo / categoría': t }; dias.forEach((d, i) => { o[`${DL[i]} ${d.slice(8, 10)}`] = por.has(d) ? f(por.get(d)) : '' }); return o }
  const tMod = (x) => Object.values(x.mod).reduce((a, b) => a + b, 0)
  const tOp = (x) => Object.values(x.veh).reduce((a, b) => a + b, 0)
  const ult = dias.filter((d) => por.has(d)).pop()
  await descargarExcel(`FuerzaLaboral_${nombre}_${semana.clave}.xlsx`.replace(/\s+/g, '_'), [
    { nombre: 'Fuerza laboral', anchos: [34, 9, 9, 9, 9, 9, 9, 9], filas: [
      { 'Cargo / categoría': 'Mano de obra directa' },
      ...cats.map((c) => fila(PL[c] || c, (x) => x.mod[c] ?? 0)),
      fila('Total mano de obra directa', tMod),
      { 'Cargo / categoría': 'Operadores / conductores' },
      ...vehs.map((v) => fila(`Conductor ${v.toLowerCase()}`, (x) => x.veh[v] ?? 0)),
      fila('Total operadores / conductores', tOp),
      { 'Cargo / categoría': 'Supervisión (staff)' },
      fila('Supervisor de campo', () => 1),
      fila('Total en el frente', (x) => tMod(x) + tOp(x) + 1),
      {}, { 'Cargo / categoría': 'Fuente: RDC finalizados de la semana. Conductores: uno por vehículo de soporte declarado en el RDC; los equipos de perforación los operan los operarios.' },
    ] },
    { nombre: 'Cuadrilla', anchos: [20, 12], filas: ult ? [...cats.map((c) => ({ Recurso: c, [nombre]: por.get(ult).mod[c] ?? 0 })), { Recurso: 'Total', [nombre]: tMod(por.get(ult)) }] : [{ Recurso: 'Sin RDC en la semana' }] },
  ])
}

/** Descarga las fotos de la semana en un solo .zip. */
export async function descargarFotosZip(fotos, nombre, semanaClave, progreso = () => {}) {
  const XLSX = await import('xlsx')
  const CFB = XLSX.CFB || XLSX.default?.CFB
  // Descarga en paralelo (6 a la vez) y arma el zip sin comprimir (las fotos ya vienen comprimidas).
  const datos = new Array(fotos.length)
  let hechas = 0, sig = 0
  async function trabajador() {
    while (sig < fotos.length) {
      const i = sig++
      try { datos[i] = new Uint8Array(await (await fetch(fotos[i].url)).arrayBuffer()) } catch (e) { console.warn('foto', e) }
      progreso(++hechas, fotos.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, fotos.length) }, trabajador))
  const z = CFB.utils.cfb_new()
  let k = 0
  fotos.forEach((f, i) => {
    if (!datos[i]) return
    k++
    const ext = (f.path?.split('.').pop() || 'jpg').toLowerCase()
    CFB.utils.cfb_add(z, `/${nombre}_${f.fecha}_${String(k).padStart(2, '0')}.${ext}`, datos[i])
  })
  CFB.utils.cfb_del(z, '/\u0001Sh33tJ5')
  const out = CFB.write(z, { fileType: 'zip', type: 'array' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([out], { type: 'application/zip' }))
  a.download = `Fotos_${nombre}_${semanaClave}.zip`.replace(/\s+/g, '_')
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export { semanaDe }

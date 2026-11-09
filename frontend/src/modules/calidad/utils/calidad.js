// Módulo Calidad: arma los cinco controles de un frente (perforación,
// inyección, malla, cable y pull test) a partir de lo que reportó el
// supervisor. Todo es puro (sin Supabase ni Vue), igual que semanal.js.
import { aFecha, hoyIso, sumarDias } from '../../frentes/utils/semanal'

// Comparación numérica de todo el código: claveOrdenNatural (avance) solo
// mira el primer número, y en "Z02/P9" vs "Z02/P10" ese es la zona.
const compararCodigoNatural = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' })

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const PERIODOS = [
  { clave: '7', etiqueta: '7 días', dias: 7 },
  { clave: '30', etiqueta: '30 días', dias: 30 },
  { clave: 'todo', etiqueta: 'Todo', dias: null },
]

/** Fecha mínima incluida en el periodo ('YYYY-MM-DD'), o null para "Todo". */
function desdePeriodo(clave) {
  const p = PERIODOS.find((x) => x.clave === clave)
  return p?.dias ? sumarDias(hoyIso(), 1 - p.dias) : null
}

/** "21 oct" */
export function fechaCorta(iso) {
  const f = aFecha(iso)
  return `${f.getDate()} ${MESES[f.getMonth()]}`
}
const claveMes = (iso) => iso.slice(0, 7)
function nombreMes(clave) {
  const [y, m] = clave.split('-').map(Number)
  return `${MESES_LARGOS[m - 1]} ${y}`
}
const mesCorto = (clave) => {
  const m = MESES[Number(clave.slice(5, 7)) - 1]
  return m.charAt(0).toUpperCase() + m.slice(1)
}

/** 1872 → "1 872"; 2.5 → "2.5". Separador de miles con espacio fino, como la
 * referencia (es-PE usa coma, que se confunde con decimal en campo). */
export function num(n, decimales = 1) {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { maximumFractionDigits: decimales }).replace(/,/g, ' ')
}

/** "Z02 / p1" y "Z02/P1" son el mismo perno. */
const normCodigo = (c) => String(c ?? '').toUpperCase().replace(/\s+/g, '')

/** "Zona 2", "Zona 02" y "zona 2 " son la misma zona → "Zona 02". */
function normZona(z) {
  const t = String(z ?? '').trim()
  // "Zona" a secas (sin número) tampoco dice cuál es.
  if (!t || /^zona$/i.test(t)) return 'Sin zona'
  const m = /(\d+)/.exec(t)
  return m ? `Zona ${m[1].padStart(2, '0')}` : t
}

/** "16mm", "16 mm" y "16" → "16 mm". */
function normDiametro(d) {
  const t = String(d ?? '').trim()
  if (!t) return 'Sin Ø'
  const m = /(\d+(?:[.,]\d+)?)/.exec(t)
  return m ? `${m[1].replace(',', '.')} mm` : t
}

const compararTexto = (a, b) => a.localeCompare(b, 'es', { numeric: true })

/** Número de bolsas que menciona una línea de bitácora ("se usaron 2 bolsas
 * cemento"), o null. Solo se muestra como referencia, nunca suma al total. */
function bolsasEnTexto(texto) {
  const m = /(\d+(?:[.,]\d+)?)\s*bolsas?/i.exec(String(texto ?? ''))
  return m ? Number(m[1].replace(',', '.')) : null
}

const masComun = (valores) => {
  const cuenta = new Map()
  for (const v of valores) if (v != null) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Los cinco controles del frente dentro del periodo.
 * - reportes: [{ id, fecha, iny_bolsas_cemento }] solo enviados.
 * - elementos: [{ reporte_id, elemento, actividad, tipo, zona, codigo, ubicacion, cantidad, unidad, ancho, largo, area_m2, diametro }]
 * - biblioteca: [{ codigo, zona, ubicacion, diametro, longitud }]
 * - bitacora: líneas que mencionan bolsas [{ reporte_id, actividad }]
 */
export function armarCalidad({ reportes, elementos, biblioteca, bitacora = [] }, periodo) {
  const desde = desdePeriodo(periodo)
  const fechaDe = new Map(reportes.map((r) => [r.id, r.fecha]))
  const enPeriodo = (e) => {
    const f = fechaDe.get(e.reporte_id)
    return f && (!desde || f >= desde)
  }
  const filas = elementos
    .filter((e) => fechaDe.has(e.reporte_id))
    .map((e) => ({ ...e, fecha: fechaDe.get(e.reporte_id), cod: normCodigo(e.codigo) }))
  const de = (elemento, actividad, soloPeriodo = true) =>
    filas.filter((e) => e.elemento === elemento && e.actividad === actividad && (!soloPeriodo || enPeriodo(e)))

  const bib = new Map()
  for (const b of biblioteca) bib.set(normCodigo(b.codigo), b)
  const conBiblioteca = bib.size > 0

  const perforacion = armarPerforacion(de('Perno', 'Perforación'), bib)
  const inyeccion = armarInyeccion(de('Perno', 'Inyección'), reportes.filter((r) => !desde || r.fecha >= desde), bitacora, bib)
  // "Por inyectar" compara contra TODA la inyección del frente: un perno
  // perforado en el periodo pudo inyectarse después de que este termine.
  const inyectadosSiempre = new Set(de('Perno', 'Inyección', false).map((e) => e.cod))
  inyeccion.porInyectar = perforacion.codigos
    .filter((p) => !inyectadosSiempre.has(p.cod))
    .map((p) => ({ codigo: p.codigo, zona: p.zona }))
    .sort((a, b) => compararCodigoNatural(a.codigo, b.codigo))

  return {
    conBiblioteca,
    totalBiblioteca: bib.size,
    perforacion,
    inyeccion,
    malla: armarMalla(de('Malla', 'Instalación')),
    cable: armarCable(de('Cable', 'Instalación')),
    pullTest: armarPullTest(de('Perno', 'Pull Test'), bib, inyeccion.anclajes),
  }
}

/** Primera fila de cada código (por fecha): un perno reperforado no cuenta dos veces. */
function primeraPorCodigo(filas) {
  const mapa = new Map()
  for (const e of [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const clave = e.cod || `sin-codigo-${mapa.size}`
    if (!mapa.has(clave)) mapa.set(clave, e)
  }
  return [...mapa.values()]
}

function porDia(filas) {
  const mapa = new Map()
  for (const e of filas) mapa.set(e.fecha, (mapa.get(e.fecha) ?? 0) + 1)
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, n]) => ({ fecha, etiqueta: fechaCorta(fecha), n }))
}

function armarPerforacion(filas, bib) {
  const unicos = primeraPorCodigo(filas)
  const codigos = unicos.map((e) => {
    const b = bib.get(e.cod)
    return {
      cod: e.cod,
      codigo: e.codigo ?? '—',
      fecha: e.fecha,
      longitud: Number(e.cantidad) || 0,
      zona: normZona(b?.zona ?? e.zona),
      ubicacion: b?.ubicacion ?? e.ubicacion ?? 'Sin ubicación',
      ubicacionReportada: e.ubicacion ?? 'Sin ubicación',
      enBiblioteca: !!b,
    }
  })
  const perforado = new Map(codigos.map((c) => [c.cod, c]))

  // Avance contra la biblioteca: zona → ubicación → códigos esperados.
  const zonas = new Map()
  for (const [cod, b] of bib) {
    const zona = normZona(b.zona)
    const ubic = b.ubicacion ?? 'Sin ubicación'
    if (!zonas.has(zona)) zonas.set(zona, new Map())
    const ubics = zonas.get(zona)
    if (!ubics.has(ubic)) ubics.set(ubic, [])
    const p = perforado.get(cod)
    ubics.get(ubic).push({ codigo: b.codigo, fecha: p?.fecha ?? null, longitud: Number(b.longitud) || null, diametro: Number(b.diametro) || null })
  }
  const fuera = codigos.filter((c) => !c.enBiblioteca).sort((a, b) => compararCodigoNatural(a.codigo, b.codigo))
  const avance = [...zonas.entries()]
    .sort((a, b) => compararTexto(a[0], b[0]))
    .map(([zona, ubics]) => {
      const ubicaciones = [...ubics.entries()]
        .sort((a, b) => compararTexto(a[0], b[0]))
        .map(([ubicacion, items]) => {
          items.sort((a, b) => compararCodigoNatural(a.codigo, b.codigo))
          return {
            ubicacion,
            items,
            total: items.length,
            perforados: items.filter((i) => i.fecha).length,
            diametro: masComun(items.map((i) => i.diametro)),
            longitud: masComun(items.map((i) => i.longitud)),
          }
        })
      return {
        zona,
        ubicaciones,
        total: ubicaciones.reduce((s, u) => s + u.total, 0),
        perforados: ubicaciones.reduce((s, u) => s + u.perforados, 0),
        fuera: fuera.filter((f) => f.zona === zona),
      }
    })
  // Fuera de biblioteca en una zona que la biblioteca no tiene: zona propia.
  for (const zona of new Set(fuera.map((f) => f.zona))) {
    if (!avance.some((z) => z.zona === zona)) avance.push({ zona, ubicaciones: [], total: 0, perforados: 0, fuera: fuera.filter((f) => f.zona === zona) })
  }

  // Sin biblioteca: solo lo reportado, agrupado por zona y ubicación reportadas.
  const reportado = new Map()
  for (const c of codigos) {
    if (!reportado.has(c.zona)) reportado.set(c.zona, new Map())
    const u = reportado.get(c.zona)
    if (!u.has(c.ubicacion)) u.set(c.ubicacion, [])
    u.get(c.ubicacion).push(c)
  }
  const sinBiblioteca = [...reportado.entries()]
    .sort((a, b) => compararTexto(a[0], b[0]))
    .map(([zona, u]) => ({
      zona,
      total: [...u.values()].reduce((s, l) => s + l.length, 0),
      ubicaciones: [...u.entries()]
        .sort((a, b) => compararTexto(a[0], b[0]))
        .map(([ubicacion, items]) => ({ ubicacion, items: items.sort((a, b) => compararCodigoNatural(a.codigo, b.codigo)), perforados: items.length })),
    }))

  const meses = new Map()
  for (const c of codigos) meses.set(claveMes(c.fecha), (meses.get(claveMes(c.fecha)) ?? 0) + 1)

  return {
    n: codigos.length,
    ml: filas.reduce((s, e) => s + (Number(e.cantidad) || 0), 0),
    codigos,
    avance,
    sinBiblioteca,
    fuera,
    porDia: porDia(unicos),
    porMes: [...meses.entries()].sort().map(([clave, n]) => ({ clave, nombre: nombreMes(clave), corto: mesCorto(clave), n })),
  }
}

function armarInyeccion(filas, reportes, bitacora, bib) {
  const unicos = primeraPorCodigo(filas)
  // Bolsas por día: suma del campo de los reportes de esa fecha (null si
  // ninguno lo llenó) y, aparte, lo que diga la bitácora de esos reportes.
  const reportesDe = new Map()
  for (const r of reportes) {
    if (!reportesDe.has(r.fecha)) reportesDe.set(r.fecha, [])
    reportesDe.get(r.fecha).push(r)
  }
  const bitacoraDe = new Map()
  for (const l of bitacora) {
    const n = bolsasEnTexto(l.actividad)
    if (n != null) bitacoraDe.set(l.reporte_id, (bitacoraDe.get(l.reporte_id) ?? 0) + n)
  }

  const dias = new Map()
  for (const e of filas) {
    if (!dias.has(e.fecha)) dias.set(e.fecha, [])
    dias.get(e.fecha).push(e)
  }
  const porDiaFilas = [...dias.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, items]) => {
      const rs = reportesDe.get(fecha) ?? []
      const conDato = rs.filter((r) => r.iny_bolsas_cemento != null)
      const bolsas = conDato.length ? conDato.reduce((s, r) => s + Number(r.iny_bolsas_cemento), 0) : null
      const enBitacora = rs.reduce((s, r) => s + (bitacoraDe.get(r.id) ?? 0), 0) || null
      const ml = items.reduce((s, e) => s + (Number(e.cantidad) || 0), 0)
      const fuente = bolsas != null ? 'reporte' : enBitacora ? 'bitacora' : 'sin'
      // Códigos del día por zona y ubicación (de la biblioteca si existe).
      const grupos = new Map()
      for (const e of items) {
        const b = bib.get(e.cod)
        const zona = normZona(b?.zona ?? e.zona)
        const ubic = b?.ubicacion ?? e.ubicacion ?? 'Sin ubicación'
        const k = `${zona}|${ubic}`
        if (!grupos.has(k)) grupos.set(k, { zona, ubicacion: ubic, items: [] })
        grupos.get(k).items.push({ codigo: e.codigo ?? '—', ml: Number(e.cantidad) || 0 })
      }
      return {
        fecha,
        etiqueta: fechaCorta(fecha),
        anclajes: items.length,
        ml,
        bolsas,
        enBitacora: bolsas == null ? enBitacora : null,
        fuente,
        rendimiento: bolsas ? ml / bolsas : null,
        grupos: [...grupos.values()]
          .sort((a, b) => compararTexto(a.zona, b.zona) || compararTexto(a.ubicacion, b.ubicacion))
          .map((g) => ({ ...g, items: g.items.sort((a, b) => compararCodigoNatural(a.codigo, b.codigo)), mlCu: masComun(g.items.map((i) => i.ml)) })),
      }
    })

  const conDato = porDiaFilas.filter((d) => d.bolsas != null)
  const bolsas = conDato.reduce((s, d) => s + d.bolsas, 0)
  const mlConDato = conDato.reduce((s, d) => s + d.ml, 0)

  const meses = new Map()
  for (const d of porDiaFilas) {
    const k = claveMes(d.fecha)
    if (!meses.has(k)) meses.set(k, { clave: k, nombre: nombreMes(k), corto: mesCorto(k), bolsas: 0, bitacora: 0, ml: 0, mlConDato: 0 })
    const m = meses.get(k)
    m.ml += d.ml
    if (d.bolsas != null) {
      m.bolsas += d.bolsas
      m.mlConDato += d.ml
    } else if (d.enBitacora) {
      m.bitacora += d.enBitacora
      m.mlConDato += d.ml
    }
  }

  return {
    anclajes: unicos.length,
    ml: filas.reduce((s, e) => s + (Number(e.cantidad) || 0), 0),
    bolsas,
    rendimiento: bolsas ? mlConDato / bolsas : null,
    porDia: porDiaFilas,
    porMes: [...meses.values()].sort((a, b) => a.clave.localeCompare(b.clave)).map((m) => ({
      ...m,
      mostrado: m.bolsas || m.bitacora,
      soloBitacora: !m.bolsas && m.bitacora > 0,
      rendimiento: (m.bolsas || m.bitacora) ? m.mlConDato / (m.bolsas || m.bitacora) : null,
    })),
    sinBolsas: porDiaFilas.filter((d) => d.bolsas == null),
    porInyectar: [],
  }
}

function armarMalla(filas) {
  const panos = filas
    .map((e) => ({
      codigo: e.codigo ?? '—',
      fecha: e.fecha,
      etiqueta: fechaCorta(e.fecha),
      ancho: e.ancho != null ? Number(e.ancho) : null,
      largo: e.largo != null ? Number(e.largo) : null,
      // Mismo criterio que fn_rdc_malla_estado: `cantidad` ya es el m².
      area: Number(e.cantidad ?? e.area_m2) || 0,
      tipo: e.tipo ?? 'Sin tipo',
      zona: normZona(e.zona),
    }))
    .sort((a, b) => compararCodigoNatural(a.codigo, b.codigo) || a.fecha.localeCompare(b.fecha))
  const tipos = [...new Set(panos.map((p) => p.tipo))]
  const zonas = [...new Set(panos.map((p) => p.zona))].sort(compararTexto)
  const medidas = [...new Set(panos.filter((p) => p.ancho && p.largo).map((p) => `${num(p.ancho, 2)} × ${num(p.largo, 2)} m`))]
  return { n: panos.length, area: panos.reduce((s, p) => s + p.area, 0), panos, tipos, zonas, medidas }
}

function armarCable(filas) {
  const tramos = filas
    .map((e) => ({ fecha: e.fecha, etiqueta: fechaCorta(e.fecha), diametro: normDiametro(e.tipo ?? e.diametro), tramo: e.codigo ?? '—', ml: Number(e.cantidad) || 0, zona: normZona(e.zona) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || compararCodigoNatural(a.tramo, b.tramo))
  const porDiametro = new Map()
  for (const t of tramos) porDiametro.set(t.diametro, (porDiametro.get(t.diametro) ?? 0) + t.ml)
  return {
    n: tramos.length,
    ml: tramos.reduce((s, t) => s + t.ml, 0),
    tramos,
    porDiametro: [...porDiametro.entries()].sort((a, b) => compararTexto(b[0], a[0])).map(([diametro, ml]) => ({ diametro, ml })),
    zonas: [...new Set(tramos.map((t) => t.zona))].sort(compararTexto),
  }
}

function armarPullTest(filas, bib, anclajesInyectados) {
  const ensayos = filas
    .map((e) => {
      const b = bib.get(e.cod)
      return { fecha: e.fecha, etiqueta: fechaCorta(e.fecha), zona: normZona(b?.zona ?? e.zona), codigo: e.codigo ?? '—', ubicacion: b?.ubicacion ?? e.ubicacion ?? '—' }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || compararCodigoNatural(a.codigo, b.codigo))
  return { n: ensayos.length, ensayos, ultimo: ensayos.at(-1) ?? null, anclajesInyectados }
}

/** "12 y 16 mm" */
export function listaDiametros(porDiametro) {
  const nums = porDiametro.map((d) => d.diametro.replace(' mm', '')).sort((a, b) => Number(a) - Number(b))
  if (!nums.length) return ''
  if (nums.length === 1) return `${nums[0]} mm`
  return `${nums.slice(0, -1).join(', ')} y ${nums.at(-1)} mm`
}

/** Totales acumulados por frente para "Comparar frentes". */
export function armarComparacion({ frentes, reportes, elementos, biblioteca }, periodo) {
  const desde = desdePeriodo(periodo)
  const rep = new Map(reportes.filter((r) => !desde || r.fecha >= desde).map((r) => [r.id, r]))
  const porFrente = new Map()
  const fila = (id) => {
    if (!porFrente.has(id)) porFrente.set(id, { perf: new Set(), iny: new Set(), malla: 0, cable: 0, pull: 0, bolsas: 0, conDatos: false })
    return porFrente.get(id)
  }
  for (const e of elementos) {
    const r = rep.get(e.reporte_id)
    if (!r) continue
    const f = fila(r.frente_id)
    f.conDatos = true
    const cod = normCodigo(e.codigo) || `${e.reporte_id}-${f.perf.size + f.iny.size}`
    if (e.elemento === 'Perno' && e.actividad === 'Perforación') f.perf.add(cod)
    else if (e.elemento === 'Perno' && e.actividad === 'Inyección') f.iny.add(cod)
    else if (e.elemento === 'Perno' && e.actividad === 'Pull Test') f.pull += 1
    else if (e.elemento === 'Malla') f.malla += Number(e.cantidad ?? e.area_m2) || 0
    else if (e.elemento === 'Cable') f.cable += Number(e.cantidad) || 0
  }
  for (const r of rep.values()) {
    if (r.iny_bolsas_cemento != null) {
      const f = fila(r.frente_id)
      f.bolsas += Number(r.iny_bolsas_cemento)
      f.conDatos = true
    }
  }
  const totalBib = new Map()
  for (const b of biblioteca) totalBib.set(b.frente_id, (totalBib.get(b.frente_id) ?? 0) + 1)

  return frentes
    .filter((fr) => porFrente.get(fr.id)?.conDatos)
    .map((fr) => {
      const f = porFrente.get(fr.id)
      return {
        id: fr.id,
        nombre: fr.nombre,
        perforados: f.perf.size,
        inyectados: f.iny.size,
        total: totalBib.get(fr.id) ?? null,
        bolsas: f.bolsas,
        malla: f.malla,
        cable: f.cable,
        pullTest: f.pull,
      }
    })
    .sort((a, b) => b.perforados + b.inyectados - (a.perforados + a.inyectados) || compararTexto(a.nombre, b.nombre))
}

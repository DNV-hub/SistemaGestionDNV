// Pestaña "Semanal" de la ficha del frente: semanas de lunes a domingo,
// resumen automático de cada día y armado de los totales de la semana. Todo
// es puro (sin Supabase ni Vue) para poder cambiar una regla sin tocar la
// pantalla.

const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

// Fechas como 'YYYY-MM-DD' en hora local, sin pasar por UTC (un Date a
// medianoche en Lima convertido a ISO cae en el día anterior).
export function aFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function aIso(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}
export function sumarDias(iso, n) {
  const f = aFecha(iso)
  f.setDate(f.getDate() + n)
  return aIso(f)
}
/** Lunes de la semana que contiene esa fecha. */
export function lunesDe(iso) {
  const f = aFecha(iso)
  f.setDate(f.getDate() - ((f.getDay() + 6) % 7))
  return aIso(f)
}
export function hoyIso() {
  return aIso(new Date())
}

/** Número de semana contando desde la que contiene `lunesSemana1` (= 1).
 * Aritmética de fechas, no un recorrido: un reporte de prueba en 2051 no
 * obliga a contar semana por semana hasta allá. */
export function numeroSemana(lunes, lunesSemana1) {
  const dias = Math.round((aFecha(lunes) - aFecha(lunesSemana1)) / 86_400_000)
  return Math.floor(dias / 7) + 1
}

/** "19 – 25 oct 2026", "27 oct – 2 nov 2026" o "29 dic 2025 – 4 ene 2026". */
export function rangoSemana(lunes) {
  const a = aFecha(lunes)
  const b = aFecha(sumarDias(lunes, 6))
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()} ${MESES[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`
  }
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${MESES[a.getMonth()]} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`
  return `${a.getDate()} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`
}

export const hora = (t) => (t ? String(t).slice(0, 5) : '')

/** Primera frase de una línea de bitácora: hasta el primer punto o punto y
 * coma que cierre la frase (no el de "3.9 x 28 m"), recortada a ~90
 * caracteres sin partir palabras. */
function primeraFrase(texto) {
  let s = String(texto ?? '').trim().replace(/\s+/g, ' ')
  const fin = s.search(/[.;](\s|$)/)
  if (fin > 0) s = s.slice(0, fin)
  if (s.length > 90) {
    const corte = s.lastIndexOf(' ', 90)
    s = s.slice(0, corte > 40 ? corte : 90)
    // Que no quede colgando en "…programada de" o "…para la".
    let previo
    do {
      previo = s
      s = s.replace(/[\s,:–-]+$/, '').replace(/\s+(de|del|la|las|el|los|y|e|o|para|con|en|a|al|por|un|una|que)$/i, '')
    } while (s !== previo)
  }
  return s.replace(/[\s,:–-]+$/, '')
}

/** Resumen del día armado de su bitácora: las 2 o 3 primeras frases
 * distintas, unidas con "; ". Única función a cambiar si más adelante el
 * resumen lo escribe el supervisor o lo genera una IA. */
function resumenDelDia(lineas) {
  const frases = []
  for (const l of lineas) {
    const f = primeraFrase(l.actividad)
    if (!f || frases.some((x) => x.toLowerCase() === f.toLowerCase())) continue
    if (frases.length >= 2 && frases.join('; ').length + f.length > 200) break
    frases.push(f)
    if (frases.length === 3) break
  }
  if (!frases.length) return 'Sin bitácora registrada'
  const texto = frases.join('; ')
  return texto.charAt(0).toUpperCase() + texto.slice(1) + '.'
}

const ordenarPorHora = (a, b) =>
  (a.hora_inicio ?? '99').localeCompare(b.hora_inicio ?? '99') || (a.orden ?? 0) - (b.orden ?? 0)

/** Los 7 días de la semana con lo que pasó en cada uno. Un día con más de un
 * reporte junta sus actividades y metrados; queda "Borrador" si alguno lo es. */
export function armarDias(lunes, reportes, bitacora, metrados) {
  const hoy = hoyIso()
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i)
    const delDia = reportes.filter((r) => r.fecha === fecha)
    const ids = new Set(delDia.map((r) => r.id))
    const bit = bitacora.filter((b) => ids.has(b.reporte_id)).sort(ordenarPorHora)
    const met = metrados.filter((m) => ids.has(m.reporte_id)).sort(ordenarPorHora)
    return {
      n: i + 1,
      fecha,
      dia: aFecha(fecha).getDate(),
      dow: DIAS_CORTOS[i],
      hoy: fecha === hoy,
      futuro: fecha > hoy,
      reportes: delDia,
      conReporte: delDia.length > 0,
      estado: !delDia.length ? null : delDia.some((r) => r.estado !== 'Finalizado') ? 'Borrador' : 'Enviado',
      bitacora: bit,
      metrados: met,
      resumen: delDia.length ? resumenDelDia(bit) : 'Sin reporte',
    }
  })
}

/** Totales de la semana por partida (código + nombre + unidad; las libres,
 * sin código, por nombre + unidad) y en qué días hubo avance. */
export function armarPartidas(dias) {
  const mapa = new Map()
  for (const d of dias) {
    for (const m of d.metrados) {
      const clave = `${m.partida_codigo ?? ''}|${m.partida_nombre}|${m.unidad ?? ''}`
      if (!mapa.has(clave)) mapa.set(clave, { codigo: m.partida_codigo, nombre: m.partida_nombre, unidad: m.unidad ?? '', total: 0, dias: new Set() })
      const p = mapa.get(clave)
      p.total += Number(m.cantidad) || 0
      p.dias.add(d.n)
    }
  }
  return [...mapa.values()].sort((a, b) => {
    if (!!a.codigo !== !!b.codigo) return a.codigo ? -1 : 1
    if (a.codigo && b.codigo) return a.codigo.localeCompare(b.codigo, 'es', { numeric: true })
    return a.nombre.localeCompare(b.nombre, 'es')
  })
}

export const numero = (n) => String(Math.round((Number(n) || 0) * 100) / 100)

/** Texto plano para WhatsApp o el informe semanal, sin emojis. */
export function textoResumenSemana(nombreFrente, nSemana, lunes, dias) {
  const rango = rangoSemana(lunes).replace(' – ', '–')
  const partes = [`${nombreFrente} · Semana ${nSemana} (${rango})`]
  for (const d of dias) {
    const f = aFecha(d.fecha)
    const cab = `Día ${d.n} · ${d.dow} ${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}`
    if (!d.conReporte) {
      partes.push(`${cab} (Sin reporte)`)
      continue
    }
    const met = d.metrados.length ? d.metrados.map((m) => `${m.partida_nombre} ${numero(m.cantidad)} ${m.unidad ?? ''}`.trim()).join('; ') : '—'
    partes.push(`${cab} (${d.estado})\n${d.resumen}\nMetrados: ${met}`)
  }
  return partes.join('\n\n')
}

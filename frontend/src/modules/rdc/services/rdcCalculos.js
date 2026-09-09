import {
  CAUSA_TIEMPO_TOTAL,
  GRUPOS_CRITICOS,
  HITO_INICIO_PISO,
  HITO_TERMINO_JORNADA,
  SECTOR_SALA_ELECTRICA,
} from './rdcConstantes'

// Cálculos derivados del reporte. Todo acá es función pura: recibe el reporte
// (y los catálogos cuando necesita resolver un nombre) y devuelve un valor.
// Los usan la vista de resumen, el texto de WhatsApp y la exportación a Excel,
// para que no haya dos versiones de la misma regla que puedan discrepar — que
// es un problema que el RDC original sí tiene en algunos puntos.

export const nombreDe = (catalogos, clave, id) => (id ? (catalogos?.[clave] ?? []).find((x) => x.id === id)?.nombre ?? '' : '')

const aMinutos = (hhmm) => {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m
}

/** Minutos entre dos horas, descontando el solape con el refrigerio.
 *
 * Ese descuento es una regla real de la operación y no un detalle: una parada
 * que abarca la hora de almuerzo no puede contar como tiempo perdido, porque
 * la cuadrilla no iba a estar trabajando igual. Si `hasta` es menor que
 * `desde` se asume que la jornada cruzó la medianoche. */
export function minutosEntre(desde, hasta, reporte) {
  const inicio = aMinutos(desde)
  let fin = aMinutos(hasta)
  if (inicio === null || fin === null) return null
  if (fin < inicio) fin += 24 * 60
  let diff = fin - inicio

  const salida = aMinutos(reporte?.refrigerioSalida)
  const retorno = aMinutos(reporte?.refrigerioRetorno)
  if (salida !== null && retorno !== null && reporte.refrigerioSalida !== '00:00' && reporte.refrigerioRetorno !== '00:00') {
    let almFin = retorno
    if (almFin < salida) almFin += 24 * 60
    const solape = Math.max(0, Math.min(fin, almFin) - Math.max(inicio, salida))
    diff -= solape
  }

  return Math.max(0, diff)
}

/** Una parada declara su duración de dos formas según la causa: por rango
 * horario, o —cuando es un cierre de vías por encapsulados— por un total en
 * horas y minutos, porque no ocurre en un tramo continuo. */
export function minutosStandby(fila, reporte) {
  if (fila.causa === CAUSA_TIEMPO_TOTAL) {
    const total = Math.round((parseFloat(fila.totalHoras) || 0) * 60 + (parseFloat(fila.totalMinutos) || 0))
    return total > 0 ? total : null
  }
  return minutosEntre(fila.desde, fila.hasta, reporte)
}

export const causaEfectiva = (fila) =>
  fila.causa === 'OTRO' ? (fila.causaOtro?.trim() ? `OTRO: ${fila.causaOtro.trim().toUpperCase()}` : 'OTRO') : fila.causa ?? ''

/** Paradas con contenido real, numeradas y con sus minutos ya calculados. */
export function standbyRegistrados(reporte) {
  return (reporte.standby ?? [])
    .filter((r) => r.actividad?.trim() || r.causa || r.desde || r.hasta || r.comentario?.trim())
    .map((r, i) => ({
      item: i + 1,
      actividad: r.actividad?.trim() ?? '',
      desde: r.desde ?? '',
      hasta: r.hasta ?? '',
      minutos: minutosStandby(r, reporte),
      causa: causaEfectiva(r),
      responsable: r.responsable?.trim() ?? '',
      comentario: r.comentario?.trim() ?? '',
    }))
}

export const totalStandbyMin = (reporte) => standbyRegistrados(reporte).reduce((s, r) => s + (r.minutos ?? 0), 0)

export const fmtHm = (min) => (min === null || min === undefined ? '—' : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`)
export const fmtHHMM = (min) =>
  min === null || min === undefined ? '' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export const horaHito = (reporte, nombre) => (reporte.hitos ?? []).find((h) => h.nombre === nombre)?.hora ?? ''

/** Tiempo efectivo = desde el inicio de actividades en piso hasta el término
 * de jornada, menos las paradas.
 *
 * La restricción de acceso al frente NO se resta acá: ocurre antes del inicio
 * de actividades, o sea fuera de esta ventana, y restarla otra vez duplicaría
 * el descuento (el RDC original ya tropezó con eso y dejó el comentario). */
export function tiempoEfectivoMin(reporte) {
  const inicio = horaHito(reporte, HITO_INICIO_PISO)
  const termino = horaHito(reporte, HITO_TERMINO_JORNADA)
  if (!inicio || !termino) return null
  const total = (aMinutos(termino) ?? 0) - (aMinutos(inicio) ?? 0)
  if (total <= 0) return null
  return Math.max(0, total - totalStandbyMin(reporte))
}

export const totalPersonal = (reporte) =>
  (reporte.personal ?? []).filter((p) => p.tipo === 'directa').reduce((s, p) => s + (Number(p.cantidad) || 0), 0)

export const esSalaElectrica = (reporte, catalogos) => nombreDe(catalogos, 'sectores', reporte.sectorId) === SECTOR_SALA_ELECTRICA

// ---------------------------------------------------------------------------
// Bloque 2: los elementos individuales, agrupados
// ---------------------------------------------------------------------------

/** Resume los elementos de sostenimiento en las cinco filas del bloque 2.
 * El total, el rango horario y —cuando aplica— la cuenta de pernos salen de
 * los elementos, que son la única fuente: no se guarda el agregado. */
export function gruposCriticos(reporte) {
  return GRUPOS_CRITICOS.map((g) => {
    const items = (reporte.elementos ?? []).filter((c) => c.elemento === g.elemento && c.actividad === g.actividad)
    if (!items.length) return null

    const horasInicio = items.map((c) => c.horaInicio).filter(Boolean).sort()
    const horasFin = items.map((c) => c.horaFin).filter(Boolean).sort()

    return {
      ...g,
      items,
      cantidad: Math.round(items.reduce((s, c) => s + (Number(c.cantidad) || 0), 0) * 100) / 100,
      unidades: items.length,
      horaInicio: horasInicio[0] ?? '',
      horaFin: horasFin[horasFin.length - 1] ?? '',
    }
  }).filter(Boolean)
}

/** Todo lo ejecutado en el día, en el orden en que se muestra: los tres
 * bloques y las partidas libres. */
export function partidasEjecutadas(reporte) {
  const salida = []
  const porBloque = (bloque, etiqueta) =>
    (reporte.metrados ?? [])
      .filter((m) => m.bloque === bloque && Number(m.cantidad) > 0)
      .sort((a, b) => a.orden - b.orden)
      .forEach((m) => salida.push({ nombre: m.partidaNombre, met: Number(m.cantidad), um: m.unidad, sub: etiqueta, manual: false }))

  porBloque('1', '1. Preliminares')
  gruposCriticos(reporte).forEach((g) =>
    salida.push({ nombre: g.partida, met: g.cuentaPernos || g.unidad !== 'UND' ? g.cantidad : g.unidades, um: g.unidad, sub: '2. Críticas', manual: false }),
  )
  porBloque('3', '3. Complementarias')
  ;(reporte.metrados ?? [])
    .filter((m) => m.bloque === 'libre' && Number(m.cantidad) > 0)
    .forEach((m) => salida.push({ nombre: m.partidaNombre, met: Number(m.cantidad), um: m.unidad ?? '', sub: 'PARTIDAS NUEVAS', manual: true }))

  return salida
}

// ---------------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------------

/** Frases que se generan solas desde los metrados ("Se realizaron
 * perforaciones con un total de 42 ML — Pernos: …"). No se guardan en la base:
 * son texto derivado y se vuelven a componer cada vez, así nunca quedan
 * desfasadas de los metrados que las originaron. */
export function entradasAutomaticas(reporte) {
  const entradas = []
  const orden = (h) => (h ? aMinutos(h) ?? Infinity : Infinity)

  const porBloque = (bloque) =>
    (reporte.metrados ?? [])
      .filter((m) => m.bloque === bloque && Number(m.cantidad) > 0)
      .forEach((m) =>
        entradas.push({
          clave: orden(m.horaInicio),
          hi: m.horaInicio ?? '',
          hf: m.horaFin ?? '',
          texto: `Se realizó ${m.partidaNombre} con un total de ${Number(m.cantidad)} ${m.unidad}`,
        }),
      )

  porBloque('1')

  const frases = {
    Perforaciones: (t, c) => `Se realizaron perforaciones con un total de ${t} ML — Pernos: ${c}`,
    Inyecciones: (t, c) => `Se realizaron inyecciones con un total de ${t} ML — Pernos: ${c}`,
    'Instalación de mallas': (t, c) => `Se realizó la instalación de malla con un total de ${t} M2, con los paños: ${c}`,
    'Instalación de cable': (t, c) => `Se instalaron cables con un total de ${t} ML: ${c}`,
    'Ensayos Pull Test': (t, c) => `Se realizaron ${t} ensayos de Pull Test — Pernos: ${c}`,
  }
  gruposCriticos(reporte).forEach((g) => {
    const codigos = g.items.map((c) => c.codigo || '—').join(', ')
    const total = g.partida === 'Ensayos Pull Test' ? g.unidades : g.cantidad
    entradas.push({ clave: orden(g.horaInicio), hi: g.horaInicio, hf: g.horaFin, texto: frases[g.partida](total, codigos) })
  })

  porBloque('3')

  const conHora = entradas.filter((e) => e.hi).sort((a, b) => a.clave - b.clave)
  return [...conHora, ...entradas.filter((e) => !e.hi)]
}

/** Las actividades escritas a mano más las automáticas, ordenadas por hora.
 * Es la misma lista que usan la hoja BITACORA del Excel y el texto de
 * WhatsApp, a propósito: en el RDC original son dos caminos distintos que
 * pueden desincronizarse. */
export function bitacoraCompleta(reporte) {
  const eventos = (reporte.bitacora ?? [])
    .filter((r) => r.horaInicio || r.actividad)
    .map((r) => ({ hi: r.horaInicio ?? '', hf: r.horaFin ?? '', texto: r.actividad ?? '', clave: r.horaInicio || 'ZZ' }))

  entradasAutomaticas(reporte).forEach((e) => eventos.push({ hi: e.hi, hf: e.hf, texto: e.texto, clave: e.hi || 'ZZ' }))

  return eventos.sort((a, b) => String(a.clave).localeCompare(String(b.clave)))
}

// ---------------------------------------------------------------------------
// Texto para WhatsApp
// ---------------------------------------------------------------------------

/** Reproduce el reporte que los supervisores comparten hoy por WhatsApp.
 * Va tal cual a la hoja REPORTE_WSP del Excel, así que su formato es parte de
 * lo que la obra ya lee: los emojis y los asteriscos de negrita no son
 * decoración, son el formato que la gente reconoce. */
export function textoWhatsapp(reporte, catalogos) {
  const frente = nombreDe(catalogos, 'frentes', reporte.frenteId) || '—'
  const fecha = reporte.fecha ? reporte.fecha.split('-').reverse().join('/') : '—'
  let t = ''

  t += `*REPORTE DIARIO DE CAMPO* 👷\n`
  t += `Sostenimiento y mantenimiento de talud ⛰️\n`
  t += `------------------------------\n`
  t += `📅 Fecha: ${fecha}\n`
  t += `📍 Sector: ${nombreDe(catalogos, 'sectores', reporte.sectorId) || '—'}\n`
  t += `🚧 Frente: ${frente}\n`
  t += `👷 Capataz: ${nombreDe(catalogos, 'capataces', reporte.capatazId) || '—'}\n`
  t += `🦺 Supervisor: ${nombreDe(catalogos, 'supervisores', reporte.supervisorId) || '—'}\n\n`

  const llegada = horaHito(reporte, 'Llegada a frente de trabajo')
  const inicioPiso = horaHito(reporte, HITO_INICIO_PISO)
  const termino = horaHito(reporte, HITO_TERMINO_JORNADA)
  if (llegada || inicioPiso || termino || reporte.refrigerioSalida) {
    t += `*REGISTRO DE JORNADA* 🕒\n`
    if (llegada) t += `• Llegada a frente de trabajo: ${llegada}\n`
    if (inicioPiso) t += `• ${HITO_INICIO_PISO}: ${inicioPiso}\n`
    if (termino) t += `• Término de jornada: ${termino}\n`
    t += `\n`
  }

  if (reporte.restriccionAcceso) {
    t += `*RESTRICCIÓN PARA LLEGAR AL FRENTE* 🚧\n`
    if (reporte.restriccionDescripcion?.trim()) t += `• ${reporte.restriccionDescripcion.trim()}\n`
    if (reporte.restriccionInicio || reporte.restriccionFin) {
      t += `• Horario: ${reporte.restriccionInicio || '—'} a ${reporte.restriccionFin || '—'}\n`
    }
    t += `\n`
  }

  t += `*AVANCE DE PARTIDAS* ✅\n`
  const ejecutadas = partidasEjecutadas(reporte)
  if (ejecutadas.length) {
    let subActual = null
    ejecutadas.forEach((p) => {
      if (p.sub && p.sub !== subActual) {
        subActual = p.sub
        t += `_${p.sub}_\n`
      }
      t += `• ${p.nombre}${p.manual ? ' (nueva)' : ''}: *${p.met} ${p.um}*\n`
    })
  } else {
    t += 'Sin metrados registrados.\n'
  }
  t += `\n`

  const bitacora = bitacoraCompleta(reporte)
  if (bitacora.length) {
    t += `*BITÁCORA DE ACTIVIDADES* 📝\n`
    bitacora.forEach((e) => {
      const hora = e.hi ? `${e.hf ? `${e.hi} - ${e.hf}` : e.hi} — ` : ''
      t += `• ${hora}${e.texto}\n`
    })
    t += `\n`
  }

  const programadas = (reporte.programacion ?? []).filter((r) => r.tipo === 'programada' && r.etiqueta)
  const noProgramadas = (reporte.programacion ?? []).filter((r) => r.tipo === 'no_programada' && r.descripcion?.trim())
  if (programadas.length || noProgramadas.length) {
    t += `*PROGRAMACIÓN MAÑANA* 📅\n`
    programadas.forEach((r) => {
      t += `• ${r.etiqueta}${r.descripcion?.trim() ? ` — ${r.descripcion.trim()}` : ''}\n`
    })
    noProgramadas.forEach((r) => {
      t += `• ${r.descripcion.trim()}${r.etiqueta?.trim() ? ` — ${r.etiqueta.trim()}` : ''}\n`
    })
    t += `\n`
  }

  const elementos = reporte.elementos ?? []
  if (elementos.length) {
    t += '*CONTROL DE SOSTENIMIENTO* 🔩\n'
    const gruposPerno = [
      { label: 'Perforación', items: elementos.filter((c) => c.elemento === 'Perno' && c.actividad === 'Perforación') },
      { label: 'Inyección', items: elementos.filter((c) => c.elemento === 'Perno' && c.actividad === 'Inyección') },
      { label: 'Pull Test', items: elementos.filter((c) => c.elemento === 'Perno' && c.actividad === 'Pull Test') },
    ]
    gruposPerno.forEach((g) => {
      if (!g.items.length) return
      const total = Math.round(g.items.reduce((s, c) => s + (Number(c.cantidad) || 0), 0) * 100) / 100
      t += `*Pernos — ${g.label}: ${g.items.length} un. (${total} ${g.items[0].unidad || 'ML'})*\n`
      g.items.forEach((c) => {
        t += `  ${c.codigo || '—'} — ${c.cantidad ? `${c.cantidad} ${c.unidad || 'ML'}` : '—'}\n`
      })
    })

    const mallas = elementos.filter((c) => c.elemento === 'Malla')
    if (mallas.length) {
      t += `*Mallas: ${Math.round(mallas.reduce((s, c) => s + (Number(c.cantidad) || 0), 0) * 100) / 100} M²*\n`
      mallas.forEach((c) => {
        const dim = c.ancho && c.largo ? `${c.ancho}×${c.largo} m` : c.cantidad ? `${c.cantidad} M²` : '—'
        t += `  ${c.codigo || '—'} — ${dim}\n`
      })
    }

    const cables = elementos.filter((c) => c.elemento === 'Cable')
    if (cables.length) {
      t += `*Cables: ${Math.round(cables.reduce((s, c) => s + (Number(c.cantidad) || 0), 0) * 100) / 100} ML*\n`
      cables.forEach((c) => {
        t += `  ${c.codigo || '—'} — ${c.cantidad ? `${c.cantidad} ML` : '—'}\n`
      })
    }
    t += `\n`
  }

  const paradas = standbyRegistrados(reporte)
  if (paradas.length) {
    t += `*STAND BY DE LA JORNADA* ⏸️\n`
    paradas.forEach((r) => {
      t += `${r.item}. ${r.actividad || '—'}\n`
      t += `   ⏱️ ${r.desde || '—'} a ${r.hasta || '—'} (*${fmtHm(r.minutos)}*)\n`
      if (r.causa) t += `   📌 Causa: ${r.causa}\n`
      if (r.comentario) t += `   💬 ${r.comentario}\n`
    })
    t += `⏰ *Total Stand By: ${fmtHm(totalStandbyMin(reporte))}*\n\n`
  }

  if (reporte.observaciones || reporte.requerimientos || reporte.restricciones) {
    t += `*OBSERVACIONES / REQUERIMIENTOS* ⚠️\n`
    if (reporte.observaciones) t += `📋 Observaciones: ${reporte.observaciones}\n`
    if (reporte.requerimientos) t += `🔧 Requerimientos: ${reporte.requerimientos}\n`
    if (reporte.restricciones) t += `🚫 Restricciones: ${reporte.restricciones}\n`
    t += `\n`
  }

  return t.trim()
}

import * as XLSX from 'xlsx'
import {
  EQUIPOS_PERFORACION,
  EQUIPOS_SOPORTE,
  HITOS,
  HITO_LLEGADA,
  HITO_TERMINO_DOCUMENTOS,
} from './rdcConstantes'
import {
  bitacoraCompleta,
  esSalaElectrica,
  fmtHHMM,
  gruposCriticos,
  horaHito,
  minutosEntre,
  nombreDe,
  standbyRegistrados,
  textoWhatsapp,
  tiempoEfectivoMin,
  totalStandbyMin,
} from './rdcCalculos'

// ===========================================================================
// EL CONTRATO CON SHAREPOINT VIVE EN ESTE ARCHIVO.
//
// Lo que se manda al webhook de Power Automate no son los datos del reporte:
// es este libro de Excel, en base64. El flujo que genera el entregable en
// SharePoint depende de su forma — nombres y orden de las hojas, encabezados,
// número y posición de las columnas. Cambiar cualquiera de esas cosas rompe la
// entrega de la obra, no solo la aplicación.
//
// Está portado del RDC en producción (_construirWorkbookRDC en js/rdc.js).
// Antes de dar por buena cualquier modificación hay que hacer la prueba de
// equivalencia descrita en docs/MODELO_RDC.md §8.1: generar el mismo reporte
// con las dos aplicaciones y comparar hoja por hoja.
//
// Ojo con la hoja RDC: su número de columnas CAMBIA según el sector (el sector
// Sala Eléctrica agrega cinco de mano de obra indirecta antes de la última).
// Está pendiente confirmar si el flujo lee por encabezado o por posición; hasta
// saberlo se replica el orden exacto del original.
// ===========================================================================

const AZUL = '1D4ED8'
const VERDE_AZULADO = '0F766E'
const VIOLETA = '7C3AED'
const GRIS = '374151'
const VERDE = '15803D'
const ROJO = 'DC2626'

/** "2026-09-09" -> "09/09/2026", como TEXTO.
 *
 * A propósito no se manda como celda de fecha: SheetJS la convertiría a UTC y
 * en Perú eso corre el día. El RDC original toma la misma precaución. */
function fechaTexto(iso) {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${a}`
}

function pintarCabecera(hoja, encabezados, color, fila = 0) {
  encabezados.forEach((_, i) => {
    const ref = XLSX.utils.encode_cell({ r: fila, c: i })
    if (!hoja[ref]) return
    hoja[ref].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 10 },
      fill: { fgColor: { rgb: color } },
      alignment: { horizontal: 'center', wrapText: true },
    }
  })
}

const duracionHoras = (hi, hf) => {
  if (!hi || !hf) return ''
  const [h1, m1] = hi.split(':').map(Number)
  const [h2, m2] = hf.split(':').map(Number)
  const min = h2 * 60 + m2 - (h1 * 60 + m1)
  return min > 0 ? Math.round((min / 60) * 100) / 100 : ''
}

const rendimiento = (metrado, duracion, unidad) =>
  duracion && metrado ? `${Math.round((metrado / duracion) * 100) / 100} ${unidad}/h` : ''

const cantidadPersonal = (reporte, categoria) =>
  Number((reporte.personal ?? []).find((p) => p.categoria === categoria)?.cantidad) || 0

const cantidadMaquinaria = (reporte, tipo) =>
  (reporte.maquinaria ?? []).filter((m) => m.tipo === tipo).reduce((s, m) => s + (Number(m.cantidad) || 0), 0)

// ---------------------------------------------------------------------------
// Hoja RDC — una sola fila, horizontal
// ---------------------------------------------------------------------------
function filaRdc(reporte, catalogos) {
  const encabezados = []
  const valores = []
  const agregar = (encabezado, valor) => {
    encabezados.push(encabezado)
    valores.push(valor)
  }

  agregar('Fecha', fechaTexto(reporte.fecha))
  agregar('Sector', nombreDe(catalogos, 'sectores', reporte.sectorId))
  agregar('Frente', nombreDe(catalogos, 'frentes', reporte.frenteId))
  agregar('Capataz', nombreDe(catalogos, 'capataces', reporte.capatazId))
  agregar('Supervisor', nombreDe(catalogos, 'supervisores', reporte.supervisorId))

  agregar('N° Capataz', cantidadPersonal(reporte, 'Capataz'))
  agregar('N° Operarios', cantidadPersonal(reporte, 'Operario'))
  agregar('N° Oficiales', cantidadPersonal(reporte, 'Oficial'))
  agregar('N° Peones', cantidadPersonal(reporte, 'Peón'))
  agregar('N° Vigías', cantidadPersonal(reporte, 'Vigía'))

  HITOS.forEach((h) => agregar(h, horaHito(reporte, h)))

  agregar('Salida refrigerio', reporte.refrigerioSalida ?? '')
  agregar('Retorno refrigerio', reporte.refrigerioRetorno ?? '')

  EQUIPOS_PERFORACION.forEach((n) => agregar(n, cantidadMaquinaria(reporte, n)))
  EQUIPOS_SOPORTE.forEach((n) => agregar(n, cantidadMaquinaria(reporte, n)))

  // Dos columnas con el MISMO encabezado "Otro": la primera lleva el detalle
  // en texto y la segunda la suma. Así está en el original y así se replica.
  const fijos = new Set([...EQUIPOS_PERFORACION, ...EQUIPOS_SOPORTE])
  const otros = (reporte.maquinaria ?? []).filter((m) => !fijos.has(m.tipo))
  agregar('Otro', otros.map((m) => `${m.tipo} (${m.cantidad})`).join('; '))
  agregar('Otro', otros.reduce((s, m) => s + (Number(m.cantidad) || 0), 0))

  agregar('Observaciones', reporte.observaciones ?? '')
  agregar('Requerimientos', reporte.requerimientos ?? '')
  agregar('Restricciones', reporte.restricciones ?? '')
  agregar('Redline - Supervisor Hegatrux', nombreDe(catalogos, 'redlineSupervisores', reporte.redlineSupervisorId))
  agregar('Redline - Descripción', reporte.redlineDescripcion ?? '')

  if (esSalaElectrica(reporte, catalogos)) {
    agregar('Ingeniero residente', cantidadPersonal(reporte, 'Ingeniero residente'))
    agregar('Supervisor de campo', cantidadPersonal(reporte, 'Supervisor de campo'))
    agregar('Ingenieros de seguridad', cantidadPersonal(reporte, 'Ingeniero de seguridad'))
    agregar('Ingeniero de calidad', cantidadPersonal(reporte, 'Ingeniero de calidad'))
    agregar('Topógrafo', cantidadPersonal(reporte, 'Topógrafo'))
  }

  agregar('Total Standby (hh:mm)', fmtHHMM(totalStandbyMin(reporte)))

  return { encabezados, valores }
}

// ---------------------------------------------------------------------------
// Hoja METRADOS
// ---------------------------------------------------------------------------
function filasMetrados(reporte, catalogos) {
  const encabezados = ['Fecha', 'Frente', 'Bloque', 'Partida', 'Unidad', 'Metrado', 'Hora Inicio', 'Hora Fin', 'Duración (h)', 'Rendimiento', 'N° Pernos', 'Pernos/h']
  const f = fechaTexto(reporte.fecha)
  const fr = nombreDe(catalogos, 'frentes', reporte.frenteId)
  const filas = []

  // Los bloques 1 y 3 se exportan COMPLETOS, incluidas las partidas que
  // quedaron en cero: el consolidado de la obra espera siempre las mismas
  // filas. Por eso se recorre el catálogo y no lo que el reporte tenga.
  const bloqueEstandar = (bloque, etiqueta) => {
    ;(catalogos.partidasEstandar ?? [])
      .filter((p) => String(p.bloque) === bloque)
      .forEach((p) => {
        const m = (reporte.metrados ?? []).find((x) => x.partidaCodigo === p.codigo)
        const metrado = Number(m?.cantidad) || 0
        const hi = m?.horaInicio ?? ''
        const hf = m?.horaFin ?? ''
        const dur = duracionHoras(hi, hf)
        filas.push([f, fr, etiqueta, p.nombre, p.unidad, metrado, hi, hf, dur, rendimiento(metrado, dur, p.unidad), '', ''])
      })
  }

  bloqueEstandar('1', '1. Preliminares')

  gruposCriticos(reporte).forEach((g) => {
    const dur = duracionHoras(g.horaInicio, g.horaFin)
    const total = g.partida === 'Ensayos Pull Test' ? g.unidades : g.cantidad
    const nPernos = g.cuentaPernos ? g.unidades : ''
    const pernosHora = g.cuentaPernos && dur && g.unidades ? `${Math.round((g.unidades / dur) * 100) / 100} pernos/h` : ''
    filas.push([f, fr, '2. Críticas', g.partida, g.unidad, total, g.horaInicio, g.horaFin, dur, rendimiento(total, dur, g.unidad), nPernos, pernosHora])
  })

  bloqueEstandar('3', '3. Complementarias')

  ;(reporte.metrados ?? [])
    .filter((m) => m.bloque === 'libre')
    .forEach((m) => filas.push([f, fr, 'Libre', m.partidaNombre, m.unidad ?? '', Number(m.cantidad) || 0, '', '', '', '', '', '']))

  return { encabezados, filas }
}

// ---------------------------------------------------------------------------
// Hoja RECURSOS
// ---------------------------------------------------------------------------
function filasRecursos(reporte, catalogos) {
  const encabezados = ['Item', 'Descripción', 'Cantidad', 'Horas']
  const filas = []
  const efectivo = tiempoEfectivoMin(reporte)
  const horas = efectivo !== null ? Math.round((efectivo / 60) * 100) / 100 : ''

  const seccion = (titulo, items, siempre = false) => {
    const validos = siempre ? items : items.filter((it) => (Number(it.cant) || 0) > 0)
    if (!validos.length) return
    filas.push(['', titulo, '', ''])
    validos.forEach((it, i) => filas.push([i + 1, it.desc, Number(it.cant) || 0, horas]))
  }

  // La mano de obra directa se lista siempre, aunque esté en cero.
  seccion(
    'MANO DE OBRA DIRECTA',
    (reporte.personal ?? []).filter((p) => p.tipo === 'directa').map((p) => ({ desc: p.categoria, cant: p.cantidad })),
    true,
  )
  seccion(
    'MANO DE OBRA INDIRECTA',
    (reporte.personal ?? []).filter((p) => p.tipo === 'indirecta').map((p) => ({ desc: p.categoria, cant: p.cantidad })),
  )

  const porCategoria = (categoria) =>
    (reporte.maquinaria ?? []).filter((m) => m.categoria === categoria).map((m) => ({ desc: m.tipo, cant: m.cantidad }))
  seccion('EQUIPOS', porCategoria('perforacion'))
  seccion('MAQUINARIA', porCategoria('soporte'))

  return { encabezados, filas }
}

// ---------------------------------------------------------------------------
// Hoja BITACORA (y su tabla anexa de restricciones)
// ---------------------------------------------------------------------------
function filasBitacora(reporte, catalogos) {
  const encabezados = ['Fecha', 'Frente', 'Hora Inicio', 'Hora Fin', 'Actividad']
  const f = fechaTexto(reporte.fecha)
  const fr = nombreDe(catalogos, 'frentes', reporte.frenteId)

  const eventos = HITOS.map((h) => ({ hi: horaHito(reporte, h), hf: '', actividad: h }))
    .filter((e) => e.hi)
    .map((e) => ({ ...e, clave: e.hi }))

  bitacoraCompleta(reporte).forEach((e) => eventos.push({ hi: e.hi, hf: e.hf, actividad: e.texto, clave: e.hi || 'ZZ' }))
  eventos.sort((a, b) => String(a.clave).localeCompare(String(b.clave)))

  return { encabezados, filas: eventos.map((e) => [f, fr, e.hi || '', e.hf || '', e.actividad]) }
}

function filasRestricciones(reporte, catalogos) {
  const encabezados = ['Fecha', 'Frente', 'Descripción', 'Hora inicio', 'Hora fin']
  const filas = reporte.restriccionAcceso
    ? [[
        fechaTexto(reporte.fecha),
        nombreDe(catalogos, 'frentes', reporte.frenteId),
        reporte.restriccionDescripcion?.trim() ?? '',
        reporte.restriccionInicio ?? '',
        reporte.restriccionFin ?? '',
      ]]
    : []
  return { encabezados, filas }
}

// ---------------------------------------------------------------------------
// Hoja CONTROL_SOSTENIMIENTO
// ---------------------------------------------------------------------------
function filasControl(reporte, catalogos) {
  const encabezados = ['Fecha', 'Frente', 'Sistema', 'Zona de Sistema', 'Elemento', 'Tipo', 'Actividad', 'Código', 'Ubicación', 'Longitud', 'Ancho', 'Largo', 'Área (M2)', 'Unidad', 'Diámetro (mm)', 'Ángulo', 'Plano', 'Perforadora', 'Hora Inicio', 'Hora Fin', 'Capataz', 'Supervisor']

  const f = fechaTexto(reporte.fecha)
  const fr = nombreDe(catalogos, 'frentes', reporte.frenteId)
  const capataz = nombreDe(catalogos, 'capataces', reporte.capatazId)
  const supervisor = nombreDe(catalogos, 'supervisores', reporte.supervisorId)

  const filas = (reporte.elementos ?? []).map((c) => {
    // La biblioteca de pernos es la única fuente de la columna Ángulo, y el
    // respaldo de Diámetro y Plano cuando el supervisor no los completó.
    const lib = (catalogos.pernos ?? []).find((p) => p.frente_id === reporte.frenteId && p.codigo === c.codigo)
    const area = c.ancho && c.largo ? Math.round(Number(c.ancho) * Number(c.largo) * 1000) / 1000 : ''
    return [
      f,
      fr,
      c.sistema ?? '',
      c.zona ?? '',
      c.elemento ?? '',
      c.tipo ?? '',
      c.actividad ?? '',
      c.codigo ?? '',
      c.ubicacion ?? '',
      c.unidad === 'ML' && c.cantidad !== '' && c.cantidad !== undefined ? c.cantidad : '',
      c.ancho ?? '',
      c.largo ?? '',
      area,
      c.unidad ?? '',
      c.diametro || lib?.diametro || '',
      lib?.angulo ?? '',
      c.plano || lib?.plano || '',
      c.tipoPerforadora ?? '',
      c.horaInicio ?? '',
      c.horaFin ?? '',
      capataz,
      supervisor,
    ]
  })

  return { encabezados, filas }
}

// ---------------------------------------------------------------------------
// Hoja STAND_BY
// ---------------------------------------------------------------------------
function filasStandBy(reporte, catalogos) {
  const encabezados = ['Item', 'Fecha', 'Frente', 'Actividad afectada', 'Desde', 'Hasta', 'Total (hh:mm)', 'Total (decimal)', 'Total (min)', 'Causa', 'Responsable de la liberación', 'Capataz', 'Operarios', 'Oficiales', 'Peones', 'Vigías', 'Total cuadrilla afectada', 'Comentarios']

  // Dos paradas que no se registran a mano pero se exportan igual: la
  // restricción de acceso al frente, y el tiempo de papeleo entre la llegada y
  // el término del llenado de documentos.
  const sinteticas = []
  if (reporte.restriccionAcceso) {
    sinteticas.push({
      actividad: 'Restricción de acceso al frente',
      desde: reporte.restriccionInicio ?? '',
      hasta: reporte.restriccionFin ?? '',
      minutos: minutosEntre(reporte.restriccionInicio, reporte.restriccionFin, reporte),
      causa: 'Restricción de acceso',
      responsable: '',
      comentario: reporte.restriccionDescripcion ?? '',
    })
  }
  const llegada = horaHito(reporte, HITO_LLEGADA)
  const terminoDocs = horaHito(reporte, HITO_TERMINO_DOCUMENTOS)
  if (llegada && terminoDocs) {
    sinteticas.push({
      actividad: 'Registro documentario',
      desde: llegada,
      hasta: terminoDocs,
      minutos: minutosEntre(llegada, terminoDocs, reporte),
      causa: 'Registro documentario',
      responsable: '',
      comentario: '',
    })
  }

  const registros = [
    ...sinteticas.map((r, i) => ({ ...r, item: i + 1 })),
    ...standbyRegistrados(reporte).map((r, i) => ({ ...r, item: sinteticas.length + i + 1 })),
  ]

  const cuadrilla = {
    capataz: cantidadPersonal(reporte, 'Capataz'),
    operarios: cantidadPersonal(reporte, 'Operario'),
    oficiales: cantidadPersonal(reporte, 'Oficial'),
    peones: cantidadPersonal(reporte, 'Peón'),
    vigias: cantidadPersonal(reporte, 'Vigía'),
  }
  cuadrilla.total = cuadrilla.capataz + cuadrilla.operarios + cuadrilla.oficiales + cuadrilla.peones + cuadrilla.vigias

  const f = fechaTexto(reporte.fecha)
  const fr = nombreDe(catalogos, 'frentes', reporte.frenteId)

  const filas = registros.map((r) => [
    r.item,
    f,
    fr,
    r.actividad,
    r.desde,
    r.hasta,
    r.minutos !== null ? fmtHHMM(r.minutos) : '',
    r.minutos !== null ? Math.round((r.minutos / 60) * 100) / 100 : '',
    r.minutos !== null ? r.minutos : '',
    r.causa,
    r.responsable ?? '',
    cuadrilla.capataz,
    cuadrilla.operarios,
    cuadrilla.oficiales,
    cuadrilla.peones,
    cuadrilla.vigias,
    cuadrilla.total,
    r.comentario ?? '',
  ])

  return { encabezados, filas }
}

// ---------------------------------------------------------------------------
// Hoja REPORTE_WSP — el texto de WhatsApp, línea por línea
// ---------------------------------------------------------------------------
function filasWsp(reporte, catalogos) {
  const texto = textoWhatsapp(reporte, catalogos)
  const lineas = texto ? texto.split('\n').map((l) => [l]) : [['Sin datos']]

  lineas.push([''])
  lineas.push(['--- RESUMEN DE JORNADA ---'])
  HITOS.forEach((h) => {
    const hora = horaHito(reporte, h)
    if (hora) lineas.push([`${h}: ${hora}`])
  })
  if (reporte.refrigerioSalida) lineas.push([`Salida a refrigerio: ${reporte.refrigerioSalida}`])
  if (reporte.refrigerioRetorno) lineas.push([`Retorno de refrigerio: ${reporte.refrigerioRetorno}`])
  if (reporte.restriccionAcceso) {
    const rango = reporte.restriccionInicio && reporte.restriccionFin ? `${reporte.restriccionInicio} - ${reporte.restriccionFin}` : ''
    const desc = reporte.restriccionDescripcion ? ` (${reporte.restriccionDescripcion})` : ''
    lineas.push([`Restricción de acceso: ${rango}${desc}`])
  }

  // El reporte completo repetido en una sola celda, para poder copiarlo de un
  // tirón desde el Excel.
  lineas.push([''])
  lineas.push(['--- RESUMEN COMPLETO (celda única) ---'])
  lineas.push([texto])

  return lineas
}

// ---------------------------------------------------------------------------
// Armado del libro
// ---------------------------------------------------------------------------

/** Nombre del archivo tal como lo espera SharePoint: "{frente}_{fecha}.xlsx".
 * Una corrección lleva "(C)" para que quede junto al original y se distinga a
 * simple vista cuál es cuál. */
export function nombreArchivo(reporte, catalogos) {
  const frente = nombreDe(catalogos, 'frentes', reporte.frenteId)
  return `${frente}_${reporte.fecha}${reporte.esCorreccion ? '(C)' : ''}.xlsx`
}

export function construirWorkbook(reporte, catalogos, { telemetria = null } = {}) {
  const libro = XLSX.utils.book_new()

  // --- RDC ---
  const { encabezados, valores } = filaRdc(reporte, catalogos)
  const hojaRdc = XLSX.utils.aoa_to_sheet([encabezados, valores])
  hojaRdc['!cols'] = encabezados.map((h, i) => ({
    wch: Math.min(Math.max(h.length, String(valores[i] ?? '').length, 8), 40),
  }))
  pintarCabecera(hojaRdc, encabezados, AZUL)
  XLSX.utils.book_append_sheet(libro, hojaRdc, 'RDC')

  // --- METRADOS ---
  const met = filasMetrados(reporte, catalogos)
  const hojaMet = XLSX.utils.aoa_to_sheet([met.encabezados, ...met.filas])
  hojaMet['!cols'] = [12, 16, 14, 55, 8, 10, 11, 11, 12, 18, 10, 14].map((wch) => ({ wch }))
  pintarCabecera(hojaMet, met.encabezados, VERDE_AZULADO)
  XLSX.utils.book_append_sheet(libro, hojaMet, 'METRADOS')

  // --- RECURSOS ---
  const rec = filasRecursos(reporte, catalogos)
  const hojaRec = XLSX.utils.aoa_to_sheet([rec.encabezados, ...rec.filas])
  hojaRec['!cols'] = [8, 40, 12, 10].map((wch) => ({ wch }))
  pintarCabecera(hojaRec, rec.encabezados, VIOLETA)
  // Las filas de título de sección (Item vacío, texto en Descripción) van
  // resaltadas, igual que en el original.
  rec.filas.forEach((fila, r) => {
    if (fila[0] === '' && fila[1] && fila[2] === '' && fila[3] === '') {
      for (let c = 0; c < 4; c++) {
        const ref = XLSX.utils.encode_cell({ r: r + 1, c })
        if (!hojaRec[ref]) hojaRec[ref] = { t: 's', v: '' }
        hojaRec[ref].s = { font: { bold: true, color: { rgb: '5B21B6' }, name: 'Arial', sz: 10 }, fill: { fgColor: { rgb: 'EDE9FE' } } }
      }
    }
  })
  XLSX.utils.book_append_sheet(libro, hojaRec, 'RECURSOS')

  // --- BITACORA (+ tabla de restricciones debajo) ---
  const bit = filasBitacora(reporte, catalogos)
  const hojaBit = XLSX.utils.aoa_to_sheet([bit.encabezados, ...bit.filas])
  hojaBit['!cols'] = [12, 16, 10, 10, 60].map((wch) => ({ wch }))
  pintarCabecera(hojaBit, bit.encabezados, GRIS)
  bit.filas.forEach((_, r) => {
    const ref = XLSX.utils.encode_cell({ r: r + 1, c: 4 })
    if (hojaBit[ref]) hojaBit[ref].s = { alignment: { wrapText: true, vertical: 'top' } }
  })

  // Dos filas en blanco de separación antes de la tabla anexa.
  const res = filasRestricciones(reporte, catalogos)
  const filaInicioRestricciones = bit.filas.length + 3
  XLSX.utils.sheet_add_aoa(hojaBit, [res.encabezados, ...res.filas], { origin: { r: filaInicioRestricciones, c: 0 } })
  pintarCabecera(hojaBit, res.encabezados, GRIS, filaInicioRestricciones)
  XLSX.utils.book_append_sheet(libro, hojaBit, 'BITACORA')

  // --- CONTROL_SOSTENIMIENTO ---
  const ctrl = filasControl(reporte, catalogos)
  const hojaCtrl = XLSX.utils.aoa_to_sheet([ctrl.encabezados, ...ctrl.filas])
  hojaCtrl['!cols'] = [12, 20, 10, 14, 10, 16, 14, 20, 12, 10, 8, 8, 10, 8, 12, 10, 10, 12, 12, 12, 16, 16].map((wch) => ({ wch }))
  pintarCabecera(hojaCtrl, ctrl.encabezados, VERDE)
  XLSX.utils.book_append_sheet(libro, hojaCtrl, 'CONTROL_SOSTENIMIENTO')

  // --- STAND_BY ---
  const sb = filasStandBy(reporte, catalogos)
  const hojaSb = XLSX.utils.aoa_to_sheet([sb.encabezados, ...sb.filas])
  hojaSb['!cols'] = [6, 12, 18, 36, 8, 8, 12, 10, 10, 24, 20, 8, 10, 10, 8, 8, 10, 40].map((wch) => ({ wch }))
  pintarCabecera(hojaSb, sb.encabezados, ROJO)
  XLSX.utils.book_append_sheet(libro, hojaSb, 'STAND_BY')

  // --- REPORTE_WSP ---
  const wsp = filasWsp(reporte, catalogos)
  const hojaWsp = XLSX.utils.aoa_to_sheet(wsp)
  hojaWsp['!cols'] = [{ wch: 95 }]
  wsp.forEach((_, r) => {
    const ref = XLSX.utils.encode_cell({ r, c: 0 })
    if (hojaWsp[ref]) hojaWsp[ref].s = { alignment: { wrapText: true, vertical: 'top' }, font: { name: 'Arial', sz: 10 } }
  })
  XLSX.utils.book_append_sheet(libro, hojaWsp, 'REPORTE_WSP')

  // --- TELEMETRIA (oculta) ---
  agregarTelemetria(libro, reporte, telemetria)

  return libro
}

/** Hoja oculta con el tiempo que tomó llenar el reporte. Se conserva porque
 * forma parte del archivo que la obra ya recibe; si en algún momento se
 * decide quitarla, es un cambio del contrato y hay que tratarlo como tal. */
function agregarTelemetria(libro, reporte, telemetria) {
  const inicio = new Date(reporte.creadoEnDispositivo)
  const fin = new Date()
  const segundos = Math.max(0, Math.round((fin - inicio) / 1000))

  const encabezados = ['Pestaña', 'Hora entrada', 'Hora salida', 'Tiempo (seg)']
  const filas = (telemetria ?? []).map((t) => [t.tab, t.entrada, t.salida, t.seg])
  filas.push(['TOTAL', inicio.toTimeString().slice(0, 8), fin.toTimeString().slice(0, 8), segundos])
  filas.push(['', '', 'Total minutos', `${Math.floor(segundos / 60)} min ${segundos % 60} seg`])

  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas])
  hoja['!cols'] = [14, 14, 14, 14].map((wch) => ({ wch }))
  encabezados.forEach((_, i) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: i })
    if (hoja[ref]) hoja[ref].s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '555555' } }, alignment: { horizontal: 'center' } }
  })
  hoja[XLSX.utils.encode_cell({ r: 0, c: 4 })] = { v: 'Versión app: Sistema', t: 's', s: { font: { sz: 8, color: { rgb: 'AAAAAA' } } } }
  if (!hoja['!ref']) hoja['!ref'] = `A1:E${filas.length + 1}`

  XLSX.utils.book_append_sheet(libro, hoja, 'TELEMETRIA')
  if (!libro.Workbook) libro.Workbook = {}
  if (!libro.Workbook.Sheets) libro.Workbook.Sheets = []
  const i = libro.SheetNames.indexOf('TELEMETRIA')
  if (i >= 0) {
    libro.Workbook.Sheets[i] = { ...(libro.Workbook.Sheets[i] ?? {}), Hidden: 1 }
  }
}

export const workbookABase64 = (libro) => XLSX.write(libro, { bookType: 'xlsx', type: 'base64', cellStyles: true })

/** Descarga local del Excel, el "Descargar mi copia" que los supervisores ya
 * usan como respaldo antes de enviar sin señal. */
export function descargarWorkbook(reporte, catalogos, opciones) {
  const libro = construirWorkbook(reporte, catalogos, opciones)
  XLSX.writeFile(libro, nombreArchivo(reporte, catalogos), { cellStyles: true })
}

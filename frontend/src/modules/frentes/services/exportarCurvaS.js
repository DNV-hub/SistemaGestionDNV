// Lienzo 6 · "Exportar curva S a Excel": un .xlsx con el gráfico nativo de
// Excel (programado, ejecutado y banda −3 / +6) y todos los datos con que se
// calcula: datos diarios, partidas con ratio HH/und, HH, peso y HH ganadas,
// cortes semanales y revisiones de la línea base. Las columnas calculadas van
// como fórmulas para que el Excel se pueda auditar.
import { CHART_CURVA_S, DRAWING_CURVA_S } from './plantillas/curvaSChart'
import { semanaDe } from './controlObraService'

const n = (v) => ({ t: 'n', v: Number(v) || 0 })
const p = (v) => ({ t: 'n', v: Number(v) || 0, z: '0.0%' })
const f = (formula, z) => ({ t: 'n', f: formula, ...(z ? { z } : {}) })
const s = (v) => ({ t: 's', v: v == null ? '' : String(v) })
const d = (iso) => ({ t: 'd', v: new Date(`${iso}T12:00:00Z`), z: 'dd/mm/yyyy' })

/**
 * @param {object} o
 *  frente, puntos[{fecha, programado_pct, ejecutado_pct}], partidasVig[{edt,nombre,unidad,q,ratio,acum}],
 *  revs[], param{tol_inf, tol_sup, alerta_desde}, fechaDato,
 *  extra[{nombre, filas, anchos}] (opcional), nombreArchivo (opcional)
 */
export async function exportarCurvaS(o) {
  const out = await construirCurvaSXlsx(o)
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (o.nombreArchivo || `${o.frente}_CurvaS_${o.fechaDato}.xlsx`).replace(/\s+/g, '_')
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function construirCurvaSXlsx(o) {
  const XLSX = await import('xlsx')
  const tolI = Number(o.param?.tol_inf ?? -3) / 100
  const tolS = Number(o.param?.tol_sup ?? 6) / 100
  const ale = Number(o.param?.alerta_desde ?? 4) / 100
  const wb = XLSX.utils.book_new()
  const estado = (c) => `IF(${c}="","",IF(OR(${c}<${tolI},${c}>${tolS}),"Crítico: ajustar curva",IF(${c}>${ale},"Alerta","Dentro de banda")))`

  // Datos diarios
  const dd = [['Fecha', 'Semana', 'Programado %', 'Ejecutado %', 'Desviación', 'Banda inferior', 'Banda superior', 'Estado'].map(s)]
  o.puntos.forEach((pt, i) => {
    const r = i + 2
    const ej = pt.ejecutado_pct != null
    dd.push([d(pt.fecha), s(semanaDe(pt.fecha).clave), p(pt.programado_pct / 100), ej ? p(pt.ejecutado_pct / 100) : s(''),
      ej ? f(`D${r}-C${r}`, '0.0%') : s(''), f(`MAX(0,C${r}${tolI < 0 ? '' : '+'}${tolI})`, '0.0%'), f(`MIN(1,C${r}+${tolS})`, '0.0%'), ej ? { t: 's', f: estado(`E${r}`) } : s('')])
  })
  const N = o.puntos.length + 1
  const wsD = XLSX.utils.aoa_to_sheet(dd); wsD['!cols'] = [12, 9, 13, 13, 12, 13, 13, 22].map((w) => ({ wch: w }))

  // Partidas
  const pa = [['EDT', 'Partida', 'Und', 'Metrado vigente', 'Ratio HH/und', 'HH', 'Peso %', 'Acumulado aprobado', '% avance', 'HH ganadas'].map(s)]
  const P = o.partidasVig.length + 2
  o.partidasVig.forEach((x, i) => {
    const r = i + 2
    pa.push([s(x.edt), s(x.nombre), s(x.unidad), n(x.q), { t: 'n', v: Number(x.ratio) || 0, z: '#,##0.000' }, f(`D${r}*E${r}`, '#,##0.0'), f(`IF($F$${P}=0,0,F${r}/$F$${P})`, '0.0%'),
      n(x.acum), f(`IF(D${r}=0,0,MIN(H${r}/D${r},1))`, '0.0%'), f(`I${r}*F${r}`, '#,##0.0')])
  })
  pa.push([s(''), s('Total'), s(''), s(''), s(''), f(`SUM(F2:F${P - 1})`, '#,##0.0'), f(`SUM(G2:G${P - 1})`, '0.0%'), s(''), f(`IF(F${P}=0,0,J${P}/F${P})`, '0.0%'), f(`SUM(J2:J${P - 1})`, '#,##0.0')])
  pa.push([s('')], [s('Metrado vigente = plano constructivo o redline aprobado. Ratio = HH por unidad vigente (Rev00 o última revisión). Avance ponderado = HH ganadas / HH total. Las partidas adicionales no aprobadas por el cliente no entran.')])
  const wsP = XLSX.utils.aoa_to_sheet(pa); wsP['!cols'] = [8, 52, 7, 15, 13, 12, 10, 17, 10, 13].map((w) => ({ wch: w }))

  // Cortes semanales (miércoles o fecha de dato)
  const cortes = []
  const vistos = new Set()
  for (const pt of o.puntos) {
    const w = semanaDe(pt.fecha)
    if (vistos.has(w.clave)) continue
    const conDato = o.puntos.filter((x) => x.fecha >= w.desde && x.fecha <= w.hasta && x.ejecutado_pct != null)
    if (!conDato.length) continue
    vistos.add(w.clave)
    cortes.push({ clave: w.clave, fecha: conDato[conDato.length - 1].fecha })
  }
  const cs = [['Semana', 'Corte', 'Programado %', 'Ejecutado %', 'Desviación', 'Criterio de Planeamiento'].map(s)]
  cortes.forEach((c, i) => {
    const r = i + 2
    cs.push([s(c.clave), d(c.fecha), f(`INDEX('Datos diarios'!$C$2:$C$${N},MATCH(B${r},'Datos diarios'!$A$2:$A$${N},0))`, '0.0%'),
      f(`INDEX('Datos diarios'!$D$2:$D$${N},MATCH(B${r},'Datos diarios'!$A$2:$A$${N},0))`, '0.0%'), f(`D${r}-C${r}`, '0.0%'),
      { t: 's', f: `IF(E${r}>${tolS},"Crítico +: ajustar ratios y HH",IF(E${r}<${tolI},"Crítico −: ajustar y alertar al jefe de frente",IF(E${r}>${ale},"Alerta: vigilar","Dentro de banda: sin ajustes")))` }])
  })
  const wsC = XLSX.utils.aoa_to_sheet(cs); wsC['!cols'] = [10, 14, 13, 13, 12, 46].map((w) => ({ wch: w }))

  // Ajustes (revisiones de la línea base)
  const aj = [['Fecha', 'Revisión', 'Partida', 'Ratio anterior', 'Ratio nuevo', 'Desviación antes', 'Desviación después', 'Motivo'].map(s)]
  if (o.revs?.length) o.revs.forEach((r) => aj.push([d(r.created_at.slice(0, 10)), s(r.rev), s(r.edt), n(r.ratio_anterior), n(r.ratio_nuevo), r.desviacion_antes == null ? s('') : n(r.desviacion_antes), r.desviacion_despues == null ? s('') : n(r.desviacion_despues), s(r.motivo)]))
  else aj.push([s('Sin ajustes registrados: la curva vigente es la Rev00.')])
  const wsA = XLSX.utils.aoa_to_sheet(aj); wsA['!cols'] = [12, 10, 10, 13, 12, 15, 16, 50].map((w) => ({ wch: w }))

  // Portada con el gráfico y el resumen al dato
  const cv = [
    [s(`${o.frente} · Curva S avance ponderado por HH`)],
    [s(`Fechas del cronograma Rev00 · metrados del plano constructivo o redline aprobado · ejecutado = avance aprobado · fecha de dato ${o.fechaDato.split('-').reverse().join('/')}`)],
    [s(`Banda de control ${o.param?.tol_inf ?? -3} % / +${o.param?.tol_sup ?? 6} % (alerta desde +${o.param?.alerta_desde ?? 4} %). Fuente: Sistema DNV.`)],
  ]
  for (let i = 0; i < 24; i++) cv.push([s('')])
  cv.push([s('Indicador'), s('Valor')])
  const r0 = cv.length + 1
  cv.push([s('Fecha de dato'), d(o.fechaDato)])
  cv.push([s('Programado al dato'), f(`INDEX('Datos diarios'!C2:C${N},MATCH(B${r0},'Datos diarios'!A2:A${N},0))`, '0.0%')])
  cv.push([s('Ejecutado al dato'), f(`INDEX('Datos diarios'!D2:D${N},MATCH(B${r0},'Datos diarios'!A2:A${N},0))`, '0.0%')])
  cv.push([s('Desviación'), f(`B${r0 + 2}-B${r0 + 1}`, '0.0%')])
  cv.push([s('Estado'), { t: 's', f: estado(`B${r0 + 3}`) }])
  const wsV = XLSX.utils.aoa_to_sheet(cv); wsV['!cols'] = [{ wch: 24 }, { wch: 22 }]

  XLSX.utils.book_append_sheet(wb, wsV, 'Curva S')
  XLSX.utils.book_append_sheet(wb, wsD, 'Datos diarios')
  XLSX.utils.book_append_sheet(wb, wsP, 'Partidas')
  XLSX.utils.book_append_sheet(wb, wsC, 'Cortes semanales')
  XLSX.utils.book_append_sheet(wb, wsA, 'Ajustes')
  // "Exportar semana a Excel" agrega aquí sus hojas (resumen, metrados, Stand By, fuerza laboral)
  for (const h of o.extra ?? []) {
    const ws = XLSX.utils.json_to_sheet(h.filas)
    if (h.anchos) ws['!cols'] = h.anchos.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31))
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true })

  // Inyecta el gráfico nativo en la hoja "Curva S" (sheet1)
  const CFB = XLSX.CFB || XLSX.default?.CFB
  const z = CFB.read(new Uint8Array(buf), { type: 'array' })
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const leer = (ruta) => { const e = CFB.find(z, ruta); return e ? dec.decode(e.content) : null }
  const poner = (ruta, txt) => { const e = CFB.find(z, ruta); if (e) e.content = enc.encode(txt); else CFB.utils.cfb_add(z, ruta, enc.encode(txt)) }
  const titulo = `Curva S · ${o.frente}`.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  poner('/xl/charts/chart1.xml', CHART_CURVA_S.replaceAll('__N__', String(N)).replace('__TITULO__', titulo))
  poner('/xl/drawings/drawing1.xml', DRAWING_CURVA_S)
  poner('/xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>')
  const relsRuta = '/xl/worksheets/_rels/sheet1.xml.rels'
  const rels = leer(relsRuta)
  const relGraf = '<Relationship Id="rIdGraf1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
  poner(relsRuta, rels ? rels.replace('</Relationships>', `${relGraf}</Relationships>`) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relGraf}</Relationships>`)
  let hoja = leer('/xl/worksheets/sheet1.xml')
  if (!hoja.includes('xmlns:r=')) hoja = hoja.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ')
  hoja = hoja.replace('</worksheet>', '<drawing r:id="rIdGraf1"/></worksheet>')
  poner('/xl/worksheets/sheet1.xml', hoja)
  let ct = leer('/[Content_Types].xml')
  ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>')
  poner('/[Content_Types].xml', ct)
  return CFB.write(z, { fileType: 'zip', type: 'array' })
}

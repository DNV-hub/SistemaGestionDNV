import { descargarExcel } from '../../../utils/exportarExcel'

// Reporte "Salidas por frente": lo usan la pantalla Reportes y la pestaña
// Salidas de Almacén, para que los dos den exactamente los mismos números.
//
// Responde "¿cuánto se usó de cada material en este frente?": una fila por
// frente + material, con lo entregado y lo devuelto (solo devoluciones ya
// RECIBIDAS; las pendientes o rechazadas no se restan). Agrupar por supervisor
// partía el mismo material en varias filas y, si la devolución quedaba bajo otro
// supervisor, no encontraba con qué restar. El detalle por entrega (con fecha
// y supervisor) va aparte, para la segunda hoja del Excel.
export async function armarReporteSalidas(reportes, filtros) {
  const [salidas, devoluciones] = await Promise.all([
    reportes.obtenerSalidasPorFrente(filtros),
    reportes.obtenerDevolucionesPorFrente(filtros),
  ])

  const detalle = salidas
    .map((s) => ({
      fecha: s.fecha,
      frente: `${s.frentes?.codigo ?? '—'} — ${s.frentes?.nombre ?? '—'}`,
      contrato: s.contratos?.nombre ?? '—',
      material: s.materiales?.descripcion ?? '—',
      unidad: s.materiales?.unidad ?? '',
      cantidad: Number(s.cantidad),
      // Quien pidió el vale; una salida directa (sin vale) no tiene supervisor.
      supervisor: s.vale_detalle?.vales?.usuarios?.nombre ?? '— (salida directa)',
    }))
    .sort((a, b) => a.frente.localeCompare(b.frente) || a.fecha.localeCompare(b.fecha) || a.material.localeCompare(b.material))

  const porGrupo = new Map()
  function filaDe(frenteId, materialId, datos) {
    const clave = `${frenteId}:${materialId}`
    if (!porGrupo.has(clave)) porGrupo.set(clave, { entregado: 0, devuelto: 0, ...datos })
    return porGrupo.get(clave)
  }

  for (const s of salidas) {
    const fila = filaDe(s.frentes?.id, s.materiales?.id, {
      frenteCodigo: s.frentes?.codigo ?? '—',
      frenteNombre: s.frentes?.nombre ?? '—',
      contrato: s.contratos?.nombre ?? '—',
      descripcion: s.materiales?.descripcion ?? '—',
      unidad: s.materiales?.unidad ?? '',
    })
    fila.entregado += Number(s.cantidad)
  }
  for (const d of devoluciones) {
    // Lo normal es que la fila ya exista (creada arriba desde una salida de ese
    // mismo frente+material). Si no —se devolvió algo que no tuvo salida en este
    // rango— se crea igual con los datos de la devolución, para que la resta
    // nunca se pierda en silencio.
    const fila = filaDe(d.frente_id, d.material_id, {
      frenteCodigo: d.frentes?.codigo ?? '—',
      frenteNombre: d.frentes?.nombre ?? '—',
      contrato: '—',
      descripcion: d.materiales?.descripcion ?? '—',
      unidad: d.materiales?.unidad ?? '',
    })
    fila.devuelto += Number(d.cantidad)
  }

  const filas = [...porGrupo.values()]
    .map((f) => ({ ...f, neto: f.entregado - f.devuelto }))
    .sort((a, b) => a.frenteCodigo.localeCompare(b.frenteCodigo) || a.descripcion.localeCompare(b.descripcion))

  return { filas, detalle }
}

export function descargarReporteSalidas({ filas, detalle }, filtros) {
  descargarExcel(`salidas_por_frente_${filtros.desde || 'inicio'}_${filtros.hasta || 'hoy'}.xlsx`, [
    {
      nombre: 'Salidas por frente',
      filas: filas.map((f) => ({
        Frente: `${f.frenteCodigo} — ${f.frenteNombre}`,
        Contrato: f.contrato,
        Material: f.descripcion,
        Unidad: f.unidad,
        Entregado: f.entregado,
        Devuelto: f.devuelto,
        'Neto (consumo real)': f.neto,
      })),
    },
    {
      nombre: 'Detalle de salidas',
      filas: detalle.map((d) => ({
        'Fecha de salida': d.fecha,
        Frente: d.frente,
        Contrato: d.contrato,
        Material: d.material,
        Unidad: d.unidad,
        Cantidad: d.cantidad,
        Supervisor: d.supervisor,
      })),
    },
  ])
}

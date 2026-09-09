import * as XLSX from 'xlsx'

// Mismo criterio que catalogo/utils/importarExcel.js: encabezados alias
// normalizados (mayúsculas, sin tildes, un solo espacio).
const ALIAS_CAMPOS = {
  CODIGO: 'codigo',
  'CODIGO ALMACEN': 'codigo',
  CANTIDAD: 'cantidad',
  CONTRATO: 'contrato',
  DOCUMENTO: 'documento_referencia',
  'DOCUMENTO DE REFERENCIA': 'documento_referencia',
  PROVEEDOR: 'proveedor',
  OBSERVACION: 'observacion',
  OBSERVACIONES: 'observacion',
}

function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarTexto(valor) {
  return String(valor ?? '').trim()
}

/** Lee un archivo .xlsx/.xls/.csv de stock actual: CODIGO, CANTIDAD y columnas opcionales. */
export async function leerArchivoIngresos(file) {
  const buffer = await file.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false })

  return filas.map((fila, idx) => {
    const registro = { _fila: idx + 2 }
    for (const [encabezado, valor] of Object.entries(fila)) {
      const campo = ALIAS_CAMPOS[normalizarEncabezado(encabezado)]
      if (!campo) continue
      registro[campo] = normalizarTexto(valor)
    }
    return registro
  })
}

/**
 * Valida cada fila contra el catálogo ya cargado (el material tiene que
 * existir de antes: esto carga cantidades, no crea materiales) y resuelve
 * material_id para el insert. El contrato es opcional por fila: si el
 * archivo trae columna CONTRATO se usa esa (nombre o código, ej. "Contrato
 * Marco" o "MARCO"); si una fila no la trae, cae al contrato elegido una
 * sola vez en el modal para todo el lote.
 */
export function procesarFilasIngreso(filasCrudas, { materialesActivos, contratosDisponibles, contratoIdPorDefecto }) {
  const materialesPorCodigo = new Map(materialesActivos.map((m) => [m.codigo.toLowerCase(), m]))
  const contratosPorClave = new Map(
    contratosDisponibles.flatMap((c) => [
      [c.nombre.toLowerCase(), c],
      [c.codigo.toLowerCase(), c],
    ])
  )

  const filas = []
  filasCrudas.forEach((f) => {
    if (!f.codigo && !f.cantidad) return // fila vacía

    if (!f.codigo || !f.cantidad) {
      filas.push({ fila: f._fila, codigo: f.codigo || '—', estado: 'error', motivo: 'Falta código o cantidad.' })
      return
    }

    const cantidad = Number(f.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Cantidad inválida.' })
      return
    }

    const material = materialesPorCodigo.get(f.codigo.toLowerCase())
    if (!material) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'El código no existe en el catálogo.' })
      return
    }

    let contratoId = contratoIdPorDefecto
    let contratoNombre = contratosDisponibles.find((c) => c.id === contratoIdPorDefecto)?.nombre ?? null
    if (f.contrato) {
      const contrato = contratosPorClave.get(f.contrato.toLowerCase())
      if (!contrato) {
        filas.push({
          fila: f._fila,
          codigo: f.codigo,
          estado: 'error',
          motivo: `El contrato "${f.contrato}" no existe (usa el nombre o código exacto).`,
        })
        return
      }
      contratoId = contrato.id
      contratoNombre = contrato.nombre
    }

    filas.push({
      fila: f._fila,
      codigo: material.codigo,
      descripcion: material.descripcion,
      unidad: material.unidad,
      material_id: material.id,
      cantidad,
      contrato_id: contratoId,
      contrato_nombre: contratoNombre,
      documento_referencia: f.documento_referencia || null,
      proveedor: f.proveedor || null,
      observacion: f.observacion || null,
      estado: 'ok',
    })
  })

  return {
    total: filasCrudas.length,
    filas,
    aImportar: filas.filter((f) => f.estado === 'ok'),
    conError: filas.filter((f) => f.estado === 'error'),
  }
}

import * as XLSX from 'xlsx'
import { normalizarNumero } from '../../../utils/normalizarNumero'

// Mismo criterio que catalogo/utils/importarExcel.js: encabezados alias
// normalizados (mayúsculas, sin tildes, un solo espacio).
const ALIAS_CAMPOS = {
  CODIGO: 'codigo',
  'CODIGO ALMACEN': 'codigo',
  'DESCRIPCION ALMACEN': 'descripcion',
  DESCRIPCION: 'descripcion',
  'UNIDAD ALMACEN': 'unidad',
  UNIDAD: 'unidad',
  CANTIDAD: 'cantidad',
  ANCHO: 'ancho',
  LARGO: 'largo',
  CONTRATO: 'contrato',
  CONVERSION: 'conversion',
  CONVERSIÓN: 'conversion',
  DOCUMENTO: 'documento_referencia',
  'DOCUMENTO DE REFERENCIA': 'documento_referencia',
  PROVEEDOR: 'proveedor',
  OBSERVACION: 'observacion',
  OBSERVACIONES: 'observacion',
}

const VALORES_CONVERSION = new Set(['ninguna', 'area', 'longitud'])

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
 * El código de catálogo NO es la identidad de un material — es solo una
 * clasificación (se usa para agrupar en el reporte EDP). La identidad real
 * es el NOMBRE tal como lo escribe el almacenero: "Cable 15mm rojo, rollos
 * de 5m" y "Cable 15mm verde, rollos de 3m" pueden compartir código CA.15
 * sin ser el mismo material — cada uno es su propia fila de catálogo, con
 * su propio stock. Por eso cada fila se resuelve por DESCRIPCION, nunca
 * por CODIGO: si ya existe un material con ese nombre exacto, se reutiliza
 * (y de paso se verifica que el código coincida); si no existe, se crea
 * uno nuevo con el código, descripción, unidad y conversión de esa fila.
 * El contrato es opcional por fila: si el archivo trae columna CONTRATO se
 * usa esa (nombre o código, ej. "Contrato Marco" o "MARCO"); si una fila
 * no la trae, cae al contrato elegido una sola vez en el modal.
 */
export function procesarFilasIngreso(filasCrudas, { materialesActivos, contratosDisponibles, contratoIdPorDefecto }) {
  const materialesPorNombre = new Map(materialesActivos.map((m) => [m.descripcion.toUpperCase(), m]))
  const contratosPorClave = new Map(
    contratosDisponibles.flatMap((c) => [
      [c.nombre.toLowerCase(), c],
      [c.codigo.toLowerCase(), c],
    ])
  )

  const filas = []
  const materialesACrearPorNombre = new Map() // nombreEnMayus -> payload

  filasCrudas.forEach((f) => {
    if (!f.codigo && !f.cantidad) return // fila vacía

    if (!f.codigo || !f.cantidad) {
      filas.push({ fila: f._fila, codigo: f.codigo || '—', estado: 'error', motivo: 'Falta código o cantidad.' })
      return
    }
    if (!f.descripcion || !f.unidad) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Falta descripción o unidad.' })
      return
    }

    const cantidad = normalizarNumero(f.cantidad)
    if (!cantidad || cantidad <= 0) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Cantidad inválida.' })
      return
    }

    const nombreClave = f.descripcion.toUpperCase()
    const material = materialesPorNombre.get(nombreClave)

    let materialId = null
    let materialPendienteClave = null
    let tipoConversion

    if (material) {
      materialId = material.id
      tipoConversion = material.tipo_conversion ?? 'ninguna'
    } else {
      const conversionDeArchivo = normalizarEncabezado(f.conversion || '').toLowerCase()
      tipoConversion = VALORES_CONVERSION.has(conversionDeArchivo) ? conversionDeArchivo : 'ninguna'
      materialPendienteClave = nombreClave
      if (!materialesACrearPorNombre.has(nombreClave)) {
        materialesACrearPorNombre.set(nombreClave, {
          codigo: f.codigo,
          descripcion: f.descripcion.toUpperCase(),
          unidad: f.unidad,
          tipo_conversion: tipoConversion,
        })
      }
    }

    const ancho = f.ancho ? normalizarNumero(f.ancho) : null
    const largo = f.largo ? normalizarNumero(f.largo) : null
    if (tipoConversion === 'area' && (!ancho || !largo)) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Este material necesita ANCHO y LARGO del rollo.' })
      return
    }
    if (tipoConversion === 'longitud' && !largo) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Este material necesita LARGO.' })
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
      codigo: f.codigo,
      descripcion: f.descripcion,
      unidad: f.unidad,
      material_id: materialId,
      materialPendienteClave,
      cantidad,
      ancho: tipoConversion === 'area' ? ancho : null,
      largo: tipoConversion !== 'ninguna' ? largo : null,
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
    materialesACrear: [...materialesACrearPorNombre.values()],
  }
}

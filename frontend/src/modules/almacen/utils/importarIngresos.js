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

  // La planilla de stock que se mantiene al día (con nombres completos,
  // dimensiones incluidas) suele ser más confiable que la descripción que
  // el material tenía en el catálogo desde que se creó — si el Excel trae
  // DESCRIPCION ALMACEN/UNIDAD ALMACEN y no coincide, se corrige el
  // catálogo de una vez con este mismo import.
  //
  // OJO: un mismo código puede aparecer en varias filas con LARGO/ANCHO
  // distintos (rollos/barras de distinto tamaño) y cada fila trae su propia
  // descripción con esa medida adentro del texto (ej. "L=03m", "L=04m").
  // El catálogo solo tiene UN campo descripción por material — no hay forma
  // de que sea "correcto" quedarse con una sola de esas variantes al azar.
  // Por eso se corrige el catálogo SOLO cuando todas las filas de un mismo
  // código coinciden en la misma descripción; si difieren entre sí, se deja
  // el catálogo como estaba y se avisa aparte (aDescripcionAmbigua) para que
  // alguien lo revise a mano — se corrigió una vez mal así (PERNO.B25 quedó
  // con la descripción de su primera fila pisando a las demás).
  const descripcionesVistasPorId = new Map() // id -> Map(descripcionEnMayus -> texto original)
  const unidadesVistasPorId = new Map() // id -> Map(unidadEnMinus -> texto original)
  const materialPorId = new Map()
  function registrarDescripcionVista(material, f) {
    materialPorId.set(material.id, material)
    if (f.descripcion) {
      const vistas = descripcionesVistasPorId.get(material.id) ?? new Map()
      vistas.set(f.descripcion.toUpperCase(), f.descripcion.toUpperCase())
      descripcionesVistasPorId.set(material.id, vistas)
    }
    if (f.unidad) {
      const vistas = unidadesVistasPorId.get(material.id) ?? new Map()
      vistas.set(f.unidad.toLowerCase(), f.unidad)
      unidadesVistasPorId.set(material.id, vistas)
    }
  }

  const filas = []
  filasCrudas.forEach((f) => {
    if (!f.codigo && !f.cantidad) return // fila vacía

    if (!f.codigo || !f.cantidad) {
      filas.push({ fila: f._fila, codigo: f.codigo || '—', estado: 'error', motivo: 'Falta código o cantidad.' })
      return
    }

    const cantidad = normalizarNumero(f.cantidad)
    if (!cantidad || cantidad <= 0) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Cantidad inválida.' })
      return
    }

    const material = materialesPorCodigo.get(f.codigo.toLowerCase())
    if (!material) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'El código no existe en el catálogo.' })
      return
    }
    registrarDescripcionVista(material, f)

    const tipoConversion = material.tipo_conversion ?? 'ninguna'
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
      codigo: material.codigo,
      // Literal: lo que dice ESTA fila del Excel (o el nombre del catálogo
      // si la fila no trae descripción propia) — nunca una mezcla con lo
      // que diga otra fila del mismo código.
      descripcion: f.descripcion || material.descripcion,
      unidad: f.unidad || material.unidad,
      material_id: material.id,
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

  // Recién acá, con todas las filas ya vistas, se sabe si un código trajo
  // una sola descripción/unidad en todo el archivo (se puede corregir el
  // catálogo con confianza) o varias distintas (ambiguo, no se toca).
  const aActualizarDescripcion = []
  const descripcionAmbigua = []
  for (const [id, material] of materialPorId) {
    const descVistas = descripcionesVistasPorId.get(id)
    const unidVistas = unidadesVistasPorId.get(id)
    if ((descVistas && descVistas.size > 1) || (unidVistas && unidVistas.size > 1)) {
      descripcionAmbigua.push({
        codigo: material.codigo,
        valores: [...(descVistas?.values() ?? [])],
      })
      continue
    }
    const payload = {}
    const descUnica = descVistas ? [...descVistas.values()][0] : null
    const unidUnica = unidVistas ? [...unidVistas.values()][0] : null
    if (descUnica && descUnica !== material.descripcion.toUpperCase()) payload.descripcion = descUnica
    if (unidUnica && unidUnica.toLowerCase() !== material.unidad.toLowerCase()) payload.unidad = unidUnica
    if (Object.keys(payload).length) {
      aActualizarDescripcion.push({ id, codigo: material.codigo, descripcionAnterior: material.descripcion, ...payload })
    }
  }

  return {
    total: filasCrudas.length,
    filas,
    aImportar: filas.filter((f) => f.estado === 'ok'),
    conError: filas.filter((f) => f.estado === 'error'),
    aActualizarDescripcion,
    descripcionAmbigua,
  }
}

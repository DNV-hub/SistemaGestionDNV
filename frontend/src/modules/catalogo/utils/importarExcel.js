import * as XLSX from 'xlsx'
import { normalizarNumero } from '../../../utils/normalizarNumero'

// Alias de encabezados aceptados (normalizados: mayúsculas, sin tildes, un
// solo espacio) hacia los campos internos que usa el importador.
const ALIAS_CAMPOS = {
  CODIGO: 'codigo',
  'DESCRIPCION ALMACEN': 'descripcion',
  DESCRIPCION: 'descripcion',
  'DESCRIPCION EDP': 'descripcionEdpNombre',
  'UNIDAD ALMACEN': 'unidad',
  UNIDAD: 'unidad',
  'UNIDAD EDP': 'unidadEdp',
  CATEGORIA: 'categoriaNombre',
  'STOCK MINIMO': 'stockMinimo',
  CONVERSION: 'conversion',
  CONVERSIÓN: 'conversion',
}

const VALORES_CONVERSION = new Set(['ninguna', 'area', 'longitud'])

/** null = celda vacía, no se toca lo que ya tenía el material.
 * undefined = el valor no es ninguno de los tres válidos (fila con error). */
function normalizarConversion(valor) {
  if (!valor) return null
  const limpio = normalizarEncabezado(valor).toLowerCase()
  return VALORES_CONVERSION.has(limpio) ? limpio : undefined
}

function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '') // quita tildes
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarTexto(valor) {
  return String(valor ?? '').trim()
}

export function normalizarClave(texto) {
  return normalizarEncabezado(texto)
}

/** Lee un archivo .xlsx/.xls/.csv y devuelve filas crudas como objetos { codigo, descripcion, unidad, descripcionEdpNombre, unidadEdp }. */
export async function leerArchivoExcel(file) {
  const buffer = await file.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false })

  return filas.map((fila, idx) => {
    const registro = { _fila: idx + 2 } // +2: encabezado ocupa la fila 1
    for (const [encabezado, valor] of Object.entries(fila)) {
      const campo = ALIAS_CAMPOS[normalizarEncabezado(encabezado)]
      if (!campo) continue
      registro[campo] = normalizarTexto(valor)
    }
    return registro
  })
}

/**
 * Procesa filas crudas: valida obligatorios, resuelve/crea sufijos para
 * códigos repetidos dentro del archivo, detecta choques con códigos ya
 * existentes en el catálogo y resuelve el nombre EDP y la categoría contra
 * lo ya cargado (o marca cuáles hay que crear) — mismo criterio para ambos.
 *
 * Los códigos que YA existen no se saltean del todo: si traen algo en la
 * columna CONVERSION, se arma `aActualizar` con esos cambios (así el mismo
 * archivo sirve para exportar el catálogo, corregir esa columna en Excel, y
 * reimportar) — el resto de los campos de una fila existente no se toca.
 */
export function procesarFilas(filasCrudas, { materialesExistentes = [], nombresEdpExistentes, categoriasExistentes = [] }) {
  const codigosExistentesSet = new Set(materialesExistentes.map((m) => m.codigo.toLowerCase()))
  const idPorCodigo = new Map(materialesExistentes.map((m) => [m.codigo.toLowerCase(), m.id]))
  const nombresEdpPorNombre = new Map(
    nombresEdpExistentes.map((n) => [normalizarClave(n.nombre), n])
  )
  const categoriasPorNombre = new Map(
    categoriasExistentes.map((c) => [normalizarClave(c.nombre), c])
  )

  const errores = []
  const validas = []

  filasCrudas.forEach((fila) => {
    if (!fila.codigo && !fila.descripcion && !fila.unidad) return // fila vacía
    if (!fila.codigo || !fila.descripcion || !fila.unidad) {
      errores.push({ fila: fila._fila, motivo: 'Falta código, descripción o unidad.' })
      return
    }
    validas.push(fila)
  })

  // Sufijo -1, -2, ... para códigos repetidos DENTRO del archivo, en el
  // orden en que aparecen (decisión del usuario para no perder filas).
  const conteoPorCodigo = new Map()
  validas.forEach((f) => {
    const clave = f.codigo.toLowerCase()
    conteoPorCodigo.set(clave, (conteoPorCodigo.get(clave) ?? 0) + 1)
  })

  const contadorAsignado = new Map()
  const nombresEdpNuevos = new Map() // clave normalizada -> nombre original
  const categoriasNuevas = new Map() // clave normalizada -> nombre original

  const filasProcesadas = validas.map((f) => {
    const claveCodigo = f.codigo.toLowerCase()
    let codigoFinal = f.codigo
    if (conteoPorCodigo.get(claveCodigo) > 1) {
      const n = (contadorAsignado.get(claveCodigo) ?? 0) + 1
      contadorAsignado.set(claveCodigo, n)
      codigoFinal = `${f.codigo}-${n}`
    }

    const yaExiste = codigosExistentesSet.has(codigoFinal.toLowerCase())

    let descripcionEdpId = null
    let descripcionEdpNueva = null
    if (f.descripcionEdpNombre) {
      const clave = normalizarClave(f.descripcionEdpNombre)
      const existente = nombresEdpPorNombre.get(clave)
      if (existente) {
        descripcionEdpId = existente.id
      } else {
        descripcionEdpNueva = f.descripcionEdpNombre
        if (!nombresEdpNuevos.has(clave)) nombresEdpNuevos.set(clave, f.descripcionEdpNombre)
      }
    }

    let categoriaId = null
    let categoriaNueva = null
    if (f.categoriaNombre) {
      const clave = normalizarClave(f.categoriaNombre)
      const existente = categoriasPorNombre.get(clave)
      if (existente) {
        categoriaId = existente.id
      } else {
        categoriaNueva = f.categoriaNombre
        if (!categoriasNuevas.has(clave)) categoriasNuevas.set(clave, f.categoriaNombre)
      }
    }

    // Porcentaje del último ingreso (0.2 = 20%), no una cantidad fija — ver
    // la ayuda del modal de importación.
    const stockMinimo = f.stockMinimo ? normalizarNumero(f.stockMinimo) : null
    const tipoConversion = normalizarConversion(f.conversion)

    return {
      fila: f._fila,
      codigoOriginal: f.codigo,
      codigo: codigoFinal,
      renombrado: codigoFinal !== f.codigo,
      descripcion: f.descripcion,
      unidad: f.unidad,
      unidad_edp: f.unidadEdp || null,
      descripcionEdpNombre: f.descripcionEdpNombre || null,
      descripcionEdpId,
      descripcionEdpNueva,
      categoriaNombre: f.categoriaNombre || null,
      categoriaId,
      categoriaNueva,
      stock_minimo_pct: Number.isFinite(stockMinimo) ? stockMinimo : null,
      tipoConversion, // null: celda vacía. undefined: valor inválido. 'ninguna'/'area'/'longitud': válido.
      yaExiste,
    }
  })

  // Filas de códigos que ya existen con una columna CONVERSION válida: se
  // arma la actualización acá, no se tocan al crear (aImportar las excluye
  // igual que antes).
  const aActualizar = filasProcesadas
    .filter((f) => f.yaExiste && f.tipoConversion)
    .map((f) => ({ id: idPorCodigo.get(f.codigo.toLowerCase()), codigo: f.codigo, tipo_conversion: f.tipoConversion }))

  const erroresConversion = filasProcesadas
    .filter((f) => f.tipoConversion === undefined)
    .map((f) => ({ fila: f.fila, motivo: `Columna CONVERSION inválida: debe ser "ninguna", "area" o "longitud".` }))

  return {
    total: filasCrudas.length,
    errores: [...errores, ...erroresConversion],
    filas: filasProcesadas,
    aImportar: filasProcesadas.filter((f) => !f.yaExiste),
    conConflicto: filasProcesadas.filter((f) => f.yaExiste && !f.tipoConversion),
    aActualizar,
    nombresEdpNuevos: [...nombresEdpNuevos.values()],
    categoriasNuevas: [...categoriasNuevas.values()],
  }
}

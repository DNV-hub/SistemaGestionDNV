// xlsx pesa ~485 KB: se descarga SOLO cuando alguien exporta o importa un
// Excel, no cada vez que se abre una pantalla que tiene ese botón.
import { normalizarNumero } from '../../../utils/normalizarNumero'

// Alias de encabezados aceptados (normalizados: mayúsculas, sin tildes, un
// solo espacio) hacia los campos internos que usa el importador.
const ALIAS_CAMPOS = {
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

/** Lee un archivo .xlsx/.xls/.csv y devuelve filas crudas como objetos { descripcion, unidad, descripcionEdpNombre, unidadEdp }. */
export async function leerArchivoExcel(file) {
  const XLSX = await import('xlsx')
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
 * Procesa filas crudas: valida obligatorios, detecta choques con materiales
 * ya existentes en el catálogo y resuelve el nombre EDP y la categoría
 * contra lo ya cargado (o marca cuáles hay que crear) — mismo criterio para
 * ambos.
 *
 * La identidad de un material es su DESCRIPCIÓN, nunca el código (memoria
 * catalogo-codigo-no-es-identidad: el código es solo una etiqueta de
 * referencia, opcional, que ni siquiera agrupa nada para el EDP — eso lo
 * hace el nombre EDP). Por eso el "ya existe"/"se crea" de cada fila se
 * decide por descripción, igual que ya hace el importador de ingresos
 * (almacen/utils/importarIngresos.js).
 *
 * Las filas que YA existen no se saltean del todo: si traen algo en la
 * columna CONVERSION, se arma `aActualizar` con esos cambios (así el mismo
 * archivo sirve para exportar el catálogo, corregir esa columna en Excel, y
 * reimportar) — el resto de los campos de una fila existente no se toca.
 */
export function procesarFilas(filasCrudas, { materialesExistentes = [], nombresEdpExistentes, categoriasExistentes = [] }) {
  const materialesPorDescripcion = new Map(materialesExistentes.map((m) => [m.descripcion.toUpperCase(), m]))
  const nombresEdpPorNombre = new Map(
    nombresEdpExistentes.map((n) => [normalizarClave(n.nombre), n])
  )
  const categoriasPorNombre = new Map(
    categoriasExistentes.map((c) => [normalizarClave(c.nombre), c])
  )

  const errores = []
  const validas = []

  filasCrudas.forEach((fila) => {
    if (!fila.descripcion && !fila.unidad) return // fila vacía
    if (!fila.descripcion || !fila.unidad) {
      errores.push({ fila: fila._fila, motivo: 'Falta descripción o unidad.' })
      return
    }
    validas.push(fila)
  })

  // Dos filas del mismo archivo con la MISMA descripción (y que no exista
  // todavía en catálogo) crearían dos materiales idénticos — se deja pasar
  // la primera, la(s) siguiente(s) se marcan como error en vez de crearse
  // dos veces.
  const descripcionesVistasEnArchivo = new Set()
  const nombresEdpNuevos = new Map() // clave normalizada -> nombre original
  const categoriasNuevas = new Map() // clave normalizada -> nombre original

  const filasProcesadas = []

  validas.forEach((f) => {
    const claveDescripcion = f.descripcion.toUpperCase()
    const existente = materialesPorDescripcion.get(claveDescripcion)
    const yaExiste = !!existente

    if (!yaExiste) {
      if (descripcionesVistasEnArchivo.has(claveDescripcion)) {
        errores.push({ fila: f._fila, motivo: `Descripción repetida en el archivo (ya la trae otra fila de este mismo archivo).` })
        return
      }
      descripcionesVistasEnArchivo.add(claveDescripcion)
    }

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

    filasProcesadas.push({
      fila: f._fila,
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
      idExistente: existente?.id ?? null,
    })
  })

  // Filas de materiales que ya existen (por descripción) con una columna
  // CONVERSION válida: se arma la actualización acá, no se tocan al crear
  // (aImportar las excluye igual que antes).
  const aActualizar = filasProcesadas
    .filter((f) => f.yaExiste && f.tipoConversion)
    .map((f) => ({ id: f.idExistente, tipo_conversion: f.tipoConversion }))

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

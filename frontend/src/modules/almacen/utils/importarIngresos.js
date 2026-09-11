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

/** "M80.4-B" -> "M80.4"; "M80.4" (sin guion) -> null: un código sin guion no
 * tiene de quién heredar, es la base él mismo. */
function codigoBase(codigo) {
  const i = codigo.indexOf('-')
  return i > 0 ? codigo.slice(0, i).trim() : null
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
 * Valida cada fila contra el catálogo ya cargado y resuelve material_id
 * para el insert. El contrato es opcional por fila: si el archivo trae
 * columna CONTRATO se usa esa (nombre o código, ej. "Contrato Marco" o
 * "MARCO"); si una fila no la trae, cae al contrato elegido una sola vez en
 * el modal para todo el lote.
 *
 * Cada variante de dimensión (un mismo producto en largos distintos) es un
 * material propio con su propio código — el Excel de stock ya no colapsa
 * "M80.4" con cuatro largos distintos en un solo material. Si el código de
 * una fila no existe todavía en el catálogo, se da de alta ahí mismo
 * (`materialesACrear`), siempre que la fila traiga descripción y unidad.
 * Tipo de conversión, nombre EDP y unidad EDP del material nuevo se
 * heredan del "código base" (la parte antes del primer guion: "M80.4-B"
 * hereda de "M80.4") si ese código base ya existe en el catálogo — así solo
 * hace falta configurar el EDP una vez por producto, en el primer código.
 */
export function procesarFilasIngreso(filasCrudas, { materialesActivos, contratosDisponibles, contratoIdPorDefecto }) {
  const materialesPorCodigo = new Map(materialesActivos.map((m) => [m.codigo.toLowerCase(), m]))
  const contratosPorClave = new Map(
    contratosDisponibles.flatMap((c) => [
      [c.nombre.toLowerCase(), c],
      [c.codigo.toLowerCase(), c],
    ])
  )

  // --- Paso 1: separar filas con material ya conocido de las que necesitan
  // un material nuevo. No se resuelve nada de las pendientes todavía: hace
  // falta ver TODAS las filas de un código nuevo antes de decidir su
  // descripción/conversión definitiva. ---
  const resueltas = [] // { f, material }
  const pendientes = [] // { f, codigoLower }
  const erroresPrevios = []

  filasCrudas.forEach((f) => {
    if (!f.codigo && !f.cantidad) return // fila vacía
    if (!f.codigo || !f.cantidad) {
      erroresPrevios.push({ fila: f._fila, codigo: f.codigo || '—', estado: 'error', motivo: 'Falta código o cantidad.' })
      return
    }
    const material = materialesPorCodigo.get(f.codigo.toLowerCase())
    if (material) {
      resueltas.push({ f, material })
      return
    }
    if (!f.descripcion || !f.unidad) {
      erroresPrevios.push({
        fila: f._fila,
        codigo: f.codigo,
        estado: 'error',
        motivo: 'El código no existe en el catálogo y la fila no trae descripción/unidad para crearlo.',
      })
      return
    }
    pendientes.push({ f, codigoLower: f.codigo.toLowerCase() })
  })

  // --- Paso 2: armar un material nuevo por cada código pendiente distinto,
  // heredando del código base cuando corresponde. ---
  const materialesACrearPorCodigo = new Map() // codigoLower -> payload
  for (const { f } of pendientes) {
    const codigoLower = f.codigo.toLowerCase()
    if (materialesACrearPorCodigo.has(codigoLower)) continue

    const base = codigoBase(f.codigo)
    const materialBase = base ? materialesPorCodigo.get(base.toLowerCase()) : null
    // El código base también puede ser, a su vez, otro código nuevo de este
    // mismo archivo (se resuelve más abajo, después de este bucle).
    const baseEsPendiente = !materialBase && base ? pendientes.some((p) => p.codigoLower === base.toLowerCase()) : false

    const conversionDeArchivo = normalizarEncabezado(f.conversion || '').toLowerCase()
    const tipoConversion = VALORES_CONVERSION.has(conversionDeArchivo)
      ? conversionDeArchivo
      : (materialBase?.tipo_conversion ?? null) // null = todavía no se sabe, se resuelve abajo si baseEsPendiente

    materialesACrearPorCodigo.set(codigoLower, {
      codigo: f.codigo,
      descripcion: f.descripcion.toUpperCase(),
      unidad: f.unidad,
      tipo_conversion: tipoConversion,
      descripcion_edp_id: materialBase?.descripcion_edp_id ?? null,
      unidad_edp: materialBase?.unidad_edp ?? null,
      codigoBaseLower: base?.toLowerCase() ?? null,
      baseEsPendiente,
    })
  }
  // Resolver los que heredan de OTRO código nuevo del mismo archivo (por si
  // el código base aparece más abajo en el Excel que su variante).
  for (const nuevo of materialesACrearPorCodigo.values()) {
    if (!nuevo.baseEsPendiente) continue
    const base = materialesACrearPorCodigo.get(nuevo.codigoBaseLower)
    if (!base) continue
    if (nuevo.tipo_conversion === null) nuevo.tipo_conversion = base.tipo_conversion
    if (nuevo.descripcion_edp_id === null) nuevo.descripcion_edp_id = base.descripcion_edp_id
    if (nuevo.unidad_edp === null) nuevo.unidad_edp = base.unidad_edp
  }
  for (const nuevo of materialesACrearPorCodigo.values()) {
    if (nuevo.tipo_conversion === null) nuevo.tipo_conversion = 'ninguna'
  }

  // --- Paso 3: con cada material resuelto (existente o recién definido),
  // procesar cantidad/ancho/largo/contrato de cada fila. ---
  const descripcionesVistas = new Map() // clave -> Map(descripcionEnMayus -> original)
  const unidadesVistas = new Map()
  const infoPorClave = new Map() // clave -> { codigo, esNuevo, descripcionCatalogo, unidadCatalogo }

  function registrarVista(clave, f) {
    if (f.descripcion) {
      const v = descripcionesVistas.get(clave) ?? new Map()
      v.set(f.descripcion.toUpperCase(), f.descripcion.toUpperCase())
      descripcionesVistas.set(clave, v)
    }
    if (f.unidad) {
      const v = unidadesVistas.get(clave) ?? new Map()
      v.set(f.unidad.toLowerCase(), f.unidad)
      unidadesVistas.set(clave, v)
    }
  }

  const filas = [...erroresPrevios]

  function procesarFila(f, { clave, codigo, descripcionEfectiva, unidadEfectiva, tipoConversion, materialId, materialNuevoCodigo }) {
    registrarVista(clave, f)
    if (!infoPorClave.has(clave)) {
      infoPorClave.set(clave, { codigo, esNuevo: !materialId, descripcionCatalogo: descripcionEfectiva, unidadCatalogo: unidadEfectiva })
    }

    const ancho = f.ancho ? normalizarNumero(f.ancho) : null
    const largo = f.largo ? normalizarNumero(f.largo) : null
    if (tipoConversion === 'area' && (!ancho || !largo)) {
      filas.push({ fila: f._fila, codigo, estado: 'error', motivo: 'Este material necesita ANCHO y LARGO del rollo.' })
      return
    }
    if (tipoConversion === 'longitud' && !largo) {
      filas.push({ fila: f._fila, codigo, estado: 'error', motivo: 'Este material necesita LARGO.' })
      return
    }

    let contratoId = contratoIdPorDefecto
    let contratoNombre = contratosDisponibles.find((c) => c.id === contratoIdPorDefecto)?.nombre ?? null
    if (f.contrato) {
      const contrato = contratosPorClave.get(f.contrato.toLowerCase())
      if (!contrato) {
        filas.push({
          fila: f._fila,
          codigo,
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
      codigo,
      // Literal: lo que dice ESTA fila del Excel (o el nombre del catálogo
      // si la fila no trae descripción propia) — nunca una mezcla con lo
      // que diga otra fila del mismo código.
      descripcion: f.descripcion || descripcionEfectiva,
      unidad: f.unidad || unidadEfectiva,
      material_id: materialId,
      materialNuevoCodigo: materialNuevoCodigo ?? null,
      cantidad: normalizarNumero(f.cantidad),
      ancho: tipoConversion === 'area' ? ancho : null,
      largo: tipoConversion !== 'ninguna' ? largo : null,
      contrato_id: contratoId,
      contrato_nombre: contratoNombre,
      documento_referencia: f.documento_referencia || null,
      proveedor: f.proveedor || null,
      observacion: f.observacion || null,
      estado: 'ok',
    })
  }

  for (const { f, material } of resueltas) {
    procesarFila(f, {
      clave: material.id,
      codigo: material.codigo,
      descripcionEfectiva: material.descripcion,
      unidadEfectiva: material.unidad,
      tipoConversion: material.tipo_conversion ?? 'ninguna',
      materialId: material.id,
    })
  }
  for (const { f, codigoLower } of pendientes) {
    const nuevo = materialesACrearPorCodigo.get(codigoLower)
    procesarFila(f, {
      clave: `nuevo:${codigoLower}`,
      codigo: nuevo.codigo,
      descripcionEfectiva: nuevo.descripcion,
      unidadEfectiva: nuevo.unidad,
      tipoConversion: nuevo.tipo_conversion,
      materialId: null,
      materialNuevoCodigo: codigoLower,
    })
  }

  // Con todas las filas vistas, un código (nuevo o existente) que trajo más
  // de una descripción/unidad distinta en el archivo queda sin corregir el
  // catálogo — el catálogo solo tiene un campo descripción por material, no
  // hay forma de que sea "correcto" quedarse con una variante al azar.
  const aActualizarDescripcion = []
  const descripcionAmbigua = []
  for (const [clave, info] of infoPorClave) {
    const descVistas = descripcionesVistas.get(clave)
    const unidVistas = unidadesVistas.get(clave)
    const ambigua = (descVistas && descVistas.size > 1) || (unidVistas && unidVistas.size > 1)
    if (ambigua) {
      descripcionAmbigua.push({ codigo: info.codigo, valores: [...(descVistas?.values() ?? [])] })
      continue
    }
    if (info.esNuevo) continue // ya nace con la descripción correcta, no hay nada que "actualizar"
    const payload = {}
    const descUnica = descVistas ? [...descVistas.values()][0] : null
    const unidUnica = unidVistas ? [...unidVistas.values()][0] : null
    if (descUnica && descUnica !== info.descripcionCatalogo.toUpperCase()) payload.descripcion = descUnica
    if (unidUnica && unidUnica.toLowerCase() !== info.unidadCatalogo.toLowerCase()) payload.unidad = unidUnica
    if (Object.keys(payload).length) {
      aActualizarDescripcion.push({ id: clave, codigo: info.codigo, descripcionAnterior: info.descripcionCatalogo, ...payload })
    }
  }

  return {
    total: filasCrudas.length,
    filas,
    aImportar: filas.filter((f) => f.estado === 'ok'),
    conError: filas.filter((f) => f.estado === 'error'),
    aActualizarDescripcion,
    descripcionAmbigua,
    materialesACrear: [...materialesACrearPorCodigo.values()].map((m) => ({
      codigo: m.codigo,
      descripcion: m.descripcion,
      unidad: m.unidad,
      tipo_conversion: m.tipo_conversion,
      descripcion_edp_id: m.descripcion_edp_id,
      unidad_edp: m.unidad_edp,
    })),
  }
}

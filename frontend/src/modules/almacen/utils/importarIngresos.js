// xlsx pesa ~485 KB: se descarga SOLO cuando alguien exporta o importa un
// Excel, no cada vez que se abre una pantalla que tiene ese botón.
import { normalizarNumero } from '../../../utils/normalizarNumero'

// Mismo criterio que catalogo/utils/importarExcel.js: encabezados alias
// normalizados (mayúsculas, sin tildes, un solo espacio).
const ALIAS_CAMPOS = {
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
  'NOMBRE EDP': 'nombre_edp',
  'DESCRIPCION EDP': 'nombre_edp',
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

/** Lee un archivo .xlsx/.xls/.csv de stock actual: DESCRIPCION ALMACEN, CANTIDAD y columnas opcionales. */
export async function leerArchivoIngresos(file) {
  const XLSX = await import('xlsx')
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
 * El código de catálogo no se usa ni se pide — no es la identidad de un
 * material, ni siquiera agrupa nada para el EDP (eso lo hace el nombre
 * EDP). La identidad real es el NOMBRE tal como lo escribe el almacenero:
 * "Cable 15mm rojo, rollos de 5m" y "Cable 15mm verde, rollos de 3m" son
 * materiales distintos, cada uno su propia fila de catálogo, con su propio
 * stock. Por eso cada fila se resuelve por DESCRIPCION: si ya existe un
 * material con ese nombre exacto, se reutiliza; si no existe, se crea uno
 * nuevo con la descripción, unidad y conversión de esa fila.
 * El contrato es opcional por fila: si el archivo trae columna CONTRATO se
 * usa esa (nombre o código, ej. "Contrato Marco" o "MARCO"); si una fila
 * no la trae, cae al contrato elegido una sola vez en el modal.
 */
export function procesarFilasIngreso(
  filasCrudas,
  { materialesActivos, contratosDisponibles, contratoIdPorDefecto, nombresEdp = [], sugerirEdp = () => null }
) {
  const claveEdp = (t) => normalizarEncabezado(t).replace(/[^A-Z0-9/.]/g, '')
  const edpPorClave = new Map(nombresEdp.map((n) => [claveEdp(n.nombre), n]))
  const materialesPorNombre = new Map(materialesActivos.map((m) => [m.descripcion.toUpperCase(), m]))
  const contratosPorClave = new Map(
    contratosDisponibles.flatMap((c) => [
      [c.nombre.toLowerCase(), c],
      [c.codigo.toLowerCase(), c],
    ])
  )

  const filas = []
  const materialesACrearPorNombre = new Map() // nombreEnMayus -> payload
  const materialesAActualizarConversionPorId = new Map() // id -> {id, tipo_conversion}

  filasCrudas.forEach((f) => {
    if (!f.descripcion && !f.cantidad) return // fila vacía

    if (!f.cantidad) {
      filas.push({ fila: f._fila, estado: 'error', motivo: 'Falta cantidad.' })
      return
    }
    if (!f.descripcion || !f.unidad) {
      filas.push({ fila: f._fila, estado: 'error', motivo: 'Falta descripción o unidad.' })
      return
    }

    // 0 es válido a propósito: un material que arranca sin stock físico
    // (así lo pidió el usuario) igual necesita su fila en `stock` para que
    // aparezca al buscarlo y para que la alerta de stock agotado lo detecte
    // — ver fn_registrar_movimiento_stock y fn_evaluar_alertas. Lo que se
    // rechaza es que la celda esté vacía/no sea un número, o que sea
    // negativa.
    //
    // Las plantillas de valorización suelen escribir "-" en vez de "0" para
    // decir "esto está en cero" — normalizarNumero no lo reconoce como
    // número (no lo es) y lo rechazaría. Se traduce acá nomás, no dentro de
    // normalizarNumero: en Procura un "-" puede significar "no aplica" en
    // vez de cero, así que esa lectura no debe cambiar para otros
    // importadores que comparten esa misma utilidad.
    const cantidadCruda = ['-', '–', '—'].includes(f.cantidad.trim()) ? '0' : f.cantidad
    const cantidad = normalizarNumero(cantidadCruda)
    if (cantidad === null || cantidad < 0) {
      filas.push({ fila: f._fila, estado: 'error', motivo: 'Cantidad inválida.' })
      return
    }

    const nombreClave = f.descripcion.toUpperCase()
    const material = materialesPorNombre.get(nombreClave)

    let materialId = null
    let materialPendienteClave = null
    let tipoConversion
    let nombreEdpFila = null // lo que se muestra en la vista previa
    let edpSugerido = false

    if (material) {
      materialId = material.id
      // Un material que ya existe en el catálogo pero SIN conversión
      // configurada ('ninguna') y esta fila SÍ trae una válida: se
      // actualiza el catálogo de una vez, en vez de exigir mantenerla por
      // separado en el Excel de Catálogo — es la misma columna CONVERSION
      // que ya se lee acá abajo para un material nuevo, ahora aplicada
      // también a uno existente. Si el catálogo YA tenía una conversión
      // propia (sea la que sea), se respeta esa: no se pisa algo que ya
      // estaba configurado a propósito solo porque esta fila trae otra
      // cosa (o nada) en esa columna.
      const conversionDeArchivo = normalizarEncabezado(f.conversion || '').toLowerCase()
      const conversionValida = VALORES_CONVERSION.has(conversionDeArchivo) ? conversionDeArchivo : null
      if (conversionValida && (material.tipo_conversion ?? 'ninguna') === 'ninguna') {
        material.tipo_conversion = conversionValida // así las siguientes filas de este mismo material ya lo ven
        materialesAActualizarConversionPorId.set(material.id, {
          id: material.id,
          tipo_conversion: conversionValida,
        })
      }
      tipoConversion = material.tipo_conversion ?? 'ninguna'
    } else {
      const conversionDeArchivo = normalizarEncabezado(f.conversion || '').toLowerCase()
      tipoConversion = VALORES_CONVERSION.has(conversionDeArchivo) ? conversionDeArchivo : 'ninguna'
      // Un material nuevo necesita nombre EDP: el del archivo (existente, o
      // uno nuevo si no existe todavía) o, si no lo trae, el que mejor
      // coincida con las guías entre los que ya existen.
      let edpId = null
      let edpNuevo = null
      if (f.nombre_edp) {
        const ya = edpPorClave.get(claveEdp(f.nombre_edp))
        if (ya) {
          edpId = ya.id
          nombreEdpFila = ya.nombre
        } else {
          edpNuevo = f.nombre_edp.trim()
          nombreEdpFila = edpNuevo
        }
      } else if (materialesACrearPorNombre.has(nombreClave)) {
        const previo = materialesACrearPorNombre.get(nombreClave)
        edpId = previo.descripcion_edp_id
        edpNuevo = previo.nombre_edp_nuevo
        nombreEdpFila = previo._nombreEdp
        edpSugerido = previo._sugerido
      } else {
        const sug = sugerirEdp(f.descripcion)
        if (sug) {
          edpId = sug.nombreEdpId
          nombreEdpFila = sug.nombre
          edpSugerido = true
        }
      }
      if (!edpId && !edpNuevo) {
        filas.push({
          fila: f._fila,
          estado: 'error',
          motivo: 'Material nuevo sin NOMBRE EDP: agrégalo en la columna NOMBRE EDP (no se encontró uno parecido en las guías).',
        })
        return
      }
      materialPendienteClave = nombreClave
      if (!materialesACrearPorNombre.has(nombreClave)) {
        materialesACrearPorNombre.set(nombreClave, {
          descripcion: f.descripcion.toUpperCase(),
          unidad: f.unidad,
          tipo_conversion: tipoConversion,
          descripcion_edp_id: edpId,
          nombre_edp_nuevo: edpNuevo,
          // lo que dice la guía pasa a ser una opción más de ese nombre EDP
          guia: f.descripcion,
          _nombreEdp: nombreEdpFila,
          _sugerido: edpSugerido,
        })
      }
    }

    const ancho = f.ancho ? normalizarNumero(f.ancho) : null
    const largo = f.largo ? normalizarNumero(f.largo) : null
    if (tipoConversion === 'area' && (!ancho || !largo)) {
      filas.push({ fila: f._fila, estado: 'error', motivo: 'Este material necesita ANCHO y LARGO del rollo.' })
      return
    }
    if (tipoConversion === 'longitud' && !largo) {
      filas.push({ fila: f._fila, estado: 'error', motivo: 'Este material necesita LARGO.' })
      return
    }

    let contratoId = contratoIdPorDefecto
    let contratoNombre = contratosDisponibles.find((c) => c.id === contratoIdPorDefecto)?.nombre ?? null
    if (f.contrato) {
      const contrato = contratosPorClave.get(f.contrato.toLowerCase())
      if (!contrato) {
        filas.push({
          fila: f._fila,
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
      descripcion: f.descripcion,
      nombre_edp: nombreEdpFila,
      edp_sugerido: edpSugerido,
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
    materialesAActualizarConversion: [...materialesAActualizarConversionPorId.values()],
  }
}

import * as XLSX from 'xlsx'
import { normalizarNumero } from '../../../utils/normalizarNumero'

// Mismo criterio que los otros importadores del Sistema: alias de
// encabezados normalizados.
const ALIAS_CAMPOS = {
  ID: 'id',
  ANCHO: 'ancho',
  LARGO: 'largo',
}

function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lee el Excel exportado desde "Ingresos sin medidas" ya corregido: usa la
 * columna ID (no se toca, es la que conecta cada fila con su ingreso real)
 * más ANCHO y/o LARGO. */
export async function leerArchivoMedidas(file) {
  const buffer = await file.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false })

  return filas.map((fila, idx) => {
    const registro = { _fila: idx + 2 }
    for (const [encabezado, valor] of Object.entries(fila)) {
      const campo = ALIAS_CAMPOS[normalizarEncabezado(encabezado)]
      if (!campo) continue
      registro[campo] = String(valor ?? '').trim()
    }
    return registro
  })
}

/** filasOriginales: lo que devuelve listarIngresosSinMedidas(), para mostrar
 * a qué material corresponde cada ID y para no confiar ciegamente en el
 * Excel (si el ID no está en la lista, se marca error). */
export function procesarFilasMedidas(filasCrudas, filasOriginales) {
  const original = new Map(filasOriginales.map((f) => [f.id, f]))
  const filas = []

  filasCrudas.forEach((f) => {
    if (!f.id && !f.ancho && !f.largo) return // fila vacía

    if (!f.id) {
      filas.push({ fila: f._fila, estado: 'error', motivo: 'Falta la columna ID.' })
      return
    }
    const fuente = original.get(f.id)
    if (!fuente) {
      filas.push({ fila: f._fila, id: f.id, estado: 'error', motivo: 'Ese ID no está en la lista exportada.' })
      return
    }

    const tipo = fuente.materiales?.tipo_conversion
    const ancho = f.ancho ? normalizarNumero(f.ancho) : null
    const largo = f.largo ? normalizarNumero(f.largo) : null

    if (tipo === 'area' && (!ancho || !largo)) {
      filas.push({ fila: f._fila, id: f.id, codigo: fuente.materiales?.codigo, estado: 'error', motivo: 'Este material necesita ancho y largo.' })
      return
    }
    if (tipo === 'longitud' && !largo) {
      filas.push({ fila: f._fila, id: f.id, codigo: fuente.materiales?.codigo, estado: 'error', motivo: 'Este material necesita el largo.' })
      return
    }

    filas.push({
      fila: f._fila,
      id: f.id,
      codigo: fuente.materiales?.codigo,
      descripcion: fuente.materiales?.descripcion,
      ancho: tipo === 'area' ? ancho : null,
      largo,
      estado: 'ok',
    })
  })

  return {
    total: filasCrudas.length,
    filas,
    aAplicar: filas.filter((f) => f.estado === 'ok'),
    conError: filas.filter((f) => f.estado === 'error'),
  }
}

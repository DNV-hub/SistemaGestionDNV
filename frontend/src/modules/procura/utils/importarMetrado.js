import * as XLSX from 'xlsx'

const ALIAS_CAMPOS = {
  CODIGO: 'codigo',
  'CANTIDAD CONTRACTUAL': 'cantidad_contractual',
  CONTRACTUAL: 'cantidad_contractual',
  'CANTIDAD PROCURA': 'cantidad_procura',
  PROCURA: 'cantidad_procura',
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

/** Lee un archivo .xlsx/.xls/.csv de metrado: CODIGO + cantidades por columna. */
export async function leerArchivoMetrado(file) {
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
 * Valida cada fila contra el catálogo (el material tiene que existir de
 * antes) y resuelve material_id + unidad para el insert. Si el material ya
 * tiene una fila vigente en este frente, importar vuelve a crear una
 * versión (igual que editar la celda a mano) — no se trata como error.
 */
export function procesarFilasMetrado(filasCrudas, { materialesActivos }) {
  const materialesPorCodigo = new Map(materialesActivos.map((m) => [m.codigo.toLowerCase(), m]))

  const filas = []
  filasCrudas.forEach((f) => {
    if (!f.codigo && !f.cantidad_contractual && !f.cantidad_procura) return // fila vacía

    if (!f.codigo) {
      filas.push({ fila: f._fila, codigo: '—', estado: 'error', motivo: 'Falta código.' })
      return
    }

    const material = materialesPorCodigo.get(f.codigo.toLowerCase())
    if (!material) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'El código no existe en el catálogo.' })
      return
    }

    const contractual = f.cantidad_contractual ? Number(f.cantidad_contractual) : 0
    const procuraCant = f.cantidad_procura ? Number(f.cantidad_procura) : 0
    if (!Number.isFinite(contractual) || contractual < 0 || !Number.isFinite(procuraCant) || procuraCant < 0) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Cantidad inválida.' })
      return
    }
    if (contractual === 0 && procuraCant === 0) {
      filas.push({
        fila: f._fila,
        codigo: f.codigo,
        estado: 'error',
        motivo: 'Debe traer al menos una cantidad (contractual o procura) mayor a cero.',
      })
      return
    }

    filas.push({
      fila: f._fila,
      codigo: material.codigo,
      descripcion: material.descripcion,
      unidad: material.unidad,
      material_id: material.id,
      cantidad_contractual: contractual,
      cantidad_procura: procuraCant,
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

import * as XLSX from 'xlsx'

// El metrado que entrega Planeamiento no distingue longitud puntual ("4 ML
// de barra helicoidal D25mm", sin decir si es con pernos de 3m o de 1.5m) —
// por eso el emparejamiento es por NOMBRE EDP, no por código de catálogo
// (que si acaso identificaría una longitud puntual, no el grupo completo).
const ALIAS_CAMPOS = {
  'NOMBRE EDP': 'nombre_edp',
  DESCRIPCION: 'nombre_edp',
  MATERIAL: 'nombre_edp',
  'MATERIAL EDP': 'nombre_edp',
  // Una sola cantidad (la de Procura). La columna CONTRACTUAL ya no se usa.
  CANTIDAD: 'cantidad_procura',
  CANT: 'cantidad_procura',
  'CANTIDAD PROCURA': 'cantidad_procura',
  PROCURA: 'cantidad_procura',
  // Zona del frente (ej. ZONA 2): un mismo Excel puede traer varias.
  ZONA: 'zona',
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

// Para sugerir por parecido, no por texto exacto: junta letras/números en
// palabras sueltas, sin tildes ni signos ("D=25MM" -> "D 25MM" -> {"D","25MM"}).
function palabrasDe(texto) {
  const limpio = String(texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
  return new Set(limpio.split(' ').filter(Boolean))
}

/** Nombres EDP más parecidos al que no se encontró — por cuántas palabras
 * comparten, no por texto exacto: "CABLE BOA 19MM" y "CABLE ACERO BOA
 * D=19mm" comparten casi todo su vocabulario aunque el texto completo no
 * coincida letra por letra. Sirve para ofrecer opciones cuando el Excel de
 * Planeamiento trae el nombre abreviado, con otro orden, o con una palabra
 * de más/de menos. */
export function sugerirNombresEdp(nombreBuscado, nombresEdp, maximo = 4) {
  const palabrasBuscadas = palabrasDe(nombreBuscado)
  if (!palabrasBuscadas.size) return []

  return nombresEdp
    .map((grupo) => {
      const palabrasGrupo = palabrasDe(grupo.nombre)
      let comunes = 0
      for (const p of palabrasBuscadas) if (palabrasGrupo.has(p)) comunes++
      return { grupo, puntaje: comunes / Math.max(palabrasBuscadas.size, palabrasGrupo.size, 1) }
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, maximo)
    .map((x) => x.grupo)
}

/** Lee un archivo .xlsx/.xls/.csv de metrado: CODIGO + cantidades por columna. */
export async function leerArchivoMetrado(file) {
  const buffer = await file.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false })

  return filas.map((fila, idx) => {
    // Número de orden dentro del archivo (1, 2, 3…), no el número de fila de Excel.
    const registro = { _fila: idx + 1 }
    for (const [encabezado, valor] of Object.entries(fila)) {
      const campo = ALIAS_CAMPOS[normalizarEncabezado(encabezado)]
      if (!campo) continue
      registro[campo] = normalizarTexto(valor)
    }
    return registro
  })
}

/**
 * Valida cada fila contra los Nombres EDP del catálogo (el grupo tiene que
 * existir de antes) y resuelve descripcion_edp_id + unidad EDP para el
 * insert. Si el grupo ya tiene una fila vigente en este frente, importar
 * vuelve a crear una versión (igual que editar la celda a mano) — no se
 * trata como error.
 */
export function procesarFilasMetrado(filasCrudas, { nombresEdp }) {
  const gruposPorNombre = new Map(nombresEdp.map((n) => [n.nombre.trim().toLowerCase(), n]))

  const filas = []
  filasCrudas.forEach((f) => {
    if (!f.nombre_edp && !f.cantidad_procura) return // fila vacía

    if (!f.nombre_edp) {
      filas.push({ fila: f._fila, nombre_edp: '—', estado: 'error', motivo: 'Falta el Nombre EDP.' })
      return
    }

    // Se calculan antes de saber si el nombre existe, para no perderlas si
    // el usuario corrige el nombre eligiendo una sugerencia.
    const cantidad = f.cantidad_procura ? Number(String(f.cantidad_procura).replace(',', '.')) : 0
    const zona = (f.zona ?? '').replace(/\s+/g, ' ').trim()

    const grupo = gruposPorNombre.get(f.nombre_edp.trim().toLowerCase())
    if (!grupo) {
      filas.push({
        fila: f._fila,
        nombre_edp: f.nombre_edp,
        zona,
        estado: 'error',
        motivo: 'Ese material no existe en el catálogo.',
        cantidad_contractual: 0,
        cantidad_procura: Number.isFinite(cantidad) ? cantidad : 0,
        observacion: f.observacion || null,
        sugerencias: sugerirNombresEdp(f.nombre_edp, nombresEdp),
      })
      return
    }
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      filas.push({ fila: f._fila, nombre_edp: f.nombre_edp, zona, estado: 'error', motivo: 'Cantidad inválida.' })
      return
    }
    if (cantidad === 0) {
      filas.push({ fila: f._fila, nombre_edp: f.nombre_edp, zona, estado: 'error', motivo: 'Falta la cantidad (debe ser mayor a cero).' })
      return
    }

    filas.push({
      fila: f._fila,
      nombre_edp: grupo.nombre,
      zona,
      unidad: grupo.unidad_edp,
      descripcion_edp_id: grupo.id,
      cantidad_contractual: 0,
      cantidad_procura: cantidad,
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

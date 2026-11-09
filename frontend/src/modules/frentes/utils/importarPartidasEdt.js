// xlsx pesa ~485 KB: se descarga SOLO cuando alguien exporta o importa un
// Excel, no cada vez que se abre una pantalla que tiene ese botón.
import { normalizarNumero } from '../../../utils/normalizarNumero'

// Coincidencia por "contiene", no por texto exacto — el Excel real de cada
// frente nunca trae el encabezado idéntico ("EDT" en vez de "Ítem EDT",
// "Partidas cronograma" en vez de "Partida", "U.M" sin punto, "Met. previ."
// truncado, etc.). Orden: de más específico a más genérico, porque el
// primer patrón que matchea gana el campo.
const REGLAS_CAMPOS = [
  { campo: 'seccion', patrones: ['GRUPO', 'SECCION'] },
  { campo: 'codigo_edt', patrones: ['CODIGO EDT', 'ITEM EDT', 'EDT', 'ITEM', 'CODIGO'] },
  { campo: 'metrado_previsto', patrones: ['PREVI', 'METRADO'] },
  { campo: 'unidad', patrones: ['U.M', 'UM', 'UNIDAD'] },
  { campo: 'nombre', patrones: ['PARTIDA', 'DESCRIPCION', 'CRONOGRAMA'] },
]

function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function campoDe(encabezado) {
  const norm = normalizarEncabezado(encabezado)
  const regla = REGLAS_CAMPOS.find(({ patrones }) => patrones.some((p) => norm.includes(p)))
  return regla?.campo ?? null
}

function normalizarTexto(valor) {
  return String(valor ?? '').trim()
}

/** Lee un archivo .xlsx/.xls/.csv de partidas EDT: Ítem/EDT, Partida, Grupo,
 * U.M. y Previsto — mismo patrón que leerArchivoMetrado (procura), pero con
 * encabezados reconocidos por coincidencia parcial (ver REGLAS_CAMPOS). */
export async function leerArchivoPartidasEdt(file) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false })

  return filas.map((fila, idx) => {
    const registro = { _fila: idx + 1 }
    for (const [encabezado, valor] of Object.entries(fila)) {
      const campo = campoDe(encabezado)
      if (!campo) continue
      registro[campo] = normalizarTexto(valor)
    }
    return registro
  })
}

// Cronogramas reales (Excel de obra) suelen traer las secciones como filas
// intercaladas ("01 ACTIVIDADES PRELIMINARES", sin U.M. ni previsto — con un
// guion "-" en esas columnas) en vez de una columna "Grupo" aparte. Una fila
// sin unidad real no puede ser una partida medible, así que se interpreta
// como título de sección: no se importa, pero su nombre pasa a agrupar las
// partidas que vienen después, hasta el siguiente título.
function esMarcadorVacio(valor) {
  const v = (valor ?? '').trim()
  return v === '' || v === '-' || v === '—' || v === '--'
}

/** Valida cada fila contra los códigos EDT que ya tiene este frente (el
 * código no se puede repetir dentro del mismo frente — mismo unique que ya
 * exige la base). `tipo_medicion` siempre entra como 'digitado': el Excel
 * del plano no trae esa clasificación, se ajusta a mano después en la
 * tabla si una partida necesita calcularse de pernos/malla/cable. */
export function procesarFilasPartidasEdt(filasCrudas, { existentes }) {
  const codigosExistentes = new Set(existentes.map((p) => p.codigo_edt.trim().toUpperCase()))
  const vistosEnArchivo = new Set()
  let seccionActual = null

  const filas = []
  filasCrudas.forEach((f) => {
    if (!f.codigo_edt && !f.nombre) return // fila vacía

    if (esMarcadorVacio(f.unidad)) {
      seccionActual = f.nombre || seccionActual
      filas.push({
        fila: f._fila,
        codigo_edt: f.codigo_edt || '—',
        nombre: f.nombre,
        estado: 'seccion',
        motivo: 'Título de sección — agrupa las partidas siguientes, no se importa como partida.',
      })
      return
    }

    if (!f.codigo_edt || !f.nombre) {
      filas.push({ fila: f._fila, codigo_edt: f.codigo_edt || '—', estado: 'error', motivo: 'Faltan Ítem o Partida.' })
      return
    }

    const clave = f.codigo_edt.trim().toUpperCase()
    if (codigosExistentes.has(clave) || vistosEnArchivo.has(clave)) {
      filas.push({
        fila: f._fila,
        codigo_edt: f.codigo_edt,
        nombre: f.nombre,
        estado: 'error',
        motivo: 'Ese ítem ya existe en este frente (o está repetido en el archivo).',
      })
      return
    }

    const previsto = f.metrado_previsto && !esMarcadorVacio(f.metrado_previsto) ? normalizarNumero(f.metrado_previsto) : null
    if (f.metrado_previsto && !esMarcadorVacio(f.metrado_previsto) && previsto === null) {
      filas.push({ fila: f._fila, codigo_edt: f.codigo_edt, nombre: f.nombre, estado: 'error', motivo: 'Previsto inválido.' })
      return
    }

    vistosEnArchivo.add(clave)
    filas.push({
      fila: f._fila,
      codigo_edt: f.codigo_edt,
      nombre: f.nombre,
      seccion: f.seccion || seccionActual,
      unidad: f.unidad,
      metrado_previsto: previsto,
      estado: 'ok',
    })
  })

  return {
    total: filasCrudas.length,
    filas,
    aImportar: filas.filter((f) => f.estado === 'ok'),
    conError: filas.filter((f) => f.estado === 'error'),
    secciones: filas.filter((f) => f.estado === 'seccion'),
  }
}

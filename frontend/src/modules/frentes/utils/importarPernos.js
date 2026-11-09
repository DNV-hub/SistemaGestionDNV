// xlsx pesa ~485 KB: se descarga solo al leer un archivo.

const ALIAS_CAMPOS = {
  CODIGO: 'codigo',
  CÓDIGO: 'codigo',
  ZONA: 'zona',
  SISTEMA: 'sistema',
  UBICACION: 'ubicacion',
  UBICACIÓN: 'ubicacion',
  DIAMETRO: 'diametro',
  DIÁMETRO: 'diametro',
  LONGITUD: 'longitud',
  ANGULO: 'angulo',
  ÁNGULO: 'angulo',
  PLANO: 'plano',
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

/** Lee la tabla de pernos del plano (CSV/Excel generado desde el PDF):
 * Código, Zona, Sistema, Ubicación, Diámetro, Longitud, Ángulo, Plano. */
export async function leerArchivoPernos(file) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false })

  return filas.map((fila, idx) => {
    const registro = { _fila: idx + 1 }
    for (const [encabezado, valor] of Object.entries(fila)) {
      const campo = ALIAS_CAMPOS[normalizarEncabezado(encabezado)]
      if (!campo) continue
      registro[campo] = normalizarTexto(valor)
    }
    return registro
  })
}

/** Único requisito real es el Código — el resto es informativo.
 * La base tiene una clave única (frente, código): un código repetido DENTRO
 * del archivo no puede entrar dos veces (se omite el repetido); y uno que ya
 * existe en este frente no se rechaza: se ACTUALIZA con los datos del archivo
 * (por ejemplo, cuando cambió la ubicación en el plano nuevo). */
export function procesarFilasPernos(filasCrudas, { existentes }) {
  const codigosExistentes = new Set(existentes.map((p) => p.codigo.trim().toUpperCase()))
  const vistosEnArchivo = new Map()

  const filas = []
  filasCrudas.forEach((f) => {
    if (!f.codigo) return // fila vacía

    const diametro = f.diametro ? Number(f.diametro) : null
    const longitud = f.longitud ? Number(f.longitud) : null
    if ((diametro !== null && !Number.isFinite(diametro)) || (longitud !== null && !Number.isFinite(longitud))) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: 'Diámetro o longitud inválidos.' })
      return
    }

    const clave = f.codigo.trim().toUpperCase()
    if (vistosEnArchivo.has(clave)) {
      filas.push({ fila: f._fila, codigo: f.codigo, estado: 'error', motivo: `Código repetido en el archivo (ya está en la fila ${vistosEnArchivo.get(clave)}). Se omite.` })
      return
    }
    vistosEnArchivo.set(clave, f._fila)
    const existe = codigosExistentes.has(clave)

    filas.push({
      fila: f._fila,
      codigo: f.codigo,
      zona: f.zona || null,
      sistema: f.sistema || null,
      ubicacion: f.ubicacion || null,
      diametro,
      longitud,
      angulo: f.angulo || null,
      plano: f.plano || null,
      estado: 'ok',
      existe,
      advertencia: existe ? 'Ya existe en este frente: se actualiza con los datos del archivo.' : null,
    })
  })

  return {
    total: filasCrudas.length,
    filas,
    aImportar: filas.filter((f) => f.estado === 'ok'),
    conError: filas.filter((f) => f.estado === 'error'),
  }
}

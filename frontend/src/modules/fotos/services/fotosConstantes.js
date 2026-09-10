// Constantes del módulo Fotos. Igual que en RDC, estas cinco categorías no
// son un catálogo editable: definen cómo se nombra cada archivo y a qué
// carpeta de SharePoint llega (vía el campo `categoria` del payload). Un
// cambio acá altera el contrato con el flujo de Power Automate.

export const FOTO_TIPOS = {
  diarias: { categoria: 'Fotos RDC', etiqueta: 'Fotos diarias', color: '#2563EB' },
  redline: { categoria: 'Redlines', etiqueta: 'Redline', color: '#DC2626' },
  sketch_perf: { categoria: 'Sketch', etiqueta: 'Sketch — Perforación', color: '#059669' },
  sketch_iny: { categoria: 'Sketch', etiqueta: 'Sketch — Inyección', color: '#059669' },
  sketch_malla: { categoria: 'Sketch', etiqueta: 'Sketch — Malla', color: '#059669' },
}

// Ancho máximo y calidad JPEG al comprimir — igual que el RDC original, para
// que el tamaño de archivo que llega a SharePoint no cambie.
export const COMPRESION = { maxAncho: 1600, calidad: 0.7 }

/** Nombre de archivo por tipo. Redline es uno solo por envío (no lleva
 * índice); el resto numera correlativamente dentro de su categoría. */
export function nombreArchivoFoto(tipoFoto, idx, ctx) {
  const { rol, nombreSinEspacios, frente, fecha } = ctx
  if (tipoFoto === 'redline') return `Redline_${frente}_${fecha}.jpg`
  if (tipoFoto === 'sketch_perf') return `Sketch_${frente}_${fecha}_PERF_${idx + 1}.jpg`
  if (tipoFoto === 'sketch_iny') return `Sketch_${frente}_${fecha}_INY_${idx + 1}.jpg`
  if (tipoFoto === 'sketch_malla') return `Sketch_${frente}_${fecha}_MALLA_${idx + 1}.jpg`
  return `${rol}_${nombreSinEspacios}_${idx + 1}.jpg`
}

/** Redimensiona a `maxAncho` y recodifica en JPEG con `calidad` reducida.
 * Se comprime al SELECCIONAR la foto (no al enviar): así el envío offline
 * solo tiene que guardar y mandar texto (base64), sin retener el archivo
 * original completo en memoria hasta que haya señal. */
export function comprimirImagen(file, maxAncho = COMPRESION.maxAncho, calidad = COMPRESION.calidad) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      let w = img.width
      let h = img.height
      if (w > maxAncho) {
        h = Math.round(h * (maxAncho / w))
        w = maxAncho
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No se pudo comprimir la imagen'))
            return
          }
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('No se pudo leer la imagen comprimida'))
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        calidad,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

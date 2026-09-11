/** Descarga un .txt plano — para reportes que Almacén va a copiar y pegar a
 * mano en WhatsApp (o donde sea), sin depender del share nativo ni del
 * portapapeles del navegador, que no siempre funcionan igual en todos los
 * dispositivos. */
export function descargarTexto(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

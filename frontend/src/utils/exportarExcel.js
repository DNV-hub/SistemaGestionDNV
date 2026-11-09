// xlsx pesa ~485 KB: se descarga recién al exportar, no al abrir las pantallas
// que tienen el botón (Almacén, Kardex, Procura…).

/**
 * Descarga un .xlsx con una o más hojas. `hojas`: [{ nombre, filas }] donde
 * cada fila es un objeto plano { 'Encabezado': valor } — así el Excel sale
 * con los encabezados que uno define, no los nombres de campo internos.
 * `anchos` (opcional): ancho de cada columna en caracteres.
 */
export async function descargarExcel(nombreArchivo, hojas) {
  const XLSX = await import('xlsx')
  const libro = XLSX.utils.book_new()
  for (const { nombre, filas, anchos } of hojas) {
    const hoja = XLSX.utils.json_to_sheet(filas)
    if (anchos) hoja['!cols'] = anchos.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31)) // Excel limita el nombre de hoja a 31 caracteres
  }
  XLSX.writeFile(libro, nombreArchivo)
}

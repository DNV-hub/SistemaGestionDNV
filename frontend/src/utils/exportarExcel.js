import * as XLSX from 'xlsx'

/**
 * Descarga un .xlsx con una o más hojas. `hojas`: [{ nombre, filas }] donde
 * cada fila es un objeto plano { 'Encabezado': valor } — así el Excel sale
 * con los encabezados que uno define, no los nombres de campo internos.
 */
export function descargarExcel(nombreArchivo, hojas) {
  const libro = XLSX.utils.book_new()
  for (const { nombre, filas } of hojas) {
    const hoja = XLSX.utils.json_to_sheet(filas)
    XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31)) // Excel limita el nombre de hoja a 31 caracteres
  }
  XLSX.writeFile(libro, nombreArchivo)
}

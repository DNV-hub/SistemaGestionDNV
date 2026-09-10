/**
 * Convierte un valor de celda de Excel a número, tolerando separador de
 * miles con coma o con punto — independiente de cómo lo haya tipeado la
 * persona o de la configuración regional de su Excel. Sin esto, "1,000" o
 * "1.000" (para "mil") se leían como 1 (el separador se confundía con el
 * decimal) o directamente quedaban como inválidos.
 */
export function normalizarNumero(valor) {
  if (valor === null || valor === undefined) return null
  let texto = String(valor).trim().replace(/\s/g, '')
  if (!texto) return null

  const tieneComa = texto.includes(',')
  const tienePunto = texto.includes('.')

  if (tieneComa && tienePunto) {
    // El separador que aparece último es el decimal; el otro es de miles.
    texto =
      texto.lastIndexOf(',') > texto.lastIndexOf('.')
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto.replace(/,/g, '')
  } else if (tieneComa) {
    // Solo coma: de miles si son grupos de 3 dígitos (1,000 / 12,345,678),
    // decimal en cualquier otro caso (1000,5).
    texto = /^\d{1,3}(,\d{3})+$/.test(texto) ? texto.replace(/,/g, '') : texto.replace(',', '.')
  } else if (tienePunto && /^\d{1,3}(\.\d{3})+$/.test(texto)) {
    // Solo punto, en grupos de 3: de miles (1.000). Un punto decimal
    // normal (1000.5) ya es el formato nativo de JS, no hace falta tocarlo.
    texto = texto.replace(/\./g, '')
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

/**
 * Formatea una cantidad para mostrar, con separador de miles y hasta 3
 * decimales (los que haga falta, sin ceros de más) — mismo criterio que el
 * formato "Contabilidad" de Excel: agrupado de a miles, alineado a la
 * derecha (eso lo pone la clase .num en las tablas, no esta función).
 * null/undefined/'' se muestran como "—", nunca como "0" (evita confundir
 * "no hay dato" con "hay cero").
 */
export function formatearNumero(valor, { decimales = 3 } = {}) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return '—'
  return numero.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: decimales })
}


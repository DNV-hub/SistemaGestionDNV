// Mismo criterio que fn_rdc_codigo_orden (SQL): separa el prefijo
// alfabético del número final y arma una clave donde el número queda
// comparable con padding — así P10 ordena después de P4/P5 y antes de P46,
// en vez del orden de texto puro (P10, P4, P46, P5...).
function claveOrdenNatural(codigo) {
  const m = /^([A-Za-z]*)(\d+)?/.exec((codigo ?? '').trim())
  return (m?.[1] ?? '').toUpperCase() + String(m?.[2] ?? '0').padStart(8, '0')
}

export const compararCodigoNatural = (a, b) => claveOrdenNatural(a).localeCompare(claveOrdenNatural(b))

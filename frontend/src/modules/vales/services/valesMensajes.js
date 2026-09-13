// Mensaje listo para copiar y pegar en el grupo de WhatsApp de obra.
//
// Mientras no todos los supervisores usan la app (hoy solo uno lo hace de
// punta a punta; el resto sigue pidiendo por WhatsApp y Almacén transcribe
// el vale a mano), Almacén sigue necesitando avisarle a cada supervisor por
// ese mismo medio que ya se le atendió — es el reemplazo digital de "tomarle
// foto a la pantalla de confirmación y reenviarla al grupo" del flujo
// anterior con la app vieja.
/**
 * Mensaje de "acabo de pedir esto" para el grupo de WhatsApp de obra, con el
 * mismo formato que ya usaba el RDC original (el usuario pasó una captura
 * real como referencia) — mientras solo un supervisor usa la app de punta a
 * punta, el resto sigue avisando por acá que mandó un requerimiento.
 */
export function textoRequerimientoParaCompartir({ vale, supervisorNombre, actividad }) {
  const frente = vale?.frentes
  const areaSector = [frente?.area ? `A: ${frente.area}` : null, frente?.sector].filter(Boolean).join(' - ')
  const ubicacion = [areaSector, frente?.codigo].filter(Boolean).join(' › ') || '—'

  const horaTexto = vale?.created_at
    ? new Date(vale.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : ''

  const lineas = vale?.lineas ?? []
  const materiales = lineas.length
    ? lineas
        .map((l, i) => `${i + 1}. ${l.materiales?.descripcion ?? '—'} — ${l.cantidad_solicitada} ${l.materiales?.unidad ?? ''}`)
        .join('\n')
    : '—'

  return [
    '🎒 *REQUERIMIENTO DE MATERIAL*',
    `Vale: ${vale?.numero ?? '—'}`,
    '',
    `📍 Ubicación: ${ubicacion}`,
    `👷 Solicitado por: ${supervisorNombre ?? '—'}`,
    `🛠 Actividad: ${actividad || '—'}`,
    `📅 Fecha: ${vale?.fecha ?? '—'}${horaTexto ? ' 🕐 ' + horaTexto : ''}`,
    '',
    `MATERIALES (${lineas.length}):`,
    materiales,
  ].join('\n')
}

export function textoEntregaParaCompartir({ vale, material, unidad, cantidad, almacen, supervisorNombre, registradoPor, fecha = new Date() }) {
  const fechaTexto = fecha.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  return [
    '✅ *VALE ATENDIDO*',
    `Vale: ${vale?.numero ?? '—'}`,
    '',
    `📍 Frente: ${vale?.frentes?.nombre ?? '—'}`,
    `👷 Supervisor: ${supervisorNombre ?? '—'}`,
    '',
    '📦 *Material entregado:*',
    `${material} — ${cantidad} ${unidad}`,
    `Almacén: ${almacen ?? '—'}`,
    '',
    `📅 ${fechaTexto}`,
    `Registrado por: ${registradoPor ?? '—'}`,
  ].join('\n')
}

// Mensaje listo para copiar y pegar en el grupo de WhatsApp de obra.
//
// Mientras no todos los supervisores usan la app (hoy solo uno lo hace de
// punta a punta; el resto sigue pidiendo por WhatsApp y Almacén transcribe
// el vale a mano), Almacén sigue necesitando avisarle a cada supervisor por
// ese mismo medio que ya se le atendió — es el reemplazo digital de "tomarle
// foto a la pantalla de confirmación y reenviarla al grupo" del flujo
// anterior con la app vieja.
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

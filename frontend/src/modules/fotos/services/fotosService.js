const URL_POWER_AUTOMATE = import.meta.env.VITE_POWER_AUTOMATE_FOTOS_URL

/** Manda las fotos de UN envío (una categoría) al flujo de Power Automate.
 * Mismo contrato que el RDC original: éxito es únicamente HTTP 202. */
export async function enviarFotos(envio) {
  const respuesta = await fetch(URL_POWER_AUTOMATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fecha: envio.fecha,
      frente: envio.frenteNombre,
      rol: envio.rol,
      nombre: envio.nombre,
      categoria: envio.categoria,
      fotos: envio.fotos,
    }),
  })
  if (respuesta.status !== 202) throw new Error(`El flujo respondió HTTP ${respuesta.status}`)
}

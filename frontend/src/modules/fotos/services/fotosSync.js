import { ENVIO } from './fotosDb'
import { guardar, pendientes } from './fotosRepository'
import { enviarFotos } from './fotosService'

// Cola de envío en segundo plano — mismo patrón que rdcSync.js: un solo
// destino acá (no dos), así que es más simple, pero la idea es la misma:
// nunca bloquear al supervisor esperando señal, y reintentar con espera
// creciente para no golpear la red sin sentido si el envío falla siempre.
const ESPERA_MINUTOS = [0, 1, 5, 15, 60]

function toca(intentos, ultimoIntentoEn) {
  if (!ultimoIntentoEn) return true
  const espera = ESPERA_MINUTOS[Math.min(intentos, ESPERA_MINUTOS.length - 1)]
  return Date.now() - new Date(ultimoIntentoEn).getTime() >= espera * 60_000
}

let sincronizando = false

export async function sincronizar() {
  if (sincronizando || !navigator.onLine) return { enviados: 0, fallidos: 0, omitidos: 0 }
  sincronizando = true
  const resumen = { enviados: 0, fallidos: 0, omitidos: 0 }

  try {
    for (const envio of await pendientes()) {
      if (!toca(envio.intentos, envio.ultimoIntentoEn)) {
        resumen.omitidos++
        continue
      }

      const actual = { ...envio, ultimoIntentoEn: new Date().toISOString(), intentos: (envio.intentos ?? 0) + 1 }
      try {
        await enviarFotos(actual)
        actual.estado = ENVIO.ENVIADO
        actual.error = null
        resumen.enviados++
      } catch (e) {
        actual.estado = ENVIO.ERROR
        actual.error = e.message ?? String(e)
        resumen.fallidos++
      }
      await guardar(actual)
    }
  } finally {
    sincronizando = false
  }

  return resumen
}

export function iniciarSincronizacionAutomatica({ intervaloMinutos = 5 } = {}) {
  const correr = () => sincronizar()

  const alRecuperarSenal = () => correr()
  const alVolverAlaPestana = () => {
    if (document.visibilityState === 'visible') correr()
  }

  window.addEventListener('online', alRecuperarSenal)
  document.addEventListener('visibilitychange', alVolverAlaPestana)
  const temporizador = setInterval(correr, intervaloMinutos * 60_000)

  correr()

  return () => {
    window.removeEventListener('online', alRecuperarSenal)
    document.removeEventListener('visibilitychange', alVolverAlaPestana)
    clearInterval(temporizador)
  }
}

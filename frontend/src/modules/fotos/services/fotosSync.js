import { ENVIO } from './fotosDb'
import { guardar, pendientes } from './fotosRepository'
import { enviarFotos } from './fotosService'

// Cola de envío en segundo plano — mismo patrón que rdcSync.js: un solo
// destino acá (no dos), así que es más simple, pero la idea es la misma:
// nunca bloquear al supervisor esperando señal, y reintentar solo.
//
// nov-2026: en campo (señal móvil débil, pantalla que se apaga a mitad de la
// subida) un envío podía quedarse "colgado": la subida nunca terminaba ni
// fallaba, el candado `sincronizando` quedaba tomado y NINGÚN intento
// posterior corría hasta cerrar y abrir la app. Por eso ahora:
//  - cada envío tiene tiempo máximo (lo pone fotosService) y el candado se
//    libera solo si una vuelta se cuelga más de CANDADO_MAX_MS;
//  - la espera entre reintentos es corta (máx. 10 min) y se intenta cada
//    minuto mientras la app está abierta;
//  - "Reintentar" fuerza el envío sin esperar;
//  - la cola arranca al abrir CUALQUIER pantalla del RDC, no solo Fotos.
const ESPERA_MINUTOS = [0, 1, 2, 5, 10]
const CANDADO_MAX_MS = 4 * 60_000

function toca(intentos, ultimoIntentoEn) {
  if (!ultimoIntentoEn) return true
  const espera = ESPERA_MINUTOS[Math.min(intentos, ESPERA_MINUTOS.length - 1)]
  return Date.now() - new Date(ultimoIntentoEn).getTime() >= espera * 60_000
}

let sincronizandoDesde = 0

export async function sincronizar({ forzar = false } = {}) {
  const ocupado = sincronizandoDesde && Date.now() - sincronizandoDesde < CANDADO_MAX_MS
  if (ocupado || !navigator.onLine) return { enviados: 0, fallidos: 0, omitidos: 0 }
  const miVuelta = Date.now()
  sincronizandoDesde = miVuelta
  const resumen = { enviados: 0, fallidos: 0, omitidos: 0 }

  try {
    for (const envio of await pendientes()) {
      if (!forzar && !toca(envio.intentos, envio.ultimoIntentoEn)) {
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
        actual.error = e?.message ?? String(e)
        resumen.fallidos++
      }
      await guardar(actual)
      if (!navigator.onLine) break
    }
  } finally {
    // Solo suelta el candado si sigue siendo de esta vuelta (si se venció y
    // otra vuelta lo tomó, no se lo quita).
    if (sincronizandoDesde === miVuelta) sincronizandoDesde = 0
  }

  return resumen
}

let detener = null

/** Idempotente: se puede llamar desde el store de Fotos y desde el del RDC;
 * corre una sola cola por sesión. */
export function iniciarSincronizacionAutomatica({ intervaloMinutos = 1 } = {}) {
  if (detener) return detener
  const correr = () => sincronizar().catch(() => {})

  const alVolver = () => {
    if (document.visibilityState === 'visible') correr()
  }

  window.addEventListener('online', correr)
  window.addEventListener('focus', correr)
  window.addEventListener('pageshow', correr)
  document.addEventListener('visibilitychange', alVolver)
  const temporizador = setInterval(correr, intervaloMinutos * 60_000)

  correr()

  detener = () => {
    window.removeEventListener('online', correr)
    window.removeEventListener('focus', correr)
    window.removeEventListener('pageshow', correr)
    document.removeEventListener('visibilitychange', alVolver)
    clearInterval(temporizador)
    detener = null
  }
  return detener
}

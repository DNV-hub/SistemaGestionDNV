import { ENVIO, ESTADO } from './rdcDb'
import { guardar, pendientes, adoptar, marcarSyncBorrador } from './rdcRepository'
import { subirReporte, marcarEnvioSharepoint, obtenerActualizadoEnRemoto, obtenerReporteCompleto } from './rdcService'
import { construirWorkbook, workbookABase64, nombreArchivo } from './rdcExcel'

// Servicio de sincronización: recorre la cola de reportes cerrados y los envía
// a sus DOS destinos, que son independientes entre sí.
//
//   Supabase   -> los datos del reporte, para el Sistema.
//   SharePoint -> el Excel, vía el webhook de Power Automate, que es el
//                 entregable que la obra ya usa hoy.
//
// Se rastrean por separado porque uno puede fallar y el otro no, y reintentar
// el que ya salió bien sería duplicar trabajo (y, del lado de SharePoint,
// pisar un archivo que ya estaba bien).

const URL_POWER_AUTOMATE = import.meta.env.VITE_POWER_AUTOMATE_RDC_URL

// Espera creciente entre reintentos, en minutos, según cuántos van. Sin esto,
// un error permanente (un reporte que el servidor rechaza) haría que la app
// golpee la red cada vez que el supervisor la abre, gastándole batería y datos
// sin llegar nunca a nada.
const ESPERA_MINUTOS = [0, 1, 5, 15, 60]

function toca(intentos, ultimoIntentoEn) {
  if (!ultimoIntentoEn) return true
  const espera = ESPERA_MINUTOS[Math.min(intentos, ESPERA_MINUTOS.length - 1)]
  return Date.now() - new Date(ultimoIntentoEn).getTime() >= espera * 60_000
}

let sincronizando = false

/** Envía lo que esté pendiente. Devuelve un resumen de lo que pasó.
 *
 * Nunca lanza: la sincronización corre en segundo plano mientras el supervisor
 * usa la app, y un fallo de red no puede convertirse en un error visible que
 * interrumpa lo que está haciendo. Lo que sí hace es dejar el motivo escrito
 * en el reporte, para que la interfaz pueda mostrarlo. */
export async function sincronizar({ catalogos } = {}) {
  if (sincronizando || !navigator.onLine) return { enviados: 0, fallidos: 0, omitidos: 0 }
  sincronizando = true

  const resumen = { enviados: 0, fallidos: 0, omitidos: 0 }

  try {
    for (const reporte of await pendientes()) {
      // Un borrador solo viaja a Supabase, nunca a SharePoint — ese envío es
      // el entregable final (el Excel que ya usa la obra), no algo que
      // generar de nuevo cada pocos minutos mientras el supervisor todavía
      // está escribiendo. Esto es lo que permite empezar un reporte en el
      // celular y seguir en otro dispositivo.
      //
      // Antes de subir, hay que comparar: si el reporte ya viajó una vez y
      // OTRO dispositivo lo editó después (por ejemplo, se adoptó en la
      // laptop y se le siguió escribiendo ahí), la copia local de ESTE
      // dispositivo quedó vieja — subirla de todos modos pisaría el trabajo
      // más nuevo de la laptop con una versión atrasada. En ese caso hay que
      // bajar la versión del servidor en vez de subir la de acá.
      if (reporte.estado === ESTADO.BORRADOR) {
        // sector_id/frente_id/supervisor_id son NOT NULL del lado de
        // Supabase — un borrador recién creado, antes de que alguien
        // termine de elegirlos en el Paso 1, no tiene nada válido que
        // respaldar todavía. Sin este chequeo, cada intento de sync
        // mientras tanto fallaba con un error de columna que en realidad no
        // es un error: es que el supervisor (o quien esté llenando el
        // reporte) recién está empezando a escribirlo.
        if (!reporte.sectorId || !reporte.frenteId || !reporte.supervisorId) {
          resumen.omitidos++
          continue
        }
        try {
          const actualizadoEnRemoto = await obtenerActualizadoEnRemoto(reporte.id)
          if (actualizadoEnRemoto && new Date(actualizadoEnRemoto) > new Date(reporte.actualizadoEn)) {
            const completo = await obtenerReporteCompleto(reporte.id)
            if (completo) await adoptar(completo)
          } else {
            await subirReporte(reporte)
            await marcarSyncBorrador(reporte.id, { errorSupabase: null })
          }
          resumen.enviados++
        } catch (e) {
          // Se guarda el motivo real en el propio reporte (no solo en la
          // consola, que en un celular nadie puede revisar) para que la
          // lista lo muestre y se pueda diagnosticar sin herramientas de
          // desarrollador.
          console.error('No se pudo sincronizar un borrador de RDC', e)
          await marcarSyncBorrador(reporte.id, { errorSupabase: e.message ?? String(e) }).catch(() => {})
          resumen.fallidos++
        }
        continue
      }

      if (!toca(reporte.sharepointIntentos ?? 0, reporte.ultimoIntentoEn)) {
        resumen.omitidos++
        continue
      }

      let actual = { ...reporte, ultimoIntentoEn: new Date().toISOString() }
      let huboFallo = false

      // --- Destino 1: Supabase ---
      if (actual.estadoSupabase !== ENVIO.ENVIADO) {
        try {
          await subirReporte(actual)
          actual.estadoSupabase = ENVIO.ENVIADO
          actual.errorSupabase = null
        } catch (e) {
          actual.estadoSupabase = ENVIO.ERROR
          actual.errorSupabase = e.message ?? String(e)
          huboFallo = true
        }
      }

      // --- Destino 2: SharePoint, vía Power Automate ---
      if (actual.estadoSharepoint !== ENVIO.ENVIADO) {
        const intentos = (actual.sharepointIntentos ?? 0) + 1
        try {
          const archivo = nombreArchivo(actual, catalogos)
          const contenidoArchivo = workbookABase64(construirWorkbook(actual, catalogos))

          const respuesta = await fetch(URL_POWER_AUTOMATE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Exactamente la misma forma que manda el RDC actual. El flujo de
            // Power Automate depende de estos cuatro campos.
            body: JSON.stringify({
              nombreArchivo: archivo,
              contenidoArchivo,
              frente: nombreFrente(actual, catalogos),
              fecha: actual.fecha,
            }),
          })

          // El flujo responde 202 (aceptado) cuando lo tomó bien; cualquier
          // otra cosa es un fallo, igual que en el RDC actual.
          if (respuesta.status !== 202) throw new Error(`el flujo respondió HTTP ${respuesta.status}`)

          actual.estadoSharepoint = ENVIO.ENVIADO
          actual.sharepointNombreArchivo = archivo
          actual.sharepointEnviadoAt = new Date().toISOString()
          actual.sharepointError = null
          actual.sharepointIntentos = intentos
        } catch (e) {
          actual.estadoSharepoint = ENVIO.ERROR
          actual.sharepointError = e.message ?? String(e)
          actual.sharepointIntentos = intentos
          huboFallo = true
        }

        // Si el reporte ya está en Supabase, se le cuenta cómo le fue al otro
        // destino, para que el estado se pueda consultar desde cualquier
        // dispositivo y no solo desde el celular que lo emitió.
        if (actual.estadoSupabase === ENVIO.ENVIADO) {
          try {
            await marcarEnvioSharepoint(actual.id, {
              estado: actual.estadoSharepoint,
              nombreArchivo: actual.sharepointNombreArchivo,
              intentos: actual.sharepointIntentos,
              error: actual.sharepointError,
            })
          } catch {
            // Es solo informativo: que no se pueda anotar no cambia el hecho
            // de que el archivo llegó (o no) a SharePoint.
          }
        }
      }

      await guardar(actual)
      if (huboFallo) resumen.fallidos++
      else resumen.enviados++
    }
  } finally {
    sincronizando = false
  }

  return resumen
}

function nombreFrente(reporte, catalogos) {
  return catalogos?.frentes?.find((f) => f.id === reporte.frenteId)?.nombre ?? ''
}

/** Arranca la sincronización en segundo plano: al recuperar señal, al volver a
 * la pestaña, y cada tanto por si acaso. Devuelve la función para detenerla. */
export function iniciarSincronizacionAutomatica(obtenerCatalogos, { intervaloMinutos = 5 } = {}) {
  const correr = () => sincronizar({ catalogos: obtenerCatalogos() })

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

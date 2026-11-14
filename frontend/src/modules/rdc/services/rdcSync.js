import { textoCrudo } from '../../../utils/mensajeError'
import { ENVIO, ESTADO } from './rdcDb'
import { pendientes, adoptar, marcarSyncBorrador, marcarSyncFinalizado, obtener, idsBorradoresLocales, quitarBorradoresLocales } from './rdcRepository'
import { subirReporte, marcarEnvioSharepoint, obtenerActualizadoEnRemoto, obtenerReporteCompleto, idsArchivadosEnRemoto } from './rdcService'
import { nombreArchivo } from './rdcExcel'

// Servicio de sincronización: recorre la cola de reportes cerrados y los envía
// a sus DOS destinos, que son independientes entre sí.
//
//   Supabase   -> los datos del reporte, para el Sistema.
//   Excel      -> desde nov-2026 lo genera el agente de Planeamiento a
//                 partir de Supabase (antes: webhook de Power Automate).
//
// Se rastrean por separado porque uno puede fallar y el otro no, y reintentar
// el que ya salió bien sería duplicar trabajo (y, del lado de SharePoint,
// pisar un archivo que ya estaba bien).

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

/** Un borrador que se borró desde otro dispositivo sigue vivo en este: se
 * seguía resubiendo al servidor y, peor, sus pernos y paños contaban como
 * "ya reportados en otro reporte" y bloqueaban registrarlos en el reporte
 * real. Se quita de acá. Devuelve cuántos quitó; sin conexión no hace nada. */
export async function depurarBorradoresArchivados() {
  if (!navigator.onLine) return 0
  const archivados = await idsArchivadosEnRemoto(await idsBorradoresLocales())
  await quitarBorradoresLocales(archivados)
  return archivados.length
}

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
    try {
      await depurarBorradoresArchivados()
    } catch (e) {
      console.error('No se pudo depurar borradores archivados', e)
    }
    for (const referencia of await pendientes()) {
      // Siempre se relee la copia MÁS FRESCA de IndexedDB antes de decidir
      // qué hacer — nunca la snapshot de `pendientes()`, que pudo quedar
      // vieja si esta vuelta del loop tardó en llegar (reintentos, red
      // lenta, una cola larga de reportes por subir) y mientras tanto el
      // supervisor editó o finalizó este mismo reporte. Sin esto, un ciclo
      // que arrancó cuando el reporte todavía era Borrador podía terminar
      // subiéndolo así DESPUÉS de que ya se hubiera finalizado y enviado a
      // SharePoint — pisando el estado real con uno viejo (pasó de
      // verdad, ver el comentario de marcarSyncFinalizado()).
      const reporte = (await obtener(referencia.id)) ?? referencia

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
          await marcarSyncBorrador(reporte.id, { errorSupabase: textoCrudo(e) }).catch(() => {})
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
          actual.errorSupabase = textoCrudo(e)
          huboFallo = true
        }
      }

      // --- Destino 2: el Excel en OneDrive/Teams ---
      // Desde nov-2026 ya no lo manda el celular a Power Automate (el flujo
      // dejó de existir). Lo arma el agente de Planeamiento desde Supabase,
      // con esta misma lógica de rdcExcel.js. Por eso el celular solo da el
      // Excel por "entregado" cuando los datos ya están en Supabase: a partir
      // de ahí, que el archivo llegue a la carpeta es trabajo del agente.
      if (actual.estadoSharepoint !== ENVIO.ENVIADO && actual.estadoSupabase === ENVIO.ENVIADO) {
        actual.estadoSharepoint = ENVIO.ENVIADO
        actual.sharepointNombreArchivo = nombreArchivo(actual, catalogos)
        actual.sharepointEnviadoAt = new Date().toISOString()
        actual.sharepointError = null
        actual.sharepointIntentos = (actual.sharepointIntentos ?? 0) + 1

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

      // Update parcial, no un guardado del objeto `actual` completo: solo
      // toca los campos de estado de envío, nunca `estado` ni el resto del
      // contenido — así, si el supervisor editó el reporte MIENTRAS se
      // subía, esto no le pisa nada.
      await marcarSyncFinalizado(reporte.id, {
        estadoSupabase: actual.estadoSupabase,
        errorSupabase: actual.errorSupabase,
        estadoSharepoint: actual.estadoSharepoint,
        sharepointNombreArchivo: actual.sharepointNombreArchivo,
        sharepointEnviadoAt: actual.sharepointEnviadoAt,
        sharepointError: actual.sharepointError,
        sharepointIntentos: actual.sharepointIntentos,
        ultimoIntentoEn: actual.ultimoIntentoEn,
      })
      if (huboFallo) resumen.fallidos++
      else resumen.enviados++
    }
  } finally {
    sincronizando = false
  }

  return resumen
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

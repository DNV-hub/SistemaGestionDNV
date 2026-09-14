import { db, CATALOGOS, ENVIO, ESTADO } from './rdcDb'

// Repositorio local: la ÚNICA fuente de verdad para las vistas del RDC.
// Ninguna vista habla con Supabase; escriben acá y el servicio de
// sincronización se encarga del resto cuando haya señal.

export const nuevoId = () => crypto.randomUUID()

/** Fecha de hoy en horario local, no UTC.
 *
 * El RDC original tiene este mismo cuidado y vale repetirlo: `toISOString()`
 * convierte a UTC, y en Perú (UTC-5) eso adelanta el día a partir de las 7 de
 * la tarde. Un reporte llenado el lunes a las 8 pm quedaría fechado el martes. */
export function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Las cinco categorías de mano de obra directa, que el reporte siempre lleva
 * aunque queden en cero (así se exportan al Excel). */
const PERSONAL_DIRECTO = ['Capataz', 'Operario', 'Oficial', 'Peón', 'Vigía']

/** Roles que solo aplican al sector Sala Eléctrica. En el RDC original esto se
 * decide comparando el nombre del sector con un texto exacto; acá se resuelve
 * con la lista de categorías, que es dato y no una comparación de cadenas
 * escondida en el código. */
export const PERSONAL_INDIRECTO_SALA_ELECTRICA = [
  'Ingeniero residente',
  'Supervisor de campo',
  'Ingeniero de seguridad',
  'Ingeniero de calidad',
  'Topógrafo',
]

/** `personalPrevio`/`maquinariaPrevia`: la cuadrilla y el equipo del último
 * reporte, para arrancar el de hoy con eso puesto en vez de en cero — así
 * funcionaba el RDC original, y es lo que de verdad pasa en el frente: la
 * cuadrilla y el equipo rara vez cambian de un día al otro, así que el
 * supervisor ajusta lo que sí cambió (alguien faltó, llegó una máquina
 * nueva) en vez de volver a tipear todo. Si no se pasa nada, cae al default
 * de siempre (las cinco categorías directas en cero, sin maquinaria). */
export function crearBorrador({
  supervisorId = null,
  creadoPor,
  sectorId = null,
  frenteId = null,
  capatazId = null,
  personalPrevio = null,
  maquinariaPrevia = null,
} = {}) {
  const ahora = new Date().toISOString()
  return {
    id: nuevoId(),
    fecha: hoyLocal(),
    sectorId,
    frenteId,
    supervisorId,
    capatazId,
    creadoPor,
    estado: ESTADO.BORRADOR,

    restriccionAcceso: false,
    restriccionDescripcion: '',
    restriccionInicio: null,
    restriccionFin: null,
    refrigerioSalida: null,
    refrigerioRetorno: null,

    observaciones: '',
    requerimientos: '',
    restricciones: '',

    redline: false,
    redlineSupervisorId: null,
    redlineDescripcion: '',

    esCorreccion: false,

    estadoSupabase: ENVIO.PENDIENTE,
    estadoSharepoint: ENVIO.PENDIENTE,
    sharepointNombreArchivo: null,
    sharepointEnviadoAt: null,
    sharepointIntentos: 0,
    sharepointError: null,

    creadoEnDispositivo: ahora,
    actualizadoEn: ahora,

    personal: personalPrevio
      ? personalPrevio.map((p) => ({ ...p, id: nuevoId() }))
      : PERSONAL_DIRECTO.map((categoria, i) => ({
          id: nuevoId(),
          categoria,
          tipo: 'directa',
          cantidad: 0,
          orden: i + 1,
        })),
    maquinaria: maquinariaPrevia ? maquinariaPrevia.map((m) => ({ ...m, id: nuevoId() })) : [],
    hitos: [],
    metrados: [],
    elementos: [],
    bitacora: [],
    standby: [],
    programacion: [],
  }
}

/** Clona un reporte anterior COMPLETO como punto de partida de uno nuevo:
 * además de sector/frente/supervisor/capataz/cuadrilla/equipo (que ya trae
 * crearBorrador()), copia también el trabajo del día — hitos, metrados,
 * elementos de sostenimiento, bitácora, stand by, programación,
 * observaciones, restricciones, redline — tal cual quedó el último.
 *
 * NO es el comportamiento por defecto: el trabajo del día cambia a diario
 * (cuánto se perforó, qué paró, qué se observó) y repetirlo solo produciría
 * reportes con los números de ayer si el supervisor se olvida de
 * actualizar cada campo antes de enviar. Es un modo explícito, pedido para
 * un usuario puntual cuya rutina sí se repite día a día — se activa por
 * cuenta (usuarios.rdc_heredar_reporte_completo), no globalmente.
 *
 * `anterior` puede colgar del estado reactivo de Pinia (el mismo problema
 * de Proxies que ya resuelve guardar(), ver su comentario) — por eso el
 * primer paso es siempre un `structuredClone` vía JSON, antes de tocar
 * nada. Cada fila de las listas anidadas recibe un id nuevo: son filas
 * nuevas en Supabase, no la misma fila del reporte viejo — reusar el id
 * chocaría con la fila original al sincronizar. */
export function crearBorradorDesde(anterior, { creadoPor }) {
  const ahora = new Date().toISOString()
  const clon = JSON.parse(JSON.stringify(anterior))
  const regenerarIds = (lista) => (lista ?? []).map((item) => ({ ...item, id: nuevoId() }))

  return {
    ...clon,
    id: nuevoId(),
    fecha: hoyLocal(),
    creadoPor,
    estado: ESTADO.BORRADOR,
    esCorreccion: false,

    estadoSupabase: ENVIO.PENDIENTE,
    estadoSharepoint: ENVIO.PENDIENTE,
    sharepointNombreArchivo: null,
    sharepointEnviadoAt: null,
    sharepointIntentos: 0,
    sharepointError: null,
    errorSupabase: null,

    creadoEnDispositivo: ahora,
    actualizadoEn: ahora,

    personal: regenerarIds(clon.personal),
    maquinaria: regenerarIds(clon.maquinaria),
    hitos: regenerarIds(clon.hitos),
    metrados: regenerarIds(clon.metrados),
    elementos: regenerarIds(clon.elementos),
    bitacora: regenerarIds(clon.bitacora),
    standby: regenerarIds(clon.standby),
    programacion: regenerarIds(clon.programacion),
  }
}

export async function guardar(reporte) {
  // `reporte` es (o cuelga de) el estado reactivo de Pinia. Un `{...spread}`
  // superficial no alcanza: Vue envuelve en un Proxy nuevo cada array/objeto
  // anidado en cuanto se LEE a través del proxy raíz, así que el spread
  // termina copiando esos proxies, no los datos planos de abajo. Peor
  // todavía, algunas operaciones del store (reasignar `personal` completo
  // tras filtrar/mapear, por ejemplo) guardan esos proxies como VALOR dentro
  // del array — a partir de ahí ni `toRaw()` en la raíz los limpia, porque
  // ya no son una envoltura de lectura: son el dato mismo.
  //
  // IndexedDB no puede clonar un Proxy (`DataCloneError`), así que
  // cualquiera de estos casos hacía fallar el guardado ENTERO en silencio
  // — no solo el campo contaminado, todo el objeto, porque el clonado
  // estructurado es atómico. `JSON.parse(JSON.stringify(...))` no tiene este
  // problema: como stringify lee cada valor a través de cualquier trampa que
  // exista y el resultado es texto, lo que sale de parsearlo de vuelta son
  // siempre objetos y arrays nativos, nunca proxies, sin importar cuántos
  // haya atrapados ni cómo hayan llegado ahí.
  const plano = JSON.parse(JSON.stringify(reporte))
  const conMarca = { ...plano, actualizadoEn: new Date().toISOString() }
  await db.reportes.put(conMarca)
  return conMarca
}

/** Escribe el reporte tal cual llega, SIN pisar `actualizadoEn` con la hora
 * actual como sí hace `guardar()`. Existe para adoptar la versión de OTRO
 * dispositivo: `actualizadoEn` tiene que seguir diciendo cuándo se editó de
 * verdad el contenido (lo que ya trae calculado `obtenerReporteCompleto`,
 * tomado del `updated_at` del servidor), no el instante en que este
 * dispositivo lo bajó — si no, la próxima comparación de "quién tiene la
 * versión más nueva" saldría mal y este dispositivo terminaría resubiendo
 * de vuelta lo que acaba de bajar, como si lo hubiera editado él. */
export async function adoptar(reporte) {
  const plano = JSON.parse(JSON.stringify(reporte))
  await db.reportes.put(plano)
  return plano
}

/** Anota el resultado de un intento de sincronización de borrador en
 * segundo plano sin tocar `actualizadoEn`, por la misma razón que `adoptar`:
 * que la app haya intentado subirlo no significa que el supervisor haya
 * editado el contenido recién. */
export async function marcarSyncBorrador(id, { errorSupabase }) {
  await db.reportes.update(id, { errorSupabase })
}

/** Igual que `marcarSyncBorrador`, para el resultado de sincronizar un
 * reporte ya FINALIZADO (los dos destinos, Supabase y SharePoint): un
 * update PARCIAL que solo toca los campos de estado de envío, nunca
 * `estado` ni el contenido del formulario ni `actualizadoEn`.
 *
 * Es crítico que sea parcial y no un `guardar()` de objeto completo: el
 * ciclo de sync arma su resultado a partir de una copia del reporte que
 * pudo leer minutos antes (reintentos, red lenta, una cola larga de
 * reportes por subir) — si mientras tanto el supervisor terminó de
 * llenarlo y lo finalizó, un guardado de objeto completo con esa copia
 * vieja resucitaría el reporte como Borrador por encima de lo que el
 * supervisor acaba de hacer. Pasó de verdad: un reporte llegó a
 * SharePoint (estado_sharepoint quedó "enviado") pero el campo `estado`
 * en Supabase volvió a decir "Borrador", porque el guardado final de ese
 * ciclo pisó el objeto entero con la snapshot vieja. */
export async function marcarSyncFinalizado(id, campos) {
  await db.reportes.update(id, campos)
}

export const obtener = (id) => db.reportes.get(id)

/** Historial local, del más reciente al más antiguo. */
export async function listar() {
  const todos = await db.reportes.toArray()
  return todos.sort((a, b) => (a.fecha === b.fecha ? b.actualizadoEn.localeCompare(a.actualizadoEn) : b.fecha.localeCompare(a.fecha)))
}

/** Solo se borran borradores: un reporte ya finalizado es registro histórico
 * y puede estar esperando sincronizar. Antes esto devolvía `false` en
 * silencio si no se cumplía la condición — el botón de borrar parecía no
 * hacer nada, sin ninguna pista de por qué. Ahora avisa el motivo. */
export async function eliminarBorrador(id) {
  const reporte = await db.reportes.get(id)
  if (!reporte) throw new Error('Este reporte ya no está en el dispositivo.')
  if (reporte.estado !== ESTADO.BORRADOR) throw new Error('Solo se pueden borrar reportes que todavía son borrador.')
  await db.reportes.delete(id)
  return true
}

/** Lo que el servicio de sincronización tiene que revisar en cada ciclo:
 * los reportes ya cerrados que todavía no llegaron a alguno de los dos
 * destinos, MÁS todos los borradores activos — estos últimos se resuben
 * completos en cada ciclo (no solo cuando cambian) para que un supervisor
 * pueda empezar un reporte en el celular y seguir en otro dispositivo esa
 * misma noche; el propio servicio de sincronización decide qué hacer con
 * cada tipo (ver rdcSync.js). */
export async function pendientes() {
  const finalizados = await db.reportes.where('estado').equals(ESTADO.FINALIZADO).toArray()
  const finalizadosPendientes = finalizados.filter((r) => r.estadoSupabase !== ENVIO.ENVIADO || r.estadoSharepoint !== ENVIO.ENVIADO)
  const borradores = await db.reportes.where('estado').equals(ESTADO.BORRADOR).toArray()
  return [...finalizadosPendientes, ...borradores]
}

export async function guardarCatalogos(catalogos) {
  const filas = Object.entries(catalogos).map(([clave, datos]) => ({
    clave,
    datos,
    actualizadoEn: new Date().toISOString(),
  }))
  await db.catalogos.bulkPut(filas)
}

/** Devuelve todos los catálogos como un objeto plano; las claves que falten
 * vienen como lista vacía, para que la interfaz no tenga que comprobar nulos. */
export async function leerCatalogos() {
  const filas = await db.catalogos.toArray()
  const porClave = Object.fromEntries(filas.map((f) => [f.clave, f.datos]))
  return Object.fromEntries(CATALOGOS.map((c) => [c, porClave[c] ?? []]))
}

/** Sin frentes no se puede llenar un reporte: es la señal de que todavía nunca
 * hubo una carga de catálogos con conexión. */
export async function hayCatalogos() {
  const frentes = await db.catalogos.get('frentes')
  return !!frentes?.datos?.length
}

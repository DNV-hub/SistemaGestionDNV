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

export function crearBorrador({ supervisorId = null, creadoPor, sectorId = null, frenteId = null, capatazId = null } = {}) {
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

    personal: PERSONAL_DIRECTO.map((categoria, i) => ({
      id: nuevoId(),
      categoria,
      tipo: 'directa',
      cantidad: 0,
      orden: i + 1,
    })),
    maquinaria: [],
    hitos: [],
    metrados: [],
    elementos: [],
    bitacora: [],
    standby: [],
    programacion: [],
  }
}

export async function guardar(reporte) {
  const conMarca = { ...reporte, actualizadoEn: new Date().toISOString() }
  await db.reportes.put(conMarca)
  return conMarca
}

export const obtener = (id) => db.reportes.get(id)

/** Historial local, del más reciente al más antiguo. */
export async function listar() {
  const todos = await db.reportes.toArray()
  return todos.sort((a, b) => (a.fecha === b.fecha ? b.actualizadoEn.localeCompare(a.actualizadoEn) : b.fecha.localeCompare(a.fecha)))
}

/** Solo se borran borradores: un reporte ya finalizado es registro histórico
 * y puede estar esperando sincronizar. */
export async function eliminarBorrador(id) {
  const reporte = await db.reportes.get(id)
  if (!reporte || reporte.estado !== ESTADO.BORRADOR) return false
  await db.reportes.delete(id)
  return true
}

/** Todo lo que ya se cerró pero todavía no llegó a alguno de los dos destinos.
 * Es la cola que recorre el servicio de sincronización. */
export async function pendientes() {
  const todos = await db.reportes.where('estado').equals(ESTADO.FINALIZADO).toArray()
  return todos.filter((r) => r.estadoSupabase !== ENVIO.ENVIADO || r.estadoSharepoint !== ENVIO.ENVIADO)
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

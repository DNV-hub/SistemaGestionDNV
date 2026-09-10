import { db, ENVIO } from './fotosDb'

export const nuevoId = () => crypto.randomUUID()

/** Un envío por categoría: fecha, frente, quién lo tomó y las fotos ya
 * comprimidas (nombreArchivo + contenidoArchivo en base64), listas para
 * mandar tal cual al flujo de Power Automate.
 *
 * `rol` y `nombre` quedan grabados EN el envío, no se recalculan al
 * reintentar: si el envío se creó hoy y recién sale mañana (porque no hubo
 * señal), tiene que seguir diciendo quién tomó las fotos, no quien esté
 * usando el dispositivo en el momento en que finalmente se manda. */
export function crearEnvio({ fecha, frenteId, frenteNombre, rol, nombre, categoria, etiqueta, fotos }) {
  return {
    id: nuevoId(),
    fecha,
    frenteId,
    frenteNombre,
    rol,
    nombre,
    categoria,
    etiqueta,
    fotos,
    estado: ENVIO.PENDIENTE,
    intentos: 0,
    error: null,
    creadoEn: new Date().toISOString(),
  }
}

export async function guardar(envio) {
  // Mismo motivo que en rdcRepository: JSON.parse(JSON.stringify()) evita
  // que un Proxy reactivo de Vue (o uno atrapado dentro de un array por una
  // reasignación previa) llegue a IndexedDB, que no puede clonarlo y hace
  // fallar la escritura entera en silencio.
  const plano = JSON.parse(JSON.stringify(envio))
  await db.envios.put(plano)
  return plano
}

export const obtener = (id) => db.envios.get(id)

export async function listar() {
  const todos = await db.envios.toArray()
  return todos.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
}

export const pendientes = () => db.envios.where('estado').notEqual(ENVIO.ENVIADO).toArray()

export async function eliminar(id) {
  await db.envios.delete(id)
}

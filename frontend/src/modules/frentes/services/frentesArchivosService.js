import { supabase } from '../../../services/supabaseClient'

const BUCKET = 'frentes-archivos'

/** Sube (o reemplaza, `upsert`) el mapa del sector o la firma del residente
 * de un frente. El nombre del archivo es fijo por tipo (siempre
 * "mapa-sector.<ext>"/"firma-residente.<ext>") para que subir uno nuevo
 * reemplace al anterior en vez de acumular versiones sueltas en el bucket.
 * Devuelve la RUTA dentro del bucket (no una URL pública: el bucket es
 * privado) — lo que se guarda en frentes.mapa_sector_url/firma_residente_url
 * es esa ruta; para mostrar el archivo hace falta pedir una URL firmada
 * (ver obtenerUrlFirmada). */
export async function subirArchivoFrente(frenteId, tipo, file) {
  const ext = file.name.split('.').pop()
  const ruta = `${frenteId}/${tipo}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, file, { upsert: true })
  if (error) throw error
  return ruta
}

/** URL temporal (1 hora) para mostrar/descargar un archivo privado del
 * bucket — se pide de nuevo cada vez que hace falta, nunca se guarda. */
export async function obtenerUrlFirmada(ruta) {
  if (!ruta) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 3600)
  if (error) throw error
  return data.signedUrl
}

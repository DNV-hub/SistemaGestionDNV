import { supabase } from '../../../services/supabaseClient'

// Destino de las fotos: Supabase Storage (espacio privado `rdc-fotos`) + una
// fila en `rdc_fotos_envios`. Reemplaza al flujo de Power Automate (que dejó
// de existir en nov-2026). Desde ahí, el agente local de Planeamiento copia
// cada archivo a la carpeta de OneDrive/Teams de siempre.
//
// Idempotente a propósito: la cola reintenta el MISMO envío (mismo id) hasta
// que sale bien, así que tanto los archivos (upsert) como la fila (upsert por
// id) se pueden volver a mandar sin duplicar nada.

const ESPACIO = 'rdc-fotos'

function base64ABlob(base64, tipo = 'image/jpeg') {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

/** Ruta dentro del espacio: solo caracteres seguros (los nombres de frente
 * traen tildes, "°" y espacios, que Storage no acepta en las claves). El
 * nombre legible del archivo se guarda aparte, en la fila del envío. */
function rutaArchivo(envio, indice) {
  const carpetaFrente = envio.frenteId || 'sin-frente'
  return `${envio.fecha}/${carpetaFrente}/${envio.id}/${String(indice + 1).padStart(2, '0')}.jpg`
}

/** Sube las fotos de UN envío (una categoría) y registra el envío. */
export async function enviarFotos(envio) {
  const archivos = []
  for (const [i, foto] of (envio.fotos ?? []).entries()) {
    const path = rutaArchivo(envio, i)
    const { error } = await supabase.storage
      .from(ESPACIO)
      .upload(path, base64ABlob(foto.contenidoArchivo), { contentType: 'image/jpeg', upsert: true })
    if (error) throw error
    archivos.push({ path, nombreArchivo: foto.nombreArchivo })
  }

  const { error } = await supabase.from('rdc_fotos_envios').upsert(
    {
      id: envio.id,
      fecha: envio.fecha,
      frente_id: envio.frenteId ?? null,
      frente_nombre: envio.frenteNombre,
      rol: envio.rol ?? null,
      nombre: envio.nombre ?? null,
      categoria: envio.categoria,
      etiqueta: envio.etiqueta ?? null,
      archivos,
      creado_en_dispositivo: envio.creadoEn ?? null,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

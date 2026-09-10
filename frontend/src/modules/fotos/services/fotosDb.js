import Dexie from 'dexie'

// Base local del módulo Fotos. Mismo motivo que en RDC: el envío de fotos se
// hace desde el frente, a veces sin señal, y no puede depender de tener
// conexión en el momento exacto en que el supervisor termina de fotografiar.
//
// Cada fila es un ENVÍO por categoría (diarias, redline, sketch_perf, …), no
// una foto suelta: el flujo de Power Automate recibe las fotos de una
// categoría en un solo POST, así que esa es también la unidad que se
// encola y se reintenta.
export const db = new Dexie('rdc_fotos')

db.version(1).stores({
  envios: 'id, estado, creadoEn',
})

export const ENVIO = {
  PENDIENTE: 'pendiente',
  ENVIADO: 'enviado',
  ERROR: 'error',
}

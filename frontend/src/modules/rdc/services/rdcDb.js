import Dexie from 'dexie'

// Base local del módulo RDC (IndexedDB, vía Dexie).
//
// POR QUÉ EXISTE: el resto de los módulos del Sistema consulta Supabase
// directamente desde sus services, lo cual está bien para back-office con
// conexión estable. El RDC no puede: los supervisores llenan el reporte en
// mina, sin señal, y a veces sincronizan días después. Todo lo que la interfaz
// muestra sale de acá, nunca de la red.
//
// POR QUÉ UN REPORTE ES UN SOLO DOCUMENTO Y NO NUEVE TABLAS COMO EN POSTGRES:
// IndexedDB no tiene joins, y el formulario trabaja con el reporte entero en
// memoria (personal, hitos, metrados, elementos, bitácora, stand by y
// programación son listas anidadas). Guardarlo tal como se edita evita
// rearmarlo en cada pantalla; la forma relacional solo hace falta al
// sincronizar, y esa traducción vive en rdcService.
export const db = new Dexie('rdc')

db.version(1).stores({
  // `id` es el UUID generado en el cliente — el mismo que va a Postgres, para
  // que reintentar un envío interrumpido sea idempotente.
  reportes: 'id, fecha, estado, estadoSupabase, estadoSharepoint, actualizadoEn',
  // Una fila por catálogo (clave = 'frentes', 'supervisores', …). Se refrescan
  // cuando hay conexión y sirven para que el formulario se pueda dibujar sin
  // ella.
  catalogos: 'clave',
})

export const CATALOGOS = [
  'sectores',
  'frentes',
  'supervisores',
  'capataces',
  'redlineSupervisores',
  'prefijos',
  'maquinarias',
  'partidasEstandar',
  'partidasEdt',
  'pernos',
]

// Estados de envío, uno por destino. Son independientes a propósito: un
// reporte puede haber llegado a Supabase y haber fallado el webhook de
// SharePoint, o al revés, y cada uno se reintenta por su cuenta.
export const ENVIO = {
  PENDIENTE: 'pendiente',
  ENVIADO: 'enviado',
  ERROR: 'error',
}

export const ESTADO = {
  BORRADOR: 'Borrador',
  FINALIZADO: 'Finalizado',
}

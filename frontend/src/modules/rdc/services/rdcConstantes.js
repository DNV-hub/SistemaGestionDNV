// Constantes del RDC.
//
// POR QUÉ ESTO NO ES UNA TABLA: varias de estas listas definen COLUMNAS del
// Excel que se envía a SharePoint (los 8 hitos y los 10 tipos de maquinaria son
// una columna cada uno en la hoja RDC). Si vivieran en una tabla
// administrable, agregar una fila cambiaría en silencio la forma del archivo y
// rompería el flujo de Power Automate que lo consume. Quedan acá, fijas y con
// este comentario, hasta que ese contrato se pueda cambiar a propósito.
//
// Las que sí son catálogo editable —frentes, supervisores, capataces,
// prefijos, maquinaria, partidas— viven en las tablas `rdc_*`.

export const HITOS = [
  'Llegada a frente de trabajo',
  'Inicio de charla de seguridad',
  'Término de charla de seguridad',
  'Término de llenado de documentos',
  'Firma de PETAR',
  'Inicio de actividades en piso',
  'Inicio de actividades en talud',
  'Término de jornada',
]

// Los cuatro hitos que además tienen consecuencias de cálculo, referenciados
// por nombre y no por posición: el orden de la lista puede cambiar, lo que
// significan no.
export const HITO_LLEGADA = 'Llegada a frente de trabajo'
export const HITO_TERMINO_DOCUMENTOS = 'Término de llenado de documentos'
export const HITO_INICIO_PISO = 'Inicio de actividades en piso'
export const HITO_TERMINO_JORNADA = 'Término de jornada'

// Orden exacto en que estos diez tipos aparecen como columnas de la hoja RDC.
export const EQUIPOS_PERFORACION = ['Compresora', 'Perforador sobre patín', 'Estación Hidráulica', 'Inyectora', 'Martillo de mano']
export const EQUIPOS_SOPORTE = ['Retroexcavadora', 'Camión grúa', 'Camión Baranda', 'Camioneta', 'Minibús']

export const CAUSAS_STANDBY = [
  'STAND BY GENERADO POR OTROS CONTRATISTAS',
  'STAND BY POR CAUSA DEL CLIENTE',
  'STAND BY POR CLIMA ADVERSO',
  'STAND BY POR PROBLEMAS EXTERNOS (CIERRE DE VÍAS DE COMUNIDADES)',
  'STAND BY POR FALTA DE FRENTE, CAMBIO DE INGENIERÍA REPENTINA, ETC.',
  'CIERRE DE VÍAS POR ENCAPSULADOS',
]

// Esta causa se declara con un tiempo total en horas y minutos en vez de un
// rango horario, porque la parada no ocurre en un tramo continuo del día.
export const CAUSA_TIEMPO_TOTAL = 'CIERRE DE VÍAS POR ENCAPSULADOS'

export const TIPOS_PERNO = ['BAHE', 'Autoperforante']
export const DIAMETROS_PERNO = ['25mm', '32mm']
export const UBICACIONES_ELEMENTO = ['Cabecera', 'Lateral', 'Viento', 'Pie', 'Cuerpo', 'Pie de banqueta']
export const TIPOS_MALLA = ['Minax 80/4', 'Minax 80/3', 'Tecco 65/3', 'Tecco 65/4', 'Geotextil', 'Geomalla', 'Deltax G80/2']
export const TIPOS_CABLE = ['12 mm', '16mm', '19mm', '22mm']
export const UNIDADES = ['ML', 'M2', 'M3', 'UND', 'HH', 'GLB', 'VIAJE']

// Nombre exacto del sector que además reporta mano de obra indirecta. En el
// RDC original esto es una comparación de texto suelta en medio del código de
// exportación; acá al menos está en un solo lugar y con nombre.
//
// Antes de 20260911170000 este sector vivía en rdc_sectores con el nombre
// "A: 4000 - SALA ELECTRICA" (el RDC codificaba el área en el propio texto).
// Al unificarse con la tabla `sectores` del Sistema (que no tiene esa
// convención) se limpió a "SALA ELECTRICA" — si esta constante no se
// actualiza junto con esa migración, el personal indirecto de este sector
// deja de agregarse solo, en silencio.
export const SECTOR_SALA_ELECTRICA = 'SALA ELECTRICA'

// Grilla de medias horas (05:00 a 22:30) que usan los selectores de horario de
// los metrados.
export const MEDIAS_HORAS = Array.from({ length: 36 }, (_, i) => {
  const h = Math.floor(i / 2) + 5
  return `${String(h).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`
})

// Las cinco agrupaciones del bloque 2 tal como se resumen en la hoja METRADOS.
export const GRUPOS_CRITICOS = [
  { partida: 'Perforaciones', unidad: 'ML', elemento: 'Perno', actividad: 'Perforación', cuentaPernos: true },
  { partida: 'Inyecciones', unidad: 'ML', elemento: 'Perno', actividad: 'Inyección', cuentaPernos: true },
  { partida: 'Instalación de mallas', unidad: 'M2', elemento: 'Malla', actividad: 'Instalación', cuentaPernos: false },
  { partida: 'Instalación de cable', unidad: 'ML', elemento: 'Cable', actividad: 'Instalación', cuentaPernos: false },
  { partida: 'Ensayos Pull Test', unidad: 'UND', elemento: 'Perno', actividad: 'Pull Test', cuentaPernos: false },
]

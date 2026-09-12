// Traduce los mensajes de error crudos de Postgres/Supabase (en inglés, con
// nombres de columnas y de restricciones) a una explicación breve en
// español para quien está mirando la lista de reportes. No reemplaza el
// mensaje real: lo antecede, porque diagnosticar un caso nuevo que este
// archivo todavía no reconoce necesita el detalle técnico tal cual llegó.

const PATRONES = [
  // Un borrador recién creado (o al que todavía le falta completar el
  // paso Datos) no tiene sector/frente/supervisor — normal mientras el
  // supervisor sigue llenándolo; el sync los reintenta solo en cuanto se
  // completen. No es un error del sistema, es información de estado.
  { prueba: /null value in column "sector_id"/, resumen: 'Todavía falta elegir el sector.' },
  { prueba: /null value in column "frente_id"/, resumen: 'Todavía falta elegir el frente.' },
  { prueba: /null value in column "supervisor_id"/, resumen: 'Todavía falta elegir el supervisor.' },

  // El frente/sector/supervisor que este reporte tenía guardado ya no
  // existe en el catálogo (por ejemplo, se reorganizó o se borró) — hay
  // que volver a elegirlo en el paso Datos para que pueda sincronizar.
  { prueba: /rdc_reportes_frente_id_fkey/, resumen: 'El frente elegido ya no existe en el catálogo: vuelve a elegirlo en el paso Datos.' },
  { prueba: /rdc_reportes_sector_id_fkey/, resumen: 'El sector elegido ya no existe en el catálogo: vuelve a elegirlo en el paso Datos.' },
  { prueba: /rdc_reportes_supervisor_id_fkey/, resumen: 'El supervisor elegido ya no existe en el catálogo: vuelve a elegirlo en el paso Datos.' },
  { prueba: /rdc_reportes_capataz_id_fkey/, resumen: 'El capataz elegido ya no existe en el catálogo: vuelve a elegirlo en el paso Datos.' },

  // Dos reportes del mismo supervisor, mismo frente y misma fecha (la
  // clave de negocio, ver rdc_reportes.unique) — pasa si se cerró uno y
  // luego se intentó crear otro igual.
  { prueba: /rdc_reportes_supervisor_id_frente_id_fecha_key/, resumen: 'Ya existe un reporte de este supervisor para ese frente en esa fecha.' },

  { prueba: /Failed to fetch|NetworkError|network request failed|fetch failed/i, resumen: 'No hay conexión con el servidor ahora mismo. Se reintentará solo apenas vuelva la señal.' },
]

/** Arma el mensaje que se muestra en la lista: la explicación en español
 * primero, y el mensaje real de la base entre paréntesis después, para no
 * perder el detalle técnico ante un caso que esta lista todavía no cubre. */
export function explicarErrorSync(mensajeCrudo) {
  if (!mensajeCrudo) return null
  const encontrado = PATRONES.find((p) => p.prueba.test(mensajeCrudo))
  const resumen = encontrado?.resumen ?? 'No se pudo guardar en la nube.'
  return `${resumen} (detalle: ${mensajeCrudo})`
}

import { supabase } from '../../../services/supabaseClient'

// Único punto del módulo que habla con Supabase. Las vistas nunca lo llaman
// directo: pasan por el repositorio local y el servicio de sincronización.
// Acá también vive la traducción entre la forma local del reporte (un
// documento con listas anidadas, camelCase) y la relacional (nueve tablas,
// snake_case).

/** Los campos de hora vacíos llegan como '' desde los <input type="time">, y
 * Postgres rechaza '' en una columna `time`. */
const oNulo = (v) => (v === '' || v === undefined ? null : v)
const numero = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

/** Trae los diez catálogos de una sola vez. Se guardan en IndexedDB para que
 * el formulario se pueda dibujar sin señal (ver rdcRepository). */
export async function descargarCatalogos() {
  const consultas = {
    sectores: supabase.from('rdc_sectores').select('id, nombre, orden').eq('activo', true).order('orden'),
    frentes: supabase.from('rdc_frentes').select('id, nombre, sector_id, orden').eq('activo', true).order('orden'),
    supervisores: supabase.from('rdc_supervisores').select('id, nombre, usuario_id').eq('activo', true).order('orden'),
    capataces: supabase.from('rdc_capataces').select('id, nombre').eq('activo', true).order('orden'),
    redlineSupervisores: supabase.from('rdc_redline_supervisores').select('id, nombre').eq('activo', true).order('orden'),
    prefijos: supabase.from('rdc_prefijos').select('id, frente_id, zona, sostenimiento, prefijo, plano').eq('activo', true).order('orden'),
    maquinarias: supabase.from('rdc_maquinarias').select('id, tipo, categoria, modelo, placa').eq('activo', true).order('orden'),
    partidasEstandar: supabase.from('rdc_partidas_estandar').select('id, bloque, codigo, nombre, unidad, orden').eq('activo', true).order('orden'),
    partidasEdt: supabase.from('rdc_partidas_edt').select('id, frente_id, codigo_edt, nombre, unidad, seccion, orden').eq('activo', true).order('orden'),
    pernos: supabase.from('rdc_pernos_biblioteca').select('id, frente_id, codigo, zona, sistema, ubicacion, diametro, longitud, angulo, plano'),
  }

  const claves = Object.keys(consultas)
  const respuestas = await Promise.all(Object.values(consultas))

  const catalogos = {}
  respuestas.forEach((r, i) => {
    if (r.error) throw r.error
    catalogos[claves[i]] = r.data
  })
  return catalogos
}

// ---------------------------------------------------------------------------
// Envío del reporte a Supabase
// ---------------------------------------------------------------------------

const cabeceraAFila = (r) => ({
  id: r.id,
  fecha: r.fecha,
  sector_id: r.sectorId,
  frente_id: r.frenteId,
  supervisor_id: r.supervisorId,
  creado_por: r.creadoPor,
  capataz_id: r.capatazId,
  estado: r.estado,
  restriccion_acceso: r.restriccionAcceso,
  restriccion_descripcion: r.restriccionAcceso ? oNulo(r.restriccionDescripcion) : null,
  restriccion_inicio: r.restriccionAcceso ? oNulo(r.restriccionInicio) : null,
  restriccion_fin: r.restriccionAcceso ? oNulo(r.restriccionFin) : null,
  refrigerio_salida: oNulo(r.refrigerioSalida),
  refrigerio_retorno: oNulo(r.refrigerioRetorno),
  observaciones: oNulo(r.observaciones),
  requerimientos: oNulo(r.requerimientos),
  restricciones: oNulo(r.restricciones),
  redline: r.redline,
  redline_supervisor_id: r.redline ? r.redlineSupervisorId : null,
  redline_descripcion: r.redline ? oNulo(r.redlineDescripcion) : null,
  es_correccion: r.esCorreccion,
  estado_sharepoint: r.estadoSharepoint,
  sharepoint_nombre_archivo: r.sharepointNombreArchivo,
  sharepoint_enviado_at: r.sharepointEnviadoAt,
  sharepoint_intentos: r.sharepointIntentos,
  sharepoint_error: r.sharepointError,
  creado_en_dispositivo: r.creadoEnDispositivo,
})

// Cada detalle: cómo se llama su tabla y cómo se traduce una de sus filas.
// `area_m2` de los elementos no aparece porque es columna generada en
// Postgres: mandarla haría fallar el insert.
const DETALLES = [
  {
    tabla: 'rdc_reporte_personal',
    lista: 'personal',
    fila: (d, reporteId) => ({ id: d.id, reporte_id: reporteId, categoria: d.categoria, tipo: d.tipo, cantidad: Number(d.cantidad) || 0, orden: d.orden }),
  },
  {
    tabla: 'rdc_reporte_maquinaria',
    lista: 'maquinaria',
    fila: (d, reporteId) => ({ id: d.id, reporte_id: reporteId, maquinaria_id: d.maquinariaId ?? null, tipo: d.tipo, categoria: d.categoria, cantidad: Number(d.cantidad), orden: d.orden }),
  },
  {
    tabla: 'rdc_reporte_hitos',
    lista: 'hitos',
    fila: (d, reporteId) => ({ id: d.id, reporte_id: reporteId, orden: d.orden, nombre: d.nombre, hora: oNulo(d.hora) }),
  },
  {
    tabla: 'rdc_reporte_metrados',
    lista: 'metrados',
    fila: (d, reporteId) => ({
      id: d.id, reporte_id: reporteId, bloque: d.bloque,
      partida_codigo: d.partidaCodigo ?? null, partida_nombre: d.partidaNombre,
      unidad: d.unidad, cantidad: numero(d.cantidad) ?? 0,
      hora_inicio: oNulo(d.horaInicio), hora_fin: oNulo(d.horaFin), orden: d.orden,
    }),
  },
  {
    tabla: 'rdc_reporte_elementos',
    lista: 'elementos',
    fila: (d, reporteId) => ({
      id: d.id, reporte_id: reporteId, elemento: d.elemento, actividad: d.actividad,
      tipo: oNulo(d.tipo), sistema: oNulo(d.sistema), zona: oNulo(d.zona),
      codigo: oNulo(d.codigo), ubicacion: oNulo(d.ubicacion),
      cantidad: numero(d.cantidad) ?? 0, unidad: d.unidad,
      ancho: numero(d.ancho), largo: numero(d.largo),
      diametro: oNulo(d.diametro), plano: oNulo(d.plano),
      tipo_perforadora: oNulo(d.tipoPerforadora),
      hora_inicio: oNulo(d.horaInicio), hora_fin: oNulo(d.horaFin), orden: d.orden,
    }),
  },
  {
    tabla: 'rdc_reporte_bitacora',
    lista: 'bitacora',
    fila: (d, reporteId) => ({ id: d.id, reporte_id: reporteId, hora_inicio: oNulo(d.horaInicio), hora_fin: oNulo(d.horaFin), actividad: d.actividad, orden: d.orden }),
  },
  {
    tabla: 'rdc_reporte_standby',
    lista: 'standby',
    fila: (d, reporteId) => ({
      id: d.id, reporte_id: reporteId, actividad: oNulo(d.actividad),
      desde: oNulo(d.desde), hasta: oNulo(d.hasta),
      causa: d.causa, causa_otro: oNulo(d.causaOtro),
      responsable: oNulo(d.responsable), comentario: oNulo(d.comentario),
      total_horas: numero(d.totalHoras), total_minutos: numero(d.totalMinutos), orden: d.orden,
    }),
  },
  {
    tabla: 'rdc_reporte_programacion',
    lista: 'programacion',
    fila: (d, reporteId) => ({ id: d.id, reporte_id: reporteId, tipo: d.tipo, etiqueta: oNulo(d.etiqueta), descripcion: oNulo(d.descripcion), orden: d.orden }),
  },
]

/** Sube el reporte completo. Es idempotente: la cabecera se hace upsert por su
 * UUID (el mismo que generó el celular) y cada detalle se borra y se vuelve a
 * insertar, que es lo que corresponde cuando el supervisor corrigió el reporte
 * y quitó filas — un upsert dejaría las viejas ahí. */
export async function subirReporte(reporte) {
  const { error: errorCabecera } = await supabase.from('rdc_reportes').upsert(cabeceraAFila(reporte), { onConflict: 'id' })
  if (errorCabecera) throw errorCabecera

  for (const { tabla, lista, fila } of DETALLES) {
    const { error: errorBorrado } = await supabase.from(tabla).delete().eq('reporte_id', reporte.id)
    if (errorBorrado) throw errorBorrado

    const filas = (reporte[lista] ?? []).map((d) => fila(d, reporte.id))
    if (filas.length === 0) continue
    const { error: errorInsercion } = await supabase.from(tabla).insert(filas)
    if (errorInsercion) throw errorInsercion
  }
}

/** Marca en el servidor el resultado del envío a SharePoint. Se hace aparte
 * del reporte porque ocurre después: primero llega a Supabase, después se
 * intenta el webhook, y cada uno puede fallar por su cuenta. */
export async function marcarEnvioSharepoint(reporteId, { estado, nombreArchivo, intentos, error }) {
  const { error: errorUpdate } = await supabase
    .from('rdc_reportes')
    .update({
      estado_sharepoint: estado,
      sharepoint_nombre_archivo: nombreArchivo ?? null,
      sharepoint_enviado_at: estado === 'enviado' ? new Date().toISOString() : null,
      sharepoint_intentos: intentos,
      sharepoint_error: error ?? null,
    })
    .eq('id', reporteId)
  if (errorUpdate) throw errorUpdate
}

// ---------------------------------------------------------------------------
// Consulta del histórico
// ---------------------------------------------------------------------------

/** Trae un reporte del servidor con todo su detalle, en la misma forma que usa
 * el repositorio local. Lo necesitan Planeamiento y Consulta, que ven reportes
 * que nunca pasaron por su dispositivo. */
export async function obtenerReporteCompleto(id) {
  const { data, error } = await supabase
    .from('rdc_reportes')
    .select(
      `*,
       rdc_reporte_personal(*), rdc_reporte_maquinaria(*), rdc_reporte_hitos(*),
       rdc_reporte_metrados(*), rdc_reporte_elementos(*), rdc_reporte_bitacora(*),
       rdc_reporte_standby(*), rdc_reporte_programacion(*)`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const lista = (filas, mapear) => (filas ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map(mapear)

  return {
    id: data.id,
    fecha: data.fecha,
    sectorId: data.sector_id,
    frenteId: data.frente_id,
    supervisorId: data.supervisor_id,
    capatazId: data.capataz_id,
    creadoPor: data.creado_por,
    estado: data.estado,
    restriccionAcceso: data.restriccion_acceso,
    restriccionDescripcion: data.restriccion_descripcion,
    restriccionInicio: data.restriccion_inicio,
    restriccionFin: data.restriccion_fin,
    refrigerioSalida: data.refrigerio_salida,
    refrigerioRetorno: data.refrigerio_retorno,
    observaciones: data.observaciones,
    requerimientos: data.requerimientos,
    restricciones: data.restricciones,
    redline: data.redline,
    redlineSupervisorId: data.redline_supervisor_id,
    redlineDescripcion: data.redline_descripcion,
    esCorreccion: data.es_correccion,
    estadoSupabase: 'enviado', // si está en el servidor, por definición llegó
    estadoSharepoint: data.estado_sharepoint,
    sharepointNombreArchivo: data.sharepoint_nombre_archivo,
    sharepointError: data.sharepoint_error,
    sharepointIntentos: data.sharepoint_intentos,
    creadoEnDispositivo: data.creado_en_dispositivo,
    actualizadoEn: data.updated_at ?? data.created_at,
    personal: lista(data.rdc_reporte_personal, (d) => ({ id: d.id, categoria: d.categoria, tipo: d.tipo, cantidad: d.cantidad, orden: d.orden })),
    maquinaria: lista(data.rdc_reporte_maquinaria, (d) => ({ id: d.id, maquinariaId: d.maquinaria_id, tipo: d.tipo, categoria: d.categoria, cantidad: d.cantidad, orden: d.orden })),
    hitos: lista(data.rdc_reporte_hitos, (d) => ({ id: d.id, orden: d.orden, nombre: d.nombre, hora: d.hora })),
    metrados: lista(data.rdc_reporte_metrados, (d) => ({ id: d.id, bloque: d.bloque, partidaCodigo: d.partida_codigo, partidaNombre: d.partida_nombre, unidad: d.unidad, cantidad: d.cantidad, horaInicio: d.hora_inicio, horaFin: d.hora_fin, orden: d.orden })),
    elementos: lista(data.rdc_reporte_elementos, (d) => ({ id: d.id, elemento: d.elemento, actividad: d.actividad, tipo: d.tipo, sistema: d.sistema, zona: d.zona, codigo: d.codigo, ubicacion: d.ubicacion, cantidad: d.cantidad, unidad: d.unidad, ancho: d.ancho, largo: d.largo, diametro: d.diametro, plano: d.plano, tipoPerforadora: d.tipo_perforadora, horaInicio: d.hora_inicio, horaFin: d.hora_fin, orden: d.orden })),
    bitacora: lista(data.rdc_reporte_bitacora, (d) => ({ id: d.id, horaInicio: d.hora_inicio, horaFin: d.hora_fin, actividad: d.actividad, orden: d.orden })),
    standby: lista(data.rdc_reporte_standby, (d) => ({ id: d.id, actividad: d.actividad, desde: d.desde, hasta: d.hasta, causa: d.causa, causaOtro: d.causa_otro, responsable: d.responsable, comentario: d.comentario, totalHoras: d.total_horas, totalMinutos: d.total_minutos, orden: d.orden })),
    programacion: lista(data.rdc_reporte_programacion, (d) => ({ id: d.id, tipo: d.tipo, etiqueta: d.etiqueta, descripcion: d.descripcion, orden: d.orden })),
  }
}

/** Reportes ya sincronizados, para la vista de histórico. RLS decide qué ve
 * cada quien: un supervisor solo los suyos, Planeamiento y Consulta todos. */
export async function listarReportes({ desde, hasta, frenteId, supervisorId } = {}) {
  let query = supabase
    .from('rdc_reportes')
    .select('id, fecha, estado, estado_sharepoint, created_at, rdc_frentes(nombre), rdc_sectores(nombre), rdc_supervisores(nombre)')
    .order('fecha', { ascending: false })
    .limit(300)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  if (frenteId) query = query.eq('frente_id', frenteId)
  if (supervisorId) query = query.eq('supervisor_id', supervisorId)

  const { data, error } = await query
  if (error) throw error
  return data
}

import { supabase } from '../../../services/supabaseClient'
import { ENVIO, ESTADO } from './rdcDb'

// Único punto del módulo que habla con Supabase. Las vistas nunca lo llaman
// directo: pasan por el repositorio local y el servicio de sincronización.
// Acá también vive la traducción entre la forma local del reporte (un
// documento con listas anidadas, camelCase) y la relacional (nueve tablas,
// snake_case).

/** Los campos de hora vacíos llegan como '' desde los <input type="time">, y
 * Postgres rechaza '' en una columna `time`. */
const oNulo = (v) => (v === '' || v === undefined ? null : v)
const numero = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

/** Bug real encontrado en vivo: toda hora del RDC (hitos, metrados,
 * elementos, bitácora, stand by) vive en una columna `time` de Postgres —
 * sin segundos de verdad, pero PostgREST SIEMPRE serializa un `time` como
 * "HH:MM:SS" (con ":00" aunque nunca se haya guardado nada ahí). El
 * selector de hora del supervisor (SelectorHora.vue) solo pide hora y
 * minuto, nunca segundos — pero apenas un reporte se sincronizaba y se
 * volvía a leer del servidor (para verlo, corregirlo, adoptarlo en otro
 * dispositivo o exportar su Excel), esos ":00" reaparecían igual, porque
 * nadie los recortaba al bajar los datos. Se corta acá, una sola vez, en
 * el único lugar por donde pasan todos esos casos. */
const soloHora = (v) => (v ? v.slice(0, 5) : v)

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

/** Trae los diez catálogos de una sola vez. Se guardan en IndexedDB para que
 * el formulario se pueda dibujar sin señal (ver rdcRepository). */
export async function descargarCatalogos() {
  const consultas = {
    // sectores/frentes ya no son catálogos propios del RDC (20260911170000):
    // son los mismos que usa el resto del Sistema (Vales, Kardex, Procura,
    // Almacén). Sin `orden` (esa tabla no lo tiene). Un frente aparece acá
    // solo si 'activo' o 'paralizado': un frente parado temporalmente sigue
    // siendo uno sobre el que un supervisor puede necesitar reportar (por
    // ejemplo, un Stand By), pero uno 'planificado' (Planeamiento lo definió
    // pero el trabajo todavía no arranca) o 'cerrado' no tiene nada que
    // reportar todavía o nunca más — no debe aparecer en el formulario.
    sectores: supabase.from('sectores').select('id, nombre').eq('activo', true).order('nombre'),
    frentes: supabase.from('frentes').select('id, codigo, nombre, sector_id, rdc_control_pernos').in('estado', ['activo', 'paralizado']).order('nombre'),
    supervisores: supabase.from('rdc_supervisores').select('id, nombre, usuario_id').eq('activo', true).order('orden'),
    capataces: supabase.from('rdc_capataces').select('id, nombre').eq('activo', true).order('orden'),
    redlineSupervisores: supabase.from('rdc_redline_supervisores').select('id, nombre').eq('activo', true).order('orden'),
    prefijos: supabase.from('rdc_prefijos').select('id, frente_id, zona, sostenimiento, prefijo, plano').eq('activo', true).order('orden'),
    maquinarias: supabase.from('rdc_maquinarias').select('id, tipo, categoria, modelo, placa').eq('activo', true).order('orden'),
    partidasEstandar: supabase.from('rdc_partidas_estandar').select('id, bloque, codigo, nombre, unidad, orden').eq('activo', true).order('orden'),
    // Bug real encontrado y corregido (2026-10-05): este select no traía
    // tipo_medicion, así que en PasoMetrados.vue toda partida caía al
    // fallback `?? 'digitado'` sin importar su tipo real — una partida
    // 'conteo_pernos'/'solo_seguimiento' se mostraba como digitable. El
    // bloque que usaba esto (Bloque 4, "Partidas EDT") ya se quitó, pero se
    // completa igual el select para que cualquier código futuro que lea
    // tipo_medicion de este catálogo offline no vuelva a pisar el mismo bug.
    partidasEdt: supabase
      .from('rdc_partidas_edt')
      .select(
        'id, frente_id, codigo_edt, nombre, unidad, seccion, orden, tipo_medicion, metrado_previsto, zona_filtro, tipo_filtro, ubicacion_filtro, factor_perforacion, factor_inyeccion'
      )
      .eq('activo', true)
      .order('orden'),
    pernos: supabase.from('rdc_pernos_biblioteca').select('id, frente_id, codigo, zona, sistema, ubicacion, diametro, longitud, angulo, plano'),
    // Estado derivado de rdc_reporte_elementos (perforado/inyectado), security
    // definer porque un Supervisor con RLS normal no vería los pernos que
    // perforó OTRO supervisor del mismo frente (rdc.ver_propios) — ver
    // fn_rdc_pernos_estado. p_frente_id null: la función ya filtra sola a los
    // frentes con rdc_control_pernos activo, así que trae "todo lo relevante"
    // igual que ya hace `pernos` (biblioteca) sin filtrar por frente acá.
    pernosEstado: supabase.rpc('fn_rdc_pernos_estado', { p_frente_id: null }),
    mallaEstado: supabase.rpc('fn_rdc_malla_estado', { p_frente_id: null }),
    cableEstado: supabase.rpc('fn_rdc_cable_estado', { p_frente_id: null }),
    // Previsto/acumulado/saldo por partida EDT, hasta ayer (default de la
    // función) — "hoy" se calcula en el cliente sumando lo que ya se tipeó
    // o lo que ya reportó el bloque 2 de ESTE reporte (ver PasoMetrados.vue).
    acumuladosEdt: supabase.rpc('fn_rdc_acumulado_edt', { p_frente_id: null }),
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
  iny_bolsas_cemento: numero(r.inyBolsasCemento),
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
      regularizado: d.regularizado ?? false, motivo_regularizacion: oNulo(d.motivoRegularizacion),
    }),
  },
  {
    tabla: 'rdc_reporte_metrados_edt',
    lista: 'metradosEdt',
    fila: (d, reporteId) => ({ id: d.id, reporte_id: reporteId, partida_edt_id: d.partidaEdtId, cantidad: numero(d.cantidad) ?? 0, orden: d.orden }),
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

  // Genera/actualiza las filas de confirmación (Fase 4) a partir de lo que
  // se acaba de subir. Idempotente: re-subir el mismo reporte (reintento
  // offline) nunca reabre ni pisa algo que Planeamiento ya resolvió.
  const { error: errorSincronizacion } = await supabase.rpc('fn_rdc_sincronizar_confirmaciones', { p_reporte_id: reporte.id })
  if (errorSincronizacion) throw errorSincronizacion
}

/** "Borra" un borrador en el servidor — en realidad lo archiva (columna
 * `eliminado_at`), no lo elimina de verdad. Nació del caso de un reporte YA
 * FINALIZADO y enviado a SharePoint que por un bug de sincronización se
 * seguía viendo como Borrador en el Sistema: alguien lo confundió con basura
 * y le dio borrar, y como antes esto era un DELETE real, hubo que
 * reconstruirlo a mano desde el Excel. Con esto, lo peor que pasa es que
 * queda en la papelera (ver Developer) hasta que alguien lo restaure.
 *
 * RLS (rdc_reportes_archivar) es quien de verdad decide si se puede: solo
 * estado Borrador y solo el propio autor o el supervisor responsable — acá
 * no se repite esa condición, que ya vive en la base y sería una segunda
 * fuente de verdad si se copiara aquí. Un id que no existe en el servidor
 * (un borrador que nunca llegó a sincronizar) no es un error: un `update`
 * sobre cero filas no falla. */
export async function eliminarReporteRemoto(id) {
  const { error } = await supabase.from('rdc_reportes').update({ eliminado_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
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

/** Solo la marca de tiempo del servidor, sin traer el reporte entero — para
 * que el sincronizador de borradores pueda decidir barato, en cada ciclo, si
 * la copia local sigue siendo la más nueva o si otro dispositivo la superó
 * mientras tanto (ver rdcSync.js). `null` si el borrador todavía nunca llegó
 * al servidor. */
export async function obtenerActualizadoEnRemoto(id) {
  const { data, error } = await supabase.from('rdc_reportes').select('updated_at').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.updated_at ?? null
}

/** Cuáles de estos reportes ya están archivados (borrados) en el servidor.
 * Un borrador borrado desde otro dispositivo deja su copia local viva en este;
 * RLS solo deja ver los archivados al autor, al supervisor responsable o a
 * quien edita todos, así que la respuesta es la de lo que esta cuenta puede ver. */
export async function idsArchivadosEnRemoto(ids) {
  if (!ids.length) return []
  const { data, error } = await supabase.from('rdc_reportes').select('id').in('id', ids).not('eliminado_at', 'is', null)
  if (error) throw error
  return data.map((r) => r.id)
}

/** ¿Ya existe (en el servidor, de cualquier dispositivo) un reporte de este
 * supervisor para este frente en esta fecha? Es la misma llave única de
 * `rdc_reportes` (supervisor_id, frente_id, fecha) — se consulta ANTES de
 * llenar todo un reporte para avisar temprano, en vez de que el supervisor
 * se entere recién al momento de enviar (pasó de verdad: uno en el celular,
 * otro en la laptop, mismo frente y día, y el segundo perdió media hora de
 * trabajo antes de toparse con el error). `excluirId` es el propio reporte
 * que se está editando, para no marcarse a sí mismo como duplicado. */
export async function buscarReporteDuplicado({ supervisorId, frenteId, fecha, excluirId }) {
  if (!supervisorId || !frenteId || !fecha) return null
  let consulta = supabase
    .from('rdc_reportes')
    .select('id, estado, estado_sharepoint')
    .eq('supervisor_id', supervisorId)
    .eq('frente_id', frenteId)
    .eq('fecha', fecha)
    // Otro bug real encontrado en vivo: sin este filtro, un reporte que YA
    // se borró (papelera, eliminado_at no nulo) seguía contando como
    // "duplicado" para siempre — el índice único de la base sí lo excluye
    // (rdc_reportes_supervisor_id_frente_id_fecha_key, ver
    // 20260928100000), pero este aviso en pantalla no, así que avisaba de
    // un choque que la base ni siquiera iba a rechazar.
    .is('eliminado_at', null)
  if (excluirId) consulta = consulta.neq('id', excluirId)
  // Bug real encontrado en vivo: sin el .limit(1), .maybeSingle() revienta
  // apenas hay DOS O MÁS filas que calzan — y revisarDuplicado() se lo
  // traga en silencio (su try/catch es a propósito permisivo: sin señal no
  // es un error real) — así que el aviso de "ya existe un reporte" dejaba
  // de salir justo cuando ya había más de un duplicado, que es el caso que
  // más lo necesita. Con .limit(1) siempre se puede avisar de al menos uno.
  const { data, error } = await consulta.limit(1).maybeSingle()
  if (error) throw error
  return data
}

/** Trae un reporte del servidor con todo su detalle, en la misma forma que usa
 * el repositorio local. Lo necesitan Planeamiento y Consulta, que ven reportes
 * que nunca pasaron por su dispositivo. */
export async function obtenerReporteCompleto(id) {
  const { data, error } = await supabase
    .from('rdc_reportes')
    .select(
      `*,
       rdc_reporte_personal(*), rdc_reporte_maquinaria(*), rdc_reporte_hitos(*),
       rdc_reporte_metrados(*), rdc_reporte_metrados_edt(*), rdc_reporte_elementos(*), rdc_reporte_bitacora(*),
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
    // La base devuelve las horas como HH:MM:SS; en todo el sistema (y en el
    // Excel) se usan como HH:MM.
    restriccionInicio: data.restriccion_inicio?.slice(0, 5) ?? data.restriccion_inicio,
    restriccionFin: data.restriccion_fin?.slice(0, 5) ?? data.restriccion_fin,
    refrigerioSalida: data.refrigerio_salida?.slice(0, 5) ?? data.refrigerio_salida,
    refrigerioRetorno: data.refrigerio_retorno?.slice(0, 5) ?? data.refrigerio_retorno,
    observaciones: data.observaciones,
    requerimientos: data.requerimientos,
    restricciones: data.restricciones,
    inyBolsasCemento: data.iny_bolsas_cemento,
    redline: data.redline,
    redlineSupervisorId: data.redline_supervisor_id,
    redlineDescripcion: data.redline_descripcion,
    esCorreccion: data.es_correccion,
    // Bug real encontrado: esto decía `'enviado'` fijo ("si está en el
    // servidor, por definición llegó"), pero esa razón solo vale para un
    // reporte FINALIZADO — un Borrador también vive en el servidor (se
    // resube completo en cada ciclo mientras se llena, ver rdcSync.js) y
    // aun así todavía no está "enviado" en el sentido que le importa a la
    // sincronización. Un supervisor que ADOPTA un borrador ajeno a medio
    // llenar (rdc.js: sincronizar() → adoptar() cuando el remoto es más
    // nuevo) heredaba `estadoSupabase: 'enviado'` a la fuerza; más tarde,
    // al finalizarlo en ESE dispositivo, sincronizar() ya no volvía a subir
    // la cabecera (la creía subida) — el Excel SÍ llegaba a SharePoint,
    // pero `rdc_reportes.estado` se quedaba en 'Borrador' para siempre.
    // Confirmado con un caso real: exactamente ese patrón.
    estadoSupabase: data.estado === ESTADO.FINALIZADO ? ENVIO.ENVIADO : ENVIO.PENDIENTE,
    estadoSharepoint: data.estado_sharepoint,
    sharepointNombreArchivo: data.sharepoint_nombre_archivo,
    sharepointError: data.sharepoint_error,
    sharepointIntentos: data.sharepoint_intentos,
    creadoEnDispositivo: data.creado_en_dispositivo,
    actualizadoEn: data.updated_at ?? data.created_at,
    personal: lista(data.rdc_reporte_personal, (d) => ({ id: d.id, categoria: d.categoria, tipo: d.tipo, cantidad: d.cantidad, orden: d.orden })),
    maquinaria: lista(data.rdc_reporte_maquinaria, (d) => ({ id: d.id, maquinariaId: d.maquinaria_id, tipo: d.tipo, categoria: d.categoria, cantidad: d.cantidad, orden: d.orden })),
    hitos: lista(data.rdc_reporte_hitos, (d) => ({ id: d.id, orden: d.orden, nombre: d.nombre, hora: soloHora(d.hora) })),
    metrados: lista(data.rdc_reporte_metrados, (d) => ({ id: d.id, bloque: d.bloque, partidaCodigo: d.partida_codigo, partidaNombre: d.partida_nombre, unidad: d.unidad, cantidad: d.cantidad, horaInicio: soloHora(d.hora_inicio), horaFin: soloHora(d.hora_fin), orden: d.orden })),
    metradosEdt: lista(data.rdc_reporte_metrados_edt, (d) => ({ id: d.id, partidaEdtId: d.partida_edt_id, cantidad: d.cantidad, orden: d.orden })),
    elementos: lista(data.rdc_reporte_elementos, (d) => ({ id: d.id, elemento: d.elemento, actividad: d.actividad, tipo: d.tipo, sistema: d.sistema, zona: d.zona, codigo: d.codigo, ubicacion: d.ubicacion, cantidad: d.cantidad, unidad: d.unidad, ancho: d.ancho, largo: d.largo, diametro: d.diametro, plano: d.plano, tipoPerforadora: d.tipo_perforadora, horaInicio: soloHora(d.hora_inicio), horaFin: soloHora(d.hora_fin), orden: d.orden, regularizado: d.regularizado, motivoRegularizacion: d.motivo_regularizacion })),
    bitacora: lista(data.rdc_reporte_bitacora, (d) => ({ id: d.id, horaInicio: soloHora(d.hora_inicio), horaFin: soloHora(d.hora_fin), actividad: d.actividad, orden: d.orden })),
    standby: lista(data.rdc_reporte_standby, (d) => ({ id: d.id, actividad: d.actividad, desde: soloHora(d.desde), hasta: soloHora(d.hasta), causa: d.causa, causaOtro: d.causa_otro, responsable: d.responsable, comentario: d.comentario, totalHoras: d.total_horas, totalMinutos: d.total_minutos, orden: d.orden })),
    programacion: lista(data.rdc_reporte_programacion, (d) => ({ id: d.id, tipo: d.tipo, etiqueta: d.etiqueta, descripcion: d.descripcion, orden: d.orden })),
  }
}

/** Conteo "oficial" de avance por zona (pernos perforados/inyectados/
 * pendientes + malla m² + cable ML), para el contador de PasoMetrados.vue
 * cuando hay señal — con la base ya descargada (`catalogos.pernosEstado`/
 * `mallaEstado`/`cableEstado`) la vista calcula lo mismo en el cliente como
 * respaldo sin conexión. */
export async function obtenerConteoAvance(frenteId) {
  const { data, error } = await supabase.rpc('fn_rdc_avance_conteo', { p_frente_id: frenteId })
  if (error) throw error
  return data
}

/** Reportes ya sincronizados, para la vista de histórico. RLS decide qué ve
 * cada quien: un supervisor solo los suyos, Planeamiento y Consulta todos.
 * Pero RLS NO alcanza para excluir lo archivado: `rdc_reportes_select_papelera`
 * (pensada para que la Papelera de Developer pueda listar lo archivado) es
 * una política permisiva más, así que se combina con OR junto a la de
 * siempre — un supervisor sigue calificando para verla igual después de
 * archivar uno de sus propios reportes (por supervisor_id/creado_por), con
 * eliminado_at ya no nulo. Si no se filtra ACÁ también, un reporte "borrado"
 * desde la pantalla de Reporte diario nunca desaparece de su propio
 * historial: el archivado en el servidor sí funciona, pero esta consulta
 * sigue trayéndolo de vuelta cada vez. */
export async function listarReportes({ desde, hasta, frenteId, supervisorId } = {}) {
  let query = supabase
    .from('rdc_reportes')
    // creado_por y supervisor_id viajan además de sus nombres: la lista los
    // necesita para decidir si el borrador que está mostrando es del propio
    // usuario (y por lo tanto se le puede ofrecer borrarlo), sin tener que
    // volver a preguntarle a la base fila por fila.
    .select('id, fecha, estado, estado_sharepoint, created_at, creado_por, supervisor_id, frente_id, frentes(nombre), sectores(nombre), rdc_supervisores(nombre)')
    .is('eliminado_at', null)
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

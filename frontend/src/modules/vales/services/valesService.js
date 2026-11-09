import { supabase } from '../../../services/supabaseClient'

// area/sector se agregan al embed de frentes solo para armar el mensaje de
// WhatsApp del requerimiento (textoRequerimientoParaCompartir) — la
// "Ubicación" del mensaje real que ya usa la obra combina ambos con el
// código.
// vale_detalle trae también el material de cada línea (no solo el id): el
// buscador de la lista de Vales necesita poder encontrar "malla" y que
// aparezcan los vales que la están pidiendo, sin una consulta aparte por
// cada vale — como acá no hay paginación (se trae todo el historial de
// una), este join extra es liviano comparado con eso.
// estado/updated_at de cada línea: la bandeja de Almacén marca los vales con
// reservas antiguas.
const SELECT_VALE =
  '*, frentes(id, codigo, nombre, estado, contrato_id, area, sector), usuarios!supervisor_id(id, nombre), creador:usuarios!creado_por(id, nombre), vale_detalle(id, estado, updated_at, materiales(codigo, descripcion))'
const SELECT_DETALLE = '*, materiales(id, codigo, descripcion, unidad, unidad_edp, tipo_conversion)'

export async function listarVales() {
  const { data, error } = await supabase
    .from('vales')
    .select(SELECT_VALE)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function obtenerVale(id) {
  const [{ data: vale, error: errorVale }, { data: lineas, error: errorLineas }] = await Promise.all([
    supabase.from('vales').select(SELECT_VALE).eq('id', id).single(),
    supabase.from('vale_detalle').select(SELECT_DETALLE).eq('vale_id', id).order('created_at'),
  ])
  if (errorVale) throw errorVale
  if (errorLineas) throw errorLineas
  return { ...vale, lineas }
}

export async function crearVale({ frente_id, supervisor_id, creado_por, observaciones, actividad, lineas }) {
  const { data: vale, error: errorVale } = await supabase
    .from('vales')
    .insert({
      frente_id,
      supervisor_id,
      creado_por: creado_por ?? null,
      observaciones,
      actividad: actividad || null,
    })
    .select(SELECT_VALE)
    .single()
  if (errorVale) throw errorVale

  const { error: errorLineas } = await supabase.from('vale_detalle').insert(
    lineas.map((l) => ({
      vale_id: vale.id,
      material_id: l.material_id,
      cantidad_solicitada: l.cantidad_solicitada,
    }))
  )
  if (errorLineas) throw errorLineas

  return obtenerVale(vale.id)
}

export async function actualizarVale(id, payload) {
  const { data, error } = await supabase.from('vales').update(payload).eq('id', id).select(SELECT_VALE).single()
  if (error) throw error
  return data
}

export async function agregarLinea(vale_id, { material_id, cantidad_solicitada }) {
  const { data, error } = await supabase
    .from('vale_detalle')
    .insert({ vale_id, material_id, cantidad_solicitada })
    .select(SELECT_DETALLE)
    .single()
  if (error) throw error
  return data
}

export async function eliminarLinea(id) {
  const { error } = await supabase.from('vale_detalle').delete().eq('id', id)
  if (error) throw error
}

export async function rechazarLinea(id) {
  const { data, error } = await supabase
    .from('vale_detalle')
    .update({ estado: 'Rechazado' })
    .eq('id', id)
    .select(SELECT_DETALLE)
    .single()
  if (error) throw error
  return data
}

export async function cancelarLinea(id) {
  const { error } = await supabase.from('vale_detalle').update({ estado: 'Cancelado' }).eq('id', id)
  if (error) throw error
}

export async function aprobarLinea({ vale_detalle_id, almacen_id, cantidad, usuario_id }) {
  const { error } = await supabase.rpc('fn_crear_reserva', {
    p_vale_detalle_id: vale_detalle_id,
    p_almacen_id: almacen_id,
    p_cantidad: cantidad,
    p_usuario_id: usuario_id,
  })
  if (error) throw error
}

/** "No entregar" (o "Cerrar con lo entregado" si ya se entregó una parte):
 * libera la reserva y cierra la línea en un solo paso, con motivo. El estado
 * del vale lo recalcula la base (trigger de vale_detalle). */
export async function cerrarLinea(lineaId, motivo) {
  const { error } = await supabase.rpc('fn_vale_cerrar_linea', { p_linea_id: lineaId, p_motivo: motivo })
  if (error) throw error
}

/** Quién aprobó, reservó, entregó o cerró cada línea del vale, en orden. */
export async function obtenerHistorialVale(valeId) {
  const { data, error } = await supabase.rpc('fn_vale_historial', { p_vale_id: valeId })
  if (error) throw error
  return data ?? []
}

/** Días desde los que una reserva sin entregar se considera antigua. */
export async function obtenerDiasReservaAntigua() {
  const { data, error } = await supabase.from('configuracion').select('valor').eq('clave', 'dias_reserva_prolongada').maybeSingle()
  if (error) throw error
  return Number(data?.valor) || 15
}

export async function liberarReserva({ reserva_id, motivo, usuario_id, cancelar }) {
  const { error } = await supabase.rpc('fn_liberar_reserva', {
    p_reserva_id: reserva_id,
    p_motivo: motivo,
    p_usuario_id: usuario_id,
    p_cancelar: cancelar,
  })
  if (error) throw error
}

export async function listarReservasDeVale(valeDetalleIds) {
  if (!valeDetalleIds.length) return []
  const { data, error } = await supabase
    .from('reservas')
    .select('*')
    .in('vale_detalle_id', valeDetalleIds)
  if (error) throw error
  return data
}

export async function obtenerReservaActivaDeLinea(valeDetalleId) {
  const { data, error } = await supabase
    .from('reservas')
    .select('*, almacenes(id, codigo, nombre)')
    .eq('vale_detalle_id', valeDetalleId)
    .in('estado', ['Activa', 'Parcial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Lotes (ingresos) con saldo, para elegir de cuál sale una entrega cuando
 * el material necesita conversión de unidades (el factor varía por lote:
 * un rollo de malla puede venir de otro tamaño en cada ingreso). */
export async function listarLotesDisponibles(materialId, almacenId) {
  const { data, error } = await supabase
    .from('ingresos')
    .select('id, fecha, cantidad, cantidad_restante, ancho, largo, factor_conversion, documento_referencia')
    .eq('material_id', materialId)
    .eq('almacen_id', almacenId)
    .gt('cantidad_restante', 0)
    .order('fecha')
  if (error) throw error
  return data
}

/** Cuántos de MIS vales tuvieron una novedad (se aprobaron, rechazaron o
 * atendieron) que todavía no vi. Es una pregunta distinta de "cuántos de
 * los míos siguen esperando una decisión" (contarValesPendientes,
 * dashboardService.js) — por eso el filtro de estado es el opuesto: acá
 * son los que YA tuvieron una decisión, no los que la siguen esperando.
 * `supervisor_id` se filtra explícito (no alcanza con RLS) porque quien
 * tiene vales.ver_todos vería todo el ruido de vales ajenos si no. */
export async function contarValesNovedades(supervisorId) {
  if (!supervisorId) return 0
  const { data, error } = await supabase
    .from('vales')
    .select('id, updated_at, visto_supervisor_en')
    .eq('supervisor_id', supervisorId)
    .in('estado', ['Aprobado', 'Rechazado', 'Parcialmente atendido', 'Atendido', 'Cerrado'])
  if (error) throw error
  return (data ?? []).filter((v) => !v.visto_supervisor_en || v.visto_supervisor_en < v.updated_at).length
}

/** Marca el vale como visto por su propio supervisor. Es una función (no un
 * UPDATE directo) porque vales_update por RLS solo deja al supervisor
 * editar su vale mientras sigue en Borrador — una vez enviado, ya no puede
 * hacer UPDATE sobre la fila. fn_marcar_vale_visto es security definer y
 * valida la autoría ella misma. */
export async function marcarValeVisto(id) {
  const { error } = await supabase.rpc('fn_marcar_vale_visto', { p_vale_id: id })
  if (error) throw error
}

/** Registra la entrega de un vale reservado, repartida entre uno o más
 * lotes en una sola operación atómica (ver fn_registrar_entrega_multilote):
 * si cualquier lote no tiene saldo, o la suma excede lo que queda de la
 * reserva, NINGUNA fila se inserta. `asignaciones` es [{ ingreso_id,
 * cantidad }]; ingreso_id va en null cuando el material no necesita lote. */
export async function registrarEntregaMultilote({
  material_id, almacen_id, frente_id, vale_detalle_id, reserva_id,
  usuario_id, documento_referencia, asignaciones,
}) {
  const { data, error } = await supabase.rpc('fn_registrar_entrega_multilote', {
    p_material_id: material_id,
    p_almacen_id: almacen_id,
    p_frente_id: frente_id,
    p_vale_detalle_id: vale_detalle_id,
    p_reserva_id: reserva_id,
    p_usuario_id: usuario_id,
    p_documento_referencia: documento_referencia ?? null,
    p_asignaciones: asignaciones.map((a) => ({ ingreso_id: a.ingreso_id ?? null, cantidad: a.cantidad })),
  })
  if (error) throw error
  return data
}

/** Para el selector "¿a nombre de quién es este vale?" al cargarlo manualmente. */
export async function listarSupervisores() {
  const { data, error } = await supabase.rpc('fn_listar_supervisores')
  if (error) throw error
  return data
}

export async function listarFrentesActivos() {
  const { data, error } = await supabase.from('frentes').select('id, codigo, nombre').eq('estado', 'activo').order('codigo')
  if (error) throw error
  return data
}

/** Para Devolución: cualquier frente puede tener material suelto pendiente
 * de devolver, sin importar su estado actual — no solo uno paralizado
 * (caso real: ZCM09 apareció como "cerrado", no "paralizado", y también
 * necesitaba poder devolver). Pedir material nuevo sí debe seguir exigiendo
 * un frente activo; devolver, no. */
export async function listarFrentesParaDevolucion() {
  const { data, error } = await supabase.from('frentes').select('id, codigo, nombre').order('codigo')
  if (error) throw error
  return data
}

export async function listarMaterialesActivos() {
  const { data, error } = await supabase
    .from('materiales')
    .select('id, codigo, descripcion, unidad, observaciones')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

export async function listarAlmacenesActivos() {
  const { data, error } = await supabase.from('almacenes').select('id, codigo, nombre').eq('estado', 'activo').order('nombre')
  if (error) throw error
  return data
}

/**
 * Situación de cada material de un vale frente a Procura y al stock del
 * almacén, para alertar al que aprueba (¿hay stock?, ¿está contemplado en el
 * metrado?, ¿ya hay sobreconsumo?) sin tener que ir a mirar otras pantallas.
 */
export async function obtenerAlertasVale({ frenteId, contratoId, materialIds }) {
  if (!materialIds.length) {
    return { stockPorMaterial: new Map(), procuraPorMaterial: new Map(), umbralSobreconsumo: 90 }
  }

  // procura_vs_consumo ya no vive por material puntual: vive por grupo EDP
  // (20260930100000) — un perno de 3m y uno de 1.5m del mismo diámetro
  // comparten límite. Acá se resuelve primero a qué grupo pertenece cada
  // material del vale, y al final se vuelve a mapear por material_id para
  // que quien llama (ValeDetalleView, por línea) no tenga que saber nada de
  // grupos EDP.
  const [{ data: stock, error: e1 }, { data: materiales, error: e2 }, { data: umbralRow }, { data: ingresos, error: e4 }] =
    await Promise.all([
      // Sin filtrar por contrato: un vale puede tomar stock de OTRO contrato
      // (decisión de la empresa, ver fn_crear_reserva), así que el stock
      // alcanzable es el del contrato que más tenga.
      supabase.from('stock').select('material_id, contrato_id, cantidad_disponible').in('material_id', materialIds),
      supabase.from('materiales').select('id, descripcion_edp_id').in('id', materialIds),
      supabase.from('configuracion').select('valor').eq('clave', 'umbral_riesgo_sobreconsumo').single(),
      // Factor de conversión de cada material (mismo criterio que la vista
      // procura_vs_consumo: el del ingreso más reciente, 1 si nunca tuvo
      // ingresos) — sin esto, comparar `cantidad_solicitada` (unidad física,
      // ej. UND) contra `saldo` (unidad EDP, ej. ML) compara cosas distintas
      // y nunca detecta el exceso (ver ValeDetalleView.vue `situacion()`).
      supabase
        .from('ingresos')
        .select('material_id, factor_conversion, fecha')
        .in('material_id', materialIds)
        .not('factor_conversion', 'is', null)
        .order('fecha', { ascending: false }),
    ])
  if (e1) throw e1
  if (e2) throw e2
  if (e4) throw e4

  // Una reserva sale de UN solo contrato (el del frente si alcanza, si no otro
  // que cubra todo) — por eso se toma el mayor, no la suma.
  const stockPorMaterial = new Map()
  for (const s of stock ?? []) {
    const cantidad = Number(s.cantidad_disponible)
    if (cantidad > (stockPorMaterial.get(s.material_id) ?? 0)) stockPorMaterial.set(s.material_id, cantidad)
  }

  const factorPorMaterial = new Map()
  for (const i of ingresos ?? []) {
    if (!factorPorMaterial.has(i.material_id)) factorPorMaterial.set(i.material_id, Number(i.factor_conversion) || 1)
  }

  const grupoPorMaterial = new Map((materiales ?? []).map((m) => [m.id, m.descripcion_edp_id]))
  const gruposIds = [...new Set([...grupoPorMaterial.values()].filter(Boolean))]

  const procuraPorMaterial = new Map()
  if (gruposIds.length) {
    const { data: procura, error: e3 } = await supabase
      .from('procura_vs_consumo')
      .select('descripcion_edp_id, nombre_edp, unidad, cantidad_prevista, cantidad_solicitada, cantidad_entregada, saldo, porcentaje_consumo')
      .eq('frente_id', frenteId)
      .in('descripcion_edp_id', gruposIds)
    if (e3) throw e3

    const procuraPorGrupo = new Map((procura ?? []).map((p) => [p.descripcion_edp_id, p]))
    for (const materialId of materialIds) {
      const fila = procuraPorGrupo.get(grupoPorMaterial.get(materialId))
      if (fila) procuraPorMaterial.set(materialId, { ...fila, factor: factorPorMaterial.get(materialId) ?? 1 })
    }
  }

  return {
    stockPorMaterial,
    procuraPorMaterial,
    umbralSobreconsumo: Number(umbralRow?.valor ?? 90),
  }
}

/**
 * Para el formulario de "Nuevo vale": avisa (sin bloquear) cuando la
 * cantidad que se está por pedir se pasaría del saldo de Procura de ese
 * frente, ANTES de mandar el vale — todavía no hay reserva creada que
 * `procura_vs_consumo` pueda contar por su cuenta, así que la cantidad
 * tentativa se convierte acá mismo a la unidad EDP del grupo (mismo criterio
 * que la vista: factor del ingreso más reciente del material, 1 si nunca
 * tuvo ingresos) y se compara contra el saldo ya existente.
 *
 * Devuelve un Map material_id -> { nombre_edp, unidad, cantidad_prevista,
 * saldo, factor }; quien llama hace `cantidad_pedida * factor` para
 * comparar contra `saldo`. Un material sin grupo EDP o sin metrado vigente
 * en ese frente simplemente no aparece en el Map (nada que avisar).
 */
export async function obtenerProcuraParaSimulacion({ frenteId, materialIds }) {
  if (!frenteId || !materialIds?.length) return new Map()

  const [{ data: materiales, error: e1 }, { data: ingresos, error: e2 }] = await Promise.all([
    supabase.from('materiales').select('id, descripcion_edp_id').in('id', materialIds),
    supabase
      .from('ingresos')
      .select('material_id, factor_conversion, fecha')
      .in('material_id', materialIds)
      .not('factor_conversion', 'is', null)
      .order('fecha', { ascending: false }),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const grupoPorMaterial = new Map((materiales ?? []).map((m) => [m.id, m.descripcion_edp_id]))
  const gruposIds = [...new Set([...grupoPorMaterial.values()].filter(Boolean))]
  if (!gruposIds.length) return new Map()

  // Un lote por material (el más reciente, por el `order` de arriba) — mismo
  // criterio que almacenService.js listarStockParaExportar y la vista
  // procura_vs_consumo.
  const factorPorMaterial = new Map()
  for (const i of ingresos ?? []) {
    if (!factorPorMaterial.has(i.material_id)) factorPorMaterial.set(i.material_id, Number(i.factor_conversion) || 1)
  }

  const { data: procura, error: e3 } = await supabase
    .from('procura_vs_consumo')
    .select('descripcion_edp_id, nombre_edp, unidad, cantidad_prevista, saldo')
    .eq('frente_id', frenteId)
    .in('descripcion_edp_id', gruposIds)
  if (e3) throw e3
  const procuraPorGrupo = new Map((procura ?? []).map((p) => [p.descripcion_edp_id, p]))

  const resultado = new Map()
  for (const materialId of materialIds) {
    const fila = procuraPorGrupo.get(grupoPorMaterial.get(materialId))
    if (fila) resultado.set(materialId, { ...fila, factor: factorPorMaterial.get(materialId) ?? 1 })
  }
  return resultado
}

/** Stock en tiempo real por almacén, para que el supervisor vea qué hay disponible antes de pedir.
 * Antes esto descartaba cualquier fila donde `materiales.estado` no fuera
 * exactamente 'activo' — pero si hay stock físico ya cargado (un ingreso
 * hecho), tiene sentido seguir mostrándolo aunque el material se haya
 * marcado inactivo después (eso solo debería impedir pedirlo de nuevo, no
 * esconder lo que ya existe en el almacén). */
export async function listarStockDisponible() {
  const { data, error } = await supabase
    .from('stock')
    .select('material_id, cantidad_disponible, almacenes(codigo, nombre), materiales(id, codigo, descripcion, unidad, estado)')
    .order('material_id')
  if (error) throw error
  return data
}

import { supabase } from '../../../services/supabaseClient'

export async function listarAlmacenes() {
  const { data, error } = await supabase.from('almacenes').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearAlmacen(payload) {
  const { data, error } = await supabase.from('almacenes').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function actualizarAlmacen(id, payload) {
  const { data, error } = await supabase.from('almacenes').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function eliminarAlmacen(id) {
  const { error } = await supabase.from('almacenes').delete().eq('id', id)
  if (error) throw error
}

export async function listarMaterialesActivos() {
  const { data, error } = await supabase
    .from('materiales')
    .select('id, codigo, descripcion, unidad, unidad_edp, tipo_conversion, descripcion_edp_id')
    .eq('estado', 'activo')
    .order('codigo')
  if (error) throw error
  return data
}

/** Lotes (ingresos) de este material en este almacén que todavía tienen
 * saldo por entregar — para elegir de cuál sale una entrega cuando el
 * material necesita conversión de unidades (el factor varía por lote). */
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

const SELECT_STOCK =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad, stock_minimo_pct), contratos(id, codigo, nombre)'

/** Stock agregado por material (sumado entre almacenes) con Categoría/Tipo
 * de material y la cantidad también en la unidad del EDP, para el
 * exportable "Resumen de stock" que pidió el usuario, con la misma
 * estructura de su plantilla (Control Interno vs Control Contrato = EDP).
 *
 * El total en unidad EDP NO es "cantidad física × un factor fijo del
 * material": el factor de conversión vive POR LOTE (ingresos.ancho/largo),
 * porque un rollo de malla puede llegar con medidas distintas de una
 * compra a otra (ver 20260910160000_conversion_unidades_edp.sql). Por eso
 * se suma `ingresos.cantidad_restante × su propio factor_conversion` — el
 * saldo de cada lote convertido a SU medida real — en vez de aplicar una
 * sola conversión a la cantidad física total. La dimensión que se muestra
 * como referencia es la del lote más reciente, no un promedio.
 */
export async function listarStockParaExportar() {
  const [{ data: stockRows, error: errorStock }, { data: ingresos, error: errorIngresos }] = await Promise.all([
    supabase
      .from('stock')
      .select(
        'material_id, cantidad_fisica, materiales(codigo, descripcion, unidad, unidad_edp, tipo_conversion, categorias(nombre, padre:categorias!categoria_padre_id(nombre)))'
      ),
    supabase
      .from('ingresos')
      .select('material_id, ancho, largo, factor_conversion, cantidad_restante, fecha')
      .not('factor_conversion', 'is', null)
      .order('fecha', { ascending: false }),
  ])
  if (errorStock) throw errorStock
  if (errorIngresos) throw errorIngresos

  const porMaterial = new Map()
  for (const s of stockRows ?? []) {
    if (!s.materiales) continue
    if (!porMaterial.has(s.material_id)) porMaterial.set(s.material_id, { ...s.materiales, cantidadFisica: 0 })
    porMaterial.get(s.material_id).cantidadFisica += Number(s.cantidad_fisica) || 0
  }

  // Un lote por material para la dimensión de referencia (el más reciente,
  // por el `order` de arriba — la primera vez que se ve ese material_id en
  // la lista ya ordenada por fecha descendente); todos los lotes se suman
  // para el total en la unidad del EDP.
  const conversionPorMaterial = new Map()
  for (const ingreso of ingresos ?? []) {
    if (!conversionPorMaterial.has(ingreso.material_id)) {
      conversionPorMaterial.set(ingreso.material_id, { totalEdp: 0, ancho: ingreso.ancho, largo: ingreso.largo })
    }
    conversionPorMaterial.get(ingreso.material_id).totalEdp += (Number(ingreso.cantidad_restante) || 0) * (Number(ingreso.factor_conversion) || 0)
  }

  return [...porMaterial.entries()].map(([materialId, m]) => {
    const necesitaConversion = m.tipo_conversion !== 'ninguna'
    const conversion = conversionPorMaterial.get(materialId)
    return {
      codigo: m.codigo,
      categoria: m.categorias?.padre?.nombre ?? '',
      tipoMaterial: m.categorias?.nombre ?? '',
      descripcion: m.descripcion,
      ancho: necesitaConversion ? conversion?.ancho ?? null : null,
      largo: necesitaConversion ? conversion?.largo ?? null : null,
      unidadInterna: m.unidad,
      cantidadInterna: m.cantidadFisica,
      unidadEdp: necesitaConversion ? (m.tipo_conversion === 'area' ? 'M2' : 'ML') : m.unidad_edp || m.unidad,
      cantidadEdp: necesitaConversion ? conversion?.totalEdp ?? 0 : m.cantidadFisica,
    }
  })
}

export async function listarStock() {
  const { data, error } = await supabase
    .from('stock')
    .select(SELECT_STOCK)
    .order('material_id')
  if (error) throw error
  return data
}

/**
 * El mínimo efectivo (20% del último ingreso, por defecto) ya viene
 * calculado desde la vista `stock_con_minimo` — misma fuente que usan las
 * alertas, para que la pantalla de Almacén nunca diga algo distinto de lo
 * que dispara una alerta. `stock` está partido por (almacén, material,
 * contrato), así que la llave para cruzarlo con la fila de stock también
 * necesita los tres campos.
 */
export async function listarStockMinimos() {
  const { data, error } = await supabase
    .from('stock_con_minimo')
    .select('almacen_id, material_id, contrato_id, stock_minimo_efectivo, ultimo_ingreso_cantidad')
  if (error) throw error
  return data
}

const SELECT_MOVIMIENTO =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), contratos(id, codigo, nombre), usuarios(id, nombre)'

export async function listarIngresos() {
  const { data, error } = await supabase
    .from('ingresos')
    .select(SELECT_MOVIMIENTO)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function crearIngreso(payload) {
  const { data, error } = await supabase.from('ingresos').insert(payload).select(SELECT_MOVIMIENTO).single()
  if (error) throw error
  return data
}

/**
 * Inserta muchos ingresos de una vez (carga inicial de stock desde Excel).
 * En lotes de 300: una sola fila por INSERT no tiene límite práctico aquí,
 * pero evita mandar de una un archivo enorme en un solo request.
 */
export async function crearIngresosMasivo(filas) {
  const LOTE = 300
  const creados = []
  for (let i = 0; i < filas.length; i += LOTE) {
    const { data, error } = await supabase
      .from('ingresos')
      .insert(filas.slice(i, i + LOTE))
      .select(SELECT_MOVIMIENTO)
    if (error) throw error
    creados.push(...data)
  }
  return creados
}

/** Ingresos de materiales que necesitan conversión y todavía no tienen sus
 * medidas cargadas (típicamente el stock inicial, subido antes de que
 * existiera esta columna) — para exportar, completar en Excel y reimportar. */
export async function listarIngresosSinMedidas() {
  const { data, error } = await supabase
    .from('ingresos')
    .select(
      'id, fecha, cantidad, documento_referencia, materiales!inner(codigo, descripcion, unidad, tipo_conversion), almacenes(codigo, nombre)'
    )
    .neq('materiales.tipo_conversion', 'ninguna')
    .is('factor_conversion', null)
    .order('fecha')
  if (error) throw error
  return data
}

/** Le agrega ancho/largo a un ingreso ya existente — no toca cantidad ni
 * cantidad_restante, así que no hay riesgo de descuadrar stock/kardex. */
export async function actualizarMedidasIngreso(id, { ancho, largo }) {
  const { error } = await supabase.rpc('fn_actualizar_medidas_ingreso', {
    p_ingreso_id: id,
    p_ancho: ancho ?? null,
    p_largo: largo ?? null,
  })
  if (error) throw error
}

export async function listarAjustes() {
  const { data, error } = await supabase
    .from('ajustes')
    .select(SELECT_MOVIMIENTO)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function crearAjuste(payload) {
  const { data, error } = await supabase.from('ajustes').insert(payload).select(SELECT_MOVIMIENTO).single()
  if (error) throw error
  return data
}

const SELECT_SALIDA =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), frentes(id, codigo, nombre), contratos(id, codigo, nombre), usuarios(id, nombre)'

export async function listarSalidas() {
  const { data, error } = await supabase
    .from('salidas')
    .select(SELECT_SALIDA)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

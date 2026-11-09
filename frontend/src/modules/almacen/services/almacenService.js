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
    .select('id, codigo, descripcion, unidad, unidad_edp, tipo_conversion, descripcion_edp_id, observaciones')
    .eq('estado', 'activo')
    .order('descripcion')
  if (error) throw error
  return data
}

/** Mismo criterio que el KPI "Vales por aprobar" del Dashboard (Enviado/En
 * revision = todavía sin decisión de Almacén) — se repite acá en vez de
 * importarlo desde el módulo de Dashboard para no acoplar Almacén a un
 * módulo que no le pertenece por una sola cuenta. */
export async function contarValesPendientes() {
  const { count, error } = await supabase
    .from('vales')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['Enviado', 'En revision'])
  if (error) throw error
  return count ?? 0
}

const SELECT_STOCK =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad, stock_minimo_pct, categorias(nombre)), contratos(id, codigo, nombre)'

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
        'material_id, cantidad_fisica, materiales(codigo, descripcion, unidad, unidad_edp, tipo_conversion, categorias(nombre, padre:categorias!categoria_padre_id(nombre)), nombres_edp(nombre))'
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
      // La categoría del material puede o no tener padre (subcategoría) —
      // con padre, ese padre es la categoría "general" a mostrar; sin
      // padre, la propia categoría ya es la de primer nivel.
      // "TIPO DE MATERIAL" es el nombre EDP (nombres_edp, el mismo que usa
      // Catálogo) — no una subcategoría: son dos clasificaciones
      // independientes del material.
      categoria: m.categorias?.padre?.nombre ?? m.categorias?.nombre ?? '',
      tipoMaterial: m.nombres_edp?.nombre ?? '',
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

/** Corrige los datos escritos de uno o varios ingresos (guía, proveedor,
 * observación). No toca cantidades ni stock. */
export async function editarDatosIngresos(ids, { documento_referencia, proveedor, observacion }) {
  const { error } = await supabase.rpc('fn_editar_datos_ingreso', {
    p_ids: ids,
    p_documento: documento_referencia,
    p_proveedor: proveedor,
    p_observacion: observacion,
  })
  if (error) throw error
}

export async function listarIngresos() {
  const { data, error } = await supabase
    .from('ingresos')
    .select(SELECT_MOVIMIENTO)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data
}

/**
 * Inserta muchos ingresos de una vez — una guía con varios materiales
 * (IngresoFormModal.vue) o la carga inicial de stock desde Excel. En lotes
 * de 300: una sola fila por INSERT no tiene límite práctico aquí, pero
 * evita mandar de una un archivo enorme en un solo request.
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

export async function listarAjustes() {
  const { data, error } = await supabase
    .from('ajustes')
    .select(SELECT_MOVIMIENTO)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data
}

export async function crearAjuste(payload) {
  const { data, error } = await supabase.from('ajustes').insert(payload).select(SELECT_MOVIMIENTO).single()
  if (error) throw error
  return data
}

// usuarios(id, nombre) es quien REGISTRÓ la salida (el almacenero que hizo
// la entrega física) — no el supervisor que la pidió. Ese viene aparte, vía
// vale_detalle -> vales.supervisor_id, igual que ya lo arma Kardex
// (kardexService.js) — una salida sin vale (entrega manual/directa) no
// tiene nada acá, y queda como "—".
const SELECT_SALIDA =
  '*, almacenes(id, codigo, nombre), materiales(id, codigo, descripcion, unidad), frentes(id, codigo, nombre), contratos(id, codigo, nombre), usuarios(id, nombre), ' +
  'vale_detalle(vale_id, vales(numero, usuarios!supervisor_id(nombre)))'

export async function listarSalidas() {
  const { data, error } = await supabase
    .from('salidas')
    .select(SELECT_SALIDA)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data
}

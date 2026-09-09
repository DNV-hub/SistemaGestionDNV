// Prueba de humo end-to-end contra un Supabase real: recorre catálogo,
// frentes, almacén (ingreso/ajuste), vales (crear -> enviar -> aprobar ->
// entregar parcial/total), reservas (liberar), kardex, procura (versionado
// + historial + comparación), alertas y usuarios — usando las mismas
// funciones/RPCs que el frontend, no queries inventadas para la prueba.
//
// Requiere SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY en el
// entorno (el service role solo se usa para crear/borrar la cuenta de
// prueba — bootstrap y cleanup — nunca para las operaciones del flujo, que
// corren como usuario autenticado normal para que las políticas RLS se
// ejecuten de verdad).
//
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node smoke-test.mjs

import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const runId = Date.now().toString(36)
const sufijo = `SMOKE-${runId}`
const results = []
let ctx = {} // guarda ids creados a medida que avanzan los pasos

function assert(cond, msg) {
  if (!cond) throw new Error(`Aserción falló: ${msg}`)
}

async function step(nombre, fn) {
  try {
    const detalle = await fn()
    results.push({ nombre, ok: true, detalle })
    console.log(`✅ ${nombre}${detalle ? ' — ' + detalle : ''}`)
  } catch (e) {
    results.push({ nombre, ok: false, error: e.message })
    console.log(`❌ ${nombre} — ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// 0. Bootstrap: cuenta de prueba (Administrador) vía service role.
// ---------------------------------------------------------------------------
async function bootstrap() {
  const email = `smoke.admin.${runId}@dnv.test`
  const password = `Smoke!${runId}Aa`

  const { data: nuevoAuth, error: errAuth } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (errAuth) throw errAuth
  ctx.testUserId = nuevoAuth.user.id
  ctx.testUserEmail = email

  const { data: rol, error: errRol } = await admin.from('roles').select('id').eq('nombre', 'Administrador').single()
  if (errRol) throw errRol

  const { error: errPerfil } = await admin
    .from('usuarios')
    .insert({ id: nuevoAuth.user.id, email, nombre: `Test Smoke ${runId}`, rol_id: rol.id, estado: 'activo' })
  if (errPerfil) throw errPerfil

  const { data: signIn, error: errSignIn } = await auth.auth.signInWithPassword({ email, password })
  if (errSignIn) throw errSignIn
  return `usuario ${email} (Administrador)`
}

// ---------------------------------------------------------------------------
// 1. Catálogo
// ---------------------------------------------------------------------------
async function catalogo() {
  const { data: categoria, error: e1 } = await auth
    .from('categorias')
    .insert({ nombre: `Categoria ${sufijo}` })
    .select()
    .single()
  if (e1) throw e1
  ctx.categoriaId = categoria.id

  const { data: material, error: e2 } = await auth
    .from('materiales')
    .insert({
      codigo: `MAT-${sufijo}`,
      descripcion: `Material de prueba ${sufijo}`,
      unidad: 'und',
      categoria_id: categoria.id,
      estado: 'activo',
      stock_minimo_default: 5,
    })
    .select()
    .single()
  if (e2) throw e2
  ctx.materialId = material.id

  const { error: e3 } = await auth
    .from('materiales')
    .update({ descripcion: `Material de prueba ${sufijo} (editado)` })
    .eq('id', material.id)
  if (e3) throw e3

  const { data: lista, error: e4 } = await auth.from('materiales').select('id').eq('id', material.id)
  if (e4) throw e4
  assert(lista.length === 1, 'el material creado debería aparecer al listarlo')

  return `categoría + material ${material.codigo} creados y editados`
}

// ---------------------------------------------------------------------------
// 2. Frentes
// ---------------------------------------------------------------------------
async function frentes() {
  const { data: frente, error } = await auth
    .from('frentes')
    .insert({
      codigo: `FR-${sufijo}`,
      nombre: `Frente de prueba ${sufijo}`,
      area: 'Pruebas automatizadas',
      estado: 'activo',
      fecha_inicio: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()
  if (error) throw error
  ctx.frenteId = frente.id
  return `frente ${frente.codigo} creado`
}

// ---------------------------------------------------------------------------
// 3. Almacén: crear almacén, ingreso, ajuste, verificar stock y kardex.
// ---------------------------------------------------------------------------
async function almacen() {
  const { data: almacen, error: e1 } = await auth
    .from('almacenes')
    .insert({ codigo: `ALM-${sufijo}`, nombre: `Almacén de prueba ${sufijo}`, estado: 'activo' })
    .select()
    .single()
  if (e1) throw e1
  ctx.almacenId = almacen.id

  const { error: e2 } = await auth.from('ingresos').insert({
    material_id: ctx.materialId,
    almacen_id: almacen.id,
    cantidad: 100,
    documento_referencia: `TEST-ING-${runId}`,
    proveedor: 'Proveedor de prueba',
    usuario_id: ctx.testUserId,
  })
  if (e2) throw e2

  const { error: e3 } = await auth.from('ajustes').insert({
    material_id: ctx.materialId,
    almacen_id: almacen.id,
    tipo: 'positivo',
    cantidad: 10,
    motivo: 'Ajuste de prueba automatizada',
    usuario_id: ctx.testUserId,
  })
  if (e3) throw e3

  const { data: stock, error: e4 } = await auth
    .from('stock')
    .select('*')
    .eq('almacen_id', almacen.id)
    .eq('material_id', ctx.materialId)
    .single()
  if (e4) throw e4
  assert(Number(stock.cantidad_fisica) === 110, `cantidad_fisica debería ser 110, es ${stock.cantidad_fisica}`)

  const { data: kardex, error: e5 } = await auth
    .from('kardex')
    .select('tipo_movimiento')
    .eq('material_id', ctx.materialId)
    .eq('almacen_id', almacen.id)
  if (e5) throw e5
  assert(kardex.length === 2, `esperaba 2 movimientos de kardex (ingreso+ajuste), hay ${kardex.length}`)

  return `almacén ${almacen.codigo}: stock físico=110 tras ingreso+ajuste, 2 movimientos en kardex`
}

// ---------------------------------------------------------------------------
// 4. Vales: crear con 2 líneas, enviar, aprobar ambas (reserva), entregar
//    la línea 1 en dos salidas (parcial + total).
// ---------------------------------------------------------------------------
async function vales() {
  const numero = `V-${sufijo}`
  const { data: vale, error: e1 } = await auth
    .from('vales')
    .insert({ numero, frente_id: ctx.frenteId, supervisor_id: ctx.testUserId, observaciones: 'Vale de prueba automatizada' })
    .select()
    .single()
  if (e1) throw e1
  ctx.valeId = vale.id

  const { data: lineas, error: e2 } = await auth
    .from('vale_detalle')
    .insert([
      { vale_id: vale.id, material_id: ctx.materialId, cantidad_solicitada: 20 },
      { vale_id: vale.id, material_id: ctx.materialId, cantidad_solicitada: 5 },
    ])
    .select()
  if (e2) throw e2
  ctx.linea1 = lineas[0].id
  ctx.linea2 = lineas[1].id

  const { error: e3 } = await auth.from('vales').update({ estado: 'Enviado' }).eq('id', vale.id)
  if (e3) throw e3

  const { data: reserva1Id, error: e4 } = await auth.rpc('fn_crear_reserva', {
    p_vale_detalle_id: ctx.linea1,
    p_almacen_id: ctx.almacenId,
    p_cantidad: 20,
    p_usuario_id: ctx.testUserId,
  })
  if (e4) throw e4
  ctx.reserva1Id = reserva1Id

  const { data: reserva2Id, error: e5 } = await auth.rpc('fn_crear_reserva', {
    p_vale_detalle_id: ctx.linea2,
    p_almacen_id: ctx.almacenId,
    p_cantidad: 5,
    p_usuario_id: ctx.testUserId,
  })
  if (e5) throw e5
  ctx.reserva2Id = reserva2Id

  const { data: stockTrasReserva, error: e6 } = await auth
    .from('stock')
    .select('cantidad_reservada')
    .eq('almacen_id', ctx.almacenId)
    .eq('material_id', ctx.materialId)
    .single()
  if (e6) throw e6
  assert(Number(stockTrasReserva.cantidad_reservada) === 25, `cantidad_reservada debería ser 25, es ${stockTrasReserva.cantidad_reservada}`)

  // Entrega parcial (12) y luego el saldo (8) de la línea 1.
  const { error: e7 } = await auth.from('salidas').insert({
    material_id: ctx.materialId,
    almacen_id: ctx.almacenId,
    cantidad: 12,
    frente_id: ctx.frenteId,
    vale_detalle_id: ctx.linea1,
    reserva_id: ctx.reserva1Id,
    usuario_id: ctx.testUserId,
    documento_referencia: `TEST-SAL-1-${runId}`,
  })
  if (e7) throw e7

  const { data: reservaParcial, error: e8 } = await auth.from('reservas').select('estado, cantidad_entregada').eq('id', ctx.reserva1Id).single()
  if (e8) throw e8
  assert(reservaParcial.estado === 'Parcial', `reserva debería quedar 'Parcial', quedó '${reservaParcial.estado}'`)
  assert(Number(reservaParcial.cantidad_entregada) === 12, 'cantidad_entregada de la reserva debería ser 12')

  const { error: e9 } = await auth.from('salidas').insert({
    material_id: ctx.materialId,
    almacen_id: ctx.almacenId,
    cantidad: 8,
    frente_id: ctx.frenteId,
    vale_detalle_id: ctx.linea1,
    reserva_id: ctx.reserva1Id,
    usuario_id: ctx.testUserId,
    documento_referencia: `TEST-SAL-2-${runId}`,
  })
  if (e9) throw e9

  const { data: reservaCompleta, error: e10 } = await auth.from('reservas').select('estado, cantidad_entregada').eq('id', ctx.reserva1Id).single()
  if (e10) throw e10
  assert(reservaCompleta.estado === 'Convertida', `reserva debería quedar 'Convertida' tras entrega total, quedó '${reservaCompleta.estado}'`)

  const { data: linea1Final, error: e11 } = await auth.from('vale_detalle').select('estado, cantidad_entregada').eq('id', ctx.linea1).single()
  if (e11) throw e11
  assert(linea1Final.estado === 'Entregado', `línea 1 debería quedar 'Entregado', quedó '${linea1Final.estado}'`)

  const { data: stockFinal, error: e12 } = await auth
    .from('stock')
    .select('cantidad_fisica, cantidad_reservada')
    .eq('almacen_id', ctx.almacenId)
    .eq('material_id', ctx.materialId)
    .single()
  if (e12) throw e12
  assert(Number(stockFinal.cantidad_fisica) === 90, `cantidad_fisica debería ser 90 (110-20 entregados), es ${stockFinal.cantidad_fisica}`)
  assert(Number(stockFinal.cantidad_reservada) === 5, `cantidad_reservada debería ser 5 (solo línea 2), es ${stockFinal.cantidad_reservada}`)

  return `vale ${numero}: 2 líneas aprobadas, línea 1 entregada en 2 salidas (parcial+total), stock consistente`
}

// ---------------------------------------------------------------------------
// 5. Reservas: liberar la reserva de la línea 2 sin entregarla.
// ---------------------------------------------------------------------------
async function reservas() {
  const { error: e1 } = await auth.rpc('fn_liberar_reserva', {
    p_reserva_id: ctx.reserva2Id,
    p_motivo: 'Liberación de prueba automatizada',
    p_usuario_id: ctx.testUserId,
    p_cancelar: false,
  })
  if (e1) throw e1

  const { data: reserva2, error: e2 } = await auth.from('reservas').select('estado').eq('id', ctx.reserva2Id).single()
  if (e2) throw e2
  assert(reserva2.estado === 'Liberada', `reserva 2 debería quedar 'Liberada', quedó '${reserva2.estado}'`)

  const { data: stock, error: e3 } = await auth
    .from('stock')
    .select('cantidad_reservada')
    .eq('almacen_id', ctx.almacenId)
    .eq('material_id', ctx.materialId)
    .single()
  if (e3) throw e3
  assert(Number(stock.cantidad_reservada) === 0, `cantidad_reservada debería volver a 0, es ${stock.cantidad_reservada}`)

  return 'reserva de la línea 2 liberada sin entrega, stock reservado vuelve a 0'
}

// ---------------------------------------------------------------------------
// 6. Kardex: la vista de movimientos debe reflejar ingreso+ajuste+2 salidas.
// ---------------------------------------------------------------------------
async function kardex() {
  const { data, error } = await auth
    .from('kardex')
    .select('tipo_movimiento')
    .eq('material_id', ctx.materialId)
    .eq('almacen_id', ctx.almacenId)
  if (error) throw error
  assert(data.length === 4, `esperaba 4 movimientos (ingreso, ajuste, 2 salidas), hay ${data.length}`)
  return `4 movimientos en kardex para el material de prueba`
}

// ---------------------------------------------------------------------------
// 7. Procura: metrado v1, nueva versión v2, historial y comparación.
// ---------------------------------------------------------------------------
async function procura() {
  const { data: v1, error: e1 } = await auth
    .from('metrados_procura')
    .insert({
      frente_id: ctx.frenteId,
      material_id: ctx.materialId,
      unidad: 'und',
      cantidad_contractual: 50,
      cantidad_procura: 10,
      responsable_id: ctx.testUserId,
      observaciones: 'v1 smoke test',
    })
    .select()
    .single()
  if (e1) throw e1
  assert(v1.version === 1 && v1.vigente === true, 'la primera versión debería ser version=1, vigente=true')

  const { data: v2, error: e2 } = await auth
    .from('metrados_procura')
    .insert({
      frente_id: ctx.frenteId,
      material_id: ctx.materialId,
      unidad: 'und',
      cantidad_contractual: 50,
      cantidad_procura: 15,
      responsable_id: ctx.testUserId,
      observaciones: 'v2 smoke test',
    })
    .select()
    .single()
  if (e2) throw e2
  assert(v2.version === 2 && v2.vigente === true, 'la segunda versión debería ser version=2, vigente=true')

  const { data: historial, error: e3 } = await auth
    .from('metrados_procura')
    .select('version, vigente')
    .eq('frente_id', ctx.frenteId)
    .eq('material_id', ctx.materialId)
  if (e3) throw e3
  assert(historial.length === 2, `el historial debería tener 2 versiones, tiene ${historial.length}`)
  const v1Recargada = historial.find((h) => h.version === 1)
  assert(v1Recargada.vigente === false, 'la versión 1 debería haber quedado vigente=false tras la v2')

  const { data: comparacion, error: e4 } = await auth
    .from('procura_vs_consumo')
    .select('*')
    .eq('frente_id', ctx.frenteId)
    .eq('material_id', ctx.materialId)
    .single()
  if (e4) throw e4
  assert(Number(comparacion.cantidad_prevista) === 65, `cantidad_prevista debería ser 65 (50+15), es ${comparacion.cantidad_prevista}`)
  assert(Number(comparacion.cantidad_entregada) === 20, `cantidad_entregada debería ser 20, es ${comparacion.cantidad_entregada}`)
  assert(Number(comparacion.cantidad_reservada) === 0, `cantidad_reservada debería ser 0 (todo entregado o liberado), es ${comparacion.cantidad_reservada}`)
  assert(Number(comparacion.cantidad_solicitada) === 25, `cantidad_solicitada debería ser 25 (20+5), es ${comparacion.cantidad_solicitada}`)

  return `versionado OK (v1->v2), historial=2 filas, comparación: previsto=65 entregado=20 solicitado=25`
}

// ---------------------------------------------------------------------------
// 8. Alertas: evaluar (RPC) y listar lo que haya para el frente de prueba.
// ---------------------------------------------------------------------------
async function alertas() {
  const { error: e1 } = await auth.rpc('fn_evaluar_alertas')
  if (e1) throw e1

  const { data, error: e2 } = await auth.from('alertas').select('tipo, nivel, estado').eq('frente_id', ctx.frenteId)
  if (e2) throw e2

  if (data.length > 0) {
    const { error: e3 } = await auth
      .from('alertas')
      .update({ estado: 'resuelta', resuelta_at: new Date().toISOString(), resuelta_por: ctx.testUserId })
      .eq('frente_id', ctx.frenteId)
      .eq('estado', 'activa')
    if (e3) throw e3
    return `fn_evaluar_alertas corrió sin error; ${data.length} alerta(s) para el frente de prueba, resueltas`
  }
  return 'fn_evaluar_alertas corrió sin error; ninguna alerta se disparó para el frente de prueba (esperable con estos montos)'
}

// ---------------------------------------------------------------------------
// 9. Usuarios: crear un segundo usuario vía la Edge Function crear-usuario.
// ---------------------------------------------------------------------------
async function usuarios() {
  const { data: rolConsulta, error: e1 } = await auth.from('roles').select('id').eq('nombre', 'Consulta').single()
  if (e1) throw e1

  const email = `smoke.consulta.${runId}@dnv.test`
  const { data, error: e2 } = await auth.functions.invoke('crear-usuario', {
    body: { email, nombre: `Test Smoke Consulta ${runId}`, rol_id: rolConsulta.id, frente_id: null },
  })
  if (e2) {
    const detalle = await e2.context?.json?.().catch(() => null)
    throw new Error(detalle?.error || e2.message)
  }
  if (data?.error) throw new Error(data.error)
  assert(!!data.passwordTemporal, 'la función debería devolver una contraseña temporal')
  ctx.segundoUsuarioId = data.usuario.id

  // Nadie debería poder eliminarse a sí mismo — la Edge Function lo rechaza.
  const { data: dataAutoborrado, error: e3 } = await auth.functions.invoke('eliminar-usuario', {
    body: { id: ctx.testUserId },
  })
  const rechazado = e3 || dataAutoborrado?.error
  assert(!!rechazado, 'eliminar-usuario debería rechazar que un usuario se borre a sí mismo')

  // Crear con contraseña elegida por el admin (no autogenerada) y probar
  // que de verdad sirve para iniciar sesión.
  const emailConPassword = `smoke.password.${runId}@dnv.test`
  const passwordElegida = `Elegida!${runId}Aa`
  const { data: dataConPassword, error: e4 } = await auth.functions.invoke('crear-usuario', {
    body: {
      email: emailConPassword,
      nombre: `Test Smoke Password ${runId}`,
      rol_id: rolConsulta.id,
      frente_id: null,
      password: passwordElegida,
    },
  })
  if (e4) throw e4
  if (dataConPassword?.error) throw new Error(dataConPassword.error)
  ctx.terceroUsuarioId = dataConPassword.usuario.id

  const verificador = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { error: eLogin1 } = await verificador.auth.signInWithPassword({
    email: emailConPassword,
    password: passwordElegida,
  })
  if (eLogin1) throw new Error(`no se pudo iniciar sesión con la contraseña elegida al crear: ${eLogin1.message}`)
  await verificador.auth.signOut()

  // Restablecer sin indicar contraseña (se genera una) y probar que la
  // vieja ya no sirve y la nueva sí.
  const { data: dataReset, error: e5 } = await auth.functions.invoke('restablecer-password', {
    body: { id: ctx.terceroUsuarioId },
  })
  if (e5) throw e5
  if (dataReset?.error) throw new Error(dataReset.error)
  assert(!!dataReset.password, 'restablecer-password debería devolver la contraseña generada')

  const { error: eLoginVieja } = await verificador.auth.signInWithPassword({
    email: emailConPassword,
    password: passwordElegida,
  })
  assert(!!eLoginVieja, 'la contraseña anterior ya no debería servir después de restablecerla')

  const { error: eLoginNueva } = await verificador.auth.signInWithPassword({
    email: emailConPassword,
    password: dataReset.password,
  })
  if (eLoginNueva) throw new Error(`la contraseña restablecida debería servir para entrar: ${eLoginNueva.message}`)
  await verificador.auth.signOut()

  return `usuario con contraseña elegida + restablecimiento verificados con inicio de sesión real; auto-eliminación rechazada correctamente`
}

// ---------------------------------------------------------------------------
// 10. Limpieza: igual criterio que el frontend (intenta borrar, si la FK lo
//     impide por historial asociado lo deja cerrado/inactivo en su lugar).
// ---------------------------------------------------------------------------
async function limpieza() {
  const notas = []

  const { error: eMat } = await auth.from('materiales').delete().eq('id', ctx.materialId)
  if (eMat) {
    await auth.from('materiales').update({ estado: 'inactivo' }).eq('id', ctx.materialId)
    notas.push('material: tenía historial (kardex/vales/procura), quedó inactivo')
  } else notas.push('material: borrado')

  const { error: eFr } = await auth.from('frentes').delete().eq('id', ctx.frenteId)
  if (eFr) {
    await auth.from('frentes').update({ estado: 'cerrado', fecha_cierre: new Date().toISOString().slice(0, 10) }).eq('id', ctx.frenteId)
    notas.push('frente: tenía historial, quedó cerrado')
  } else notas.push('frente: borrado')

  const { error: eAlm } = await auth.from('almacenes').delete().eq('id', ctx.almacenId)
  if (eAlm) {
    await auth.from('almacenes').update({ estado: 'inactivo' }).eq('id', ctx.almacenId)
    notas.push('almacén: tenía historial, quedó inactivo')
  } else notas.push('almacén: borrado')

  await auth.from('categorias').delete().eq('id', ctx.categoriaId)

  // Ninguno de estos dos tiene historial propio: se borran de verdad vía
  // la Edge Function eliminar-usuario (probando esa función tal como la
  // usaría la app, no con el service role directo).
  for (const [id, etiqueta] of [
    [ctx.segundoUsuarioId, 'usuario Consulta'],
    [ctx.terceroUsuarioId, 'usuario de prueba de contraseñas'],
  ]) {
    if (!id) continue
    const { data, error } = await auth.functions.invoke('eliminar-usuario', { body: { id } })
    if (error || data?.error) {
      notas.push(`${etiqueta}: no se pudo eliminar (${data?.error || error.message})`)
    } else {
      notas.push(`${etiqueta}: ${data.eliminado ? 'borrado' : 'quedó inactivo'} (vía Edge Function)`)
    }
  }

  // El usuario bootstrap sí queda referenciado como responsable/usuario_id
  // en todo lo que tocó (ingresos, ajustes, vales, salidas, procura, y
  // también en `auditoria.usuario_id` por cada acción que hizo) — esas FK
  // no son "on delete cascade" a propósito (mismo principio de auditoría
  // que protege frentes/materiales/almacenes), así que este delete termina
  // en "queda inactivo" en una corrida normal — es lo esperado. Si alguna
  // vez hace falta purgar todo el rastro de una corrida (no solo
  // desactivar), hay que borrar también las filas de `auditoria` con
  // usuario_id = este id además de las de kardex/salidas/reservas/etc., o
  // eliminar-usuario sigue fallando aunque ya no quede negocio real.
  if (ctx.testUserId) {
    const { error } = await admin.auth.admin.deleteUser(ctx.testUserId)
    if (error) {
      await admin.from('usuarios').update({ estado: 'inactivo' }).eq('id', ctx.testUserId)
      notas.push('usuario Administrador de bootstrap: tenía historial asociado, quedó inactivo (no se pudo borrar)')
    } else {
      notas.push('usuario Administrador de bootstrap: borrado')
    }
  }

  return notas.join('; ')
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`=== Smoke test DNV — run ${runId} ===\n`)

  await step('0. Bootstrap cuenta de prueba', bootstrap)
  await step('1. Catálogo (categoría + material)', catalogo)
  await step('2. Frentes', frentes)
  await step('3. Almacén (ingreso + ajuste + stock/kardex)', almacen)
  await step('4. Vales (crear, enviar, aprobar, entregar parcial+total)', vales)
  await step('5. Reservas (liberar sin entrega)', reservas)
  await step('6. Kardex (consulta filtrada)', kardex)
  await step('7. Procura (versionado + historial + comparación)', procura)
  await step('8. Alertas (evaluar + listar/resolver)', alertas)
  await step('9. Usuarios (Edge Function crear-usuario)', usuarios)
  await step('10. Limpieza', limpieza)

  const fallidos = results.filter((r) => !r.ok)
  console.log(`\n=== Resultado: ${results.length - fallidos.length}/${results.length} pasos OK ===`)
  if (fallidos.length) {
    console.log('Pasos con error:')
    fallidos.forEach((r) => console.log(`  - ${r.nombre}: ${r.error}`))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Error no controlado:', e)
  process.exit(1)
})

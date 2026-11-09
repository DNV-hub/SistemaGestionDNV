<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useValesStore } from '../../vales/store/vales'
import { useAuthStore } from '../../../store/auth'
import EntregaFormModal from '../../vales/components/EntregaFormModal.vue'
import { textoEntregaParaCompartir, textoRequerimientoParaCompartir } from '../../vales/services/valesMensajes'
import { obtenerDiasReservaAntigua, obtenerHistorialVale } from '../../vales/services/valesService'

// Vales del almacenero (almacenero-vales-referencia.html): bandeja a la
// izquierda y detalle a la derecha. Es el único lugar donde se opera un vale:
// aprobar, rechazar, entregar, no entregar (cerrar una línea) y cancelar, con
// el historial de todo lo que pasó.
const vales = useValesStore()
const auth = useAuthStore()
const route = useRoute()

const puedeAprobarRechazar = computed(() => auth.tienePermiso('vales.aprobar_rechazar'))
const puedeRegistrarEntrega = computed(() => auth.tienePermiso('salidas.registrar_entrega'))
const puedeCancelar = computed(() => auth.tienePermiso('vales.cancelar'))
const puedeCerrarLinea = computed(() => puedeAprobarRechazar.value || puedeCancelar.value || puedeRegistrarEntrega.value)

// Líneas aprobadas que todavía esperan entrega (o el resto de una entrega).
const ABIERTAS = ['Aprobado', 'Reservado', 'Parcialmente entregado']
const diasReservaAntigua = ref(15)
onMounted(async () => {
  try {
    diasReservaAntigua.value = await obtenerDiasReservaAntigua()
  } catch (e) {
    console.error(e)
  }
})
const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0)

// ---------------------------------------------------------------------------
// Vale de prueba (XXXX): vive solo en este navegador. Sirve para ensayar
// aprobar, rechazar, bajar cantidades, entregar y cancelar sin tocar la base
// de datos: no reserva ni descuenta stock ni escribe kardex. Lo ve Developer
// (o cualquiera que abra Almacén con ?prueba=1) hasta que se elimina.
// ---------------------------------------------------------------------------
const DEMO_ID = 'prueba-xxxx'
const CLAVE_PRUEBA_OCULTA = 'dnv-vale-prueba-oculto'
function leerPruebaOculta() {
  try {
    return localStorage.getItem(CLAVE_PRUEBA_OCULTA) === '1'
  } catch {
    return false
  }
}
// ?prueba=1 lo vuelve a mostrar aunque se haya eliminado antes.
if (route.query.prueba === '1') {
  try {
    localStorage.removeItem(CLAVE_PRUEBA_OCULTA)
  } catch {
    /* sin almacenamiento: igual se muestra en esta sesión */
  }
}
const pruebaOculta = ref(route.query.prueba === '1' ? false : leerPruebaOculta())
const puedeVerPrueba = computed(
  () => !pruebaOculta.value && puedeAprobarRechazar.value && (auth.nombreRol === 'Developer' || route.query.prueba === '1')
)
// Stock y Procura inventados, elegidos para que salga cada alerta: sin Procura,
// excede Procura, dentro de Procura, stock que no alcanza y sin stock.
const DEMO_STOCK = new Map([['p1', 2045], ['p2', 336], ['p3', 416], ['p4', 10], ['p5', 0]])
const DEMO_PROCURA = new Map([
  ['p2', { cantidad_prevista: 132.94, saldo: -217.06, unidad: 'M', factor: 1 }],
  ['p3', { cantidad_prevista: 120, saldo: 60, unidad: 'UND', factor: 1 }],
  ['p4', { cantidad_prevista: 100, saldo: 80, unidad: 'UND', factor: 1 }],
  ['p5', { cantidad_prevista: 6, saldo: 6, unidad: 'RLL', factor: 1 }],
])
function crearPrueba() {
  const mat = (id, descripcion, unidad, sol) => ({
    id: `${id}-l`,
    material_id: id,
    estado: 'Pendiente',
    cantidad_solicitada: sol,
    cantidad_aprobada: null,
    cantidad_entregada: 0,
    materiales: { descripcion, unidad, tipo_conversion: 'ninguna' },
  })
  const ahora = new Date().toISOString()
  return {
    // Historial simulado: se va llenando con cada paso, igual que el real.
    historial: [
      { fecha_hora: ahora, usuario: 'SUPERVISOR DE PRUEBA', evento: 'Vale creado', detalle: null },
      { fecha_hora: ahora, usuario: 'SUPERVISOR DE PRUEBA', evento: 'Vale: Enviado', detalle: null },
    ],
    id: DEMO_ID,
    numero: 'XXXX',
    estado: 'Enviado',
    fecha: new Date().toISOString().slice(0, 10),
    fecha_envio: new Date().toISOString(),
    created_at: new Date().toISOString(),
    supervisor_id: 'prueba',
    frentes: { codigo: 'PRUEBA', nombre: 'Frente de prueba' },
    usuarios: { nombre: 'SUPERVISOR DE PRUEBA' },
    actividad: 'Vale de prueba: nada de lo que hagas aquí toca el stock ni la base de datos',
    observaciones: 'Cortar el cable en secciones de: 22 ML · 32 ML · 46 ML',
    lineas: [
      mat('p1', 'CABLE DE ACERO BOA D=06MM 1/4', 'ML', 200),
      mat('p2', 'CABLE DE ACERO BOA D=12MM 1/2', 'M', 100),
      mat('p3', 'SUJETACABLE 12MM 1/2', 'UND', 40),
      mat('p4', 'SUJETACABLE 19MM 3/4', 'UND', 24),
      mat('p5', 'MALLA MINAX 80/3 D=3.5X30M', 'RLL', 2),
    ],
  }
}
const prueba = reactive(crearPrueba())
function reiniciarPrueba() {
  Object.assign(prueba, crearPrueba())
  dec.value = {}
  qty.value = {}
  entregaQty.value = {}
  confirmandoCancelar.value = false
  mensajeWsp.value = ''
  avisar('Vale de prueba reiniciado')
}
function eliminarPrueba() {
  try {
    localStorage.setItem(CLAVE_PRUEBA_OCULTA, '1')
  } catch {
    /* sin almacenamiento: se oculta solo en esta sesión */
  }
  pruebaOculta.value = true
  seleccionId.value = null
  const primero = lista.value[0]
  if (primero) abrirVale(primero.id)
  avisar('Vale de prueba eliminado')
}
function anotarPrueba(evento, detalle = null) {
  prueba.historial.push({ fecha_hora: new Date().toISOString(), usuario: auth.perfil?.nombre ?? 'Almacén', evento, detalle })
}
// Estado del vale de prueba a partir de sus líneas (mismas reglas que el real).
function recalcularEstadoPrueba() {
  const antes = prueba.estado
  const ls = prueba.lineas
  const vivas = ls.filter((l) => !['Rechazado', 'Cancelado'].includes(l.estado))
  if (ls.some((l) => l.estado === 'Pendiente')) prueba.estado = 'Enviado'
  else if (!vivas.length) prueba.estado = ls.some((l) => l.estado === 'Cancelado') ? 'Cancelado' : 'Rechazado'
  else if (vivas.every((l) => l.estado === 'Entregado')) prueba.estado = 'Atendido'
  else if (vivas.some((l) => Number(l.cantidad_entregada) > 0)) prueba.estado = 'Parcialmente atendido'
  else prueba.estado = 'Aprobado'
  if (prueba.estado !== antes) anotarPrueba(`Vale: ${prueba.estado}`)
}

// ---------------------------------------------------------------------------
// Bandeja
// ---------------------------------------------------------------------------
const ETIQUETA = {
  Borrador: 'Borrador',
  Enviado: 'Enviado',
  'En revision': 'Enviado',
  Aprobado: 'Aprobado',
  Reservado: 'Aprobado',
  'Parcialmente atendido': 'Parcial',
  Atendido: 'Atendido',
  Cerrado: 'Atendido',
  Rechazado: 'Rechazado',
  Cancelado: 'Cancelado',
}
const FILTROS = [
  ['todos', 'Todos'],
  ['resolver', 'Por resolver'],
  ['Enviado', 'Enviado'],
  ['Aprobado', 'Aprobado'],
  ['Parcial', 'Parcial'],
  ['Atendido', 'Atendido'],
  ['Rechazado', 'Rechazado'],
  ['Cancelado', 'Cancelado'],
]
const etiquetaDe = (estado) => ETIQUETA[estado] ?? estado

// En escritorio la bandeja ocupa justo el alto que queda en pantalla y la
// lista de vales se desplaza dentro de su recuadro (con la rueda, sin barra
// visible): muchos vales ya no alargan toda la página.
const inboxEl = ref(null)
const altoInbox = ref(null)
function medirInbox() {
  const el = inboxEl.value
  if (!el || window.innerWidth <= 820) {
    altoInbox.value = null
    return
  }
  altoInbox.value = Math.max(360, Math.round(window.innerHeight - Math.max(el.getBoundingClientRect().top, 16) - 16))
}
onMounted(() => {
  nextTick(medirInbox)
  window.addEventListener('resize', medirInbox)
})
onBeforeUnmount(() => window.removeEventListener('resize', medirInbox))

const filtro = ref('todos')
const busqueda = ref('')
const seleccionId = ref(null)
const mantenerId = ref(null) // el vale que se acaba de tocar sigue visible aunque salga del filtro
const abierto = ref(false) // móvil: ¿se está viendo el detalle?

const ordenados = computed(() => {
  const reales = [...vales.vales].sort((a, b) => new Date(b.fecha_envio ?? b.created_at) - new Date(a.fecha_envio ?? a.created_at))
  return puedeVerPrueba.value ? [prueba, ...reales] : reales
})
// El contador de "Enviado" cuenta solo vales reales: la prueba no suma.
const porEnviar = computed(() => vales.vales.filter((v) => etiquetaDe(v.estado) === 'Enviado').length)

// "Por resolver": una reserva lleva demasiados días sin entregarse y Almacén
// tiene que decidir (entregar, entregar menos y cerrar, o no entregar).
const porResolver = (v) =>
  (v.vale_detalle ?? []).some(
    (d) => ['Reservado', 'Parcialmente entregado'].includes(d.estado) && diasDesde(d.updated_at) >= diasReservaAntigua.value
  )
const nPorResolver = computed(() => vales.vales.filter(porResolver).length)

const lista = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return ordenados.value.filter((v) => {
    if (filtro.value === 'resolver') {
      if (!porResolver(v) && v.id !== mantenerId.value) return false
    } else if (filtro.value !== 'todos' && etiquetaDe(v.estado) !== filtro.value && v.id !== mantenerId.value) return false
    if (q) {
      const texto = `${v.numero} ${v.frentes?.codigo ?? ''} ${v.frentes?.nombre ?? ''} ${v.usuarios?.nombre ?? ''}`.toLowerCase()
      if (!texto.includes(q) && v.id !== mantenerId.value) return false
    }
    return true
  })
})

const fmtLima = (iso, opts) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', ...opts }).format(new Date(iso))
function fechaCorta(iso) {
  if (!iso) return '—'
  const dia = fmtLima(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) // dd/mm/aaaa
  const hoy = fmtLima(new Date().toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' })
  const ayer = fmtLima(new Date(Date.now() - 86_400_000).toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' })
  const hora = fmtLima(iso, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (dia === hoy) return `Hoy ${hora}`
  if (dia === ayer) return `Ayer ${hora}`
  return `${dia.slice(0, 5)} · ${hora}`
}
const cuando = (v) => fechaCorta(v.fecha_envio ?? v.created_at)

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------
const esPrueba = computed(() => seleccionId.value === DEMO_ID && puedeVerPrueba.value)
const vale = computed(() => {
  if (esPrueba.value) return prueba
  return vales.valeActual?.id === seleccionId.value ? vales.valeActual : null
})
const cargandoDetalle = ref(false)
const dec = ref({}) // lineaId -> 'ap' | 'rj'
const qty = ref({}) // lineaId -> cantidad a aprobar
const entregaQty = ref({}) // lineaId -> cantidad a entregar
const confirmandoCancelar = ref(false)
const motivoCancelar = ref('')
const mensajeWsp = ref('')
const copiado = ref(false)

async function abrirVale(id, { desdeUsuario = false } = {}) {
  seleccionId.value = id
  if (desdeUsuario) abierto.value = true
  dec.value = {}
  qty.value = {}
  entregaQty.value = {}
  confirmandoCancelar.value = false
  motivoCancelar.value = ''
  mensajeWsp.value = ''
  mantenerId.value = null
  cerrando.value = null
  historial.value = null
  verHistorial.value = false
  if (id === DEMO_ID) return // el vale de prueba no se descarga: vive en memoria
  cargandoDetalle.value = true
  try {
    await vales.cargarDetalle(id)
    await repararEstado()
  } finally {
    cargandoDetalle.value = false
  }
}

// Un vale con todas sus líneas ya respondidas no puede seguir "Enviado": si el
// último paso de responder falló (por ejemplo, se cortó la conexión), el vale
// se corrige solo al abrirlo.
async function repararEstado() {
  if (esPrueba.value || !puedeAprobarRechazar.value || !vale.value) return
  if (!['Enviado', 'En revision'].includes(vale.value.estado)) return
  if (vale.value.lineas.some((l) => l.estado === 'Pendiente')) return
  try {
    if (await vales.reconciliarEstado()) {
      refrescarLista()
      avisar(`${vale.value.numero} quedó como ${vale.value.estado}`)
    }
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  // ?vale=<id> (enlaces viejos al detalle de un vale) abre ese vale directo.
  const pedido = typeof route.query.vale === 'string' ? route.query.vale : null
  if (pedido) abrirVale(pedido, { desdeUsuario: true })
  else if (primerReal.value && !seleccionId.value) abrirVale(primerReal.value.id)
})
// Cuando llega la lista (se carga aparte) se abre el primero.
const primerReal = computed(() => lista.value.find((v) => v.id !== DEMO_ID))
watch(
  () => primerReal.value?.id,
  (id) => {
    if (id && !seleccionId.value) abrirVale(id)
  }
)

const nf = (n) => String(Math.round((Number(n) || 0) * 100) / 100)

const lineas = computed(() => {
  if (!vale.value) return []
  return (vale.value.lineas ?? []).map((l) => {
    const sol = Number(l.cantidad_solicitada) || 0
    const apr = l.cantidad_aprobada == null ? null : Number(l.cantidad_aprobada)
    const ent = Number(l.cantidad_entregada) || 0
    const pend = l.estado === 'Pendiente'
    const decision = dec.value[l.id] ?? 'ap'
    const cantidad = pend ? (qty.value[l.id] ?? sol) : apr ?? 0
    return { l, id: l.id, nombre: l.materiales?.descripcion ?? '—', u: l.materiales?.unidad ?? '', sol, apr, ent, est: l.estado, pend, decision, cantidad }
  })
})

/** Cápsulas de stock y Procura de una línea. Mismos datos y misma conversión
 * de unidades que el detalle de siempre (vales.store._cargarAlertas): la
 * cantidad que se va a aprobar se pasa a la unidad del EDP y se compara con
 * lo que queda de lo previsto. */
function situacion(x) {
  const disp = (esPrueba.value ? DEMO_STOCK : vales.alertasStockPorMaterial).get(x.l.material_id) ?? 0
  const procura = (esPrueba.value ? DEMO_PROCURA : vales.alertasProcuraPorMaterial).get(x.l.material_id) ?? null
  const aprobando = x.pend && x.decision === 'ap'
  let stock = { cls: '', texto: `Stock ${nf(disp)} ${x.u}` }
  let malo = false
  if (aprobando) {
    if (disp <= 0) {
      stock = { cls: 'red', texto: 'Sin stock' }
      malo = true
    } else if (x.cantidad > disp) {
      stock = { cls: 'red', texto: `Stock ${nf(disp)} ${x.u} · no alcanza` }
      malo = true
    } else stock.cls = 'ok'
  } else if (x.pend) stock.cls = 'ok'

  let proc = { cls: 'ok', texto: '', detalle: '' }
  let tope = Infinity
  if (!procura) {
    proc = { cls: 'amb', texto: 'No contemplado en Procura', detalle: '' }
    malo = true
  } else {
    const factor = procura.factor ?? 1
    const previsto = Number(procura.cantidad_prevista)
    const consumido = previsto - Number(procura.saldo)
    const usado = aprobando ? x.cantidad * factor : 0
    const total = consumido + usado
    const exceso = total - previsto
    const un = procura.unidad ?? ''
    tope = (previsto - consumido) / factor
    if (exceso > 0.0001) {
      proc = {
        cls: 'red',
        texto: `Excede Procura en ${nf(exceso)} ${un}`,
        detalle: `Previsto ${nf(previsto)} ${un} · Ya se sacó ${nf(consumido)} ${un}${usado ? ` · Con este vale ${nf(total)} ${un}` : ''}`,
      }
      malo = true
    } else {
      proc = { cls: 'ok', texto: `Dentro de Procura · queda ${nf(previsto - total)} ${un}`, detalle: '' }
    }
  }
  const maxQ = Math.floor(Math.min(x.sol, disp, tope) * 1000) / 1000
  const ajustar = aprobando && malo && maxQ > 0 && x.cantidad > maxQ ? maxQ : null
  return { stock, proc, ajustar }
}

const COLOR_ESTADO = {
  Reservado: '#4C8DF6',
  'Parcialmente entregado': '#4C8DF6',
  Entregado: '#22A05B',
  Rechazado: '#E5484D',
  Cancelado: '#8D929B',
}

const pendientes = computed(() => lineas.value.filter((x) => x.pend))
const nAprobar = computed(() => pendientes.value.filter((x) => x.decision === 'ap' && x.cantidad > 0).length)
const nRechazar = computed(() => pendientes.value.length - nAprobar.value)
const hayEntregas = computed(() => lineas.value.some((x) => x.ent > 0))
const puedeResponder = computed(() => puedeAprobarRechazar.value && ['Enviado', 'En revision'].includes(vale.value?.estado) && pendientes.value.length > 0)
// Cancelar el vale entero solo si todavía no salió nada: si ya se entregó
// algo, lo que corresponde es cerrar las líneas que faltan ("No entregar").
const puedeCancelarVale = computed(
  () => puedeCancelar.value && ['Enviado', 'En revision', 'Aprobado', 'Reservado'].includes(vale.value?.estado) && !hayEntregas.value
)

function fijarCantidad(x, valor) {
  const n = Math.max(0, Number(valor) || 0)
  qty.value = { ...qty.value, [x.id]: n }
}
function aprobar(x) {
  dec.value = { ...dec.value, [x.id]: 'ap' }
}
function rechazar(x) {
  dec.value = { ...dec.value, [x.id]: 'rj' }
}

// ---- Toast ---------------------------------------------------------------
const toast = ref('')
let tt = null
function avisar(t) {
  toast.value = t
  clearTimeout(tt)
  tt = setTimeout(() => (toast.value = ''), 2600)
}

function refrescarLista() {
  if (!esPrueba.value && vales.valeActual) vales._actualizarEnLista(vales.valeActual)
}

// ---- Responder vale ----------------------------------------------------------
const trabajando = ref(false)
async function responder() {
  if (!vale.value || trabajando.value) return
  if (esPrueba.value) {
    // Simulación: solo cambia el vale de prueba en memoria.
    for (const x of pendientes.value) {
      if (x.decision === 'rj' || x.cantidad <= 0) {
        x.l.estado = 'Rechazado'
        anotarPrueba(`${x.nombre}: rechazado`)
      } else {
        x.l.estado = 'Reservado'
        x.l.cantidad_aprobada = x.cantidad
        x.l.updated_at = new Date().toISOString()
        anotarPrueba(`${x.nombre}: aprobado y reservado`, `Cantidad: ${nf(x.cantidad)} ${x.u}`)
      }
    }
    recalcularEstadoPrueba()
    mantenerId.value = DEMO_ID
    dec.value = {}
    qty.value = {}
    avisar('Prueba: vale respondido (no se reservó stock)')
    return
  }
  trabajando.value = true
  const almacenId = vales.almacenesActivos[0]?.id
  try {
    for (const x of pendientes.value) {
      if (x.decision === 'rj' || x.cantidad <= 0) await vales.rechazarLinea(x.id)
      else {
        if (!almacenId) throw new Error('No hay un almacén activo para reservar el stock.')
        // Sin recargar el detalle entre líneas: se recarga UNA vez al final.
        await vales.aprobarLinea({ vale_detalle_id: x.id, almacen_id: almacenId, cantidad: x.cantidad, usuario_id: auth.session.user.id, recargar: false })
      }
    }
    await vales.recargarDetalle()
    mantenerId.value = vale.value.id
    dec.value = {}
    qty.value = {}
    await repararEstado()
    refrescarLista()
    avisar('Vale respondido · se reserva el stock aprobado')
  } catch (e) {
    console.error(e)
    avisar(`No se pudo responder el vale${e?.message ? ': ' + e.message : '.'}`)
    await vales.recargarDetalle()
  } finally {
    trabajando.value = false
  }
}

// ---- Entregar --------------------------------------------------------------
const entregaEnProgreso = ref(null) // { linea, reserva } — solo materiales con lote
const necesitaLote = (l) => (l.materiales?.tipo_conversion ?? 'ninguna') !== 'ninguna'
const pendienteDeEntrega = (x) => Math.max(0, (x.apr ?? 0) - x.ent)
const entregable = (x) => ['Reservado', 'Parcialmente entregado'].includes(x.est)

// Aviso de entrega para WhatsApp: ya no se despliega como un recuadro grande,
// queda guardado por línea y se copia con el ícono junto a "ENTREGADO".
const mensajesEntrega = ref({}) // lineaId -> texto de la última entrega
const copiadoId = ref(null)
function textoEntrega(linea, cantidad, almacen) {
  return textoEntregaParaCompartir({
    vale: vale.value,
    material: linea.materiales?.descripcion ?? '—',
    unidad: linea.materiales?.unidad ?? '',
    cantidad,
    almacen,
    supervisorNombre: vale.value?.usuarios?.nombre,
    registradoPor: auth.perfil?.nombre,
  })
}
function mensajeDeEntrega(linea, reserva, cantidad) {
  mensajesEntrega.value = { ...mensajesEntrega.value, [linea.id]: textoEntrega(linea, cantidad, reserva.almacenes?.nombre) }
}
async function copiarEntrega(x) {
  // Si la entrega fue en otra sesión, el aviso se arma con el total entregado.
  const texto = mensajesEntrega.value[x.id] ?? textoEntrega(x.l, x.ent, esPrueba.value ? 'PRUEBA' : vales.almacenesActivos[0]?.nombre)
  try {
    await navigator.clipboard.writeText(texto)
    copiadoId.value = x.id
    setTimeout(() => copiadoId.value === x.id && (copiadoId.value = null), 2000)
    avisar('Aviso de entrega copiado · pégalo en WhatsApp')
  } catch {
    copiado.value = false
    mensajeWsp.value = texto // sin portapapeles: se muestra para copiarlo a mano
  }
}

async function entregar(x) {
  if (trabajando.value) return
  const rem = pendienteDeEntrega(x)
  const q = Math.min(rem, Math.max(0, Number(entregaQty.value[x.id] ?? rem) || 0))
  if (q <= 0) {
    avisar('Ingresa una cantidad mayor a 0')
    return
  }
  if (esPrueba.value) {
    x.l.cantidad_entregada = Number(x.l.cantidad_entregada) + q
    x.l.estado = x.l.cantidad_entregada >= Number(x.l.cantidad_aprobada) ? 'Entregado' : 'Parcialmente entregado'
    anotarPrueba(`${x.nombre}: entrega`, `${nf(q)} ${x.u}`)
    entregaQty.value = { ...entregaQty.value, [x.id]: null }
    recalcularEstadoPrueba()
    mensajeDeEntrega(x.l, { almacenes: { nombre: 'PRUEBA' } }, q)
    avisar('Prueba: entrega registrada · el aviso de WhatsApp se copia con el ícono')
    return
  }
  const reserva = await vales.obtenerReservaDeLinea(x.id)
  if (!reserva) {
    avisar('Esta línea no tiene una reserva activa (puede que ya esté entregada o liberada).')
    return
  }
  // Los materiales que se entregan por lote (malla, cable…) piden elegir de
  // qué lote sale: se usa el formulario de siempre.
  if (necesitaLote(x.l)) {
    entregaEnProgreso.value = { linea: x.l, reserva }
    return
  }
  trabajando.value = true
  try {
    await vales.registrarEntrega({
      linea: x.l,
      reserva,
      documento_referencia: null,
      asignaciones: [{ cantidad: q, ingreso_id: null }],
      usuario_id: auth.session.user.id,
    })
    mantenerId.value = vale.value?.id ?? null
    entregaQty.value = { ...entregaQty.value, [x.id]: null }
    mensajeDeEntrega(x.l, reserva, q)
    refrescarLista()
    avisar('Entrega registrada · copia el aviso con el ícono junto a la cantidad')
  } catch (e) {
    console.error(e)
    avisar(`No se pudo registrar la entrega${e?.message ? ': ' + e.message : '.'}`)
  } finally {
    trabajando.value = false
  }
}

async function guardarEntregaLote(payload) {
  const { linea, reserva } = entregaEnProgreso.value
  await vales.registrarEntrega({ linea, reserva, ...payload, usuario_id: auth.session.user.id })
  const total = payload.asignaciones.reduce((s, a) => s + Number(a.cantidad), 0)
  mensajeDeEntrega(linea, reserva, total)
  entregaEnProgreso.value = null
  mantenerId.value = vale.value?.id ?? null
  refrescarLista()
  avisar('Entrega registrada · copia el aviso con el ícono junto a la cantidad')
}
// ---- No entregar / Cerrar con lo entregado ----------------------------------
// Una sola acción para soltar material de un vale: libera la reserva y cierra
// la línea (Cancelado si no salió nada; Entregado con lo entregado si salió
// una parte). Pide motivo.
const cerrando = ref(null) // { id, motivo }
const abierta = (x) => ABIERTAS.includes(x.est)
const textoCerrar = (x) => (x.ent > 0 ? 'Cerrar con lo entregado' : 'No entregar')
function abrirCierre(x) {
  cerrando.value = cerrando.value?.id === x.id ? null : { id: x.id, motivo: '' }
}
async function confirmarCierre(x) {
  const motivo = (cerrando.value?.motivo ?? '').trim()
  if (!motivo) {
    avisar('Indica el motivo')
    return
  }
  if (esPrueba.value) {
    x.l.estado = x.ent > 0 ? 'Entregado' : 'Cancelado'
    if (x.ent > 0) x.l.cantidad_aprobada = x.ent
    x.l.motivo_cierre = motivo
    anotarPrueba(`${x.nombre}: ${x.ent > 0 ? 'cerrado con lo entregado' : 'cancelado'}`, motivo)
    recalcularEstadoPrueba()
    cerrando.value = null
    mantenerId.value = DEMO_ID
    avisar('Prueba: línea cerrada (no se liberó stock)')
    return
  }
  trabajando.value = true
  try {
    await vales.cerrarLinea(x.l, motivo)
    cerrando.value = null
    mantenerId.value = vale.value?.id ?? null
    historial.value = null
    verHistorial.value = false
    avisar(x.ent > 0 ? `"${x.nombre}" quedó cerrado con lo entregado` : `"${x.nombre}" no se entregará · el stock vuelve a estar disponible`)
  } catch (e) {
    console.error(e)
    avisar(`No se pudo cerrar la línea${e?.message ? ': ' + e.message : '.'}`)
  } finally {
    trabajando.value = false
  }
}

// ---- Historial ---------------------------------------------------------------
const historial = ref(null)
const verHistorial = ref(false)
const cargandoHistorial = ref(false)
async function alternarHistorial() {
  verHistorial.value = !verHistorial.value
  if (!verHistorial.value || historial.value || esPrueba.value) return
  cargandoHistorial.value = true
  try {
    historial.value = await obtenerHistorialVale(vale.value.id)
  } catch (e) {
    console.error(e)
    avisar(`No se pudo cargar el historial${e?.message ? ': ' + e.message : '.'}`)
    verHistorial.value = false
  } finally {
    cargandoHistorial.value = false
  }
}
const historialMostrado = computed(() => (esPrueba.value ? prueba.historial : historial.value))
const fechaHistorial = (iso) => fmtLima(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

// ---- Cancelar ----------------------------------------------------------------
async function cancelarVale() {
  if (esPrueba.value) {
    for (const l of prueba.lineas) if (!['Rechazado', 'Entregado'].includes(l.estado)) l.estado = 'Cancelado'
    prueba.estado = 'Cancelado'
    anotarPrueba('Vale: Cancelado', motivoCancelar.value.trim() || null)
    confirmandoCancelar.value = false
    mantenerId.value = DEMO_ID
    avisar('Prueba: vale cancelado (no había reservas que liberar)')
    return
  }
  trabajando.value = true
  try {
    await vales.cancelar(auth.session.user.id, motivoCancelar.value.trim() || 'Cancelado desde Almacén')
    mantenerId.value = vale.value?.id ?? null
    confirmandoCancelar.value = false
    refrescarLista()
    avisar('Vale cancelado · reservas liberadas')
  } catch (e) {
    console.error(e)
    avisar(`No se pudo cancelar el vale${e?.message ? ': ' + e.message : '.'}`)
  } finally {
    trabajando.value = false
  }
}

// ---- WhatsApp ----------------------------------------------------------------
// Copia el requerimiento directo; solo si el portapapeles falla se muestra
// el texto para copiarlo a mano.
async function generarWsp() {
  const texto = textoRequerimientoParaCompartir({
    vale: vale.value,
    supervisorNombre: vale.value?.usuarios?.nombre,
    actividad: vale.value?.actividad,
  })
  try {
    await navigator.clipboard.writeText(texto)
    avisar('Requerimiento copiado · pégalo en WhatsApp')
  } catch {
    copiado.value = false
    mensajeWsp.value = texto
  }
}
async function copiarWsp() {
  try {
    await navigator.clipboard.writeText(mensajeWsp.value)
    copiado.value = true
  } catch {
    avisar('No se pudo copiar automáticamente — selecciona el texto y cópialo a mano.')
  }
}

// Nota de corte de cable: "Cortar el cable en secciones de: 22 ML · 32 ML".
const cortes = computed(() => {
  const m = vale.value?.observaciones?.match(/^Cortar el cable en secciones de:\s*(.+)$/)
  return m ? m[1].split('·').map((s) => s.trim()).filter(Boolean) : null
})
</script>

<template>
  <div class="va" :class="{ 'va-abierto': abierto }">
    <div class="va-split">
      <!-- ================= BANDEJA ================= -->
      <div ref="inboxEl" class="va-inbox" :style="altoInbox ? { height: altoInbox + 'px' } : null">
        <input v-model="busqueda" class="va-busca" type="search" placeholder="Buscar vale, frente o supervisor…" aria-label="Buscar vale" />
        <div class="va-chips" role="group" aria-label="Estado del vale">
          <button
            v-for="f in FILTROS"
            :key="f[0]"
            type="button"
            class="va-chip"
            :class="{ on: filtro === f[0] }"
            :aria-pressed="filtro === f[0]"
            @click="filtro = f[0]"
          >
            {{ f[1] }}<span v-if="f[0] === 'Enviado' && porEnviar" class="va-n">{{ porEnviar }}</span
            ><span v-if="f[0] === 'resolver' && nPorResolver" class="va-n rojo">{{ nPorResolver }}</span>
          </button>
        </div>
        <div class="va-card va-lista">
          <p v-if="vales.cargando && !vales.vales.length" class="va-vacio">Cargando vales…</p>
          <template v-else>
            <button
              v-for="v in lista"
              :key="v.id"
              type="button"
              class="va-fila"
              :class="{ sel: v.id === seleccionId }"
              :aria-label="`Vale ${v.numero}, ${etiquetaDe(v.estado)}`"
              @click="abrirVale(v.id, { desdeUsuario: true })"
            >
              <span class="va-t">
                <span class="va-l1"><b>{{ v.numero }}</b><span>{{ v.frentes?.codigo || v.frentes?.nombre }}</span><em v-if="v.id === DEMO_ID" class="va-tag">PRUEBA</em></span>
                <span class="va-l2">{{ v.usuarios?.nombre }} · {{ cuando(v) }}</span>
                <span v-if="v.id !== DEMO_ID && porResolver(v)" class="va-marcas">
                  <em class="va-marca amb">Reserva de más de {{ diasReservaAntigua }} días</em>
                </span>
              </span>
              <span class="va-pill" :class="etiquetaDe(v.estado)">{{ etiquetaDe(v.estado) }}</span>
            </button>
            <p v-if="!lista.length" class="va-vacio">{{ vales.error || 'No hay vales en esta vista.' }}</p>
          </template>
        </div>
      </div>

      <!-- ================= DETALLE ================= -->
      <div class="va-det">
        <p v-if="cargandoDetalle && !vale" class="va-vacio">Cargando…</p>
        <template v-else-if="vale">
          <button type="button" class="va-atras" @click="abierto = false">‹ Vales</button>

          <div class="va-hd">
            <h2>{{ vale.numero }}</h2>
            <span class="va-pill" :class="etiquetaDe(vale.estado)">{{ etiquetaDe(vale.estado) }}</span>
            <span class="va-fl"></span>
            <button type="button" class="va-wa" @click="generarWsp">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-5A8 8 0 1 1 21 12z" /></svg>
              WhatsApp
            </button>
          </div>
          <div class="va-meta">
            {{ vale.frentes?.codigo ? vale.frentes.codigo + ' — ' : '' }}{{ vale.frentes?.nombre }} · {{ vale.usuarios?.nombre }} · {{ cuando(vale) }}<template v-if="vale.creado_por"> · Cargado{{ vale.creador?.nombre ? ' por ' + vale.creador.nombre : ' manualmente' }}</template>
          </div>

          <div v-if="esPrueba" class="va-prueba">
            <b>VALE DE PRUEBA</b>
            <span>Todo lo que hagas aquí es una simulación: no reserva ni descuenta stock, no escribe kardex y no toca la base de datos. Solo existe en este navegador.</span>
            <div class="va-prueba-b">
              <button type="button" @click="reiniciarPrueba">Reiniciar prueba</button>
              <button type="button" class="eliminar" @click="eliminarPrueba">Eliminar vale de prueba</button>
            </div>
          </div>

          <div v-if="vale.actividad || vale.observaciones" class="va-card va-info">
            <div v-if="vale.actividad"><span class="va-k">ACTIVIDAD</span>{{ vale.actividad }}</div>
            <div v-if="vale.observaciones">
              <template v-if="cortes"><span class="va-k">CORTAR EN</span><span v-for="c in cortes" :key="c" class="va-cut">{{ c }}</span></template>
              <template v-else><span class="va-k">NOTA</span>{{ vale.observaciones }}</template>
            </div>
          </div>

          <div v-if="mensajeWsp" class="va-card va-wsp">
            <div class="va-wsp-h">
              <span>Mensaje para WhatsApp</span>
              <button type="button" aria-label="Cerrar" @click="mensajeWsp = ''">✕</button>
            </div>
            <textarea readonly :value="mensajeWsp" rows="8"></textarea>
            <button type="button" class="va-copiar" @click="copiarWsp">{{ copiado ? '✓ Copiado' : 'Copiar mensaje' }}</button>
          </div>

          <div class="va-card">
            <p v-if="!lineas.length" class="va-vacio">Este vale todavía no tiene materiales.</p>
            <div v-for="x in lineas" :key="x.id" class="va-mat" :class="{ rej: x.est === 'Rechazado' || x.est === 'Cancelado' }">
              <div class="va-L">
                <b class="va-nom">{{ x.nombre }}</b>
                <div class="va-row">
                  <span v-if="!x.pend" class="va-st" :style="{ color: COLOR_ESTADO[x.est] }">{{ x.est }}</span>
                  <template v-if="!['Rechazado', 'Cancelado', 'Entregado'].includes(x.est)">
                    <span class="va-cap" :class="situacion(x).stock.cls">{{ situacion(x).stock.texto }}</span>
                    <span class="va-cap" :class="situacion(x).proc.cls">{{ situacion(x).proc.texto }}</span>
                  </template>
                </div>
                <div v-if="situacion(x).proc.detalle && !['Rechazado', 'Cancelado', 'Entregado'].includes(x.est)" class="va-det2">{{ situacion(x).proc.detalle }}</div>
                <button v-if="situacion(x).ajustar" type="button" class="va-fix" @click="fijarCantidad(x, situacion(x).ajustar)">
                  Ajustar a {{ nf(situacion(x).ajustar) }} {{ x.u }}
                </button>
                <div v-if="abierta(x) && x.est !== 'Aprobado' && diasDesde(x.l.updated_at) >= diasReservaAntigua" class="va-aviso amb">
                  Reservado hace {{ diasDesde(x.l.updated_at) }} días sin entregar
                </div>
                <div v-if="x.l.motivo_cierre && ['Cancelado', 'Entregado'].includes(x.est)" class="va-det2">Motivo: {{ x.l.motivo_cierre }}</div>
              </div>

              <div class="va-R">
                <!-- Pendiente: aprobar con cantidad o rechazar -->
                <template v-if="x.pend && puedeAprobarRechazar">
                  <div v-if="x.decision === 'ap'" class="va-ctl">
                    <span v-if="x.cantidad !== x.sol" class="va-of">de {{ nf(x.sol) }}</span>
                    <label class="va-num">
                      <input type="number" inputmode="decimal" min="0" step="any" :value="nf(x.cantidad)" aria-label="Cantidad a aprobar" @input="fijarCantidad(x, $event.target.value)" />
                      <em>{{ x.u }}</em>
                    </label>
                    <button type="button" class="va-ok" aria-label="Aprobar este material" title="Aprobado" @click="aprobar(x)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </button>
                    <button type="button" class="va-no" aria-label="Rechazar este material" title="Rechazar" @click="rechazar(x)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                  <div v-else class="va-ctl">
                    <span class="va-rech">Rechazado</span>
                    <button type="button" class="va-undo" @click="aprobar(x)">Deshacer</button>
                  </div>
                </template>
                <div v-else-if="x.pend" class="va-q"><small>SOLICITADO</small><b>{{ nf(x.sol) }} {{ x.u }}</b></div>
                <div v-else class="va-q">
                  <small>{{ x.apr == null ? 'SOLICITADO' : 'ENTREGADO' }}</small>
                  <div class="va-qv">
                    <b>{{ x.apr == null ? `${nf(x.sol)} ${x.u}` : `${nf(x.ent)} / ${nf(x.apr)} ${x.u}` }}</b>
                    <button
                      v-if="x.ent > 0"
                      type="button"
                      class="va-copy"
                      :class="{ ok: copiadoId === x.id }"
                      :title="copiadoId === x.id ? 'Copiado' : 'Copiar aviso de entrega para WhatsApp'"
                      :aria-label="`Copiar aviso de entrega de ${x.nombre} para WhatsApp`"
                      @click="copiarEntrega(x)"
                    >
                      <svg v-if="copiadoId === x.id" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
                    </button>
                  </div>
                </div>

                <!-- Entregar · No entregar / Cerrar con lo entregado -->
                <div v-if="(entregable(x) && puedeRegistrarEntrega) || (abierta(x) && puedeCerrarLinea)" class="va-acts">
                  <div v-if="entregable(x) && puedeRegistrarEntrega" class="va-ctl">
                    <label class="va-num">
                      <input
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="any"
                        :max="pendienteDeEntrega(x)"
                        :value="nf(entregaQty[x.id] ?? pendienteDeEntrega(x))"
                        aria-label="Cantidad a entregar"
                        @input="entregaQty = { ...entregaQty, [x.id]: Math.max(0, Math.min(pendienteDeEntrega(x), Number($event.target.value) || 0)) }"
                      />
                      <em>{{ x.u }}</em>
                    </label>
                    <button type="button" class="va-ent" :disabled="trabajando" @click="entregar(x)">Entregar</button>
                  </div>
                  <button
                    v-if="abierta(x) && puedeCerrarLinea"
                    type="button"
                    class="va-sec"
                    :aria-expanded="cerrando?.id === x.id"
                    @click="abrirCierre(x)"
                  >
                    {{ textoCerrar(x) }}
                  </button>
                </div>
                <span v-if="x.est === 'Entregado'" class="va-done">✓ Entregado</span>
              </div>

              <!-- Confirmación: a lo ancho, debajo del material -->
              <div v-if="cerrando?.id === x.id" class="va-cierre" role="group" :aria-label="textoCerrar(x)">
                <div class="va-cierre-t">
                  <b>{{ textoCerrar(x) }}</b>
                  <span v-if="x.ent > 0">
                    Queda entregado con {{ nf(x.ent) }} {{ x.u }}. Los {{ nf(pendienteDeEntrega(x)) }} {{ x.u }} que faltaban se liberan y vuelven al stock disponible.
                  </span>
                  <span v-else-if="x.est === 'Aprobado'">El material queda cancelado; no tenía stock reservado.</span>
                  <span v-else>El material queda cancelado y los {{ nf(x.apr) }} {{ x.u }} reservados vuelven al stock disponible.</span>
                </div>
                <div class="va-cierre-f">
                  <input
                    v-model="cerrando.motivo"
                    class="va-motivo"
                    type="text"
                    placeholder="Motivo (obligatorio)"
                    aria-label="Motivo"
                    @keydown.enter="confirmarCierre(x)"
                  />
                  <button type="button" class="va-cierre-no" @click="cerrando = null">Volver</button>
                  <button type="button" class="va-cierre-si" :disabled="trabajando" @click="confirmarCierre(x)">Confirmar</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="puedeResponder" class="va-foot">
            <div>Aprobar {{ nAprobar }}<template v-if="nRechazar"> · Rechazar {{ nRechazar }}</template> de {{ pendientes.length }}</div>
            <button type="button" class="va-cta" :disabled="trabajando" @click="responder">{{ trabajando ? 'Respondiendo…' : 'Responder vale' }}</button>
          </div>

          <template v-if="puedeCancelarVale">
            <div v-if="confirmandoCancelar" class="va-askc">
              <div>¿Cancelar {{ vale.numero }}? Se liberan las reservas de stock y no se puede deshacer.</div>
              <input v-model="motivoCancelar" class="va-motivo" type="text" placeholder="Motivo (opcional)" aria-label="Motivo de la cancelación" />
              <div class="va-b">
                <button type="button" class="no" @click="confirmandoCancelar = false">Volver</button>
                <button type="button" class="yes" :disabled="trabajando" @click="cancelarVale">Sí, cancelar</button>
              </div>
            </div>
            <button v-else type="button" class="va-vcx" @click="confirmandoCancelar = true">Cancelar vale</button>
          </template>

          <div class="va-card va-hist">
            <button type="button" class="va-hist-h" :aria-expanded="verHistorial" @click="alternarHistorial">
              <span>Historial del vale</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <template v-if="verHistorial">
              <p v-if="cargandoHistorial" class="va-vacio">Cargando historial…</p>
              <ol v-else-if="historialMostrado?.length" class="va-hist-l">
                <li v-for="(h, i) in historialMostrado" :key="i">
                  <span class="va-hist-f">{{ fechaHistorial(h.fecha_hora) }}</span>
                  <span class="va-hist-e">
                    <b>{{ h.evento }}</b>
                    <small v-if="h.detalle">{{ h.detalle }}</small>
                    <small class="u">{{ h.usuario }}</small>
                  </span>
                </li>
              </ol>
              <p v-else class="va-vacio">Sin movimientos registrados.</p>
            </template>
          </div>
        </template>
        <p v-else class="va-vacio">Elige un vale de la lista.</p>
      </div>
    </div>

    <div v-if="toast" class="va-toast" role="status">{{ toast }}</div>

    <EntregaFormModal
      v-if="entregaEnProgreso"
      :linea="entregaEnProgreso.linea"
      :reserva="entregaEnProgreso.reserva"
      @guardar="guardarEntregaLote"
      @cerrar="entregaEnProgreso = null"
    />
  </div>
</template>

<style scoped>
.va {
  --sf: var(--color-surface);
  --so: var(--color-surface-2);
  --ln: var(--color-border);
  --tx: var(--color-text);
  --mu: var(--color-text-muted);
  color: var(--tx);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}
.va * {
  box-sizing: border-box;
}
.va button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.va-split {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
.va-inbox {
  flex: 1 1 440px;
  max-width: 520px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 16px;
}
.va-busca,
.va-chips {
  flex: none;
}
.va-card.va-lista {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.va-lista::-webkit-scrollbar {
  display: none;
}
.va-det {
  flex: 999 1 480px;
  min-width: 0;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.va-card {
  background: var(--sf);
  border-radius: 16px;
  box-shadow: 0 0 0 1px var(--ln);
  overflow: hidden;
}
.va-busca {
  height: 44px;
  width: 100%;
  border: 0;
  border-radius: 14px;
  background: var(--sf);
  box-shadow: 0 0 0 1px var(--ln);
  padding: 0 16px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx);
}
.va-busca:focus {
  outline: 2px solid #f6a800;
}
.va-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.va-chip {
  border: 0;
  background: var(--so);
  color: var(--mu);
  height: 32px;
  padding: 0 12px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}
.va-chip.on {
  background: var(--tx);
  color: var(--color-bg);
}
.va-n {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 99px;
  margin-left: 7px;
  font-size: 11px;
  font-weight: 800;
  background: #f6a800;
  color: #111;
}
.va-fila {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--ln);
  background: none;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  min-height: 58px;
}
.va-fila:first-child {
  border-top: 0;
}
.va-fila:hover {
  background: var(--so);
}
.va-fila.sel {
  background: var(--so);
  box-shadow: inset 3px 0 0 #f6a800;
}
.va-t {
  flex: 1;
  min-width: 0;
}
.va-l1 {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.va-l1 b {
  font-size: 15px;
  font-weight: 800;
}
.va-l1 span {
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.va-l2 {
  display: block;
  font-size: 12.5px;
  color: var(--mu);
  font-weight: 600;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.va-pill {
  font-size: 12px;
  font-weight: 800;
  border-radius: 99px;
  padding: 4px 10px;
  white-space: nowrap;
  flex: 0 0 auto;
}
.va-pill.Enviado { background: rgba(76, 141, 246, 0.16); color: #4c8df6; }
.va-pill.Aprobado { background: rgba(246, 168, 0, 0.16); color: #d98e00; }
.va-pill.Atendido { background: rgba(34, 197, 94, 0.16); color: #22a05b; }
.va-pill.Parcial { background: rgba(124, 92, 255, 0.16); color: #7c5cff; }
.va-pill.Cancelado,
.va-pill.Borrador { background: rgba(141, 146, 155, 0.18); color: #8d929b; }
.va-pill.Rechazado { background: rgba(239, 68, 68, 0.16); color: #e5484d; }
.va-tag {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  border-radius: 6px;
  padding: 2px 6px;
  background: rgba(124, 92, 255, 0.16);
  color: #7c5cff;
  align-self: center;
}
.va-prueba {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 16px;
  background: rgba(124, 92, 255, 0.1);
  box-shadow: 0 0 0 1px rgba(124, 92, 255, 0.4);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}
.va-prueba b {
  color: #7c5cff;
  letter-spacing: 0.06em;
}
.va-prueba-b {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.va-prueba-b button {
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 11px;
  background: var(--so);
  font-size: 13px;
  font-weight: 800;
}
.va-prueba-b .eliminar {
  color: #e5484d !important;
}
.va-vacio {
  margin: 0;
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--mu);
  font-weight: 600;
}

/* Detalle */
.va-hd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.va-hd h2 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.va-fl {
  flex: 1;
}
.va-wa {
  border: 0;
  background: #f6a800;
  color: #111 !important;
  height: 36px;
  padding: 0 14px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 800;
  display: inline-flex;
  gap: 7px;
  align-items: center;
}
.va-wa:hover {
  background: #e59a00;
}
.va-atras {
  display: none;
  border: 0;
  background: none;
  color: var(--mu) !important;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 8px 6px 0;
  align-self: flex-start;
}
.va-meta {
  font-size: 13px;
  color: var(--mu);
  font-weight: 600;
  margin-top: -6px;
}
.va-info {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.va-k {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--mu);
  margin-right: 8px;
}
.va-cut {
  font-size: 13px;
  font-weight: 800;
  border-radius: 8px;
  padding: 3px 9px;
  background: rgba(246, 168, 0, 0.16);
  color: #d98e00;
  margin-right: 6px;
  display: inline-block;
}
.va-wsp {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.va-wsp-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 800;
}
.va-wsp-h button {
  border: 0;
  background: none;
  color: var(--mu) !important;
}
.va-wsp textarea {
  width: 100%;
  border: 0;
  border-radius: 12px;
  background: var(--so);
  color: var(--tx);
  padding: 10px 12px;
  font: inherit;
  font-size: 12.5px;
  resize: vertical;
}
.va-copiar {
  align-self: flex-start;
  border: 0;
  background: var(--tx);
  color: var(--color-bg) !important;
  height: 36px;
  padding: 0 14px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 800;
}
.va-mat {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 14px 16px;
  border-top: 1px solid var(--ln);
}
.va-mat:first-child {
  border-top: 0;
}
.va-mat.rej .va-nom {
  opacity: 0.55;
}
.va-L {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.va-nom {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}
.va-R {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex: none;
}
.va-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.va-st {
  font-size: 12px;
  font-weight: 700;
  margin-right: 2px;
}
.va-cap {
  font-size: 12px;
  font-weight: 700;
  border-radius: 8px;
  padding: 2px 8px;
  background: var(--so);
  color: var(--mu);
}
.va-cap.ok { background: rgba(34, 197, 94, 0.15); color: #22a05b; }
.va-cap.red { background: rgba(239, 68, 68, 0.14); color: #e5484d; }
.va-cap.amb { background: rgba(246, 168, 0, 0.16); color: #d98e00; }
.va-det2 {
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
  line-height: 1.4;
}
.va-fix {
  border: 0;
  background: none;
  color: #4c8df6 !important;
  font-size: 12px;
  font-weight: 800;
  padding: 2px 0;
  align-self: flex-start;
}
.va-ctl {
  display: flex;
  align-items: center;
  gap: 8px;
}
.va-num {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  border-radius: 12px;
  background: var(--so);
  padding: 0 12px 0 6px;
  box-shadow: inset 0 0 0 1px var(--ln);
}
.va-num:focus-within {
  outline: 2px solid #f6a800;
  outline-offset: 1px;
}
.va-num input {
  width: 62px;
  border: 0;
  background: transparent;
  color: var(--tx);
  font: inherit;
  font-size: 17px;
  font-weight: 800;
  text-align: right;
  padding: 0;
  font-variant-numeric: tabular-nums;
  outline: none;
  -moz-appearance: textfield;
  appearance: textfield;
}
.va-num input::-webkit-outer-spin-button,
.va-num input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.va-num em {
  font-style: normal;
  font-size: 13px;
  font-weight: 700;
  color: var(--mu);
}
.va-of {
  font-size: 12px;
  font-weight: 700;
  color: #d98e00;
}
.va-ok,
.va-no {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 0;
  display: grid;
  place-items: center;
}
.va-ok {
  background: rgba(46, 160, 67, 0.16);
  color: #2ea043 !important;
  box-shadow: inset 0 0 0 1.5px rgba(46, 160, 67, 0.55);
}
.va-no {
  background: transparent;
  color: var(--mu) !important;
  box-shadow: inset 0 0 0 1px var(--ln);
}
.va-no:hover {
  color: #e5484d !important;
  box-shadow: inset 0 0 0 1px rgba(229, 72, 77, 0.5);
  background: rgba(229, 72, 77, 0.08);
}
.va-rech {
  font-size: 13px;
  font-weight: 800;
  color: #e5484d;
}
.va-undo {
  border: 0;
  background: none;
  color: #4c8df6 !important;
  font-size: 13px;
  font-weight: 800;
  padding: 6px 2px;
}
.va-ent {
  border: 0;
  background: #f6a800;
  color: #111 !important;
  height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
}
.va-ent:hover {
  background: #e59a00;
}
.va-ent:disabled,
.va-cta:disabled {
  opacity: 0.6;
  cursor: default;
}
.va-q {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.va-q small {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--mu);
}
.va-q b {
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.va-done {
  font-size: 13px;
  font-weight: 800;
  color: #22a05b;
}
.va-foot {
  position: sticky;
  bottom: 12px;
  background: var(--sf);
  border-radius: 16px;
  box-shadow: 0 0 0 1px var(--ln), 0 10px 30px rgba(0, 0, 0, 0.12);
  padding: 12px 12px 12px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.va-foot div {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--mu);
}
.va-cta {
  border: 0;
  background: #f6a800;
  color: #111 !important;
  height: 44px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
}
.va-vcx {
  border: 0;
  background: none;
  color: #e5484d !important;
  font-size: 13px;
  font-weight: 800;
  padding: 10px 4px;
  align-self: flex-start;
}
.va-askc {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(229, 72, 77, 0.5);
  background: var(--sf);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
}
.va-motivo {
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: var(--so);
  color: var(--tx);
  padding: 0 12px;
  font: inherit;
  font-size: 14px;
}
.va-b {
  display: flex;
  gap: 8px;
}
.va-b button {
  flex: 1;
  height: 40px;
  border-radius: 12px;
  border: 0;
  font-size: 13px;
  font-weight: 800;
}
.va-b .no {
  background: var(--so);
}
.va-b .yes {
  background: #e5484d;
  color: #fff !important;
}
.va-n.rojo {
  background: #e5484d;
  color: #fff;
}
.va-marcas {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.va-marca {
  font-style: normal;
  font-size: 11px;
  font-weight: 800;
  border-radius: 6px;
  padding: 2px 7px;
}
.va-marca.amb,
.va-aviso.amb { background: rgba(246, 168, 0, 0.16); color: #d98e00; }
.va-aviso {
  font-size: 12.5px;
  font-weight: 700;
  border-radius: 10px;
  padding: 7px 10px;
  line-height: 1.4;
}
/* Columna de acciones: Entregar arriba, No entregar debajo, mismo ancho. */
.va-acts {
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.va-acts .va-ctl {
  width: 100%;
}
.va-acts .va-num {
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}
.va-acts .va-num input {
  width: 100%;
  min-width: 0;
}
.va-acts .va-ent {
  flex: 0 0 104px;
}
.va-sec {
  width: 100%;
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #e5484d !important;
  box-shadow: inset 0 0 0 1px rgba(229, 72, 77, 0.45);
  font-size: 13px;
  font-weight: 800;
}
.va-sec:hover,
.va-sec[aria-expanded='true'] {
  background: rgba(229, 72, 77, 0.08);
  box-shadow: inset 0 0 0 1px rgba(229, 72, 77, 0.7);
}
.va-qv {
  display: flex;
  align-items: center;
  gap: 6px;
}
.va-copy {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: var(--so);
  color: var(--mu) !important;
  display: grid;
  place-items: center;
  flex: none;
}
.va-copy:hover {
  color: var(--tx) !important;
  box-shadow: inset 0 0 0 1px var(--ln);
}
.va-copy.ok {
  background: rgba(34, 197, 94, 0.15);
  color: #22a05b !important;
}
/* Confirmación de cierre: fila a lo ancho bajo el material. */
.va-mat {
  flex-wrap: wrap;
}
.va-cierre {
  flex: 1 1 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(229, 72, 77, 0.06);
  box-shadow: inset 0 0 0 1px rgba(229, 72, 77, 0.35);
}
.va-cierre-t {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.45;
}
.va-cierre-t b {
  color: #e5484d;
  font-weight: 800;
}
.va-cierre-t span {
  color: var(--mu);
  font-weight: 600;
}
.va-cierre-f {
  display: flex;
  gap: 8px;
}
.va-cierre-f .va-motivo {
  flex: 1;
  min-width: 0;
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
}
.va-cierre-no,
.va-cierre-si {
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  flex: none;
}
.va-cierre-no {
  background: var(--so);
}
.va-cierre-si {
  background: #e5484d;
  color: #fff !important;
}
.va-cierre-si:disabled {
  opacity: 0.6;
}
.va-hist-h {
  width: 100%;
  border: 0;
  background: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
}
.va-hist-h svg {
  transition: transform 0.15s;
  color: var(--mu);
}
.va-hist-h[aria-expanded='true'] svg {
  transform: rotate(180deg);
}
.va-hist-l {
  list-style: none;
  margin: 0;
  padding: 0 16px 14px;
  display: flex;
  flex-direction: column;
}
.va-hist-l li {
  display: flex;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--ln);
}
.va-hist-f {
  flex: 0 0 88px;
  font-size: 12px;
  font-weight: 700;
  color: var(--mu);
  font-variant-numeric: tabular-nums;
}
.va-hist-e {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 13px;
}
.va-hist-e b {
  font-weight: 700;
}
.va-hist-e small {
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
}
.va-hist-e small.u {
  font-size: 11.5px;
}
.va-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: var(--tx);
  color: var(--color-bg);
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  z-index: 90;
  max-width: 90vw;
}

@media (max-width: 820px) {
  .va-inbox,
  .va-det {
    max-width: none;
    flex-basis: 100%;
  }
  .va-atras {
    display: inline-flex;
  }
  .va-inbox {
    position: static;
    height: auto !important;
  }
  .va-card.va-lista {
    overflow: visible;
  }
  .va:not(.va-abierto) .va-det {
    display: none;
  }
  .va.va-abierto .va-inbox {
    display: none;
  }
  .va-mat {
    flex-direction: column;
    gap: 12px;
  }
  .va-R {
    align-items: flex-start;
    width: 100%;
  }
  .va-acts {
    width: 100%;
  }
  .va-q {
    align-items: flex-start;
  }
  .va-cierre-f {
    flex-wrap: wrap;
  }
  .va-cierre-f .va-motivo {
    flex-basis: 100%;
  }
  .va-cierre-no,
  .va-cierre-si {
    flex: 1;
  }
}
</style>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAlmacenStore } from '../store/almacen'
import { useAuthStore } from '../../../store/auth'
import IngresoFormModal from '../components/IngresoFormModal.vue'
import AjusteFormModal from '../components/AjusteFormModal.vue'
import CorregirIngresoModal from '../components/CorregirIngresoModal.vue'
import ImportarIngresosModal from '../components/ImportarIngresosModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'
import { useReservasStore } from '../../reservas/store/reservas'
import { contarReservasVigentes } from '../../reservas/services/reservasService'
import { useValesStore } from '../../vales/store/vales'
import ValeFormModal from '../../vales/components/ValeFormModal.vue'
import DevolucionNuevaView from '../../vales/views/DevolucionNuevaView.vue'
import TransferenciaNuevaView from '../../vales/views/TransferenciaNuevaView.vue'
import ValesAlmacenero from '../components/ValesAlmacenero.vue'
import { useDevolucionesStore } from '../../devoluciones/store/devoluciones'
import RecibirDevolucionModal from '../../devoluciones/components/RecibirDevolucionModal.vue'
import ReevaluarBajaModal from '../../devoluciones/components/ReevaluarBajaModal.vue'
import AnularRecepcionModal from '../../devoluciones/components/AnularRecepcionModal.vue'
import { useTransferenciasStore } from '../../transferencias/store/transferencias'
import { descargarExcel } from '../../../utils/exportarExcel'
import { useReportesStore } from '../../reportes/store/reportes'
import { armarReporteSalidas, descargarReporteSalidas } from '../../reportes/utils/salidasFrente'
import { listarStockParaExportar, contarValesPendientes } from '../services/almacenService'
import { formatearNumero } from '../../../utils/formatearNumero'
import { useEsMovil } from '../../../composables/useEsMovil'

const almacen = useAlmacenStore()
const auth = useAuthStore()
const devoluciones = useDevolucionesStore()
const transferencias = useTransferenciasStore()
const router = useRouter()

const route = useRoute()
// ?tab=vales deja volver desde el detalle de un vale a la pestaña Vales de
// Almacén (y no al módulo viejo de Vales).
const PESTAÑAS_VALIDAS = ['stock', 'ingresos', 'salidas', 'vales', 'reservas', 'ajustes', 'devoluciones', 'bajas', 'transferencias']
const tab = ref(PESTAÑAS_VALIDAS.includes(route.query.tab) ? route.query.tab : 'stock')
const mostrarModalIngreso = ref(false)
const mostrarModalAjuste = ref(false)
const mostrarModalImportar = ref(false)
// "+ Nuevo ingreso" abre directo el formulario individual (el caso más
// común); el ingreso masivo por Excel ya no es un botón aparte en el panel,
// sino una opción dentro de ese mismo formulario que cambia al otro panel.
function irAIngresoMasivo() {
  mostrarModalIngreso.value = false
  mostrarModalImportar.value = true
}
const ajustePrellenado = ref(null)
// Ingreso al que se le están corrigiendo los datos (guía, proveedor, observación).
const ingresoEnEdicion = ref(null)
// Otros materiales que entraron en la misma carga: mismo usuario y misma hora de registro.
const hermanosDelIngreso = computed(() => {
  const i = ingresoEnEdicion.value
  if (!i) return []
  return almacen.ingresos.filter((x) => x.id !== i.id && x.usuario_id === i.usuario_id && x.created_at === i.created_at)
})
async function guardarDatosIngreso(ids, datos) {
  await almacen.editarDatosIngresos(ids, datos)
}
// Ajuste de cantidad que sale de "Corregir ingreso" (mismo registrarAjuste de siempre).
async function ajustarDesdeIngreso(payload) {
  await almacen.registrarAjuste({ ...payload, usuario_id: auth.session.user.id })
}
function correccionIngresoLista({ datos, cantidad, ingresos, parcial }) {
  if (datos && cantidad) aviso.value = 'Ingreso corregido: datos y cantidad.'
  else if (cantidad) aviso.value = 'Cantidad del ingreso corregida con un ajuste.'
  else aviso.value = ingresos > 1 ? `Datos actualizados en ${ingresos} ingresos.` : 'Datos del ingreso actualizados.'
  if (!parcial) ingresoEnEdicion.value = null
}
const devolucionARecibir = ref(null)
const bajaAReevaluar = ref(null)
const recepcionAAnular = ref(null)
const anulandoRecepcion = ref(false)
const errorAnular = ref('')
const aviso = ref('')

const puedeRegistrarIngreso = computed(() => auth.tienePermiso('stock.registrar_ingreso'))
const puedeRegistrarAjuste = computed(() => auth.tienePermiso('stock.registrar_ajuste'))
const puedeVerSalidas = computed(() => auth.tienePermiso('kardex.ver'))
const puedeVerDevoluciones = computed(
  () => auth.tienePermiso('devoluciones.ver_todas') || auth.tienePermiso('devoluciones.recibir_rechazar')
)
const puedeRecibirDevoluciones = computed(() => auth.tienePermiso('devoluciones.recibir_rechazar'))
const puedeVerTransferencias = computed(
  () => auth.tienePermiso('transferencias.ver_todas') || auth.tienePermiso('transferencias.confirmar_rechazar'),
)

async function recibirDevolucion({ devolucion_id, almacen_id, cantidad_reutilizable, ancho, largo }) {
  await devoluciones.recibir({ devolucion_id, almacen_id, cantidad_reutilizable, ancho, largo, usuario_id: auth.session.user.id })
  devolucionARecibir.value = null
  aviso.value = 'Devolución recibida.'
}

// Hover del estado de una devolución: quién la recibió o rechazó, y cuándo.
// Es un globito propio (no el `title` del navegador, que es lento, no sale
// al tocar en pantallas táctiles y algunos navegadores lo suprimen).
function lineasResolucion(d) {
  if (d.estado === 'Solicitada') return ['Pendiente', 'Aún no la recibe ni la rechaza nadie']
  const cuando = d.recibida_at
    ? new Date(d.recibida_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : ''
  const lineas = [`${d.estado === 'Recibida' ? 'Recibida' : 'Rechazada'} por ${d.receptor?.nombre ?? '—'}`]
  if (cuando) lineas.push(cuando)
  if (d.estado === 'Rechazada' && d.motivo_rechazo) lineas.push(`Motivo: ${d.motivo_rechazo}`)
  return lineas
}
const tipEstado = ref(null)
function mostrarTipEstado(evento, d) {
  const r = evento.currentTarget.getBoundingClientRect()
  const arriba = r.top > 110
  tipEstado.value = {
    lineas: lineasResolucion(d),
    left: `${Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130)}px`,
    top: `${arriba ? r.top - 8 : r.bottom + 8}px`,
    arriba,
  }
}
function ocultarTipEstado() {
  tipEstado.value = null
}

async function rechazarDevolucion(d) {
  const motivo = prompt(`¿Por qué se rechaza la devolución de "${d.materiales?.descripcion}"?`)
  if (motivo === null) return
  await devoluciones.rechazar({ devolucion_id: d.id, motivo, usuario_id: auth.session.user.id })
  aviso.value = 'Devolución rechazada.'
}

async function anularRecepcion({ motivo }) {
  anulandoRecepcion.value = true
  errorAnular.value = ''
  try {
    await devoluciones.anularRecepcion({ devolucion_id: recepcionAAnular.value.id, motivo, usuario_id: auth.session.user.id })
    recepcionAAnular.value = null
    aviso.value = 'Devolución rechazada — el material salió del stock.'
    almacen.cargar() // el stock cambió
  } catch (e) {
    errorAnular.value = e?.message ?? 'No se pudo rechazar la devolución.'
  } finally {
    anulandoRecepcion.value = false
  }
}

async function reevaluarBaja({ cantidad_a_recuperar, ancho, largo, motivo }) {
  await devoluciones.reevaluar({
    devolucion_id: bajaAReevaluar.value.id,
    usuario_id: auth.session.user.id,
    cantidad_a_recuperar,
    ancho,
    largo,
    motivo,
  })
  bajaAReevaluar.value = null
  aviso.value = 'Evaluación corregida — el material vuelve a stock.'
}

// stock_con_minimo ya calcula el mínimo (20% del último ingreso, por
// defecto) del lado de la base — misma fuente que usan las alertas, para
// que esta pantalla nunca diga algo distinto de lo que dispara una alerta.
// `stock` está partido por (almacén, material, contrato), así que la
// llave para cruzar ambas listas necesita los tres campos.
const claveMinimo = (almacenId, materialId, contratoId) => `${almacenId}::${materialId}::${contratoId}`
const minimosPorFila = computed(() => new Map(almacen.stockMinimos.map((m) => [claveMinimo(m.almacen_id, m.material_id, m.contrato_id), m])))

function stockMinimoEfectivo(fila) {
  return minimosPorFila.value.get(claveMinimo(fila.almacen_id, fila.material_id, fila.contrato_id))?.stock_minimo_efectivo ?? null
}

function bajoMinimo(fila) {
  const minimo = stockMinimoEfectivo(fila)
  return minimo !== null && fila.cantidad_disponible < minimo
}

function estadoFila(fila) {
  if (Number(fila.cantidad_disponible) <= 0) return 'Sin stock'
  if (bajoMinimo(fila)) return 'Bajo mínimo'
  return 'OK'
}

// Buscador dinámico, uno por pestaña: por nombre o código, para verificar
// rápido algo sin desplazarse por toda la tabla. Se limpia solo al
// cambiar de pestaña, para no dejar un filtro puesto donde ya no se ve.
const busqueda = ref('')
watch(tab, () => (busqueda.value = ''))
const placeholderBusqueda = computed(() =>
  tab.value === 'salidas' ? 'Buscar por material, frente o supervisor…' : 'Buscar por nombre…'
)

// Botón de filtro de la pestaña Stock: deja ver de un click solo lo que
// necesita atención (bajo mínimo o en cero), sin tener que buscar material
// por material. Se apaga solo al cambiar de pestaña, igual que la búsqueda.
const soloBajoOAgotado = ref(false)
watch(tab, () => (soloBajoOAgotado.value = false))

// Filtro de Almacén/Contrato en la barra de herramientas (antes eran
// columnas de cada tabla): solo Stock/Ingresos/Ajustes/Salidas tienen esos
// campos por fila, así que en las demás pestañas no filtran nada.
const PESTAÑAS_CON_CONTRATO = ['stock', 'ingresos', 'ajustes', 'salidas']
const filtroContratoId = ref('')

function porTexto(lista, campos) {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return lista
  return lista.filter((fila) => campos.some((obtener) => obtener(fila)?.toLowerCase().includes(q)))
}

// El stock es una fila por material Y contrato: si hay más de un contrato, un
// mismo material sale repetido (una fila por contrato). Se rotula cada fila con
// su contrato para que no parezca una repetición.
const nombreContratoPorId = computed(() => new Map(almacen.contratos.map((c) => [c.id, c.nombre])))
const variosContratos = computed(() => almacen.contratos.length > 1)

function porContrato(lista) {
  return lista.filter((fila) => !filtroContratoId.value || fila.contrato_id === filtroContratoId.value)
}

const stockFiltrado = computed(() => {
  const base = porTexto(porContrato(almacen.stock), [(f) => f.materiales?.descripcion])
  return soloBajoOAgotado.value ? base.filter((f) => estadoFila(f) !== 'OK') : base
})

// Estados internos → pills de la referencia visual.
const ESTADO_PILL = {
  OK: { texto: 'Disponible', clase: 'ok' },
  'Bajo mínimo': { texto: 'Bajo mínimo', clase: 'amb' },
  'Sin stock': { texto: 'Agotado', clase: 'low' },
}

// Stock agrupado por tipo de material (categoría): un bloque por categoría,
// las categorías en orden alfabético, y dentro de cada una los materiales
// también alfabéticos por descripción — igual se respetan los filtros de
// arriba (almacén/contrato/búsqueda/bajo-agotado), esto solo reordena lo
// que ya pasó ese filtro.
const stockAgrupado = computed(() => {
  const grupos = new Map()
  for (const fila of stockFiltrado.value) {
    const categoria = fila.materiales?.categorias?.nombre || 'Sin categoría'
    if (!grupos.has(categoria)) grupos.set(categoria, [])
    grupos.get(categoria).push(fila)
  }
  // `inicio`: la numeración (#) sigue corrida entre categorías, no se reinicia.
  let siguiente = 1
  return [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([categoria, filas]) => {
      const grupo = {
        categoria,
        inicio: siguiente,
        filas: [...filas].sort((a, b) => (a.materiales?.descripcion ?? '').localeCompare(b.materiales?.descripcion ?? '')),
      }
      siguiente += filas.length
      return grupo
    })
})
const ingresosFiltrados = computed(() =>
  porTexto(porContrato(almacen.ingresos), [(f) => f.materiales?.descripcion])
)
const ajustesFiltrados = computed(() =>
  porTexto(porContrato(almacen.ajustes), [(f) => f.materiales?.descripcion])
)
// Salidas también se busca por frente y por supervisor (antes solo por
// material, así que escribir un frente en el buscador no filtraba nada).
const salidasFiltradas = computed(() =>
  porTexto(porContrato(almacen.salidas), [
    (f) => f.materiales?.descripcion,
    (f) => f.frentes?.codigo,
    (f) => f.frentes?.nombre,
    (f) => f.vale_detalle?.vales?.usuarios?.nombre,
  ])
)

// Consolidado por frente dentro de Salidas: se escribe el frente en el buscador
// y el botón "Consolidado" arma el resumen (entregado / devuelto / consumo real
// por material) de ese frente; de ahí sale el Excel. Es el mismo cálculo de la
// pantalla Reportes. Las fechas solo viven dentro del panel.
const reportesStore = useReportesStore()
const salidaFrenteId = ref('')
const salidaDesde = ref('')
const salidaHasta = ref('')
const reporteFrente = ref(null)
const generandoReporteFrente = ref(false)
const errorReporteFrente = ref('')
let pedidoReporte = 0
// Frentes que salen en lo que el buscador ya está mostrando. Sin texto no hay
// ninguno: el consolidado se pide sobre un frente que ya escribiste.
const frentesConSalidas = computed(() => {
  if (!busqueda.value.trim()) return []
  const porId = new Map()
  for (const s of salidasFiltradas.value) if (s.frentes?.id) porId.set(s.frentes.id, s.frentes)
  return [...porId.values()].sort((a, b) => (a.codigo ?? a.nombre).localeCompare(b.codigo ?? b.nombre))
})
const elegirFrenteAbierto = ref(false)
function pedirConsolidado() {
  if (frentesConSalidas.value.length === 1) salidaFrenteId.value = frentesConSalidas.value[0].id
  else if (frentesConSalidas.value.length > 1) elegirFrenteAbierto.value = !elegirFrenteAbierto.value
}
function elegirFrenteConsolidado(id) {
  elegirFrenteAbierto.value = false
  salidaFrenteId.value = id
}
watch(tab, () => {
  elegirFrenteAbierto.value = false
  limpiarFiltrosSalidas()
})
const nombreFrenteElegido = computed(() => {
  const f = almacen.salidas.find((x) => x.frentes?.id === salidaFrenteId.value)?.frentes
  return f ? `${f.codigo ? f.codigo + ' — ' : ''}${f.nombre}` : ''
})
const totalesReporteFrente = computed(() => {
  const filas = reporteFrente.value?.filas ?? []
  return { materiales: filas.length, hayDevuelto: filas.some((f) => f.devuelto > 0) }
})
watch([salidaFrenteId, salidaDesde, salidaHasta], async () => {
  const mio = ++pedidoReporte
  errorReporteFrente.value = ''
  if (!salidaFrenteId.value) {
    reporteFrente.value = null
    generandoReporteFrente.value = false
    return
  }
  generandoReporteFrente.value = true
  try {
    const resultado = await armarReporteSalidas(reportesStore, {
      frenteId: salidaFrenteId.value,
      desde: salidaDesde.value || null,
      hasta: salidaHasta.value || null,
    })
    if (mio === pedidoReporte) reporteFrente.value = resultado
  } catch (e) {
    console.error(e)
    if (mio === pedidoReporte) errorReporteFrente.value = 'No se pudo armar el resumen del frente.'
  } finally {
    if (mio === pedidoReporte) generandoReporteFrente.value = false
  }
})
function descargarReporteFrente() {
  descargarReporteSalidas(reporteFrente.value, { desde: salidaDesde.value, hasta: salidaHasta.value })
}
function limpiarFiltrosSalidas() {
  salidaFrenteId.value = ''
  salidaDesde.value = ''
  salidaHasta.value = ''
}
const devolucionesFiltradas = computed(() =>
  porTexto(devoluciones.devoluciones, [(f) => f.materiales?.descripcion])
)
const transferenciasFiltradas = computed(() =>
  porTexto(transferencias.transferencias, [(f) => f.materiales?.descripcion])
)
// Devoluciones recibidas donde quedó algo dado de baja (no volvió a stock) —
// control interno de Almacén, independiente de la pestaña de Devoluciones.
const bajas = computed(() => devoluciones.devoluciones.filter((d) => d.estado === 'Recibida' && d.cantidad_baja > 0))
// El número rojo de "Bajas" avisa solo de bajas NUEVAS: al entrar a la
// pestaña se anota cuántas había y deja de mostrarse; si luego aparecen más,
// vuelve a salir solo con la diferencia.
const CLAVE_BAJAS_VISTAS = 'dnv-almacen-bajas-vistas'
function leerBajasVistas() {
  try {
    return Number(localStorage.getItem(CLAVE_BAJAS_VISTAS)) || 0
  } catch {
    return 0
  }
}
const bajasVistas = ref(leerBajasVistas())
const bajasNuevas = computed(() => Math.max(0, bajas.value.length - bajasVistas.value))
function marcarBajasVistas() {
  bajasVistas.value = bajas.value.length
  try {
    localStorage.setItem(CLAVE_BAJAS_VISTAS, String(bajasVistas.value))
  } catch {
    /* sin almacenamiento: el aviso vale solo en esta sesión */
  }
}
watch(
  [tab, () => bajas.value.length],
  () => {
    if (tab.value === 'bajas') marcarBajasVistas()
  },
  { immediate: true },
)
const bajasFiltradas = computed(() => porTexto(bajas.value, [(f) => f.materiales?.descripcion]))

const valesPendientes = ref(0)
const devolucionesPendientes = computed(() => devoluciones.devoluciones.filter((d) => d.estado === 'Solicitada').length)

// ---------------------------------------------------------------------------
// Pestaña Vales: misma lista, filtros y consultas que /vales (useValesStore),
// cargada recién al abrir la pestaña.
// ---------------------------------------------------------------------------
const valesStore = useValesStore()
const puedeVerVales = computed(() => auth.tienePermiso('vales.ver_todos'))
const puedeCrearParaOtro = computed(() => auth.tienePermiso('vales.crear_para_otro'))
const mostrarModalVale = ref(false)
// "Nuevo vale" arranca como requerimiento; desde ahí también se puede
// devolver o transferir material (cada uno con su propio permiso).
const tiposDeMovimiento = computed(() => [
  ...(auth.tienePermiso('devoluciones.crear') ? [{ clave: 'devolucion', etiqueta: 'Devolver material' }] : []),
  ...(auth.tienePermiso('transferencias.crear') ? [{ clave: 'transferencia', etiqueta: 'Transferir material' }] : []),
])
// Escritorio: ventana sobre la pantalla (como Nuevo ingreso o Nuevo vale);
// celular: pantalla completa.
const modalDevolucion = ref(false)
const modalTransferencia = ref(false)
function abrirMovimiento(clave) {
  if (esMovil.value) router.push(clave === 'devolucion' ? '/vales/devolucion' : '/vales/transferencia')
  else if (clave === 'devolucion') modalDevolucion.value = true
  else modalTransferencia.value = true
}
function movimientoCreado(mensaje) {
  modalDevolucion.value = false
  modalTransferencia.value = false
  aviso.value = mensaje
}
function irAOtroMovimiento(clave) {
  mostrarModalVale.value = false
  abrirMovimiento(clave)
}
let valesCargados = false

// La lista de vales la pinta ValesAlmacenero (bandeja + detalle); acá solo se
// descarga una vez, al abrir la pestaña.
watch(tab, (t) => {
  if (t !== 'vales' || valesCargados) return
  valesCargados = true
  valesStore.cargarLista()
  if (puedeCrearParaOtro.value) valesStore.cargarSupervisores()
  valesStore.cargarStockDisponible()
}, { immediate: true }) // immediate: al llegar con ?tab=vales la pestaña ya nace abierta

const stockPorMaterialMapa = computed(() => new Map(valesStore.stockPorMaterial.map((m) => [m.id, m.disponible])))
async function crearVale(payload) {
  const esSupervisor = auth.nombreRol === 'Supervisor'
  const vale = await valesStore.crearYEnviar({
    ...payload,
    supervisor_id: esSupervisor ? auth.session.user.id : payload.supervisor_id,
    creado_por: esSupervisor ? null : auth.session.user.id,
  })
  mostrarModalVale.value = false
  router.push(`/vales/${vale.id}`)
}

// ---------------------------------------------------------------------------
// Pestaña Reservas: mismo store y consultas que /reservas (useReservasStore),
// cargada recién al abrir la pestaña. Es solo de consulta: lo que se hace con
// una reserva (entregar, no entregar) se decide en la ficha del vale, para que
// el vale siempre se entere.
// ---------------------------------------------------------------------------
const reservasStore = useReservasStore()
const reservasBusqueda = ref('')
const reservasSoloActivas = ref(true)
const reservasFrenteId = ref('')
let reservasCargadas = false

// Número rojo de la pestaña: reservas vigentes (Activa/Parcial). Se queda
// hasta que todas se entreguen o se liberen. Se cuenta aparte porque la
// lista de reservas recién se descarga al abrir la pestaña.
const reservasVigentes = ref(0)
async function actualizarReservasVigentes() {
  try {
    reservasVigentes.value = await contarReservasVigentes()
  } catch {
    /* sin el contador la pestaña se ve igual, solo sin el número */
  }
}
onMounted(actualizarReservasVigentes)

function buscarReservas() {
  reservasStore.buscar({
    estados: reservasSoloActivas.value ? ['Activa', 'Parcial'] : null,
    almacenId: null,
    frenteId: reservasFrenteId.value || null,
  })
}
watch(tab, async (t) => {
  if (t !== 'reservas' || reservasCargadas) return
  reservasCargadas = true
  await reservasStore.cargarFiltros()
  buscarReservas()
}, { immediate: true })
watch([reservasSoloActivas, reservasFrenteId], () => {
  if (reservasCargadas) buscarReservas()
})

const reservasFiltradas = computed(() => {
  const q = reservasBusqueda.value.trim().toLowerCase()
  if (!q) return reservasStore.reservas
  return reservasStore.reservas.filter(
    (r) =>
      r.materiales?.descripcion?.toLowerCase().includes(q) ||
      r.vale_detalle?.vales?.numero?.toLowerCase().includes(q) ||
      r.frentes?.nombre?.toLowerCase().includes(q) ||
      r.frentes?.codigo?.toLowerCase().includes(q)
  )
})
const diasDeAntiguedad = (fecha) => Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
const reservaProlongada = (r) =>
  ['Activa', 'Parcial'].includes(r.estado) && diasDeAntiguedad(r.created_at) >= reservasStore.diasReservaProlongada
const CLASE_PILL_RESERVA = { Activa: 'amb', Parcial: 'info', Completada: 'ok', Entregada: 'ok', Liberada: 'neu' }
const clasePillReserva = (estado) => CLASE_PILL_RESERVA[estado] ?? 'neu'
async function abrirValeDeReserva(r) {
  const valeId = r.vale_detalle?.vale_id
  if (!valeId) return
  await router.replace({ path: '/almacen', query: { ...route.query, tab: 'vales', vale: valeId } })
  tab.value = 'vales'
}

// ---------------------------------------------------------------------------
// Cabecera: botón naranja según la pestaña y menú ⋯.
// ---------------------------------------------------------------------------
const accion = computed(() => {
  const sinAlmacen = !almacen.almacenes.length
  switch (tab.value) {
    case 'salidas':
      return { texto: 'Nueva salida', visible: puedeVerVales.value, ejecutar: () => (tab.value = 'vales') }
    case 'vales':
      return { texto: 'Nuevo vale', visible: auth.tienePermiso('vales.crear'), ejecutar: () => (mostrarModalVale.value = true) }
    case 'reservas':
      return { texto: 'Nueva reserva', visible: puedeVerVales.value, ejecutar: () => (tab.value = 'vales') }
    case 'ajustes':
      return { texto: 'Nuevo ajuste', visible: puedeRegistrarAjuste.value, deshabilitado: sinAlmacen, ejecutar: abrirAjuste }
    case 'devoluciones':
      return { texto: 'Nueva devolución', visible: auth.tienePermiso('devoluciones.crear'), ejecutar: () => abrirMovimiento('devolucion') }
    case 'transferencias':
      return { texto: 'Nueva transferencia', visible: auth.tienePermiso('transferencias.crear'), ejecutar: () => abrirMovimiento('transferencia') }
    case 'bajas':
      return { texto: 'Nueva baja', visible: puedeVerDevoluciones.value, ejecutar: () => (tab.value = 'devoluciones') }
    default:
      return { texto: 'Nuevo ingreso', visible: puedeRegistrarIngreso.value, deshabilitado: sinAlmacen, ejecutar: () => (mostrarModalIngreso.value = true) }
  }
})

const menuAbierto = ref(false)
const menuMasRef = ref(null)
const hayMenuMas = computed(
  () =>
    auth.tienePermiso('kardex.ver') || tab.value === 'stock'
)
function cerrarMenuAfuera(e) {
  elegirFrenteAbierto.value = false
  if (menuAbierto.value && !menuMasRef.value?.contains(e.target)) menuAbierto.value = false
}
function cerrarMenuConEscape(e) {
  if (e.key === 'Escape') menuAbierto.value = false
}
onMounted(() => {
  document.addEventListener('click', cerrarMenuAfuera)
  document.addEventListener('keydown', cerrarMenuConEscape)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', cerrarMenuAfuera)
  document.removeEventListener('keydown', cerrarMenuConEscape)
})

onMounted(() => {
  almacen.cargar()
  if (puedeVerDevoluciones.value) devoluciones.cargar()
  if (puedeVerTransferencias.value) transferencias.cargar()
  if (auth.tienePermiso('vales.ver_todos')) contarValesPendientes().then((c) => (valesPendientes.value = c))
})

// Tarjetas de resumen — "Stock crítico" y "Reservado" salen de lo ya
// cargado (una fila de `stock` por material+almacén+contrato, nunca se
// suma cantidad física entre materiales de unidades distintas: se cuentan
// ítems, no cantidades).
const stockCriticoCount = computed(() => almacen.stock.filter((f) => bajoMinimo(f)).length)
const reservadoCount = computed(() => almacen.stock.filter((f) => Number(f.cantidad_reservada) > 0).length)

/** filas: una por cada material de la guía (una sola guía puede traer
 * varios) — todas comparten almacén/contrato/documento/proveedor, arma
 * cada una IngresoFormModal.vue. Se registran juntas con el mismo camino
 * que ya usa la importación masiva por Excel. */
async function registrarIngreso(filas) {
  aviso.value = ''
  await almacen.importarIngresosMasivo(filas.map((f) => ({ ...f, usuario_id: auth.session.user.id })))
  aviso.value = filas.length > 1 ? `${filas.length} ingresos registrados.` : 'Ingreso registrado.'
  mostrarModalIngreso.value = false
}

async function importarIngresosMasivo({ almacen_id, filas }) {
  aviso.value = ''
  const payload = filas.map((f) => ({
    almacen_id,
    contrato_id: f.contrato_id,
    material_id: f.material_id,
    cantidad: f.cantidad,
    ancho: f.ancho,
    largo: f.largo,
    documento_referencia: f.documento_referencia,
    proveedor: f.proveedor,
    observacion: f.observacion,
    usuario_id: auth.session.user.id,
  }))
  await almacen.importarIngresosMasivo(payload)
  aviso.value = `Se registraron ${payload.length} ingresos.`
}

/** materialesACrear de procesarFilasIngreso: nombres que todavía no
 * existían en el catálogo. Devuelve los materiales creados (con su id
 * real) para que el modal pueda resolver material_id en las filas
 * pendientes antes de registrar los ingresos. */
async function crearMaterialesMasivo(materialesACrear) {
  return almacen.crearMaterialesFaltantes(materialesACrear)
}

/** materialesAActualizarConversion de procesarFilasIngreso: materiales que
 * ya existían sin conversión configurada, y esta importación de ingresos
 * les trajo ANCHO/LARGO — se completa el catálogo antes de registrar los
 * ingresos, para que el trigger que calcula factor_conversion ya vea el
 * tipo correcto. */
async function actualizarConversionMasiva(actualizaciones) {
  await almacen.actualizarConversionMateriales(actualizaciones)
}

async function registrarAjuste(payload) {
  aviso.value = ''
  await almacen.registrarAjuste({ ...payload, usuario_id: auth.session.user.id })
  aviso.value = 'Ajuste registrado.'
  cerrarModalAjuste()
}

function abrirAjuste() {
  ajustePrellenado.value = null
  mostrarModalAjuste.value = true
}

function cerrarModalAjuste() {
  mostrarModalAjuste.value = false
  ajustePrellenado.value = null
}

function formatearFechaHora(iso) {
  const d = new Date(iso)
  const fecha = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  return `${fecha} ${hora}`
}

// 'YYYY-MM-DD' → 'YY-MM-DD'
const fechaCorta = (f) => (f ? f.slice(2) : '—')

const exportandoStockExcel = ref(false)

/** Mismas columnas que la plantilla del usuario (Categoría, Tipo de
 * material, Control Interno vs. Control Contrato/EDP), un renglón por
 * material sumado entre almacenes — no filtra por lo que esté buscado en
 * pantalla, exporta el catálogo completo. Ancho/Largo quedan vacíos para
 * materiales sin conversión de unidades, igual que en su plantilla
 * original. GRIFO/CRC, TURNO y OPERADOR de esa plantilla no se incluyen:
 * no son datos que el Sistema registre por material en el stock. */
async function exportarStockExcel() {
  aviso.value = ''
  exportandoStockExcel.value = true
  try {
    const filas = await listarStockParaExportar()
    descargarExcel(
      `Resumen_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          nombre: 'Resumen Stock',
          filas: filas
            .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.descripcion.localeCompare(b.descripcion))
            .map((m, i) => ({
              ITEM: i + 1,
              CATEGORIA: m.categoria,
              'TIPO DE MATERIAL': m.tipoMaterial,
              'MARCA/DESCRIPCION': m.descripcion,
              ANCHO: m.ancho ?? '',
              LARGO: m.largo ?? '',
              'CONTROL INTERNO — UNIDAD': m.unidadInterna,
              'CONTROL INTERNO — CANTIDAD': m.cantidadInterna,
              'CONTROL CONTRATO (EDP) — UNIDAD': m.unidadEdp,
              'CONTROL CONTRATO (EDP) — CANTIDAD': Math.round(m.cantidadEdp * 100) / 100,
              STOCK: m.cantidadInterna > 0 ? 'OK' : 'SIN STOCK',
            })),
        },
      ]
    )
  } catch (e) {
    console.error(e)
    aviso.value = `No se pudo exportar el stock a Excel${e?.message ? ': ' + e.message : '.'}`
  } finally {
    exportandoStockExcel.value = false
  }
}

// ---------------------------------------------------------------------------
// Celular: en vez de tablas de varias columnas, filas de 2 líneas (título,
// detalle gris, y a la derecha cantidad + estado). Mismos datos filtrados y
// mismas acciones que la tabla de escritorio.
// ---------------------------------------------------------------------------
const esMovil = useEsMovil()
const frenteTxt = (f) => (f ? `${f.codigo ? f.codigo + ' — ' : ''}${f.nombre}` : '—')
const conUnidad = (n, m) => `${formatearNumero(n)} ${m?.unidad ?? ''}`.trim()
const PILL_DEVOLUCION = { Solicitada: 'amb', Recibida: 'ok', Rechazada: 'neu' }

const listaMovil = computed(() => {
  switch (tab.value) {
    case 'stock':
      return stockFiltrado.value.map((f) => ({
        key: `${f.almacen_id}-${f.material_id}-${f.contrato_id}`,
        titulo: f.materiales?.descripcion ?? '—',
        etiqueta: variosContratos.value ? nombreContratoPorId.value.get(f.contrato_id) : '',
        detalle: `Físico ${conUnidad(f.cantidad_fisica, f.materiales)} · Reservado ${formatearNumero(f.cantidad_reservada)}`,
        derecha: conUnidad(f.cantidad_disponible, f.materiales),
        pill: ESTADO_PILL[estadoFila(f)],
      }))
    case 'ingresos':
      return ingresosFiltrados.value.map((i) => ({
        key: i.id,
        titulo: i.materiales?.descripcion ?? '—',
        detalle: `${fechaCorta(i.fecha)} · ${i.documento_referencia ?? 'Sin documento'} · ${i.usuarios?.nombre ?? '—'}`,
        derecha: conUnidad(i.cantidad, i.materiales),
        acciones: puedeRegistrarAjuste.value ? [{ texto: 'Corregir', ejecutar: () => (ingresoEnEdicion.value = i) }] : [],
      }))
    case 'salidas':
      return salidasFiltradas.value.map((x) => ({
        key: x.id,
        titulo: x.materiales?.descripcion ?? '—',
        detalle: `${x.vale_detalle?.vales?.numero ?? '—'} · ${frenteTxt(x.frentes)} · ${x.vale_detalle?.vales?.usuarios?.nombre ?? '—'} · ${fechaCorta(x.fecha)}`,
        derecha: conUnidad(x.cantidad, x.materiales),
      }))
    case 'reservas':
      return reservasFiltradas.value.map((r) => ({
        key: r.id,
        titulo: r.materiales?.descripcion ?? '—',
        detalle: `Vale ${r.vale_detalle?.vales?.numero ?? '—'} · ${frenteTxt(r.frentes)} · ${diasDeAntiguedad(r.created_at)} días`,
        derecha: conUnidad(r.cantidad - r.cantidad_entregada, r.materiales),
        pill: { texto: r.estado, clase: clasePillReserva(r.estado) },
        acciones: r.vale_detalle?.vale_id ? [{ texto: 'Abrir vale', ejecutar: () => abrirValeDeReserva(r) }] : [],
      }))
    case 'ajustes':
      return ajustesFiltrados.value.map((a) => ({
        key: a.id,
        titulo: a.materiales?.descripcion ?? '—',
        detalle: `${fechaCorta(a.fecha)} · ${a.motivo} · ${a.usuarios?.nombre ?? '—'}`,
        derecha: `${a.tipo === 'positivo' ? '+' : '−'}${conUnidad(a.cantidad, a.materiales)}`,
        pill: { texto: a.tipo, clase: a.tipo === 'positivo' ? 'ok' : 'amb' },
        acciones: puedeRegistrarAjuste.value ? [{ texto: 'Corregir', ejecutar: () => abrirCorregirAjuste(a) }] : [],
      }))
    case 'devoluciones':
      return devolucionesFiltradas.value.map((d) => ({
        key: d.id,
        titulo: d.materiales?.descripcion ?? '—',
        detalle: `${d.numero ?? '—'} · ${frenteTxt(d.frentes)} · ${d.supervisor?.nombre ?? '—'}`,
        derecha: conUnidad(d.cantidad, d.materiales),
        pill: { texto: d.estado, clase: PILL_DEVOLUCION[d.estado] ?? 'neu' },
        acciones: !puedeRecibirDevoluciones.value
          ? []
          : d.estado === 'Solicitada'
            ? [
                { texto: 'Recibir', ejecutar: () => (devolucionARecibir.value = d) },
                { texto: 'Rechazar', peligro: true, ejecutar: () => rechazarDevolucion(d) },
              ]
            : d.estado === 'Recibida'
              ? [{ texto: 'Rechazar', peligro: true, ejecutar: () => { errorAnular.value = ''; recepcionAAnular.value = d } }]
              : [],
      }))
    case 'transferencias':
      return transferenciasFiltradas.value.map((t) => ({
        key: t.id,
        titulo: t.materiales?.descripcion ?? '—',
        detalle: `${fechaCorta(t.fecha)} · ${frenteTxt(t.frente_origen)} → ${frenteTxt(t.frente_destino)} · ${t.supervisor?.nombre ?? '—'}`,
        derecha: conUnidad(t.cantidad, t.materiales),
        pill: { texto: t.estado, clase: t.estado.toLowerCase().startsWith('confirm') ? 'ok' : 'amb' },
      }))
    case 'bajas':
      return bajasFiltradas.value.map((b) => ({
        key: b.id,
        titulo: b.materiales?.descripcion ?? '—',
        detalle: `${b.numero ?? '—'} · ${fechaCorta(b.fecha)} · ${frenteTxt(b.frentes)}`,
        derecha: conUnidad(b.cantidad_baja, b.materiales),
        acciones: puedeRecibirDevoluciones.value ? [{ texto: 'Revertir', ejecutar: () => (bajaAReevaluar.value = b) }] : [],
      }))
    default:
      return []
  }
})
const textoAccion = computed(() => {
  const t = accion.value.texto
  if (!esMovil.value) return t
  if (tab.value === 'vales') return 'Nuevo'
  const sinNuevo = t.replace(/^Nuev[oa]\s+/i, '')
  return sinNuevo.charAt(0).toUpperCase() + sinNuevo.slice(1)
})

function abrirCorregirAjuste(a) {
  ajustePrellenado.value = {
    almacen_id: a.almacen_id,
    contrato_id: a.contrato_id,
    material_id: a.material_id,
    tipo: a.tipo === 'positivo' ? 'negativo' : 'positivo',
    cantidad: a.cantidad,
    motivo: `Corrección del ajuste ${a.tipo} del ${a.fecha}.`,
    nota: `Corrigiendo ajuste ${a.tipo} de ${a.cantidad} ${a.materiales?.unidad ?? ''} de "${a.materiales?.descripcion ?? ''}" en ${a.almacenes?.nombre ?? ''}. Ajusta el tipo/cantidad si la corrección es distinta.`,
  }
  mostrarModalAjuste.value = true
}
</script>

<template>
  <div class="almacen">
    <!-- Mensajes globales -->
    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="almacen.sinConexionDesde" class="sin-conexion">
      Sin conexión — mostrando el stock de la última vez que hubo internet, {{ formatearFechaHora(almacen.sinConexionDesde) }}.
      <button type="button" class="reintentar" @click="almacen.cargar">Reintentar</button>
    </p>
    <p v-if="almacen.error" class="error">
      {{ almacen.error }}
      <button type="button" class="reintentar" @click="almacen.cargar">Reintentar</button>
    </p>
    <p v-if="!almacen.almacenes.length && !almacen.cargando" class="aviso-vacio">
      No hay ningún almacén configurado — contacta al Developer para crearlo.
    </p>

    <!-- Cabecera: título + Ctrl K + menú ⋯ + botón principal según la pestaña -->
    <div class="top">
      <h1>Almacén</h1>
      <div class="acts">
        <div v-if="hayMenuMas" ref="menuMasRef" class="menu-mas">
          <button type="button" class="ghost ghost-icono" aria-label="Más acciones" aria-haspopup="menu"
            :aria-expanded="menuAbierto" @click.stop="menuAbierto = !menuAbierto">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
          <div v-if="menuAbierto" class="menu-lista" role="menu">
            <router-link v-if="auth.tienePermiso('kardex.ver')" to="/kardex" class="menu-item" role="menuitem">Kardex</router-link>
            <button v-if="tab === 'stock'" type="button" class="menu-item" role="menuitem"
              :disabled="exportandoStockExcel" @click="menuAbierto = false; exportarStockExcel()">
              {{ exportandoStockExcel ? 'Exportando…' : 'Exportar stock (Excel)' }}
            </button>
          </div>
        </div>
        <button v-if="accion.visible" type="button" class="cta" :disabled="accion.deshabilitado"
          :title="accion.deshabilitado ? 'Crea un almacén primero' : ''" @click="accion.ejecutar()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>{{ textoAccion }}</span>
        </button>
      </div>
    </div>

    <!-- Pestañas -->
    <div class="tabs" role="tablist" aria-label="Secciones de Almacén">
      <button type="button" role="tab" class="tab" :class="{ on: tab === 'stock' }" :aria-selected="tab === 'stock'" @click="tab = 'stock'">Stock</button>
      <button type="button" role="tab" class="tab" :class="{ on: tab === 'ingresos' }" :aria-selected="tab === 'ingresos'" @click="tab = 'ingresos'">Ingresos</button>
      <button v-if="puedeVerSalidas" type="button" role="tab" class="tab" :class="{ on: tab === 'salidas' }" :aria-selected="tab === 'salidas'" @click="tab = 'salidas'">Salidas</button>
      <button v-if="puedeVerVales" type="button" role="tab" class="tab" :class="{ on: tab === 'vales' }" :aria-selected="tab === 'vales'" @click="tab = 'vales'">Vales</button>
      <button type="button" role="tab" class="tab" :class="{ on: tab === 'reservas' }" :aria-selected="tab === 'reservas'" @click="tab = 'reservas'">Reservas<span v-if="reservasVigentes" class="nb">{{ reservasVigentes }}</span></button>
      <button type="button" role="tab" class="tab" :class="{ on: tab === 'ajustes' }" :aria-selected="tab === 'ajustes'" @click="tab = 'ajustes'">Ajustes</button>
      <button v-if="puedeVerDevoluciones" type="button" role="tab" class="tab" :class="{ on: tab === 'devoluciones' }" :aria-selected="tab === 'devoluciones'" @click="tab = 'devoluciones'">
        Devoluciones<span v-if="devolucionesPendientes" class="nb">{{ devolucionesPendientes }}</span>
      </button>
      <button v-if="puedeVerTransferencias" type="button" role="tab" class="tab" :class="{ on: tab === 'transferencias' }" :aria-selected="tab === 'transferencias'" @click="tab = 'transferencias'">Transferencias</button>
      <button v-if="puedeVerDevoluciones" type="button" role="tab" class="tab" :class="{ on: tab === 'bajas' }" :aria-selected="tab === 'bajas'" @click="tab = 'bajas'">
        Bajas<span v-if="bajasNuevas" class="nb">{{ bajasNuevas }}</span>
      </button>
    </div>

    <p v-if="almacen.cargando && tab !== 'vales'">Cargando…</p>

    <section v-else class="col" role="tabpanel">
      <!-- Franja KPI: una sola tarjeta con 4 celdas -->
      <div v-if="tab === 'stock'" class="kpis">
        <div class="kpi"><div class="l">Ítems en catálogo</div><div class="v">{{ almacen.materialesActivos.length }}</div></div>
        <div class="kpi"><div class="l">Vales por responder</div><div class="v">{{ valesPendientes }}</div></div>
        <button type="button" class="kpi" :class="{ on: soloBajoOAgotado }" :aria-pressed="soloBajoOAgotado" @click="soloBajoOAgotado = !soloBajoOAgotado">
          <div class="l">Stock crítico</div><div class="v v-critico">{{ stockCriticoCount }}</div>
        </button>
        <div class="kpi"><div class="l">Reservado</div><div class="v">{{ reservadoCount }}</div></div>
      </div>

      <!-- Barra de filtros -->
      <template v-if="tab === 'vales'"></template>
      <div v-else-if="tab === 'reservas'" class="filters">
        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input v-model="reservasBusqueda" type="search" aria-label="Buscar reserva" placeholder="Buscar por material, vale o frente…" />
        </label>
        <select v-model="reservasFrenteId" class="sel" aria-label="Filtrar por frente">
          <option value="">Todos los frentes</option>
          <option v-for="f in reservasStore.frentes" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
        </select>
        <button type="button" class="seg" :class="{ on: reservasSoloActivas }" :aria-pressed="reservasSoloActivas"
          @click="reservasSoloActivas = !reservasSoloActivas">Solo activas / parciales</button>
      </div>
      <div v-else class="filters">
        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input v-model="busqueda" type="search" :aria-label="placeholderBusqueda" :placeholder="placeholderBusqueda" />
        </label>
        <select v-if="PESTAÑAS_CON_CONTRATO.includes(tab)" v-model="filtroContratoId" class="sel" aria-label="Filtrar por contrato">
          <option value="">Todos los contratos</option>
          <option v-for="c in almacen.contratos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
        <button v-if="tab === 'stock'" type="button" class="seg" :class="{ on: soloBajoOAgotado }" :aria-pressed="soloBajoOAgotado"
          @click="soloBajoOAgotado = !soloBajoOAgotado">Solo bajo / agotado</button>
        <div v-if="tab === 'salidas'" class="consol-wrap">
          <button type="button" class="seg consol" :class="{ on: !!salidaFrenteId }" :disabled="!frentesConSalidas.length"
            :title="frentesConSalidas.length ? 'Resumen y Excel del frente que escribiste' : 'Escribe un frente en el buscador para sacar su consolidado'"
            @click.stop="pedirConsolidado">
            Consolidado<span v-if="frentesConSalidas.length > 1" class="nb">{{ frentesConSalidas.length }}</span>
          </button>
          <div v-if="elegirFrenteAbierto" class="menu-lista consol-menu" role="menu">
            <button v-for="f in frentesConSalidas" :key="f.id" type="button" class="menu-item" role="menuitem"
              @click="elegirFrenteConsolidado(f.id)">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</button>
          </div>
        </div>
      </div>

      <!-- Salidas: consolidado del frente + Excel (antes en Reportes) -->
      <div v-if="tab === 'salidas' && salidaFrenteId" class="rf">
        <div class="rf-cab">
          <div class="rf-tit">
            <b>{{ nombreFrenteElegido }}</b>
            <span>
              {{ salidaDesde || salidaHasta ? `${salidaDesde ? fechaCorta(salidaDesde) : 'inicio'} → ${salidaHasta ? fechaCorta(salidaHasta) : 'hoy'}` : 'Todo el historial' }}
              <template v-if="reporteFrente"> · {{ totalesReporteFrente.materiales }} materiales</template>
            </span>
          </div>
          <div class="rf-acts">
            <input v-model="salidaDesde" type="date" class="rf-fecha" title="Desde" aria-label="Desde" />
            <input v-model="salidaHasta" type="date" class="rf-fecha" title="Hasta" aria-label="Hasta" />
            <button v-if="auth.tienePermiso('reportes.exportar')" type="button" class="rf-xls"
              :disabled="!reporteFrente?.filas.length || generandoReporteFrente" @click="descargarReporteFrente">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
              Descargar Excel
            </button>
            <button type="button" class="rf-x" aria-label="Cerrar consolidado" title="Cerrar consolidado" @click="limpiarFiltrosSalidas">×</button>
          </div>
        </div>
        <p v-if="generandoReporteFrente" class="rf-msg">Armando resumen…</p>
        <p v-else-if="errorReporteFrente" class="rf-msg rf-err">{{ errorReporteFrente }}</p>
        <p v-else-if="reporteFrente && !reporteFrente.filas.length" class="rf-msg">Este frente no tiene salidas en ese rango.</p>
        <div v-else-if="reporteFrente" class="rf-tabla">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th class="num">Entregado</th>
                <th v-if="totalesReporteFrente.hayDevuelto" class="num">Devuelto</th>
                <th class="num">Consumo real</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in reporteFrente.filas" :key="i">
                <td>{{ f.descripcion }}</td>
                <td class="num">{{ formatearNumero(f.entregado) }} <span class="unit">{{ f.unidad }}</span></td>
                <td v-if="totalesReporteFrente.hayDevuelto" class="num">{{ f.devuelto ? formatearNumero(f.devuelto) : '—' }}</td>
                <td class="num"><b>{{ formatearNumero(f.neto) }}</b> <span class="unit">{{ f.unidad }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <router-link v-if="auth.tienePermiso('reportes.exportar')" to="/reportes" class="rf-mas">Más reportes (Procura vs. consumo, EDP) ›</router-link>
      </div>

      <!-- Vales del almacenero: bandeja + detalle -->
      <ValesAlmacenero v-if="tab === 'vales'" />

      <!-- Celular: filas de 2 líneas en lugar de la tabla -->
      <div v-if="tab !== 'vales' && esMovil" class="lm">
        <p v-if="tab === 'reservas' && reservasStore.cargando" class="lm-vacio">Cargando reservas…</p>
        <template v-else>
          <div v-for="r in listaMovil" :key="r.key" class="lm-r">
            <div class="lm-t">
              <b>{{ r.titulo }}<span v-if="r.etiqueta" class="chip-contrato">{{ r.etiqueta }}</span></b>
              <small>{{ r.detalle }}</small>
              <div v-if="r.acciones?.length" class="lm-acc">
                <button v-for="a in r.acciones" :key="a.texto" type="button" class="mini" :class="{ peligro: a.peligro }" @click="a.ejecutar()">{{ a.texto }}</button>
              </div>
            </div>
            <div class="lm-d">
              <b>{{ r.derecha }}</b>
              <span v-if="r.pill" class="sp" :class="r.pill.clase">{{ r.pill.texto }}</span>
            </div>
          </div>
          <p v-if="!listaMovil.length" class="lm-vacio">No hay nada para mostrar con estos filtros.</p>
        </template>
      </div>

      <!-- Tabla: una tarjeta blanca -->
      <div v-if="tab !== 'vales' && !esMovil" class="table"><div class="in">

      <table v-if="tab === 'stock'" class="tabla tabla-stock">
        <colgroup>
          <col style="width: 64px" /><col /><col style="width: 100px" /><col style="width: 100px" /><col style="width: 110px" /><col style="width: 126px" />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>DESCRIPCIÓN</th>
            <th class="r">FÍSICA</th>
            <th class="r">RESERVADA</th>
            <th class="r">DISPONIBLE</th>
            <th class="c">ESTADO</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="grupo in stockAgrupado" :key="grupo.categoria">
            <tr class="grp">
              <td colspan="6">{{ grupo.categoria }} · {{ grupo.filas.length }}</td>
            </tr>
            <tr
              v-for="(fila, idx) in grupo.filas"
              :key="`${fila.almacen_id}-${fila.material_id}-${fila.contrato_id}`"
              class="fila"
              :class="{ low: estadoFila(fila) === 'Sin stock' }"
            >
              <td class="idx">{{ grupo.inicio + idx }}</td>
              <td class="desc">
                {{ fila.materiales?.descripcion ?? '—' }}
                <span v-if="variosContratos && nombreContratoPorId.get(fila.contrato_id)" class="chip-contrato">{{ nombreContratoPorId.get(fila.contrato_id) }}</span>
              </td>
              <td class="r fuerte">{{ formatearNumero(fila.cantidad_fisica) }} <span class="u">{{ fila.materiales?.unidad }}</span></td>
              <td class="r apagado">{{ formatearNumero(fila.cantidad_reservada) }}</td>
              <td class="r fuerte">{{ formatearNumero(fila.cantidad_disponible) }} <span class="u">{{ fila.materiales?.unidad }}</span></td>
              <td class="c"><span class="sp" :class="ESTADO_PILL[estadoFila(fila)].clase">{{ ESTADO_PILL[estadoFila(fila)].texto }}</span></td>
            </tr>
          </template>
          <tr v-if="!stockFiltrado.length">
            <td colspan="6" class="vacio">
              {{ almacen.stock.length ? 'Ningún material coincide con la búsqueda.' : 'Sin movimientos de stock todavía.' }}
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else-if="tab === 'ingresos'" class="tabla tabla-secundaria">
        <thead>
          <tr>
            <th class="num">#</th>
            <th class="col-fecha">Fecha</th>
            <th>Descripción</th>
            <th class="num">Cantidad</th>
            <th class="num">Dim. (m)</th>
            <th class="num">Restante</th>
            <th>Documento</th>
            <th>Registró</th>
            <th v-if="puedeRegistrarAjuste"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(i, idx) in ingresosFiltrados" :key="i.id">
            <td class="num td-idx">{{ idx + 1 }}</td>
            <td class="col-fecha" data-label="Fecha">{{ fechaCorta(i.fecha) }}</td>
            <td class="td-nombre">
              <div class="desc">{{ i.materiales?.descripcion ?? '—' }}</div>
            </td>
            <td class="num" data-label="Cantidad">
              {{ formatearNumero(i.cantidad) }} <span class="unit">{{ i.materiales?.unidad }}</span>
            </td>
            <td class="num" data-label="Dimensiones">
              <template v-if="i.ancho != null && i.largo != null">{{ formatearNumero(i.ancho) }} × {{ formatearNumero(i.largo) }}</template>
              <template v-else-if="i.largo != null">L {{ formatearNumero(i.largo) }}</template>
              <template v-else>—</template>
            </td>
            <td class="num" data-label="Restante">{{ i.cantidad_restante != null ? formatearNumero(i.cantidad_restante) : '—' }}</td>
            <td data-label="Documento"><div class="doc-ref" :title="i.documento_referencia ?? ''">{{ i.documento_referencia ?? '—' }}</div></td>
            <td data-label="Registró">{{ i.usuarios?.nombre ?? '—' }}</td>
            <td v-if="puedeRegistrarAjuste" class="td-acciones">
              <button type="button" class="mini" title="Corregir guía, proveedor, observación o cantidad" @click="ingresoEnEdicion = i">Corregir</button>
            </td>
          </tr>
          <tr v-if="!ingresosFiltrados.length">
            <td colspan="9" class="vacio">
              {{ almacen.ingresos.length ? 'Ningún ingreso coincide con la búsqueda.' : 'No hay ingresos registrados.' }}
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'ajustes'" class="tabla tabla-secundaria">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th class="num">Cantidad</th>
            <th>Motivo</th>
            <th>Registrado por</th>
            <th v-if="puedeRegistrarAjuste"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(a, idx) in ajustesFiltrados" :key="a.id">
            <td class="num td-idx">{{ idx + 1 }}</td>
            <td class="col-fecha" data-label="Fecha">{{ fechaCorta(a.fecha) }}</td>
            <td class="td-nombre">
              <div class="desc">{{ a.materiales?.descripcion ?? '—' }}</div>
            </td>
            <td data-label="Tipo">
              <span class="badge" :class="a.tipo">{{ a.tipo }}</span>
            </td>
            <td class="num" data-label="Cantidad">
              {{ formatearNumero(a.cantidad) }} <span class="unit">{{ a.materiales?.unidad }}</span>
            </td>
            <td data-label="Motivo"><div class="doc-ref motivo-ref" :title="a.motivo">{{ a.motivo }}</div></td>
            <td data-label="Registrado por">{{ a.usuarios?.nombre ?? '—' }}</td>
            <td v-if="puedeRegistrarAjuste" class="td-acciones">
              <BotonIcono variante="corregir" titulo="Corregir con otro ajuste" @click="abrirCorregirAjuste(a)" />
            </td>
          </tr>
          <tr v-if="!ajustesFiltrados.length">
            <td colspan="8" class="vacio">
              {{ almacen.ajustes.length ? 'Ningún ajuste coincide con la búsqueda.' : 'No hay ajustes registrados.' }}
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'salidas'" class="tabla tabla-secundaria">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Frente</th>
            <th>Supervisor</th>
            <th class="num">Cantidad</th>
            <th>Vale</th>
            <th>Registrado por</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, idx) in salidasFiltradas" :key="s.id">
            <td class="num td-idx">{{ idx + 1 }}</td>
            <td class="col-fecha" data-label="Fecha">{{ fechaCorta(s.fecha) }}</td>
            <td class="td-nombre">
              <div class="desc">{{ s.materiales?.descripcion ?? '—' }}</div>
            </td>
            <td data-label="Frente">{{ s.frentes?.codigo ? s.frentes.codigo + ' — ' : '' }}{{ s.frentes?.nombre }}</td>
            <td data-label="Supervisor">{{ s.vale_detalle?.vales?.usuarios?.nombre ?? '—' }}</td>
            <td class="num" data-label="Cantidad">
              {{ formatearNumero(s.cantidad) }} <span class="unit">{{ s.materiales?.unidad }}</span>
            </td>
            <td data-label="Vale">
              {{ s.vale_detalle?.vales?.numero ?? '—' }}
              <span v-if="s.documento_referencia && s.documento_referencia !== s.vale_detalle?.vales?.numero" class="doc-ref"> · {{ s.documento_referencia }}</span>
            </td>
            <td data-label="Registrado por">{{ s.usuarios?.nombre ?? '—' }}</td>
          </tr>
          <tr v-if="!salidasFiltradas.length">
            <td colspan="8" class="vacio">
              {{ almacen.salidas.length ? 'Ninguna salida coincide con la búsqueda.' : 'No hay salidas registradas.' }}
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'devoluciones'" class="tabla tabla-secundaria tabla-devoluciones">
        <colgroup>
          <col style="width: 48px" /><col style="width: 100px" /><col />
          <col /><col style="width: 90px" /><col style="width: 90px" /><col style="width: 150px" />
          <col /><col style="width: 110px" /><col style="width: 190px" />
        </colgroup>
        <thead>
          <tr>
            <th class="num">#</th>
            <th>N° Vale</th>
            <th>Frente</th>
            <th>Descripción</th>
            <th class="num">Cantidad</th>
            <th>Estado</th>
            <th>Evaluación Almacén</th>
            <th>Supervisor</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, idx) in devolucionesFiltradas" :key="d.id">
            <td class="num td-idx">{{ idx + 1 }}</td>
            <td data-label="N° Vale">
              <div class="vale-num">{{ d.numero ?? '—' }}</div>
              <div class="vale-fecha">{{ fechaCorta(d.fecha) }}</div>
            </td>
            <td data-label="Frente"><div class="frente-corto" :title="(d.frentes?.codigo ? d.frentes.codigo + ' — ' : '') + (d.frentes?.nombre ?? '')">{{ d.frentes?.codigo ? d.frentes.codigo + ' — ' : '' }}{{ d.frentes?.nombre }}</div></td>
            <td class="td-nombre">
              <div class="desc">{{ d.materiales?.descripcion ?? '—' }}</div>
            </td>
            <td class="num" data-label="Cantidad">{{ formatearNumero(d.cantidad) }} {{ d.materiales?.unidad }}</td>
            <td data-label="Estado">
              <span class="badge" :class="d.estado_material">{{ d.estado_material === 'bueno' ? 'Bueno' : 'Dañado' }}</span>
            </td>
            <td data-label="Evaluación Almacén">
              <span v-if="d.cantidad_reutilizable !== null" class="evaluacion">
                <span class="ok">{{ formatearNumero(d.cantidad_reutilizable) }} vuelven</span>
                <span v-if="d.cantidad_baja > 0" class="baja">{{ formatearNumero(d.cantidad_baja) }} de baja</span>
              </span>
              <span v-else>—</span>
            </td>
            <td data-label="Supervisor">{{ d.supervisor?.nombre ?? '—' }}</td>
            <td data-label="Estado">
              <span
                class="badge badge-tip"
                :class="d.estado.toLowerCase()"
                tabindex="0"
                @mouseenter="mostrarTipEstado($event, d)"
                @mouseleave="ocultarTipEstado"
                @focus="mostrarTipEstado($event, d)"
                @blur="ocultarTipEstado"
                @click.stop="mostrarTipEstado($event, d)"
              >{{ d.estado }}</span>
            </td>
            <td v-if="puedeRecibirDevoluciones" class="td-acciones">
              <div v-if="d.estado === 'Solicitada'" class="acciones-fila">
                <button type="button" class="mini" @click="devolucionARecibir = d">Recibir</button>
                <button type="button" class="mini peligro" @click="rechazarDevolucion(d)">Rechazar</button>
              </div>
              <div v-else-if="d.estado === 'Recibida'" class="acciones-fila">
                <button type="button" class="mini peligro" title="Se recibió por error: quitarla del stock y rechazarla" @click="errorAnular = ''; recepcionAAnular = d">Rechazar</button>
              </div>
            </td>
          </tr>
          <tr v-if="!devolucionesFiltradas.length">
            <td colspan="10" class="vacio">
              {{ devoluciones.devoluciones.length ? 'Ninguna devolución coincide con la búsqueda.' : 'No hay devoluciones registradas.' }}
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'transferencias'" class="tabla tabla-secundaria">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Fecha</th>
            <th>Descripción</th>
            <th class="num">Cantidad</th>
            <th>De</th>
            <th>A</th>
            <th>Supervisor</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(t, idx) in transferenciasFiltradas" :key="t.id">
            <td class="num td-idx">{{ idx + 1 }}</td>
            <td class="col-fecha" data-label="Fecha">{{ fechaCorta(t.fecha) }}</td>
            <td class="td-nombre">
              <div class="desc">{{ t.materiales?.descripcion ?? '—' }}</div>
            </td>
            <td class="num" data-label="Cantidad">{{ formatearNumero(t.cantidad) }} {{ t.materiales?.unidad }}</td>
            <td data-label="De">{{ t.frente_origen?.codigo ? t.frente_origen.codigo + ' — ' : '' }}{{ t.frente_origen?.nombre }}</td>
            <td data-label="A">{{ t.frente_destino?.codigo ? t.frente_destino.codigo + ' — ' : '' }}{{ t.frente_destino?.nombre }}</td>
            <td data-label="Supervisor">{{ t.supervisor?.nombre ?? '—' }}</td>
            <td data-label="Estado">
              <span class="badge" :class="t.estado.toLowerCase()">{{ t.estado }}</span>
            </td>
          </tr>
          <tr v-if="!transferenciasFiltradas.length">
            <td colspan="8" class="vacio">
              {{ transferencias.transferencias.length ? 'Ninguna transferencia coincide con la búsqueda.' : 'No hay transferencias registradas.' }}
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'reservas'" class="tabla tabla-secundaria">
        <thead>
          <tr>
            <th>VALE</th>
            <th>FRENTE</th>
            <th>MATERIAL</th>
            <th class="r">RESERVADO</th>
            <th class="r">ENTREGADO</th>
            <th class="r">PENDIENTE</th>
            <th class="r">ANTIGÜEDAD</th>
            <th>ESTADO</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="reservasStore.cargando">
            <td colspan="9" class="vacio">Cargando reservas…</td>
          </tr>
          <template v-else>
            <tr v-for="r in reservasFiltradas" :key="r.id" :class="{ prolongada: reservaProlongada(r) }">
              <td class="fuerte" data-label="Vale">{{ r.vale_detalle?.vales?.numero ?? '—' }}</td>
              <td class="fuerte" data-label="Frente"><div class="frente-corto" :title="(r.frentes?.codigo ? r.frentes.codigo + ' — ' : '') + (r.frentes?.nombre ?? '')">{{ r.frentes?.codigo ? r.frentes.codigo + ' — ' : '' }}{{ r.frentes?.nombre }}</div></td>
              <td class="td-nombre"><div class="desc">{{ r.materiales?.descripcion }}</div></td>
              <td class="r fuerte" data-label="Reservado">{{ formatearNumero(r.cantidad) }} <span class="u">{{ r.materiales?.unidad }}</span></td>
              <td class="r apagado" data-label="Entregado">{{ formatearNumero(r.cantidad_entregada) }}</td>
              <td class="r fuerte" data-label="Pendiente">{{ formatearNumero(r.cantidad - r.cantidad_entregada) }} <span class="u">{{ r.materiales?.unidad }}</span></td>
              <td class="r antig" data-label="Antigüedad">{{ diasDeAntiguedad(r.created_at) }} días</td>
              <td data-label="Estado"><span class="sp" :class="clasePillReserva(r.estado)">{{ r.estado }}</span></td>
              <td class="td-acciones">
                <button v-if="r.vale_detalle?.vale_id" type="button" class="mini" @click="abrirValeDeReserva(r)">Abrir vale</button>
              </td>
            </tr>
            <tr v-if="!reservasFiltradas.length">
              <td colspan="9" class="vacio">
                {{ reservasStore.error || 'No hay reservas para mostrar.' }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <table v-else class="tabla tabla-secundaria">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>N° Devolución</th>
            <th>Fecha</th>
            <th>Frente</th>
            <th>Descripción</th>
            <th class="num">Dado de baja</th>
            <th>Recibido por</th>
            <th v-if="puedeRecibirDevoluciones"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(b, idx) in bajasFiltradas" :key="b.id">
            <td class="num td-idx">{{ idx + 1 }}</td>
            <td data-label="N° Devolución">{{ b.numero ?? '—' }}</td>
            <td class="col-fecha" data-label="Fecha">{{ fechaCorta(b.fecha) }}</td>
            <td data-label="Frente">{{ b.frentes?.codigo ? b.frentes.codigo + ' — ' : '' }}{{ b.frentes?.nombre }}</td>
            <td class="td-nombre">
              <div class="desc">{{ b.materiales?.descripcion ?? '—' }}</div>
            </td>
            <td class="num" data-label="Dado de baja">
              <span class="baja">{{ formatearNumero(b.cantidad_baja) }} {{ b.materiales?.unidad }}</span>
            </td>
            <td data-label="Recibido por">{{ b.receptor?.nombre ?? '—' }}</td>
            <td v-if="puedeRecibirDevoluciones" class="td-acciones">
              <button type="button" class="mini" @click="bajaAReevaluar = b">Revertir</button>
            </td>
          </tr>
          <tr v-if="!bajasFiltradas.length">
            <td colspan="8" class="vacio">
              {{ bajas.length ? 'Ninguna baja coincide con la búsqueda.' : 'No hay material dado de baja.' }}
            </td>
          </tr>
        </tbody>
      </table>
      </div></div>
    </section>

    <IngresoFormModal
      v-if="mostrarModalIngreso"
      :almacenes="almacen.almacenes"
      :materiales="almacen.materialesActivos"
      :contratos="almacen.contratos"
      @guardar="registrarIngreso"
      @crear-material="crearMaterialesMasivo"
      @cerrar="mostrarModalIngreso = false"
      @ingreso-masivo="irAIngresoMasivo"
    />

    <CorregirIngresoModal
      v-if="ingresoEnEdicion"
      :ingreso="ingresoEnEdicion"
      :hermanos="hermanosDelIngreso"
      :stock="almacen.stock"
      :materiales="almacen.materialesActivos"
      @guardar-datos="guardarDatosIngreso"
      @ajustar="ajustarDesdeIngreso"
      @listo="correccionIngresoLista"
      @cerrar="ingresoEnEdicion = null"
    />

    <AjusteFormModal
      v-if="mostrarModalAjuste"
      :almacenes="almacen.almacenes"
      :materiales="almacen.materialesActivos"
      :contratos="almacen.contratos"
      :stock="almacen.stock"
      :prellenado="ajustePrellenado"
      @guardar="registrarAjuste"
      @cerrar="cerrarModalAjuste"
    />

    <DevolucionNuevaView v-if="modalDevolucion" como-modal @cerrar="modalDevolucion = false" @creado="movimientoCreado" />
    <TransferenciaNuevaView v-if="modalTransferencia" como-modal @cerrar="modalTransferencia = false" @creado="movimientoCreado" />

    <ValeFormModal
      v-if="mostrarModalVale"
      :frentes-activos="valesStore.frentesActivos"
      :materiales-activos="valesStore.materialesActivos"
      :stock-por-material="stockPorMaterialMapa"
      :supervisores-activos="puedeCrearParaOtro ? valesStore.supervisoresActivos : null"
      :tipos="tiposDeMovimiento"
      @cambiar-tipo="irAOtroMovimiento"
      @guardar="crearVale"
      @cerrar="mostrarModalVale = false"
    />

    <ImportarIngresosModal
      v-if="mostrarModalImportar"
      :almacenes="almacen.almacenes"
      :contratos="almacen.contratos"
      :materiales="almacen.materialesActivos"
      @importar="importarIngresosMasivo"
      @crear-materiales="crearMaterialesMasivo"
      @actualizar-conversion="actualizarConversionMasiva"
      @cerrar="mostrarModalImportar = false"
    />

    <RecibirDevolucionModal
      v-if="devolucionARecibir"
      :devolucion="devolucionARecibir"
      :almacenes="almacen.almacenes"
      @recibir="recibirDevolucion"
      @cerrar="devolucionARecibir = null"
    />

    <AnularRecepcionModal
      v-if="recepcionAAnular"
      :devolucion="recepcionAAnular"
      :guardando="anulandoRecepcion"
      :error="errorAnular"
      @confirmar="anularRecepcion"
      @cerrar="recepcionAAnular = null"
    />
    <ReevaluarBajaModal
      v-if="bajaAReevaluar"
      :devolucion="bajaAReevaluar"
      @confirmar="reevaluarBaja"
      @cerrar="bajaAReevaluar = null"
    />
    <div
      v-if="tipEstado"
      class="tip-estado"
      :class="{ abajo: !tipEstado.arriba }"
      :style="{ left: tipEstado.left, top: tipEstado.top }"
      role="tooltip"
    >
      <div v-for="(l, i) in tipEstado.lineas" :key="i" :class="i === 0 ? 'tip-tit' : 'tip-lin'">{{ l }}</div>
    </div>
  </div>
</template>

<style scoped>
/* Medidas y colores de almacen-referencia.html. Oscuro (por defecto) usa los
   tokens de la app; claro usa los hex exactos de la referencia. */
.almacen {
  --a-bg: var(--color-bg);
  --a-card: var(--color-surface);
  --a-line: var(--color-border);
  --a-line-ctl: var(--color-border);
  --a-text: var(--color-text);
  --a-muted: var(--color-text-muted);
  --a-faint: var(--color-text-muted);
  --a-chip: var(--color-surface-2);
  --a-hover: var(--color-surface-2);
  --a-danger: var(--color-danger);
  --a-low-bg: var(--color-danger-soft);
  --a-kpi-hover: var(--color-surface-2);
  --a-kpi-on: var(--color-primary-soft);
  --a-seg-hover: var(--color-surface-2);
  --a-seg-on-bg: var(--color-text);
  --a-seg-on-fg: var(--color-bg);
  --a-ok-bg: var(--color-success-soft);
  --a-ok-fg: var(--color-success);
  --a-low-pill-bg: var(--color-danger-soft);
  --a-low-pill-fg: var(--color-danger);
  --a-amb-bg: var(--color-warning-soft);
  --a-amb-fg: var(--color-warning);
  --a-info-bg: var(--color-info-soft);
  --a-info-fg: var(--color-info);
  --a-neu-bg: var(--color-neutral-soft);
  --a-neu-fg: var(--color-text-muted);
  --a-shadow-menu: 0 8px 24px rgba(0, 0, 0, 0.4);

  width: 100%;
  max-width: 1800px;
  margin: 0;
  padding: 32px 40px 56px 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  color: var(--a-text);
  -webkit-font-smoothing: antialiased;
}
:root[data-theme='light'] .almacen {
  --a-bg: #f6f6f4;
  --a-card: #fff;
  --a-line: #ededE9;
  --a-line-ctl: #e8e8e4;
  --a-text: #111;
  --a-muted: #6b7078;
  --a-faint: #8d929b;
  --a-chip: #f3f3f1;
  --a-hover: #fafaf8;
  --a-danger: #d92d20;
  --a-low-bg: #fff6f5;
  --a-kpi-hover: #fffbf0;
  --a-kpi-on: #fff6de;
  --a-seg-hover: #eeeeea;
  --a-seg-on-bg: #111;
  --a-seg-on-fg: #fff;
  --a-ok-bg: #e3f6ea;
  --a-ok-fg: #1b7f47;
  --a-low-pill-bg: #fde8e6;
  --a-low-pill-fg: #b42318;
  --a-amb-bg: #fff3d6;
  --a-amb-fg: #8a5400;
  --a-info-bg: #e4eefd;
  --a-info-fg: #2f6fd6;
  --a-neu-bg: #ededE9;
  --a-neu-fg: #5b616b;
  --a-shadow-menu: 0 8px 24px rgba(17, 19, 21, 0.12);
}
.almacen button,
.almacen select,
.almacen input { font-family: inherit; }
.almacen button { cursor: pointer; }
.almacen :focus-visible { outline: 2px solid #f6a800; outline-offset: 2px; }
.col { display: flex; flex-direction: column; gap: 22px; }

/* ── Cabecera ── */
.top { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
h1 { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em; color: var(--a-text); }
.acts { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.ghost {
  border: 0;
  background: var(--a-card);
  color: var(--a-muted);
  font-size: 13px;
  font-weight: 600;
  height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  text-decoration: none;
  box-shadow: 0 0 0 1px var(--a-line-ctl);
}
.ghost:hover { color: var(--a-text); box-shadow: 0 0 0 1px var(--a-muted); }
.ghost-icono { width: 44px; padding: 0; justify-content: center; }
.ghost:disabled { opacity: 0.5; cursor: not-allowed; }

.kbd { font-size: 11px; font-weight: 700; color: var(--a-muted); background: var(--a-chip); border-radius: 6px; padding: 3px 6px; }
.cta {
  border: 0;
  background: #f6a800;
  color: #111;
  font-size: 15px;
  font-weight: 800;
  height: 44px;
  padding: 0 20px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.cta:hover:not(:disabled) { background: #e59a00; }
.cta:disabled { opacity: 0.5; cursor: not-allowed; }

.menu-mas { position: relative; }
.menu-lista {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 210px;
  background: var(--a-card);
  border-radius: 14px;
  padding: 6px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 0 1px var(--a-line-ctl), var(--a-shadow-menu);
}
.menu-item {
  border: 0;
  background: transparent;
  color: var(--a-text);
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  text-decoration: none;
  padding: 10px 12px;
  border-radius: 10px;
}
.menu-item:hover:not(:disabled) { background: var(--a-hover); }
.menu-item:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Pestañas con subrayado ── */
.tabs { display: flex; overflow-x: auto; border-bottom: 1px solid var(--a-line); scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tab {
  position: relative;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  padding: 12px 0;
  margin-right: 28px;
  font-size: 15px;
  font-weight: 600;
  color: var(--a-muted);
  white-space: nowrap;
}
.tab:hover { color: var(--a-text); }
.tab.on { color: var(--a-text); font-weight: 700; }
.tab.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 2px; background: #f6a800; }
.nb { font-size: 11px; font-weight: 700; color: var(--a-danger); margin-left: 6px; vertical-align: 1px; }

/* ── Franja KPI: una tarjeta, 4 celdas separadas por 1px ── */
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1px;
  background: var(--a-line);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 0 0 1px var(--a-line);
}
.kpi { border: 0; background: var(--a-card); text-align: left; padding: 20px 24px; font: inherit; color: inherit; }
button.kpi { cursor: pointer; }
button.kpi:hover { background: var(--a-kpi-hover); }
.kpi.on { background: var(--a-kpi-on); }
.kpi .l { font-size: 12px; font-weight: 600; color: var(--a-muted); }
.kpi .v { font-size: 30px; font-weight: 800; margin-top: 6px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.kpi .v-critico { color: var(--a-danger); }

/* ── Barra de filtros ── */
.filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.search {
  flex: 1 1 260px;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  background: var(--a-card);
  border-radius: 14px;
  padding: 0 16px;
  color: var(--a-faint);
  box-shadow: 0 0 0 1px var(--a-line-ctl);
}
.search input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 15px; color: var(--a-text); min-width: 0; }
.search svg { flex-shrink: 0; }
.sel {
  height: 44px;
  border: 0;
  border-radius: 14px;
  background: var(--a-card);
  padding: 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--a-text);
  box-shadow: 0 0 0 1px var(--a-line-ctl);
}
.seg {
  border: 0;
  background: transparent;
  color: var(--a-muted);
  font-size: 14px;
  font-weight: 600;
  height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  white-space: nowrap;
}
.seg:hover { color: var(--a-text); background: var(--a-seg-hover); }
.seg.on { background: var(--a-seg-on-bg); color: var(--a-seg-on-fg); }

/* ── Salidas: resumen del frente elegido ── */
.consol-wrap { position: relative; }
.consol { border: 1px solid var(--a-line-ctl); }
.consol:disabled { opacity: 0.5; cursor: not-allowed; }
.consol-menu { right: auto; left: 0; min-width: 260px; }
.rf-fecha {
  height: 40px; border: 0; border-radius: 12px; background: var(--a-chip); color: var(--a-text);
  padding: 0 10px; font: inherit; font-size: 13.5px; min-width: 0;
}
.rf {
  background: var(--a-card);
  border-radius: 20px;
  box-shadow: 0 0 0 1px var(--a-line);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rf-cab { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.rf-tit { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rf-tit b { font-size: 16px; font-weight: 800; }
.rf-tit span { font-size: 12.5px; color: var(--a-muted); }
.rf-acts { display: flex; align-items: center; gap: 8px; }
.rf-xls {
  display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border: 0; border-radius: 12px;
  background: var(--color-primary); color: var(--color-primary-ink); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
}
.rf-xls:disabled { opacity: 0.5; cursor: not-allowed; }
.rf-x {
  width: 40px; height: 40px; border: 0; border-radius: 12px; background: var(--a-chip); color: var(--a-muted);
  font-size: 20px; line-height: 1; cursor: pointer;
}
.rf-x:hover { color: var(--a-text); }
.rf-msg { margin: 0; font-size: 13.5px; color: var(--a-muted); }
.rf-err { color: var(--a-danger); }
.rf-tabla { overflow: auto; border-radius: 12px; box-shadow: 0 0 0 1px var(--a-line); max-height: 320px; }
.rf-tabla table { width: 100%; border-collapse: collapse; font-size: 14px; }
.rf-tabla th, .rf-tabla td { padding: 9px 14px; text-align: left; border-bottom: 1px solid var(--a-line); }
.rf-tabla th { position: sticky; top: 0; background: var(--a-chip); font-size: 11.5px; font-weight: 700; color: var(--a-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.rf-tabla td.num, .rf-tabla th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rf-tabla tr:last-child td { border-bottom: 0; }
.rf-tabla .unit { color: var(--a-muted); font-size: 12px; }
.rf-mas { align-self: flex-start; font-size: 13px; font-weight: 600; color: var(--a-muted); text-decoration: none; }
.rf-mas:hover { color: var(--a-text); }
@media (max-width: 1024px) {
  .rf-acts { flex-wrap: wrap; width: 100%; }
  .rf-fecha { flex: 1 1 calc(50% - 6px); }
  .rf { padding: 14px; border-radius: 16px; }
  .rf-xls { flex: 1; justify-content: center; }
}

/* ── Tabla: una tarjeta blanca ── */
.table { background: var(--a-card); border-radius: 20px; box-shadow: 0 0 0 1px var(--a-line); overflow-x: auto; }
.table .in { min-width: 640px; padding: 6px 8px 8px; }
.tabla { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: auto; font-size: 14px; }
.tabla-stock { table-layout: fixed; }
.tabla-secundaria { min-width: max-content; }
.table .in:has(.tabla-secundaria) { width: max-content; min-width: 100%; }
.tabla th {
  height: 44px;
  padding: 0 8px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--a-faint);
  text-transform: uppercase;
  white-space: nowrap;
}
.tabla td { height: 52px; padding: 10px 8px; text-align: left; font-size: 14px; white-space: nowrap; }
/* Solo el texto largo puede envolver, con ancho mínimo */
.tabla td.td-nombre { white-space: normal; min-width: 180px; }
.tabla td[data-label='Frente'] { white-space: normal; min-width: 0; }
.tabla .antig { font-size: 12px; font-weight: 500; color: var(--a-muted); }
.tabla .doc-ref { max-width: 150px; white-space: normal; overflow-wrap: anywhere; font-size: 12.5px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tabla .motivo-ref { max-width: 240px; }
.badge-tip { cursor: default; }
.tip-estado { position: fixed; z-index: 60; transform: translate(-50%, -100%); max-width: 260px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: 12px; padding: 10px 12px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35); font-size: 12.5px; pointer-events: none; }
.tip-estado.abajo { transform: translate(-50%, 0); }
.tip-estado .tip-tit { font-weight: 800; }
.tip-estado .tip-lin { color: var(--color-text-muted); font-weight: 500; margin-top: 2px; overflow-wrap: anywhere; }
.tabla .frente-corto { max-width: 105px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabla .vale-num { font-weight: 700; line-height: 1.2; }
.tabla .vale-fecha { font-size: 11.5px; font-weight: 500; color: var(--a-muted, var(--color-text-muted)); line-height: 1.2; margin-top: 2px; }
.tabla td[data-label='Supervisor'] { white-space: normal; min-width: 140px; }
.tabla td.td-acciones { text-align: right; }
.tabla th:first-child, .tabla td:first-child { padding-left: 16px; }
.tabla th:last-child, .tabla td:last-child { padding-right: 16px; }
.tabla tbody tr:not(.grp):hover td { background: var(--a-hover); }
.tabla tbody tr:not(.grp) td:first-child { border-radius: 12px 0 0 12px; }
.tabla tbody tr:not(.grp) td:last-child { border-radius: 0 12px 12px 0; }
.tabla .r, .tabla .num { text-align: right; font-variant-numeric: tabular-nums; }
.tabla .c { text-align: center; }
.tabla tr.low td { background: var(--a-low-bg); }
.tabla tr.prolongada td { background: var(--a-amb-bg); }
.tabla tr.low:hover td { background: var(--a-low-bg); filter: brightness(0.98); }
.tabla tr.grp td {
  height: auto;
  padding: 18px 16px 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.idx { color: var(--a-faint); font-weight: 600; }
.desc { font-weight: 600; text-transform: uppercase; color: var(--a-text); }
.chip-contrato { margin-left: 8px; padding: 2px 8px; border-radius: 999px; background: var(--a-hover, rgba(128, 128, 128, 0.15)); color: var(--a-muted); font-size: 11px; font-weight: 700; text-transform: none; white-space: nowrap; }
.fuerte { font-weight: 700; }
.apagado { font-weight: 600; color: var(--a-muted); }
.u, .unit { font-size: 11px; color: var(--a-faint); font-weight: 600; }
.doc-ref { color: var(--a-faint); font-size: 12px; }
.td-idx { color: var(--a-faint); font-weight: 600; }
.td-nombre .desc { font-weight: 600; text-transform: uppercase; }
.col-fecha { white-space: nowrap; font-variant-numeric: tabular-nums; }
.vacio { text-align: center !important; color: var(--a-muted); padding: 2rem 1rem !important; }

/* Pills de estado */
.sp, .badge { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 10px; white-space: nowrap; display: inline-block; }
.sp.ok, .badge.positivo, .badge.bueno, .badge.recibida, .badge.confirmada { background: var(--a-ok-bg); color: var(--a-ok-fg); }
.sp.low, .badge.negativo, .badge.danado { background: var(--a-low-pill-bg); color: var(--a-low-pill-fg); }
.sp.amb, .badge.solicitada { background: var(--a-amb-bg); color: var(--a-amb-fg); }
.sp.info { background: var(--a-info-bg); color: var(--a-info-fg); }
.sp.neu, .badge.rechazada { background: var(--a-neu-bg); color: var(--a-neu-fg); }
.evaluacion { display: flex; flex-direction: column; gap: 2px; font-size: 12px; white-space: nowrap; }
.evaluacion .ok { color: var(--a-ok-fg); font-weight: 600; }
.evaluacion .baja, td .baja { color: var(--a-low-pill-fg); font-weight: 600; }

/* Acciones de fila */
.acciones-fila { display: flex; gap: 8px; justify-content: flex-end; }
.mini {
  padding: 5px 11px;
  font-size: 12px;
  border-radius: 999px;
  border: 0;
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 700;
}
.mini.peligro { background: var(--a-low-pill-bg); color: var(--a-low-pill-fg); }

/* Mensajes globales */
.aviso { color: var(--a-ok-fg); font-size: 14px; margin: 0; }
.aviso-vacio, .sin-conexion { color: var(--a-amb-fg); background: var(--a-amb-bg); padding: 10px 14px; border-radius: 12px; font-size: 13px; margin: 0; }
.error { color: var(--a-danger); font-size: 14px; margin: 0; }
.reintentar { margin-left: 8px; padding: 4px 10px; border: 1px solid currentColor; border-radius: 999px; background: none; color: inherit; font-size: 12px; font-weight: 600; }

@media (max-width: 760px) {
  .almacen { padding: 16px; gap: 18px; }
  h1 { font-size: 26px; }
}

/* ── Celular (≤1024px): chips deslizables, 2 indicadores y filas de 2 líneas ── */
@media (max-width: 1024px) {
  .almacen { gap: 12px; padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
  .top { position: sticky; top: 0; z-index: 4; flex-wrap: nowrap; gap: 10px; padding-bottom: 6px; background: var(--color-bg); }
  .top h1 { flex: 1; min-width: 0; font-size: 22px; }
  .acts { flex-wrap: nowrap; gap: 8px; }
  .tabs { gap: 8px; border-bottom: 0; padding-bottom: 2px; }
  .tab {
    flex: 0 0 auto;
    height: 32px;
    padding: 0 13px;
    border-radius: 999px;
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    font-size: 12.5px;
    font-weight: 700;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
  }
  .tab.on { background: var(--color-text); color: var(--color-bg); font-weight: 700; }
  .tab.on::after { display: none; }
  .kpis { grid-template-columns: 1fr 1fr; }
  .kpis .kpi:nth-child(2), .kpis .kpi:nth-child(4) { display: none; }
  .kpi { padding: 12px 14px; }
  .kpi .v { font-size: 24px; }
  .search { flex: 1 1 100%; }
  .filters .sel, .filters .seg { flex: 1 1 auto; }
  .lm { background: var(--a-card); border-radius: 18px; box-shadow: 0 0 0 1px var(--a-line); padding: 2px 14px; }
  .lm-r { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--a-line); }
  .lm-r:last-child { border-bottom: 0; }
  .lm-t { flex: 1; min-width: 0; }
  .lm-t b { display: block; font-size: 13.5px; font-weight: 700; line-height: 1.3; text-transform: uppercase; color: var(--a-text); }
  .lm-t small { display: block; margin-top: 2px; font-size: 12px; font-weight: 600; color: var(--a-muted); }
  .lm-acc { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .lm-d { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; }
  .lm-d b { font-size: 14px; font-weight: 800; white-space: nowrap; }
  .lm-vacio { margin: 0; padding: 22px 4px; text-align: center; font-size: 13px; font-weight: 600; color: var(--a-muted); }
}
</style>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../../store/auth'
import { useRdcStore } from '../store/rdc'
import {
  nuevoId,
  codigosPerforadosLocalesDeFrente,
  codigosMallaLocalesDeFrente,
} from '../services/rdcRepository'
import { depurarBorradoresArchivados } from '../services/rdcSync'
import { conTiempoLimite } from '../../../utils/conTiempoLimite'
import { DIAMETROS_PERNO, MEDIAS_HORAS, TIPOS_CABLE, TIPOS_MALLA, TIPOS_PERNO, UBICACIONES_ELEMENTO, UNIDADES } from '../services/rdcConstantes'
import { rdcUi } from '../services/rdcUi'

const rdc = useRdcStore()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const puedeVerAvance = computed(
  () => !!reporte.value?.frenteId && auth.tienePermiso('frentes.ver') && !['Supervisor', 'Almacen'].includes(auth.nombreRol),
)
function verAvance() {
  // Al volver, el formulario se reabre en este mismo paso (Metrado).
  rdcUi.pasoVolver = 2
  router.push({ path: `/frentes/${reporte.value.frenteId}/control`, query: { volver: route.fullPath } })
}
const reporte = computed(() => rdc.actual)

// Antes de decir que un código "ya está en otro reporte sin sincronizar", se
// quitan de este dispositivo los borradores que ya se borraron en el servidor
// (desde otro dispositivo): no existen más y no deben bloquear nada. Con
// tiempo límite y en silencio: sin conexión se sigue con lo que hay.
async function limpiarBorradoresArchivados() {
  try {
    await conTiempoLimite(depurarBorradoresArchivados(), 4000, 'sin respuesta')
  } catch {
    /* sin conexión o lento: se valida con lo local */
  }
}
const guardar = () => rdc.guardar()

// Un solo bloque abierto a la vez. Son listas largas: con dos desplegados hay
// que desplazarse mucho para llegar al siguiente y en el celular se pierde de
// vista en cuál estabas. Las partidas libres van aparte porque son cortas y a
// veces se consultan mientras se llena otro bloque.
// Críticas abre expandida (es lo que más se llena); si Bitácora mandó a una
// sección concreta («Ver en Metrado»), se abre esa.
const SECCION_A_BLOQUE = { pre: 1, cri: 2, com: 3 }
const bloqueAbierto = ref(SECCION_A_BLOQUE[rdcUi.seccionPedida] ?? 2)
rdcUi.seccionPedida = null
// "N con avance" de cada sección, para verlo sin abrirla.
const conAvance = computed(() => {
  const r = reporte.value
  const porBloque = (b) => r.metrados.filter((m) => m.bloque === b && Number(m.cantidad) > 0).length
  const grupos = new Set(r.elementos.map((e) => `${e.elemento}|${e.actividad}`)).size
  return { 1: porBloque('1'), 2: grupos, 3: porBloque('3') }
})

const libresAbierto = ref(false)
const alternarBloque = (n) => (bloqueAbierto.value = bloqueAbierto.value === n ? null : n)

// --- Bloques 1 y 3: partidas fijas del catálogo ---------------------------
// El reporte guarda solo las que tienen cantidad; la lista completa sale del
// catálogo y la fila se crea al escribir. Se referencian por CÓDIGO y nunca
// por posición: en el RDC original se guardaban por índice de array y bastaba
// insertar una partida en medio para desalinear los borradores existentes.
const partidasDe = (bloque) => (rdc.catalogos?.partidasEstandar ?? []).filter((p) => String(p.bloque) === bloque)
const metradoDe = (codigo) => reporte.value.metrados.find((m) => m.partidaCodigo === codigo)
const cantidadDe = (codigo) => metradoDe(codigo)?.cantidad ?? ''
const tieneValor = (codigo) => Number(metradoDe(codigo)?.cantidad) > 0

function fijarMetrado(partida, bloque, campo, valor) {
  let fila = metradoDe(partida.codigo)
  if (!fila) {
    fila = {
      id: nuevoId(),
      bloque,
      partidaCodigo: partida.codigo,
      partidaNombre: partida.nombre,
      unidad: partida.unidad,
      cantidad: 0,
      horaInicio: null,
      horaFin: null,
      orden: partida.orden ?? 0,
    }
    reporte.value.metrados.push(fila)
  }
  fila[campo] = campo === 'cantidad' ? Number(valor) || 0 : valor || null

  // Una partida sin cantidad ni horarios no aporta nada: se quita para que el
  // reporte no cargue filas vacías.
  if (!fila.cantidad && !fila.horaInicio && !fila.horaFin) {
    reporte.value.metrados = reporte.value.metrados.filter((m) => m.id !== fila.id)
  }
  guardar()
}

const escalonar = (partida, bloque, delta) => {
  const actual = Number(metradoDe(partida.codigo)?.cantidad) || 0
  fijarMetrado(partida, bloque, 'cantidad', Math.max(0, Math.round((actual + delta) * 100) / 100))
}

// Hora compacta de cada partida: un enlace «Agregar hora» / «07:30 – 09:00»
// que abre Inicio – Fin (grilla de 30 min; si la hora ya existe y no cae en la
// grilla, se conserva como opción para no perderla).
const horaAbierta = ref({})
const alternarHora = (clave) => (horaAbierta.value = { ...horaAbierta.value, [clave]: !horaAbierta.value[clave] })
const opcionesHora = (actual) => (actual && !MEDIAS_HORAS.includes(actual) ? [actual, ...MEDIAS_HORAS] : MEDIAS_HORAS)
function etiquetaHora(m) {
  if (!m?.horaInicio) return 'Agregar hora'
  return m.horaFin ? `${m.horaInicio} – ${m.horaFin}` : `${m.horaInicio} – ?`
}

// --- Bloque 2: elementos de sostenimiento --------------------------------
const TIPOS_ELEMENTO = [
  { clave: 'perf', etiqueta: 'Perforación', elemento: 'Perno', actividad: 'Perforación', unidad: 'ML' },
  { clave: 'iny', etiqueta: 'Inyección', elemento: 'Perno', actividad: 'Inyección', unidad: 'ML' },
  { clave: 'malla', etiqueta: 'Malla', elemento: 'Malla', actividad: 'Instalación', unidad: 'M2' },
  { clave: 'cable', etiqueta: 'Cable', elemento: 'Cable', actividad: 'Instalación', unidad: 'ML' },
  { clave: 'pull', etiqueta: 'Pull Test', elemento: 'Perno', actividad: 'Pull Test', unidad: 'UND' },
]

const tipoActivo = ref('perf')
const definicion = computed(() => TIPOS_ELEMENTO.find((t) => t.clave === tipoActivo.value))

// --- Control de pernos (piloto Barrera 5) ---------------------------------
// Solo activo para frentes con frentes.rdc_control_pernos — el resto del
// sistema (Excel, SharePoint, dashboard, cualquier otro frente) sigue igual.
// El estado de cada perno (perforado/inyectado) se DERIVA, nunca se guarda
// aparte: fn_rdc_pernos_estado ya lo calcula en el servidor a partir de
// rdc_reporte_elementos, y acá se combina con lo que todavía no sincronizó
// (reporte.elementos de esta sesión) para que perforar e inyectar en el
// mismo reporte, o sin señal, funcione igual.
const frenteControlPernos = computed(() => {
  const f = (rdc.catalogos?.frentes ?? []).find((fr) => fr.id === reporte.value?.frenteId)
  return !!f?.rdc_control_pernos
})

const normalizarCodigo = (c) => (c ?? '').trim().toUpperCase()

/** Mapa codigo_norm -> { codigo, zona, estado, perforacionMl, perforacionFecha,
 * diasPendiente }, ya con la sesión actual superpuesta encima de lo
 * descargado del servidor (fn_rdc_pernos_estado vía catalogos.pernosEstado).
 *
 * Se descartan del catálogo del servidor las filas que vengan del MISMO
 * reporte que se está editando (perforacion_reporte_id/inyeccion_reporte_id
 * === reporte.value.id): un Borrador sincroniza seguido mientras se llena
 * (ver rdcSync.js), así que el servidor puede ya conocer estos mismos
 * elementos — sin este descarte, el mapa igual queda bien acá (sobrescribir
 * una clave no duplica nada), pero el mismo criterio se reutiliza tal cual
 * para Malla y, sobre todo, para Cable (una suma pura, sin código, donde si
 * duplicaría si no se descartara antes de sumar). */
function sinPropioReporte(filas, campoReporteId) {
  return filas.filter((f) => f[campoReporteId] !== reporte.value?.id)
}

const estadoPernosMapa = computed(() => {
  const mapa = new Map()
  const delServidor = (rdc.catalogos?.pernosEstado ?? []).filter((f) => f.frente_id === reporte.value?.frenteId)
  for (const fila of delServidor) {
    if (fila.perforacion_reporte_id === reporte.value?.id || fila.inyeccion_reporte_id === reporte.value?.id) continue
    mapa.set(fila.codigo_norm, {
      codigo: fila.codigo,
      zona: fila.zona,
      ubicacion: fila.ubicacion,
      estado: fila.estado,
      perforacionMl: fila.perforacion_ml,
      perforacionFecha: fila.perforacion_fecha,
      diasPendiente: fila.dias_pendiente,
    })
  }
  // Perforación de ESTA sesión: todavía no llegó al servidor (o si ya
  // llegó, esto refleja lo último que se escribió, que es lo que importa).
  for (const e of reporte.value?.elementos ?? []) {
    if (e.elemento === 'Perno' && e.actividad === 'Perforación' && e.codigo) {
      mapa.set(normalizarCodigo(e.codigo), {
        codigo: e.codigo, zona: e.zona, ubicacion: e.ubicacion, estado: 'perforado',
        perforacionMl: e.cantidad, perforacionFecha: reporte.value.fecha, diasPendiente: 0,
      })
    }
  }
  // Inyección de ESTA sesión: ya no debe seguir apareciendo como pendiente,
  // aunque el servidor todavía no se haya enterado.
  for (const e of reporte.value?.elementos ?? []) {
    if (e.elemento === 'Perno' && e.actividad === 'Inyección' && e.codigo) {
      const previo = mapa.get(normalizarCodigo(e.codigo))
      if (previo) mapa.set(normalizarCodigo(e.codigo), { ...previo, estado: 'inyectado' })
    }
  }
  return mapa
})

/** Igual idea que estadoPernosMapa, pero para Malla: acá no hay estados
 * (perforado/inyectado), solo "ya instalado" — el mapa sirve para detectar
 * duplicados de código de paño Y, con `tipo` a bordo, para el desglose por
 * tipo de más abajo (sumar área sin distinguir tipo de malla no sirve para
 * controlar nada: un frente puede tener Tecco y Triple Torsión a la vez). */
const estadoMallaMapa = computed(() => {
  const mapa = new Map()
  const delServidor = sinPropioReporte(
    (rdc.catalogos?.mallaEstado ?? []).filter((f) => f.frente_id === reporte.value?.frenteId),
    'reporte_id',
  )
  for (const fila of delServidor) {
    mapa.set(fila.codigo_norm, { codigo: fila.codigo, zona: fila.zona, tipo: fila.tipo, areaM2: fila.area_m2 })
  }
  for (const e of reporte.value?.elementos ?? []) {
    if (e.elemento === 'Malla' && e.actividad === 'Instalación' && e.codigo) {
      mapa.set(normalizarCodigo(e.codigo), { codigo: e.codigo, zona: e.zona, tipo: e.tipo, areaM2: e.cantidad })
    }
  }
  return mapa
})

/** codigo_norm -> fila de rdc_pernos_biblioteca (catálogo del plano subido
 * en Configuración). Si el perno que se está perforando/inyectando ya está
 * en el catálogo, su Ubicación y Diámetro salen de ahí en vez del valor
 * genérico del formulario — Planeamiento ya los definió al subir el
 * catálogo, no hace falta que el supervisor los vuelva a tipear. Sigue
 * siendo editable en la tabla de abajo por si campo necesita corregirlo. */
const bibliotecaPernosMapa = computed(() => {
  const mapa = new Map()
  for (const p of rdc.catalogos?.pernos ?? []) {
    if (p.frente_id !== reporte.value?.frenteId) continue
    mapa.set(normalizarCodigo(p.codigo), p)
  }
  return mapa
})
// Con catálogo subido, Ubicación y Diámetro dejan de pedirse en el
// formulario — ya se sabe el valor de cada perno por su código, pedirlo de
// nuevo era justo la queja: "ya lo puse yo y el supervisor me pone otra
// cosa igual".
const hayCatalogoPernos = computed(() => bibliotecaPernosMapa.value.size > 0)

function pendientesDeZona(zona) {
  return [...estadoPernosMapa.value.values()]
    .filter((p) => p.estado === 'perforado' && (p.zona ?? '') === (zona ?? ''))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
}


// Usado por la sugerencia de "Partidas libres" más abajo (sugerenciaLibre) —
// el panel de solo lectura que mostraba Previsto/Acumulado/Hoy/Saldo se quitó
// (el supervisor lo veía en el celular con TODAS las partidas del frente,
// sin filtrar por bloque, y resultaba más ruido que ayuda).
const partidasEdtDelFrente = computed(() => (rdc.catalogos?.partidasEdt ?? []).filter((p) => p.frente_id === reporte.value?.frenteId))

const prefijosDelFrente = computed(() => (rdc.catalogos?.prefijos ?? []).filter((p) => p.frente_id === reporte.value?.frenteId))
const zonas = computed(() => [...new Set(prefijosDelFrente.value.map((p) => p.zona))])
const sostenimientosDe = (zona) => {
  const lista = prefijosDelFrente.value.filter((p) => p.zona === zona).map((p) => p.sostenimiento)
  return lista.length ? lista : ['Manual']
}

// Perforación/Inyección/Pull Test: el supervisor ya no elige zona y
// sostenimiento para "llegar" al prefijo — elige el prefijo directo (es lo
// único que de verdad identifica dónde está parado) y zona/sostenimiento
// salen solos por detrás, sin mostrarse: eso ya quedó como un dato que solo
// usa el reporte de Excel, no algo que el supervisor necesite ver ni tipear
// de nuevo. Lista plana de todos los prefijos reales del frente, cada uno
// con la fila (zona+sostenimiento+plano) de la que sale.
const prefijosPlanosFrente = computed(() => {
  const lista = []
  for (const fila of prefijosDelFrente.value) {
    const opciones = (fila.prefijo ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    for (const p of opciones) lista.push({ prefijo: p, fila })
  }
  return lista
})
// Si el frente no tiene NINGÚN prefijo real configurado (catálogo vacío, o
// todas sus filas son "Manual" sin prefijo cargado), no hay de dónde elegir
// — ahí sí se pide zona/sostenimiento a mano, igual que antes.
const hayPrefijosFrente = computed(() => prefijosPlanosFrente.value.length > 0)
const CLAVES_PREFIJO_DIRECTO = ['perf', 'iny', 'pull']
const usaPrefijoDirecto = computed(() => CLAVES_PREFIJO_DIRECTO.includes(definicion.value.clave) && hayPrefijosFrente.value)

/** El <select> de prefijo se liga a ESTO, no directo a `nuevo.prefijo` —
 * mismo motivo que ya documenta `prefijoActivo` más abajo: si se confiara
 * en que `nuevo.prefijo` ya viene cargado, la primera vez que se entra a
 * esta pestaña con el frente recién elegido (antes de que el watch de
 * `tipoActivo` vuelva a correr) podría mostrarse vacío. El getter con
 * respaldo (primer prefijo de la lista) garantiza un valor válido desde el
 * primer render; el setter solo toca `nuevo.prefijo`, nunca zona ni
 * sostenimiento — esos se resuelven solos en construirBase(), a partir de
 * CUALQUIER prefijo que esté activo en ese momento, nunca de un valor
 * copiado de antemano. */
const prefijoDirectoSeleccionado = computed({
  get: () => nuevo.value.prefijo || prefijosPlanosFrente.value[0]?.prefijo || '',
  set: (valor) => {
    nuevo.value.prefijo = valor
  },
})
const filaPrefijoDirecto = computed(
  () => prefijosPlanosFrente.value.find((x) => x.prefijo === prefijoDirectoSeleccionado.value)?.fila ?? null,
)

// En el RDC original, cada una de las cinco sub-formas (Perforación, Inyección,
// Malla, Cable, Pull Test) es su propio acordeón con sus propios campos — no
// comparten estado entre sí. Acá se simula lo mismo: al cambiar de pestaña, el
// formulario se reinicia con los valores por defecto de esa actividad, en vez
// de arrastrar lo que había quedado tipeado en la anterior (que ni siquiera
// tendría las mismas opciones, p. ej. el "Tipo" de una malla no es un tipo de perno).
function formularioVacio(clave) {
  const zona = zonas.value[0] ?? ''
  return {
    zona,
    sostenimiento: sostenimientosDe(zona)[0] ?? 'Manual',
    // Perforación/Inyección/Pull Test con prefijos reales: se deja vacío a
    // propósito — prefijoDirectoSeleccionado ya resuelve un valor válido
    // por su cuenta (primer prefijo de la lista) sin necesitar que quede
    // precargado acá.
    prefijo: '',
    letra: '',
    codigo: '', // código manual de malla, distinto del prefijo
    n1: '',
    n2: '',
    cantidad: '', // longitud en ML (perf/iny/cable)
    ancho: '',
    largo: '',
    tipo: clave === 'perf' ? TIPOS_PERNO[0] : clave === 'malla' ? TIPOS_MALLA[0] : clave === 'cable' ? TIPOS_CABLE[0] : '',
    tipoOtro: '', // texto libre cuando tipo === '__otro__' (malla o cable que no está en la lista)
    diametro: DIAMETROS_PERNO[0],
    diametroOtro: '',
    ubicacion: UBICACIONES_ELEMENTO[0],
    horaInicio: '',
    horaFin: '',
  }
}

const nuevo = ref(formularioVacio('perf'))
watch(tipoActivo, (clave) => {
  nuevo.value = formularioVacio(clave)
  avisoRechazados.value = []
  regularizarAbierto.value = false
})

const filaPrefijo = computed(() =>
  prefijosDelFrente.value.find((p) => p.zona === nuevo.value.zona && p.sostenimiento === nuevo.value.sostenimiento),
)
// Una misma combinación puede admitir varios prefijos, separados por comas.
const opcionesPrefijo = computed(() => (filaPrefijo.value?.prefijo ?? '').split(',').map((x) => x.trim()).filter(Boolean))
const esManual = computed(() => !filaPrefijo.value || filaPrefijo.value.sostenimiento === 'Manual' || !opcionesPrefijo.value.length)

/** El prefijo que realmente se usa al agregar un elemento.
 *
 * No se puede confiar en que `nuevo.prefijo` ya esté cargado: cuando hay
 * una sola opción no hay ningún <select> ni <input> en pantalla que la
 * escriba ahí (ver plantilla) — solo se muestra en negrita, sin tocar el
 * campo. Antes eso se resolvía con un `watch` que copiaba la opción a
 * `nuevo.prefijo` en cuanto `opcionesPrefijo` "cambiaba", pero un `watch`
 * nunca corre en su primer render: si la pestaña abre ya con una sola
 * opción resuelta (el caso más común), el valor jamás llegaba a copiarse y
 * el elemento se guardaba sin prefijo ni número. Este computed no depende
 * de que algo cambie — siempre calcula el valor correcto, incluida la
 * apertura inicial. */
const prefijoActivo = computed(() => {
  if (usaPrefijoDirecto.value) return prefijoDirectoSeleccionado.value
  if (esManual.value) return nuevo.value.prefijo || ''
  if (opcionesPrefijo.value.length > 1) return nuevo.value.prefijo || opcionesPrefijo.value[0]
  return opcionesPrefijo.value[0] || ''
})

const areaMallaPreview = computed(() => {
  const a = Number(nuevo.value.ancho)
  const l = Number(nuevo.value.largo)
  return a > 0 && l > 0 ? (Math.round(a * l * 1000) / 1000).toFixed(3) : null
})

const MAXIMO_RANGO = 200

/** Arma el código de un elemento perf/iny/pull. Sin prefijo configurado, el
 * pull test cae a "P" + número (igual que el RDC original) y perf/iny quedan
 * con solo la letra + número, o vacío si tampoco hay letra. */
function codigoSecuencial(clave, prefijo, letra, numero) {
  if (clave === 'pull') return prefijo ? `${prefijo}${numero}` : `P${numero}`
  return prefijo ? `${prefijo}${letra}${numero}` : letra ? `${letra}${numero}` : ''
}

/** Campos comunes a todo elemento que se agregue en este instante — zona,
 * sostenimiento y plano salen siempre de acá, nunca se arman dos veces: lo
 * usan tanto `agregarElementos()` (rango libre) como la selección de
 * pendientes y la regularización de Inyección (control de pernos), para que
 * las tres rutas terminen en filas con EXACTAMENTE la misma forma. */
function construirBase() {
  const d = definicion.value
  const n = nuevo.value
  // Con prefijo directo, zona/sostenimiento/plano NUNCA salen de `nuevo`
  // (ese camino ya no los muestra ni los toca) — salen de la fila del
  // prefijo que esté activo en este instante, sin importar si `nuevo.zona`
  // quedó con el valor por defecto de otra pestaña.
  if (usaPrefijoDirecto.value) {
    const fila = filaPrefijoDirecto.value
    return {
      elemento: d.elemento,
      actividad: d.actividad,
      unidad: d.unidad,
      zona: fila?.zona || null,
      sistema: fila?.sostenimiento || null,
      plano: fila?.plano ?? null,
    }
  }
  return {
    elemento: d.elemento,
    actividad: d.actividad,
    unidad: d.unidad,
    zona: n.zona || null,
    sistema: n.sostenimiento || null,
    plano: !esManual.value ? filaPrefijo.value?.plano ?? null : null,
  }
}

const avisoRechazados = ref([])

async function agregarElementos() {
  heredarHoraGrupo()
  const d = definicion.value
  const n = nuevo.value
  const prefijo = prefijoActivo.value
  const base = construirBase()
  avisoRechazados.value = []

  // El tipo elegido, o el texto libre cuando se marcó "Otro" (mismo patrón
  // que diametroFinal más abajo, para cuando el tipo de malla/cable que usa
  // el supervisor no está en la lista fija).
  const tipoResuelto = n.tipo === '__otro__' ? (n.tipoOtro || '').trim() || null : n.tipo || null

  if (d.clave === 'malla') {
    const ancho = Number(n.ancho)
    const largo = Number(n.largo)
    if (!ancho || !largo) return
    const codigoManual = n.codigo.trim()
    const codigo = codigoManual || (prefijo ? `${prefijo}${reporte.value.elementos.length + 1}` : null)

    // Control de pernos extendido a Malla (solo frentes con el interruptor
    // activo): un paño ya reportado no se puede volver a reportar — mismo
    // criterio y mismos dos orígenes que Perforación (servidor+sesión, y
    // otros reportes de este dispositivo sin sincronizar). Sin código
    // resuelto (sin manual ni prefijo) no hay nada que comparar.
    if (frenteControlPernos.value && codigo) {
      const norm = normalizarCodigo(codigo)
      if (estadoMallaMapa.value.has(norm)) {
        avisoRechazados.value = [`${codigo} (este paño ya fue reportado)`]
        return
      }
      await limpiarBorradoresArchivados()
      const codigosLocalesOtrosReportes = await codigosMallaLocalesDeFrente(reporte.value.frenteId, reporte.value.id)
      if (codigosLocalesOtrosReportes.has(norm)) {
        avisoRechazados.value = [`${codigo} (ya reportado en otro reporte de este frente, todavía sin sincronizar)`]
        return
      }
    }

    reporte.value.elementos.push({
      ...base,
      id: nuevoId(),
      tipo: tipoResuelto,
      codigo,
      ubicacion: null,
      cantidad: Math.round(ancho * largo * 1000) / 1000,
      ancho,
      largo,
      diametro: null,
      tipoPerforadora: null,
      horaInicio: n.horaInicio || null,
      horaFin: n.horaFin || null,
      orden: reporte.value.elementos.length + 1,
    })
  } else if (d.clave === 'cable') {
    // Un cable no se cuenta pierna a pierna: N° inicio/fin nombran el TRAMO
    // (p. ej. "VM07-C1 → VM07-C5") y la longitud ingresada es la del tramo
    // completo — una sola fila, no una por número. Así se comporta el RDC
    // original y así se preserva la longitud real: repetirla por cada número
    // del rango la multiplicaría por la cantidad de números, no por la del cable.
    const desde = parseInt(n.n1)
    if (!desde) return
    const ml = Number(n.cantidad)
    if (!ml) return
    const hastaNum = parseInt(n.n2)
    const hasta = hastaNum >= desde ? hastaNum : desde
    const codigoInicio = prefijo ? `${prefijo}${desde}` : `C-${desde}`
    const codigoFin = hasta > desde ? (prefijo ? `${prefijo}${hasta}` : `C-${hasta}`) : ''
    reporte.value.elementos.push({
      ...base,
      id: nuevoId(),
      tipo: tipoResuelto,
      codigo: codigoFin ? `${codigoInicio} → ${codigoFin}` : codigoInicio,
      ubicacion: null,
      cantidad: ml,
      ancho: null,
      largo: null,
      diametro: null,
      tipoPerforadora: null,
      horaInicio: n.horaInicio || null,
      horaFin: n.horaFin || null,
      orden: reporte.value.elementos.length + 1,
    })
  } else {
    // perf / iny / pull: un elemento físico por número del rango.
    const desde = parseInt(n.n1)
    if (!desde) return
    const hastaNum = parseInt(n.n2)
    const hasta = hastaNum >= desde ? hastaNum : desde
    if (hasta - desde > MAXIMO_RANGO) return

    const cantidad = d.clave === 'pull' ? 1 : Number(n.cantidad)
    if (d.clave !== 'pull' && !cantidad) return

    const letra = (n.letra || '').toUpperCase()
    const diametroFinal = d.clave === 'perf' ? (n.diametro === '__otro__' ? `${n.diametroOtro}mm` : n.diametro) : null

    // Control de pernos (solo Perforación, solo frentes con el interruptor
    // activo): un código ya perforado no se puede volver a perforar. Se
    // revisa contra servidor+sesión actual (estadoPernosMapa, que se
    // actualiza solo con cada push de este mismo bucle) y contra otros
    // reportes de este frente que ya están en este dispositivo pero
    // todavía no sincronizaron — ninguno de los dos lo sabría todavía por
    // su cuenta.
    const validarDuplicados = d.clave === 'perf' && frenteControlPernos.value
    if (validarDuplicados) await limpiarBorradoresArchivados()
    const codigosLocalesOtrosReportes = validarDuplicados
      ? await codigosPerforadosLocalesDeFrente(reporte.value.frenteId, reporte.value.id)
      : null

    for (let i = desde; i <= hasta; i++) {
      const codigo = codigoSecuencial(d.clave, prefijo, letra, i)
      if (validarDuplicados && codigo) {
        const norm = normalizarCodigo(codigo)
        const yaEstado = estadoPernosMapa.value.get(norm)
        if (yaEstado) {
          avisoRechazados.value.push(`${codigo} (ya ${yaEstado.estado === 'inyectado' ? 'inyectado' : 'perforado'})`)
          continue
        }
        if (codigosLocalesOtrosReportes.has(norm)) {
          avisoRechazados.value.push(`${codigo} (ya perforado en otro reporte de este frente, todavía sin sincronizar)`)
          continue
        }
      }
      const libPerno = bibliotecaPernosMapa.value.get(normalizarCodigo(codigo))
      reporte.value.elementos.push({
        ...base,
        id: nuevoId(),
        tipo: d.clave === 'perf' ? n.tipo || null : d.clave === 'pull' ? 'Ensayo' : null,
        codigo,
        ubicacion: libPerno?.ubicacion || n.ubicacion || null,
        cantidad,
        ancho: null,
        largo: null,
        diametro: d.clave === 'perf' ? (libPerno?.diametro ? `${libPerno.diametro}mm` : diametroFinal) : null,
        tipoPerforadora: null,
        horaInicio: n.horaInicio || null,
        horaFin: n.horaFin || null,
        orden: reporte.value.elementos.length + 1,
      })
    }
  }

  // Se limpian los campos "de esta instancia" — cada elemento nuevo suele
  // tener su propia hora y su propio rango — pero se conservan zona, sost,
  // prefijo, tipo, diámetro, perforadora y ubicación: lo normal es cargar
  // varios elementos seguidos con esos mismos datos.
  Object.assign(nuevo.value, { n1: '', n2: '', cantidad: '', ancho: '', largo: '', codigo: '', letra: '', horaInicio: '', horaFin: '' })
  guardar()
}

function quitarElemento(id) {
  reporte.value.elementos = reporte.value.elementos.filter((e) => e.id !== id)
  guardar()
}

/** Corrección puntual de Ubicación/Diámetro en la tabla de "ya agregados" —
 * para cuando el valor que trajo el catálogo (o el que se tipeó) no es el
 * que terminó pasando en campo. */
function actualizarElementoCampo(id, campo, valor) {
  const fila = reporte.value.elementos.find((e) => e.id === id)
  if (!fila) return
  fila[campo] = valor || null
  guardar()
}

/** Corrección del tipo de malla de un paño ya agregado (p. ej. se reportó
 * Minox y era Deltax). "Otro…" pide el nombre a mano, igual que al agregar. */
function opcionesTipoMallaPara(valorActual) {
  return valorActual && !TIPOS_MALLA.includes(valorActual) ? [valorActual, ...TIPOS_MALLA] : TIPOS_MALLA
}
function cambiarTipoMalla(id, evento) {
  const fila = reporte.value.elementos.find((e) => e.id === id)
  if (!fila) return
  let tipo = evento.target.value
  if (tipo === '__otro__') {
    tipo = (window.prompt('Tipo de malla (ej: Tecco 100/4):') || '').trim()
    if (!tipo) {
      evento.target.value = fila.tipo || ''
      return
    }
  }
  actualizarElementoCampo(id, 'tipo', tipo)
}

/** Opciones del <select> de Ubicación en la tabla — agrega el valor actual
 * al principio si vino del catálogo con un texto que no está en la lista
 * fija, para no perderlo ni forzar a elegir otra cosa sin querer. */
function opcionesUbicacionPara(valorActual) {
  return valorActual && !UBICACIONES_ELEMENTO.includes(valorActual) ? [valorActual, ...UBICACIONES_ELEMENTO] : UBICACIONES_ELEMENTO
}

const elementosDelTipo = computed(() =>
  reporte.value.elementos.filter((e) => e.elemento === definicion.value.elemento && e.actividad === definicion.value.actividad),
)
// Hora del grupo (Inicio – Fin) de lo ya agregado en la pestaña activa.
const horaGrupo = computed(() => ({
  inicio: elementosDelTipo.value.map((e) => e.horaInicio).filter(Boolean).sort()[0] ?? '',
  fin: elementosDelTipo.value.map((e) => e.horaFin).filter(Boolean).sort().slice(-1)[0] ?? '',
}))
function fijarHoraGrupo(campo, valor) {
  elementosDelTipo.value.forEach((e) => (e[campo] = valor || null))
  guardar()
}
/** Lo que se agrega después toma la hora del grupo, para no pedirla otra vez. */
function heredarHoraGrupo() {
  nuevo.value.horaInicio = nuevo.value.horaInicio || horaGrupo.value.inicio
  nuevo.value.horaFin = nuevo.value.horaFin || horaGrupo.value.fin
}
const conUbicacion = computed(() => definicion.value.clave === 'perf' || definicion.value.clave === 'iny')

// --- Inyección por selección de pendientes (solo frentes con control) ----
// Reemplaza el rango N° inicio/fin: en vez de escribir números a ciegas, se
// elige de lo que ya está perforado y sin inyectar en la zona activa.
const pendientesZonaActual = computed(() => (frenteControlPernos.value ? pendientesDeZona(nuevo.value.zona) : []))

const filasIny = ref([]) // [{ codigo, zona, ubicacion, ml, marcado }]
watch(
  pendientesZonaActual,
  (pendientes) => {
    if (tipoActivo.value !== 'iny') return
    filasIny.value = pendientes.map((p) => ({ codigo: p.codigo, zona: p.zona, ubicacion: p.ubicacion, ml: p.perforacionMl ?? '', marcado: false }))
  },
  { immediate: true },
)

const todosMarcadosIny = computed({
  get: () => filasIny.value.length > 0 && filasIny.value.every((f) => f.marcado),
  set: (v) => filasIny.value.forEach((f) => (f.marcado = v)),
})

function confirmarInyeccionSeleccion() {
  heredarHoraGrupo()
  const seleccionados = filasIny.value.filter((f) => f.marcado && Number(f.ml) > 0)
  if (!seleccionados.length) return
  const base = construirBase()
  for (const f of seleccionados) {
    reporte.value.elementos.push({
      ...base,
      id: nuevoId(),
      tipo: null,
      codigo: f.codigo,
      // Bug real encontrado y corregido (2026-10-06): esto usaba
      // nuevo.value.ubicacion (el selector compartido del formulario,
      // default 'Cabecera') para TODOS los pernos marcados, sin importar
      // dónde se habían perforado de verdad — un perno perforado en
      // "Cuerpo" quedaba inyectado como "Cabecera". Ahora usa la ubicación
      // real de CADA perno (la que ya quedó registrada al perforarlo).
      ubicacion: f.ubicacion || null,
      cantidad: Number(f.ml),
      ancho: null,
      largo: null,
      diametro: null,
      tipoPerforadora: null,
      horaInicio: nuevo.value.horaInicio || null,
      horaFin: nuevo.value.horaFin || null,
      orden: reporte.value.elementos.length + 1,
      regularizado: false,
      motivoRegularizacion: null,
    })
  }
  Object.assign(nuevo.value, { horaInicio: '', horaFin: '' })
  guardar()
}

// Regularizar: un código que no está en la lista de pendientes (llegó por
// fuera, o el perforado se cargó mal) se puede igual inyectar, dejando
// constancia obligatoria del motivo — rdc_reporte_elementos_regularizado_coherente
// exige ese motivo del lado de la base, acá se exige también antes de mandar.
const regularizarAbierto = ref(false)
const regularizarForm = ref({ codigo: '', ml: '', motivo: '' })

function confirmarRegularizar() {
  heredarHoraGrupo()
  const codigo = regularizarForm.value.codigo.trim()
  const ml = Number(regularizarForm.value.ml)
  const motivo = regularizarForm.value.motivo.trim()
  if (!codigo || !ml || !motivo) return
  const base = construirBase()
  // La ubicación de un perno es siempre la del perno, nunca la del
  // selector compartido del formulario (mismo bug ya corregido en
  // confirmarInyeccionSeleccion — ver DICCIONARIO_DATOS.md 2026-10-06).
  const libPerno = bibliotecaPernosMapa.value.get(normalizarCodigo(codigo))
  reporte.value.elementos.push({
    ...base,
    id: nuevoId(),
    tipo: null,
    codigo,
    ubicacion: libPerno?.ubicacion || nuevo.value.ubicacion || null,
    cantidad: ml,
    ancho: null,
    largo: null,
    diametro: null,
    tipoPerforadora: null,
    horaInicio: nuevo.value.horaInicio || null,
    horaFin: nuevo.value.horaFin || null,
    orden: reporte.value.elementos.length + 1,
    regularizado: true,
    motivoRegularizacion: motivo,
  })
  regularizarAbierto.value = false
  guardar()
}

/** Cuántos elementos y cuánto suman, por cada una de las cinco pestañas — para
 * que se vea de un vistazo qué se ha registrado sin tener que abrir cada una. */
const estadisticasPorTipo = computed(() => {
  const mapa = {}
  TIPOS_ELEMENTO.forEach((t) => {
    const items = reporte.value.elementos.filter((e) => e.elemento === t.elemento && e.actividad === t.actividad)
    mapa[t.clave] = { count: items.length, total: Math.round(items.reduce((s, e) => s + (Number(e.cantidad) || 0), 0) * 100) / 100 }
  })
  return mapa
})

// --- Partidas libres -----------------------------------------------------
const nuevaLibre = ref({ nombre: '', unidad: '', cantidad: '' })
const libres = computed(() => reporte.value.metrados.filter((m) => m.bloque === 'libre'))

/** Similitud por bigramas de caracteres (Dice) — mismo criterio que ya usa
 * `fn_rdc_sincronizar_confirmaciones` con pg_trgm para sugerir partida EDT
 * en la bandeja de Confirmación, pero acá se adelanta al momento de tipear
 * (sin red, contra el catálogo ya descargado), para que no se repita el
 * caso real de Barrera 5: un supervisor reportó "Barrera Provisional" como
 * partida libre en m2 porque no la encontraba en sus bloques fijos, cuando
 * ya estaba en el cronograma (01.06, en ml). */
function normalizarTexto(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}
function bigramas(s) {
  const out = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}
function similitudTexto(a, b) {
  const A = bigramas(normalizarTexto(a))
  const B = bigramas(normalizarTexto(b))
  if (!A.length || !B.length) return 0
  const restante = [...B]
  let interseccion = 0
  for (const g of A) {
    const idx = restante.indexOf(g)
    if (idx !== -1) {
      interseccion++
      restante.splice(idx, 1)
    }
  }
  return (2 * interseccion) / (A.length + B.length)
}

const UMBRAL_SUGERENCIA_LIBRE = 0.45
const sugerenciaLibre = computed(() => {
  const texto = nuevaLibre.value.nombre.trim()
  if (texto.length < 3) return null
  let mejor = null
  for (const p of partidasEdtDelFrente.value) {
    const score = similitudTexto(texto, p.nombre)
    if (!mejor || score > mejor.score) mejor = { partida: p, score }
  }
  return mejor && mejor.score >= UMBRAL_SUGERENCIA_LIBRE ? mejor : null
})

function usarSugerenciaLibre() {
  if (!sugerenciaLibre.value) return
  nuevaLibre.value.nombre = sugerenciaLibre.value.partida.nombre
  nuevaLibre.value.unidad = sugerenciaLibre.value.partida.unidad
}

function agregarLibre() {
  const l = nuevaLibre.value
  if (!l.nombre.trim() || !Number(l.cantidad)) return
  reporte.value.metrados.push({
    id: nuevoId(),
    bloque: 'libre',
    partidaCodigo: null,
    partidaNombre: l.nombre.trim(),
    unidad: l.unidad || 'UND',
    cantidad: Number(l.cantidad),
    horaInicio: null,
    horaFin: null,
    orden: libres.value.length + 1,
  })
  nuevaLibre.value = { nombre: '', unidad: '', cantidad: '' }
  guardar()
}

function quitarLibre(id) {
  reporte.value.metrados = reporte.value.metrados.filter((m) => m.id !== id)
  guardar()
}
</script>

<template>
  <div v-if="reporte">
    <div v-if="!reporte.frenteId" class="alert alert-amber">
      <i class="ti ti-alert-triangle" />
      <span>Elige primero un frente en el paso «Datos»: de él dependen los códigos de los elementos.</span>
    </div>

    <div class="aviso-bitacora"><span>✦</span><span>Lo que reportes aquí se escribe solo en la Bitácora, con su hora.</span></div>

    <!-- ── BLOQUE 1 ── -->
    <div class="card blq-card" style="border-left-color: var(--blue-text)">
      <div class="blq-head" @click="alternarBloque(1)">
        <span class="blq-titulo" style="color: var(--blue-text)"><i class="ti ti-list-check" />1. Actividades preliminares</span>
        <span class="blq-cnt" :class="{ si: conAvance[1] }">{{ conAvance[1] ? `${conAvance[1]} con avance` : 'Sin avance' }}</span>
        <i class="ti" :class="bloqueAbierto === 1 ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--blue-text)" />
      </div>

      <div v-if="bloqueAbierto === 1" style="margin-top: 10px">
        <div
          v-for="p in partidasDe('1')"
          :key="p.codigo"
          class="blq-row"
          :class="{ 'has-val': tieneValor(p.codigo) }"
          style="--row-accent: var(--blue-text)"
        >
          <div class="blq-row-top">
            <span class="blq-row-title">{{ p.nombre }}</span>
            <span class="unit-pill">{{ p.unidad }}</span>
          </div>
          <div class="blq-row-bottom">
            <span class="blq-row-label">Cantidad ejecutada</span>
            <div class="stepper">
              <button type="button" class="stepper-btn" aria-label="Restar" @click="escalonar(p, '1', -1)">−</button>
              <input
                :value="cantidadDe(p.codigo)"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                class="stepper-input"
                @change="fijarMetrado(p, '1', 'cantidad', $event.target.value)"
              />
              <button type="button" class="stepper-btn" aria-label="Sumar" @click="escalonar(p, '1', 1)">+</button>
            </div>
          </div>
          <div v-if="tieneValor(p.codigo)" class="hr-link">
            <button type="button" class="hr-btn" :class="{ falta: !metradoDe(p.codigo)?.horaInicio }" @click="alternarHora(p.codigo)">
              <i class="ti ti-clock" />{{ etiquetaHora(metradoDe(p.codigo)) }}
            </button>
            <div v-if="horaAbierta[p.codigo]" class="hr-par">
              <select :value="metradoDe(p.codigo)?.horaInicio ?? ''" aria-label="Inicio" @change="fijarMetrado(p, '1', 'horaInicio', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in opcionesHora(metradoDe(p.codigo)?.horaInicio)" :key="h" :value="h">{{ h }}</option>
              </select>
              <span>–</span>
              <select :value="metradoDe(p.codigo)?.horaFin ?? ''" aria-label="Fin" @change="fijarMetrado(p, '1', 'horaFin', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in opcionesHora(metradoDe(p.codigo)?.horaFin)" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── BLOQUE 2 ── -->
    <div class="card blq-card" style="border-left-color: var(--amber)">
      <div class="blq-head" @click="alternarBloque(2)">
        <span class="blq-titulo" style="color: var(--amber)"><i class="ti ti-bolt" />2. Actividades críticas</span>
        <span class="blq-cnt" :class="{ si: conAvance[2] }">{{ conAvance[2] ? `${conAvance[2]} con avance` : 'Sin avance' }}</span>
        <i class="ti" :class="bloqueAbierto === 2 ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--amber)" />
      </div>

      <div v-if="bloqueAbierto === 2" style="margin-top: 10px">
        <p v-if="!reporte.frenteId" class="empty-msg">Selecciona primero el frente en la pestaña Datos.</p>

        <template v-else>
          <!-- El avance (perforados / inyectados / malla y cable por zona y
               tipo) vive en Control de sostenimiento de la ficha del frente;
               acá solo queda el acceso. Supervisor y Almacén no pueden entrar
               a la ficha, así que a ellos no se les ofrece. -->
          <button v-if="puedeVerAvance" type="button" class="ver-avance" @click="verAvance">
            <span><i class="ti ti-chart-bar" /> Ver avance</span>
            <span aria-hidden="true">›</span>
          </button>

          <div class="pestanas">
            <button
              v-for="t in TIPOS_ELEMENTO"
              :key="t.clave"
              type="button"
              class="pestana"
              :class="{ activa: tipoActivo === t.clave }"
              @click="tipoActivo = t.clave"
            >
              <span class="pestana-label">{{ t.etiqueta }}</span>
              <span v-if="estadisticasPorTipo[t.clave].count" class="pestana-conteo">
                {{ estadisticasPorTipo[t.clave].count }} reg · {{ estadisticasPorTipo[t.clave].total }} {{ t.unidad }}
              </span>
            </button>
          </div>

          <div class="ctrl-form">
            <!-- Total del día, no por perno: a diferencia de todo lo demás
                 acá abajo (que es un registro por cada elemento), el cemento
                 se reporta una sola vez por jornada de Inyección — pedido
                 puntual de campo. -->
            <div v-if="definicion.clave === 'iny'" class="field">
              <label>Bolsas de cemento usadas hoy{{ estadisticasPorTipo.iny.count ? ' (obligatorio)' : '' }}</label>
              <input v-model="reporte.inyBolsasCemento" type="number" min="0" step="1" inputmode="numeric" placeholder="Ej: 12" @change="guardar" />
            </div>
            <!-- Perforación/Inyección/Pull Test con prefijos reales
                 configurados: el supervisor solo elige el prefijo (es lo
                 único que de verdad identifica dónde está parado) — zona,
                 sostenimiento y plano salen solos por detrás, sin pedirse
                 ni mostrarse: eso ya es dato de Excel, no algo que vuelva a
                 tipear. Sin ningún prefijo configurado para el frente, cae
                 al modo manual de siempre (zona + sostenimiento + prefijo
                 libre). -->
            <div v-if="usaPrefijoDirecto" class="field" :class="{ mitad: definicion.clave === 'perf' }">
              <label>Prefijo</label>
              <div v-if="prefijosPlanosFrente.length === 1" class="pref-pill">{{ prefijosPlanosFrente[0].prefijo }}</div>
              <select v-else v-model="prefijoDirectoSeleccionado">
                <option v-for="p in prefijosPlanosFrente" :key="p.prefijo" :value="p.prefijo">{{ p.prefijo }}</option>
              </select>
            </div>
            <template v-else-if="definicion.clave === 'perf' || definicion.clave === 'iny' || definicion.clave === 'pull'">
              <div class="grid2">
                <div class="field">
                  <label>Zona</label>
                  <select v-model="nuevo.zona">
                    <option v-if="!zonas.length" value="">(sin zonas configuradas)</option>
                    <option v-for="z in zonas" :key="z" :value="z">{{ z || '(general)' }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Sostenimiento</label>
                  <select v-model="nuevo.sostenimiento">
                    <option v-for="s in sostenimientosDe(nuevo.zona)" :key="s" :value="s">{{ s }}</option>
                  </select>
                </div>
              </div>
              <div class="prefijo-row">
                <span class="prefijo-label">Prefijo:</span>
                <input v-model="nuevo.prefijo" type="text" class="prefijo-input" placeholder="Ej: VM07-" />
              </div>
            </template>

            <!-- Malla/Cable: zona y sostenimiento solo se preguntan si el
                 frente de verdad tiene más de una opción — con una sola (o
                 ninguna), no hay nada que elegir y se usa esa sola sin
                 pedirla. Nunca piden prefijo (eso es solo de Perforación/
                 Inyección/Pull Test). -->
            <div v-if="(definicion.clave === 'malla' || definicion.clave === 'cable') && (zonas.length > 1 || sostenimientosDe(nuevo.zona).length > 1)" class="grid2">
              <div v-if="zonas.length > 1" class="field">
                <label>Zona</label>
                <select v-model="nuevo.zona">
                  <option v-for="z in zonas" :key="z" :value="z">{{ z || '(general)' }}</option>
                </select>
              </div>
              <div v-if="sostenimientosDe(nuevo.zona).length > 1" class="field">
                <label>Sostenimiento</label>
                <select v-model="nuevo.sostenimiento">
                  <option v-for="s in sostenimientosDe(nuevo.zona)" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
            </div>

            <!-- Tipo / Diámetro (solo perforación) -->
            <div v-if="definicion.clave === 'perf'" class="grid2 ct-contents">
              <div class="field">
                <label>Tipo</label>
                <select v-model="nuevo.tipo">
                  <option v-for="t in TIPOS_PERNO" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div v-if="!hayCatalogoPernos" class="field">
                <label>Diámetro</label>
                <select v-model="nuevo.diametro">
                  <option v-for="d in DIAMETROS_PERNO" :key="d" :value="d">{{ d }}</option>
                  <option value="__otro__">Otro</option>
                </select>
              </div>
            </div>
            <div v-if="definicion.clave === 'perf' && !hayCatalogoPernos && nuevo.diametro === '__otro__'" class="field">
              <label>Diámetro (mm)</label>
              <input v-model="nuevo.diametroOtro" type="number" min="1" inputmode="numeric" placeholder="41" />
            </div>

            <!-- Tipo de malla + Código -->
            <template v-if="definicion.clave === 'malla'">
              <div class="field">
                <label>Tipo de malla</label>
                <select v-model="nuevo.tipo">
                  <option v-for="t in TIPOS_MALLA" :key="t" :value="t">{{ t }}</option>
                  <option value="__otro__">Otro</option>
                </select>
              </div>
              <div class="field">
                <label>Código</label>
                <input v-model="nuevo.codigo" type="text" class="mono" placeholder="Ej: M1" />
              </div>
            </template>
            <div v-if="definicion.clave === 'malla' && nuevo.tipo === '__otro__'" class="field">
              <label>Tipo de malla (especificar)</label>
              <input v-model="nuevo.tipoOtro" type="text" placeholder="Ej: Tecco 100/4" />
            </div>

            <!-- Tipo de cable -->
            <div v-if="definicion.clave === 'cable'" class="field">
              <label>Tipo</label>
              <select v-model="nuevo.tipo">
                <option v-for="t in TIPOS_CABLE" :key="t" :value="t">{{ t }}</option>
                <option value="__otro__">Otro</option>
              </select>
            </div>
            <div v-if="definicion.clave === 'cable' && nuevo.tipo === '__otro__'" class="field">
              <label>Tipo de cable (especificar)</label>
              <input v-model="nuevo.tipoOtro" type="text" placeholder="Ej: 25mm" />
            </div>

            <!-- Rango N° (todo menos malla; Inyección con control de pernos usa
                 la lista de pendientes de más abajo en su lugar) -->
            <div v-if="definicion.clave !== 'malla' && !(definicion.clave === 'iny' && frenteControlPernos)" class="rango-n">
              <div class="field"><label>N° inicio</label><input v-model="nuevo.n1" type="number" min="1" step="1" inputmode="numeric" class="mono" /></div>
              <div class="flecha">→</div>
              <div class="field"><label>N° fin (opc)</label><input v-model="nuevo.n2" type="number" min="1" step="1" inputmode="numeric" class="mono" /></div>
            </div>

            <!-- Longitud/Ubicación, Ancho×Largo, o solo Longitud (cable) -->
            <template v-if="definicion.clave === 'malla'">
              <div class="rango-n">
                <div class="field"><label>Ancho (m)</label><input v-model="nuevo.ancho" type="number" min="0" step="0.01" inputmode="decimal" /></div>
                <div class="flecha">×</div>
                <div class="field"><label>Largo (m)</label><input v-model="nuevo.largo" type="number" min="0" step="0.01" inputmode="decimal" /></div>
              </div>
              <div v-if="areaMallaPreview" class="area-preview">= <strong>{{ areaMallaPreview }}</strong> M2</div>
            </template>
            <div
              v-else-if="definicion.clave === 'perf' || (definicion.clave === 'iny' && !frenteControlPernos)"
              class="grid2"
              :style="definicion.clave === 'perf' && hayCatalogoPernos ? 'grid-template-columns: 1fr' : ''"
            >
              <div class="field"><label>Longitud por perno (ML)</label><input v-model="nuevo.cantidad" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /></div>
              <div v-if="!(definicion.clave === 'perf' && hayCatalogoPernos)" class="field">
                <label>Ubicación</label>
                <select v-model="nuevo.ubicacion">
                  <option v-for="u in UBICACIONES_ELEMENTO" :key="u" :value="u">{{ u }}</option>
                </select>
              </div>
            </div>
            <!-- Inyección CON control de pernos: la longitud viene por fila en
                 la lista de pendientes de más abajo — acá solo queda elegir la
                 ubicación, compartida por todo lo que se agregue de una vez
                 (o nada, si el catálogo ya la resuelve sola por código). -->
            <div v-else-if="definicion.clave === 'iny' && frenteControlPernos" class="field">
              <template v-if="!hayCatalogoPernos">
                <label>Ubicación</label>
                <select v-model="nuevo.ubicacion">
                  <option v-for="u in UBICACIONES_ELEMENTO" :key="u" :value="u">{{ u }}</option>
                </select>
              </template>
            </div>
            <div v-else-if="definicion.clave === 'cable'" class="field">
              <label>Longitud (ML)</label>
              <input v-model="nuevo.cantidad" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />
            </div>

            <!-- Pull Test no lleva tipo, diámetro, letra, longitud ni ubicación —
                 solo el prefijo (arriba) y el rango N° (arriba también). -->

            <p v-if="avisoRechazados.length" class="alert alert-amber" style="margin: 0 0 8px">
              <i class="ti ti-alert-triangle" />
              <span>No se agregaron (código duplicado): {{ avisoRechazados.join(', ') }}</span>
            </p>

            <button
              v-if="!(definicion.clave === 'iny' && frenteControlPernos)"
              type="button"
              class="ctrl-add-btn"
              style="width: 100%"
              @click="agregarElementos"
            >
              <i class="ti ti-plus" /> Agregar
            </button>

            <!-- Inyección CON control de pernos: lista de pendientes de la
                 zona elegida en vez de un rango — solo se puede marcar lo que
                 ya está perforado y sin inyectar. -->
            <template v-else>
              <div v-if="!pendientesZonaActual.length && !regularizarAbierto" class="empty-msg">
                No hay pernos pendientes de inyectar en esta zona.
              </div>
              <template v-else-if="!regularizarAbierto">
                <div class="chips-cab">
                  <span>{{ filasIny.filter((f) => f.marcado).length }} de {{ filasIny.length }} seleccionados</span>
                  <button type="button" class="chips-todos" @click="todosMarcadosIny = !todosMarcadosIny">
                    {{ todosMarcadosIny ? 'Quitar todos' : 'Seleccionar todos' }}
                  </button>
                </div>
                <div class="chips-iny">
                  <button v-for="f in filasIny" :key="f.codigo" type="button" class="chip-iny mono"
                    :class="{ on: f.marcado }" :aria-pressed="f.marcado" :disabled="!(Number(f.ml) > 0)"
                    :title="Number(f.ml) > 0 ? '' : 'Este perno no tiene longitud perforada; usa Regularizar'" @click="f.marcado = !f.marcado">{{ f.codigo }}</button>
                </div>
                <button type="button" class="ctrl-add-btn" style="width: 100%" :disabled="!filasIny.some((f) => f.marcado)" @click="confirmarInyeccionSeleccion">
                  <i class="ti ti-plus" /> Agregar {{ filasIny.filter((f) => f.marcado).length || '' }} seleccionados
                </button>
              </template>

              <button type="button" class="link-btn" @click="regularizarAbierto = !regularizarAbierto">
                {{ regularizarAbierto ? 'Cancelar regularización' : '¿Un código que no aparece arriba? Regularizar' }}
              </button>
              <template v-if="regularizarAbierto">
                <div class="grid2">
                  <div class="field"><label>Código</label><input v-model="regularizarForm.codigo" type="text" class="mono" /></div>
                  <div class="field"><label>Longitud (ML)</label><input v-model="regularizarForm.ml" type="number" min="0" step="0.01" inputmode="decimal" /></div>
                </div>
                <div class="field">
                  <label>Motivo (obligatorio)</label>
                  <textarea v-model="regularizarForm.motivo" rows="2" placeholder="Por qué este código no estaba en la lista de perforados…" />
                </div>
                <button
                  type="button"
                  class="ctrl-add-btn"
                  style="width: 100%"
                  :disabled="!regularizarForm.codigo.trim() || !regularizarForm.ml || !regularizarForm.motivo.trim()"
                  @click="confirmarRegularizar"
                >
                  <i class="ti ti-plus" /> Regularizar e inyectar
                </button>
              </template>
            </template>
          </div>

          <div v-if="elementosDelTipo.length" class="hr-link hr-grupo">
            <button type="button" class="hr-btn" :class="{ falta: !horaGrupo.inicio }" @click="alternarHora('grupo')">
              <i class="ti ti-clock" />{{ horaGrupo.inicio ? `${horaGrupo.inicio} – ${horaGrupo.fin || '?'}` : 'Agregar hora' }}
            </button>
            <div v-if="horaAbierta.grupo" class="hr-par">
              <select :value="horaGrupo.inicio" aria-label="Inicio" @change="fijarHoraGrupo('horaInicio', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in opcionesHora(horaGrupo.inicio)" :key="h" :value="h">{{ h }}</option>
              </select>
              <span>–</span>
              <select :value="horaGrupo.fin" aria-label="Fin" @change="fijarHoraGrupo('horaFin', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in opcionesHora(horaGrupo.fin)" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>

          <div v-if="elementosDelTipo.length" style="overflow-x: auto">
          <table data-sin-filtro class="ctrl-table">
            <thead>
              <tr>
                <th>Código</th>
                <th v-if="definicion.clave === 'perf'">Tipo/Ø</th>
                <th v-if="definicion.clave === 'malla'">Tipo malla</th>
                <th style="text-align: right">Cant.</th>
                <th v-if="conUbicacion">Ubic.</th>
                <th style="width: 28px" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in elementosDelTipo" :key="e.id">
                <td class="mono">
                  {{ e.codigo || '—' }}
                  <span v-if="e.regularizado" class="nota-inline" title="Regularizado">⚑</span>
                </td>
                <td v-if="definicion.clave === 'perf'">
                  {{ e.tipo || '—' }}
                  <input
                    type="text"
                    class="tabla-input diametro-input"
                    :value="e.diametro"
                    placeholder="Ø"
                    @change="actualizarElementoCampo(e.id, 'diametro', $event.target.value)"
                  />
                </td>
                <td v-if="definicion.clave === 'malla'">
                  <select class="tabla-input" :value="e.tipo || ''" @change="cambiarTipoMalla(e.id, $event)">
                    <option v-for="t in opcionesTipoMallaPara(e.tipo)" :key="t" :value="t">{{ t }}</option>
                    <option value="__otro__">Otro…</option>
                  </select>
                </td>
                <td style="text-align: right">{{ e.cantidad }} {{ e.unidad }}</td>
                <td v-if="conUbicacion">
                  <select
                    v-if="definicion.clave !== 'iny'"
                    class="tabla-input"
                    :value="e.ubicacion"
                    @change="actualizarElementoCampo(e.id, 'ubicacion', $event.target.value)"
                  >
                    <option v-for="u in opcionesUbicacionPara(e.ubicacion)" :key="u" :value="u">{{ u }}</option>
                  </select>
                  <!-- Inyección: la ubicación es la del perno, no se edita acá
                       — si está mal, se corrige en la Perforación de ese
                       mismo código (o en el catálogo), nunca aparte, para
                       que no vuelvan a quedar desincronizadas entre sí. -->
                  <span v-else class="mono" :title="'Ubicación del perno (' + (e.ubicacion || 'sin catálogo') + '), no editable acá'">
                    {{ e.ubicacion || '—' }}
                  </span>
                </td>
                <td style="text-align: center">
                  <button type="button" class="del-btn" aria-label="Eliminar" @click="quitarElemento(e.id)"><i class="ti ti-x" /></button>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </template>
      </div>
    </div>

    <!-- ── BLOQUE 3 ── -->
    <div class="card blq-card" style="border-left-color: var(--green)">
      <div class="blq-head" @click="alternarBloque(3)">
        <span class="blq-titulo" style="color: var(--green)"><i class="ti ti-tools" />3. Actividades complementarias</span>
        <span class="blq-cnt" :class="{ si: conAvance[3] }">{{ conAvance[3] ? `${conAvance[3]} con avance` : 'Sin avance' }}</span>
        <i class="ti" :class="bloqueAbierto === 3 ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--green)" />
      </div>

      <div v-if="bloqueAbierto === 3" style="margin-top: 10px">
        <div
          v-for="p in partidasDe('3')"
          :key="p.codigo"
          class="blq-row"
          :class="{ 'has-val': tieneValor(p.codigo) }"
          style="--row-accent: var(--green)"
        >
          <div class="blq-row-top">
            <span class="blq-row-title">{{ p.nombre }}</span>
            <span class="unit-pill">{{ p.unidad }}</span>
          </div>
          <div class="blq-row-bottom">
            <span class="blq-row-label">Cantidad ejecutada</span>
            <div class="stepper">
              <button type="button" class="stepper-btn" aria-label="Restar" @click="escalonar(p, '3', -1)">−</button>
              <input
                :value="cantidadDe(p.codigo)"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                class="stepper-input"
                @change="fijarMetrado(p, '3', 'cantidad', $event.target.value)"
              />
              <button type="button" class="stepper-btn" aria-label="Sumar" @click="escalonar(p, '3', 1)">+</button>
            </div>
          </div>
          <div v-if="tieneValor(p.codigo)" class="hr-link">
            <button type="button" class="hr-btn" :class="{ falta: !metradoDe(p.codigo)?.horaInicio }" @click="alternarHora(p.codigo)">
              <i class="ti ti-clock" />{{ etiquetaHora(metradoDe(p.codigo)) }}
            </button>
            <div v-if="horaAbierta[p.codigo]" class="hr-par">
              <select :value="metradoDe(p.codigo)?.horaInicio ?? ''" aria-label="Inicio" @change="fijarMetrado(p, '3', 'horaInicio', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in opcionesHora(metradoDe(p.codigo)?.horaInicio)" :key="h" :value="h">{{ h }}</option>
              </select>
              <span>–</span>
              <select :value="metradoDe(p.codigo)?.horaFin ?? ''" aria-label="Fin" @change="fijarMetrado(p, '3', 'horaFin', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in opcionesHora(metradoDe(p.codigo)?.horaFin)" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── PARTIDAS LIBRES ── -->
    <div class="card blq-card">
      <div class="blq-head" @click="libresAbierto = !libresAbierto">
        <span class="blq-titulo"><i class="ti ti-circle-plus" />Partidas libres</span>
        <i class="ti" :class="libresAbierto ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--text3)" />
      </div>

      <div v-if="libresAbierto" style="margin-top: 10px">
        <p class="note" style="margin-bottom: 10px">Para actividades que no están en los bloques.</p>
        <div class="grid2">
          <div class="field ancho"><label>Nombre</label><input v-model="nuevaLibre.nombre" type="text" placeholder="Nombre de la partida" /></div>
          <div class="field">
            <label>U.M.</label>
            <select v-model="nuevaLibre.unidad">
              <option value="">—</option>
              <option v-for="u in UNIDADES" :key="u" :value="u">{{ u }}</option>
            </select>
          </div>
          <div class="field"><label>Metrado</label><input v-model="nuevaLibre.cantidad" type="number" step="0.01" inputmode="decimal" placeholder="0.00" /></div>
        </div>

        <p v-if="sugerenciaLibre" class="alert alert-amber" style="margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px">
          <span>
            <i class="ti ti-alert-triangle" />
            ¿Buscabas <strong>{{ sugerenciaLibre.partida.codigo_edt }} · {{ sugerenciaLibre.partida.nombre }}</strong>
            ({{ sugerenciaLibre.partida.unidad }})? Ya está en el cronograma de este frente.
          </span>
          <button type="button" class="link-btn" style="white-space: nowrap" @click="usarSugerenciaLibre">Usar esta</button>
        </p>

        <button type="button" class="add-btn" @click="agregarLibre"><i class="ti ti-plus" /> Agregar partida</button>

        <ul v-if="libres.length" class="lista-filas">
          <li v-for="m in libres" :key="m.id">
            <span>{{ m.partidaNombre }} — {{ m.cantidad }} {{ m.unidad }}</span>
            <button type="button" class="del-btn" aria-label="Quitar" @click="quitarLibre(m.id)"><i class="ti ti-x" /></button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.blq-card {
  border-left: 4px solid var(--border-md);
}
.blq-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.blq-cnt {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  background: var(--surface2);
  color: var(--text2);
  white-space: nowrap;
}
.blq-cnt.si {
  background: var(--green-bg);
  color: var(--green-text);
}
.blq-titulo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text2);
}
.blq-titulo i {
  font-size: 15px;
}

/* Lista de pendientes de Inyección (control de pernos) */
.chk-todos {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text2);
  padding: 4px 2px 8px;
}
.chips-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text2);
  padding: 2px 2px 8px;
}
.chips-todos {
  background: none;
  border: none;
  color: var(--amber);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.chips-iny {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
  padding-bottom: 10px;
}
.chip-iny {
  height: 40px;
  border-radius: 999px;
  border: 1px solid var(--border-md);
  background: transparent;
  color: var(--text2);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip-iny:disabled { opacity: 0.4; cursor: not-allowed; }
.chip-iny.on {
  background: var(--amber);
  border-color: var(--amber);
  color: #14161a;
}
.fila-pendiente {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 2px;
  border-bottom: 1px solid var(--border-md);
}
.chk-pendiente {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.ml-pendiente {
  width: 76px;
  text-align: right;
}
.link-btn {
  width: 100%;
  background: none;
  border: none;
  color: var(--amber);
  font-size: 12.5px;
  font-weight: 700;
  padding: 8px 0;
  cursor: pointer;
  text-align: center;
}

/* Aviso fino y hora compacta de cada partida */
.aviso-bitacora {
  display: flex;
  gap: 8px;
  padding: 9px 12px;
  margin-bottom: 10px;
  border-radius: 12px;
  background: var(--amber-bg);
  color: var(--amber-text);
  font-size: 12.5px;
  font-weight: 600;
}
.hr-link {
  margin-top: 4px;
}
.hr-grupo {
  margin: 0 0 10px;
}
.hr-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 6px;
  margin-left: -6px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text2);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.hr-btn.falta {
  color: var(--blue-text);
}
.hr-par {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.hr-par select {
  flex: 1;
  min-width: 0;
  height: 36px;
  border-radius: 9px;
  border: 1px solid var(--border-md);
  background: var(--surface2);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  padding: 0 6px;
}
.hr-par span {
  color: var(--text2);
}

/* Formulario de críticas en dos columnas (los campos de ancho completo ocupan
   las dos; Prefijo|Tipo y N° inicio|N° fin van lado a lado). */
.ctrl-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;
}
.ctrl-form > * {
  grid-column: 1 / -1;
  min-width: 0;
}
.ctrl-form > .mitad,
.ctrl-form > .ct-contents > .field {
  grid-column: auto;
}
.ctrl-form > .ct-contents {
  display: contents;
}
.ctrl-form .rango-n {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.ctrl-form .rango-n .flecha {
  display: none;
}
.pref-pill {
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--surface2);
  font-weight: 800;
  font-family: ui-monospace, monospace;
}
/* Chevron en los desplegables, para que se vea que se pueden cambiar. */
.rdc-app.formulario select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236F6B63' stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.ver-avance {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  margin-bottom: 10px;
  border: 1px solid var(--border-md);
  border-radius: 12px;
  background: var(--surface2);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}
</style>

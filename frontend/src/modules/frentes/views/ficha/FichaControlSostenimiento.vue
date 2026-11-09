<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { obtenerConteo, listarPernos, listarMalla, listarCable, obtenerUmbrales, listarPernosBiblioteca } from '../../../avance/services/avanceService'
import { useAuthStore } from '../../../../store/auth'
import CambiarCodigoPernoModal from '../../components/CambiarCodigoPernoModal.vue'
import { compararCodigoNatural } from '../../../avance/utils/ordenNatural'
import { conTiempoLimite } from '../../../../utils/conTiempoLimite'
import { formatearNumero } from '../../../../utils/formatearNumero'
import { descargarExcel } from '../../../../utils/exportarExcel'

// Era AvanceSostenimientoView.vue (módulo "avance", con su propio selector
// de frente) — ahora vive como pestaña de la ficha del frente, así que el
// frente ya no se elige acá: llega por prop desde la ruta, y cualquier
// cambio de frente (navegar entre fichas sin recargar la página) dispara
// una recarga completa, cosa que la versión original no necesitaba porque
// el supervisor cambiaba de frente con su propio <select>.
const props = defineProps({
  frenteId: { type: String, required: true },
})

const auth = useAuthStore()
const cargando = ref(false)
const error = ref('')

// ---- Cambiar el código de un perno ya reportado ------------------------------
// Para cuando cambia el plano y la numeración (ZCM05): el perno físico es el
// mismo, solo cambia su código. Se hace en un cuadro propio
// (CambiarCodigoPernoModal) y solo lo ve quien puede editar reportes de todos.
const puedeEditarCodigo = computed(() => auth.tienePermiso('rdc.editar_todos'))
const pernoEnEdicion = ref(null)
const avisoCodigo = ref('')
function alCambiarCodigo(mensaje) {
  avisoCodigo.value = mensaje
  pernoEnEdicion.value = null
  cargar(props.frenteId, { suave: true })
}

const conteo = ref([])
const pernos = ref([])
const malla = ref([])
const cable = ref([])
const umbrales = ref({ diasAmbar: 3, diasRojo: 7 })
const catalogoPernos = ref([])

const tab = ref('pernos')
const zonaFiltro = ref('')
watch(tab, () => (zonaFiltro.value = ''))
const ubicacionFiltro = ref('')
watch(tab, () => (ubicacionFiltro.value = ''))

// Búsqueda libre (mismo patrón que Almacén/Catálogo): un solo recuadro que
// busca por código, zona, ubicación, fecha o "perf"/"iny" — en vez de
// obligar a usar los selects de Zona/Estado para todo. Se combina con esos
// filtros (AND), no los reemplaza.
const busqueda = ref('')
watch(tab, () => (busqueda.value = ''))
const normalizarTextoBusqueda = (s) => (s ?? '').toString().toLowerCase()
function coincideBusqueda(...campos) {
  const q = normalizarTextoBusqueda(busqueda.value).trim()
  if (!q) return true
  return normalizarTextoBusqueda(campos.filter(Boolean).join(' ')).includes(q)
}

const anclaTabla = ref(null)
// Resúmenes por zona / ubicación: plegados por defecto, se abren con su botón.
const mostrarZonas = ref(false)
const mostrarUbic = ref(false)
function irA(tabDestino, estado = '') {
  tab.value = tabDestino
  estadoFiltro.value = estado
  nextTick(() => anclaTabla.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

// `suave: true` = actualizar los datos SIN vaciar la pantalla ni mostrar
// "Cargando…" (se usa después de cambiar un código: la tabla sigue a la vista
// y se refresca sola). Sin eso, un cambio dejaba la pantalla en blanco hasta
// que la consulta respondía — y si se colgaba, había que dar F5.
async function cargar(id, { suave = false } = {}) {
  if (!suave) {
    zonaFiltro.value = ''
    ubicacionFiltro.value = ''
    conteo.value = []
    pernos.value = []
    malla.value = []
    cable.value = []
    catalogoPernos.value = []
  }
  if (!id) return
  if (!suave) cargando.value = true
  error.value = ''
  try {
    // Con tiempo límite: una consulta colgada ya no deja "Cargando…" para siempre.
    const [u, c, p, m, cb, catalogo] = await conTiempoLimite(
      Promise.all([
        obtenerUmbrales(id),
        obtenerConteo(id),
        listarPernos(id),
        listarMalla(id),
        listarCable(id),
        listarPernosBiblioteca(id),
      ]),
      20000,
      'La consulta tardó demasiado.'
    )
    umbrales.value = u
    conteo.value = c
    pernos.value = p
    malla.value = m
    cable.value = cb
    catalogoPernos.value = catalogo
  } catch (e) {
    console.error(e)
    error.value = `No se pudo ${suave ? 'actualizar' : 'cargar'} el avance de este frente${e?.message ? ': ' + e.message : '.'}`
  } finally {
    cargando.value = false
  }
}
watch(() => props.frenteId, (id) => cargar(id), { immediate: true })

// Totales de PERNOS del frente completo (todas las zonas juntas), para las
// tarjetas resumen de arriba — acá sí tiene sentido sumar: un perno está
// perforado o no, más allá de su diámetro. Malla y Cable NO se suman en
// ningún total único: un frente puede tener más de un tipo (Tecco, Triple
// Torsión…) y sumar sus m²/ML mezclaría cosas que no se pueden sumar — van
// con su propio desglose por tipo dentro de cada pestaña, más abajo, igual
// que los controla la hoja CONTROL_SOSTENIMIENTO del Excel (una fila por
// elemento, con su Tipo, nunca agregada).
const totales = computed(() => {
  const t = { perforados: 0, inyectados: 0, pendientes: 0 }
  for (const c of conteo.value) {
    t.perforados += c.perforados
    t.inyectados += c.inyectados
    t.pendientes += c.pendientes
  }
  return t
})

const normalizarCodigo = (c) => (c ?? '').trim().toUpperCase()

// Metros lineales del frente completo, para mostrarlos al lado de los totales.
const sumar = (filas, campo) => filas.reduce((t, f) => t + (Number(f[campo]) || 0), 0)
const mlPerforados = computed(() => sumar(pernos.value, 'perforacion_ml'))
const mlInyectados = computed(() => sumar(pernos.value.filter((p) => p.estado === 'inyectado'), 'inyeccion_ml'))

// Antes no se podía saber "cuántos pernos del plano todavía no se
// perforaron" — no existía ningún catálogo contra el cual comparar lo
// reportado. Con el catálogo subido, un código del plano que no aparece
// en `pernos` (que solo trae lo YA perforado, vía fn_rdc_pernos_estado) es
// justamente eso: una fila "virtual" con estado 'sin_perforar', para que
// aparezca en la misma tabla y se pueda filtrar igual que perforado/inyectado.
const pernosCodigosReportados = computed(() => new Set(pernos.value.map((p) => p.codigo_norm)))
const pernosPendientesDePerforar = computed(() =>
  catalogoPernos.value
    .filter((c) => !pernosCodigosReportados.value.has(normalizarCodigo(c.codigo)))
    .map((c) => ({
      codigo: c.codigo,
      codigo_norm: normalizarCodigo(c.codigo),
      zona: c.zona,
      ubicacion: c.ubicacion,
      perforacion_ml: null,
      perforacion_fecha: null,
      inyeccion_fecha: null,
      estado: 'sin_perforar',
      dias_pendiente: null,
    })),
)
const pernosParaTabla = computed(() => [...pernos.value, ...pernosPendientesDePerforar.value])

// Desglose por tipo SIN el filtro de zona de la tabla de abajo — son las
// tarjetas de resumen de arriba, tienen que mostrar el total real del
// frente sin importar qué zona esté elegida en el filtro de la tabla.
function porTipo(filas, campoCantidad) {
  const mapa = new Map()
  for (const f of filas) {
    const tipo = f.tipo || 'Sin tipo'
    mapa.set(tipo, (mapa.get(tipo) ?? 0) + (Number(f[campoCantidad]) || 0))
  }
  return [...mapa.entries()].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => a.tipo.localeCompare(b.tipo))
}
const mallaPorTipoTotal = computed(() => porTipo(malla.value, 'area_m2'))
const cablePorTipoTotal = computed(() => porTipo(cable.value, 'longitud_ml'))

const zonaDe = (fila) => fila.zona || '(general)'

// La zona de un perno ya reportado sale del CATÁLOGO del plano cuando su código
// está ahí: en los reportes la zona se escribe a mano ("Zona 2" / "Zona 02") y
// así se partía una misma zona en dos. Si no está en el catálogo, vale la reportada.
const catalogoPorCodigo = computed(() => new Map(catalogoPernos.value.map((c) => [normalizarCodigo(c.codigo), c])))
// Igual que la zona: la ubicación (Cabecera, Cuerpo, Pie…) sale del catálogo del
// plano cuando el código está ahí, para que se cuente igual aunque el reporte la
// haya escrito distinto.
const ubicacionPernoDe = (p) =>
  catalogoPorCodigo.value.get(p.codigo_norm ?? normalizarCodigo(p.codigo))?.ubicacion || p.ubicacion || '(sin ubicación)'
const zonaPernoDe = (p) => catalogoPorCodigo.value.get(p.codigo_norm ?? normalizarCodigo(p.codigo))?.zona || zonaDe(p)

const estadoFiltro = ref('')
watch(tab, () => (estadoFiltro.value = ''))

const ORDEN_ESTADO_PERNO = { inyectado: 0, perforado: 1, sin_perforar: 2 }

const pernosFiltrados = computed(() =>
  [...pernosParaTabla.value]
    .filter((p) => !zonaFiltro.value || zonaPernoDe(p) === zonaFiltro.value)
    .filter((p) => !ubicacionFiltro.value || ubicacionPernoDe(p) === ubicacionFiltro.value)
    .filter((p) => !estadoFiltro.value || p.estado === estadoFiltro.value)
    .filter((p) =>
      coincideBusqueda(
        p.codigo,
        p.zona,
        p.ubicacion,
        fechaCorta(p.perforacion_fecha),
        fechaCorta(p.inyeccion_fecha),
        p.perforacion_fecha ? 'perforación perforado' : '',
        p.inyeccion_fecha ? 'inyección inyectado' : '',
      ),
    )
    // Primero lo ya ejecutado (inyectado), luego lo que falta inyectar y al final
    // lo que falta perforar; dentro de cada grupo, por código (G1, G2, … G10).
    .sort((a, b) => (ORDEN_ESTADO_PERNO[a.estado] ?? 9) - (ORDEN_ESTADO_PERNO[b.estado] ?? 9) || compararCodigoNatural(a.codigo, b.codigo)),
)
const mallaFiltrada = computed(() =>
  [...malla.value]
    .filter((m) => !zonaFiltro.value || zonaDe(m) === zonaFiltro.value)
    .filter((m) => coincideBusqueda(m.codigo, m.zona, m.tipo, fechaCorta(m.fecha)))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)),
)
const cableFiltrado = computed(() =>
  [...cable.value]
    .filter((c) => !zonaFiltro.value || zonaDe(c) === zonaFiltro.value)
    .filter((c) => coincideBusqueda(c.codigo, c.zona, c.tipo, fechaCorta(c.fecha)))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)),
)

// Estas sí respetan el filtro de zona de la tabla de abajo — "para esta
// zona (o todas), cuánto hay de cada tipo" (porTipo ya está declarado más
// arriba, para las tarjetas de resumen sin filtrar).
const mallaPorTipo = computed(() => porTipo(mallaFiltrada.value, 'area_m2'))
const cablePorTipo = computed(() => porTipo(cableFiltrado.value, 'longitud_ml'))

// Desglose por zona de lo que falta — solo tiene sentido mostrarlo cuando
// el frente tiene más de una zona (como VPM-03 con Zona 02/03); con una
// sola zona, el total de la tarjeta ya dice todo. Se cuenta solo contra el
// CATÁLOGO (rdc_pernos_biblioteca), nunca contra lo reportado: un frente de
// una sola zona real puede tener reportes con "zona" vacía o con un valor
// suelto sin sentido (p. ej. Barrera 5), y eso generaba un falso "2 zonas".
const zonasTotalesPernos = computed(() => [...new Set(catalogoPernos.value.map((p) => zonaDe(p)))].sort())
function contarPorZona(filas) {
  const mapa = new Map()
  for (const f of filas) {
    const z = zonaDe(f)
    mapa.set(z, (mapa.get(z) ?? 0) + 1)
  }
  return [...mapa.entries()].map(([zona, n]) => ({ zona, n })).sort((a, b) => a.zona.localeCompare(b.zona))
}
// Avance de cada zona del plano: cuántos pernos van inyectados sobre el total
// de la zona, y los ML perforados. "Terminada" = todos inyectados.
const resumenPorZona = computed(() => {
  const mapa = new Map()
  for (const c of catalogoPernos.value) {
    const z = zonaDe(c)
    if (!mapa.has(z)) mapa.set(z, { zona: z, total: 0, perforados: 0, inyectados: 0, ml: 0 })
    mapa.get(z).total++
  }
  for (const p of pernos.value) {
    const r = mapa.get(zonaPernoDe(p))
    if (!r) continue
    r.perforados++
    if (p.estado === 'inyectado') r.inyectados++
    r.ml += Number(p.perforacion_ml) || 0
  }
  return [...mapa.values()].sort((a, b) => a.zona.localeCompare(b.zona))
})
// Avance por UBICACIÓN contra el plano (catálogo): cuánto va y cuánto falta en
// Cabecera, Cuerpo, Pie… Respeta la zona elegida en el filtro, para ver "en la
// Zona 03, cuánto falta en cabecera".
const resumenPorUbicacion = computed(() => {
  const mapa = new Map()
  const enZona = (z) => !zonaFiltro.value || z === zonaFiltro.value
  for (const c of catalogoPernos.value) {
    if (!enZona(zonaDe(c))) continue
    const u = c.ubicacion || '(sin ubicación)'
    if (!mapa.has(u)) mapa.set(u, { ubicacion: u, total: 0, perforados: 0, inyectados: 0 })
    mapa.get(u).total++
  }
  for (const p of pernos.value) {
    if (!enZona(zonaPernoDe(p))) continue
    const r = mapa.get(ubicacionPernoDe(p))
    if (!r) continue
    r.perforados++
    if (p.estado === 'inyectado') r.inyectados++
  }
  return [...mapa.values()].sort((a, b) => a.ubicacion.localeCompare(b.ubicacion))
})
async function verUbicacion(ubicacion) {
  const zona = zonaFiltro.value
  irA('pernos')
  await nextTick() // el cambio de pestaña limpia los filtros; se ponen después
  zonaFiltro.value = zona
  ubicacionFiltro.value = ubicacion
}

async function verZona(zona) {
  irA('pernos')
  await nextTick() // el cambio de pestaña limpia el filtro de zona; se pone después
  zonaFiltro.value = zona
}

const sinPerforarPorZona = computed(() => contarPorZona(pernosPendientesDePerforar.value))
const faltaInyectarPorZona = computed(() => contarPorZona(pernos.value.filter((p) => p.estado === 'perforado')))

function colorAntiguedad(dias) {
  if (dias == null) return ''
  if (dias >= umbrales.value.diasRojo) return 'rojo'
  if (dias >= umbrales.value.diasAmbar) return 'ambar'
  return ''
}

function fechaCorta(f) {
  return f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-PE') : '—'
}

// ---- Exportar (botón Exportar de la ficha) -----------------------------------
// Un Excel con tres hojas — Pernos, Malla, Cable — con las mismas columnas de
// las tablas. Exporta todo el frente, sin los filtros de pantalla.
const ESTADO_PERNO = { inyectado: 'Inyectado', perforado: 'Falta inyectar', sin_perforar: 'Sin perforar' }
const fechaExcel = (f) => (f ? fechaCorta(f) : '')
const numExcel = (n) => (n == null || n === '' ? '' : Number(n))
const vacioSiNo = (filas, primera) => (filas.length ? filas : [{ [primera]: 'Sin registros' }])
async function exportar(nombreFrente) {
  const filasPernos = [...pernosParaTabla.value]
    .sort((a, b) => (ORDEN_ESTADO_PERNO[a.estado] ?? 9) - (ORDEN_ESTADO_PERNO[b.estado] ?? 9) || compararCodigoNatural(a.codigo, b.codigo))
    .map((p) => ({
      Código: p.codigo,
      Zona: zonaPernoDe(p) === '(general)' ? '' : zonaPernoDe(p),
      Ubicación: ubicacionPernoDe(p) === '(sin ubicación)' ? '' : ubicacionPernoDe(p),
      'Longitud (ML)': numExcel(p.perforacion_ml),
      Perforación: fechaExcel(p.perforacion_fecha),
      Inyección: fechaExcel(p.inyeccion_fecha),
      Estado: ESTADO_PERNO[p.estado] ?? p.estado,
      Días: numExcel(p.dias_pendiente),
    }))
  const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : compararCodigoNatural(a.codigo, b.codigo))
  const filasMalla = [...malla.value].sort(porFecha).map((m) => ({
    'Código de paño': m.codigo ?? '',
    Zona: m.zona ?? '',
    Tipo: m.tipo ?? '',
    'Área (m²)': numExcel(m.area_m2),
    Fecha: fechaExcel(m.fecha),
  }))
  const filasCable = [...cable.value].sort(porFecha).map((c) => ({
    Tramo: c.codigo ?? '',
    Zona: c.zona ?? '',
    Tipo: c.tipo ?? '',
    'Longitud (ML)': numExcel(c.longitud_ml),
    Fecha: fechaExcel(c.fecha),
  }))
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  const archivo = `Control_sostenimiento_${(nombreFrente || 'frente').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')}_${hoy}.xlsx`
  await descargarExcel(archivo, [
    { nombre: 'Pernos', filas: vacioSiNo(filasPernos, 'Código'), anchos: [14, 12, 24, 14, 13, 13, 15, 8] },
    { nombre: 'Malla', filas: vacioSiNo(filasMalla, 'Código de paño'), anchos: [16, 12, 22, 12, 13] },
    { nombre: 'Cable', filas: vacioSiNo(filasCable, 'Tramo'), anchos: [24, 12, 14, 15, 13] },
  ])
}
const listoParaExportar = computed(() => !cargando.value && !error.value)
defineExpose({ exportar, listoParaExportar })
</script>

<template>
  <div class="pl-col">
    <p v-if="error" class="error">
      {{ error }}
      <button type="button" class="reintentar" @click="cargar(frenteId)">Reintentar</button>
    </p>

    <p v-if="cargando" class="pl-empty">Cargando…</p>

    <template v-else>
      <div class="pl-kpis">
        <button type="button" class="pl-kpi" @click="irA('pernos')">
          <div class="l">Perforados</div>
          <div class="v">
            {{ totales.perforados }}<span v-if="catalogoPernos.length" class="sobre-total">/{{ catalogoPernos.length }}</span>
          </div>
          <div v-if="mlPerforados" class="s">{{ formatearNumero(mlPerforados) }} ML</div>
        </button>
        <button type="button" class="pl-kpi" @click="irA('pernos', 'inyectado')">
          <div class="l">Inyectados</div>
          <div class="v">
            {{ totales.inyectados }}<span v-if="catalogoPernos.length" class="sobre-total">/{{ catalogoPernos.length }}</span>
          </div>
          <div v-if="mlInyectados" class="s">{{ formatearNumero(mlInyectados) }} ML</div>
        </button>
        <button v-if="catalogoPernos.length" type="button" class="pl-kpi" @click="irA('pernos', 'sin_perforar')">
          <div class="l">Falta perforar</div>
          <div class="v" :style="pernosPendientesDePerforar.length > 0 ? 'color: var(--p-amber-txt)' : ''">{{ pernosPendientesDePerforar.length }}</div>
          <div v-if="zonasTotalesPernos.length > 1" class="s">
            <span v-for="z in sinPerforarPorZona" :key="z.zona" class="zona-n">{{ z.zona }}: {{ z.n }}</span>
          </div>
        </button>
        <button type="button" class="pl-kpi" @click="irA('pernos', 'perforado')">
          <div class="l">Falta inyectar</div>
          <div class="v" :style="totales.pendientes > 0 ? 'color: var(--p-amber-txt)' : ''">{{ totales.pendientes }}</div>
          <div v-if="zonasTotalesPernos.length > 1" class="s">
            <span v-for="z in faltaInyectarPorZona" :key="z.zona" class="zona-n">{{ z.zona }}: {{ z.n }}</span>
          </div>
        </button>
        <button v-if="malla.length" type="button" class="pl-kpi" @click="irA('malla')">
          <div class="l">Malla instalada</div>
          <div class="v">{{ malla.length }}<span class="sobre-total"> paños</span></div>
          <div class="s">
            <span v-for="t in mallaPorTipoTotal" :key="t.tipo" class="zona-n">{{ t.tipo }}: {{ formatearNumero(t.total) }} m²</span>
          </div>
        </button>
        <button v-if="cable.length" type="button" class="pl-kpi" @click="irA('cable')">
          <div class="l">Cable instalado</div>
          <div class="v">{{ cable.length }}<span class="sobre-total"> tramos</span></div>
          <div class="s">
            <span v-for="t in cablePorTipoTotal" :key="t.tipo" class="zona-n">{{ t.tipo }}: {{ formatearNumero(t.total) }} ML</span>
          </div>
        </button>
      </div>

      <!-- Resumen compacto por zona y por ubicación: una fila de píldoras con
           su barra de avance, en vez de tarjetas grandes. Tocar una filtra la tabla. -->
      <!-- Botones de despliegue: los resúmenes arrancan plegados para no ocupar
           la pantalla; se abren cuando se necesitan. -->
      <div v-if="resumenPorZona.length > 1 || (catalogoPernos.length && resumenPorUbicacion.length > 1)" class="cmp-toggles">
        <button v-if="resumenPorZona.length > 1" type="button" class="cmp-toggle" :class="{ on: mostrarZonas }" :aria-expanded="mostrarZonas" @click="mostrarZonas = !mostrarZonas">
          Por zona <span class="cmp-cuenta">{{ resumenPorZona.length }}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <button v-if="catalogoPernos.length && resumenPorUbicacion.length > 1" type="button" class="cmp-toggle" :class="{ on: mostrarUbic }" :aria-expanded="mostrarUbic" @click="mostrarUbic = !mostrarUbic">
          Por ubicación <span class="cmp-cuenta">{{ resumenPorUbicacion.length }}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>

      <div v-if="mostrarZonas && resumenPorZona.length > 1" class="cmp-bloque">
        <div class="cmp-grid">
          <button
            v-for="z in resumenPorZona"
            :key="z.zona"
            type="button"
            class="cmp-item"
            :class="{ listo: z.inyectados === z.total }"
            :title="`${z.zona}: ${z.inyectados} de ${z.total} inyectados · ${z.perforados} perforados · ${formatearNumero(z.ml)} ML`"
            @click="verZona(z.zona)"
          >
            <span class="cmp-fila">
              <span class="cmp-nom">{{ z.zona }}<i v-if="z.inyectados === z.total" class="cmp-ok">✓</i></span>
              <span class="cmp-n"><b>{{ z.inyectados }}</b>/{{ z.total }}</span>
            </span>
            <span class="cmp-barra"><span :style="{ width: (z.total ? Math.round((z.inyectados / z.total) * 100) : 0) + '%' }"></span></span>
            <span class="cmp-sub">{{ z.perforados }} perf. · {{ formatearNumero(z.ml) }} ML</span>
          </button>
        </div>
      </div>

      <div v-if="mostrarUbic && catalogoPernos.length && resumenPorUbicacion.length > 1" class="cmp-bloque">
        <div v-if="zonaFiltro" class="ubic-titulo">Ubicaciones de {{ zonaFiltro }}</div>
        <div class="cmp-grid">
          <button
            v-for="u in resumenPorUbicacion"
            :key="u.ubicacion"
            type="button"
            class="cmp-item"
            :class="{ listo: u.inyectados === u.total }"
            :title="`${u.ubicacion}: ${u.inyectados} de ${u.total} inyectados · falta perforar ${u.total - u.perforados} · falta inyectar ${u.perforados - u.inyectados}`"
            @click="verUbicacion(u.ubicacion)"
          >
            <span class="cmp-fila">
              <span class="cmp-nom">{{ u.ubicacion }}<i v-if="u.inyectados === u.total" class="cmp-ok">✓</i></span>
              <span class="cmp-n"><b>{{ u.inyectados }}</b>/{{ u.total }}</span>
            </span>
            <span class="cmp-barra"><span :style="{ width: (u.total ? Math.round((u.inyectados / u.total) * 100) : 0) + '%' }"></span></span>
            <span class="cmp-sub">
              {{ u.inyectados === u.total ? 'todo inyectado' : `falta perf. ${u.total - u.perforados} · iny. ${u.perforados - u.inyectados}` }}
            </span>
          </button>
        </div>
      </div>

      <div ref="anclaTabla" class="pl-filters">
        <div class="chips" role="group" aria-label="Tipo de elemento">
          <button type="button" class="pl-seg" :class="{ on: tab === 'pernos' }" :aria-pressed="tab === 'pernos'" @click="tab = 'pernos'">Pernos<span class="n">{{ totales.perforados }}</span></button>
          <button type="button" class="pl-seg" :class="{ on: tab === 'malla' }" :aria-pressed="tab === 'malla'" @click="tab = 'malla'">Malla<span class="n">{{ malla.length }} paños</span></button>
          <button type="button" class="pl-seg" :class="{ on: tab === 'cable' }" :aria-pressed="tab === 'cable'" @click="tab = 'cable'">Cable<span class="n">{{ cable.length }} tramos</span></button>
        </div>
        <!-- Los filtros por zona, ubicación y estado ya no son listas sueltas:
             se hacen desde el embudito de cada encabezado de la tabla (tipo
             Excel). Los que se activan tocando un resumen de arriba se
             muestran aquí como etiquetas que se pueden quitar. -->
        <button v-if="zonaFiltro" type="button" class="filtro-activo" @click="zonaFiltro = ''">Zona: {{ zonaFiltro }} <span aria-hidden="true">✕</span></button>
        <button v-if="ubicacionFiltro" type="button" class="filtro-activo" @click="ubicacionFiltro = ''">Ubicación: {{ ubicacionFiltro }} <span aria-hidden="true">✕</span></button>
        <button v-if="estadoFiltro" type="button" class="filtro-activo" @click="estadoFiltro = ''">
          Estado: {{ estadoFiltro === 'sin_perforar' ? 'Falta perforar' : estadoFiltro === 'perforado' ? 'Falta inyectar' : 'Inyectados' }} <span aria-hidden="true">✕</span>
        </button>
        <label class="pl-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            v-model="busqueda"
            type="search"
            :aria-label="tab === 'pernos' ? 'Buscar perno' : 'Buscar'"
            :placeholder="tab === 'pernos' ? 'Buscar código, zona, ubicación, fecha, perf./iny.…' : 'Buscar código, zona, tipo, fecha…'"
          />
        </label>
      </div>

      <p v-if="avisoCodigo" class="aviso-codigo" role="status">
        {{ avisoCodigo }}
        <button type="button" aria-label="Cerrar aviso" @click="avisoCodigo = ''">✕</button>
      </p>
      <div v-if="tab === 'pernos'" class="pl-table">
        <div class="in">
          <div class="pl-th c-pernos">
            <span>CÓDIGO</span><span>ZONA</span><span>UBICACIÓN</span><span class="pl-r">LONGITUD (ML)</span>
            <span>PERFORACIÓN</span><span>INYECCIÓN</span><span>ESTADO</span><span class="pl-r">DÍAS</span>
          </div>
          <div v-for="p in pernosFiltrados" :key="p.codigo_norm" class="pl-tr c-pernos" :class="colorAntiguedad(p.dias_pendiente)">
            <span class="mono pl-strong">
              {{ p.codigo }}
              <button
                v-if="puedeEditarCodigo && p.estado !== 'sin_perforar'"
                type="button"
                class="ed-lapiz"
                title="Cambiar el código de este perno"
                aria-label="Cambiar el código de este perno"
                @click="pernoEnEdicion = p"
              >✎</button>
            </span>
            <span>{{ zonaPernoDe(p) === '(general)' ? '—' : zonaPernoDe(p) }}</span>
            <span>{{ ubicacionPernoDe(p) === '(sin ubicación)' ? '—' : ubicacionPernoDe(p) }}</span>
            <span class="pl-r">{{ formatearNumero(p.perforacion_ml) }}</span>
            <span>{{ fechaCorta(p.perforacion_fecha) }}</span>
            <span>{{ fechaCorta(p.inyeccion_fecha) }}</span>
            <span>
              <span class="pl-sp" :class="p.estado === 'inyectado' ? 'ok' : p.estado === 'sin_perforar' ? 'low' : 'warn'">
                {{ p.estado === 'inyectado' ? 'Inyectado' : p.estado === 'sin_perforar' ? 'Sin perforar' : 'Falta inyectar' }}
              </span>
            </span>
            <span class="pl-r"><strong v-if="p.dias_pendiente != null" class="dias-pendiente">{{ p.dias_pendiente }}</strong><template v-else>—</template></span>
          </div>
          <div v-if="!pernosFiltrados.length" class="pl-vacio">No hay pernos para mostrar.</div>
        </div>
      </div>
      <p v-if="tab === 'pernos'" class="nota-pie">
        Orden natural por código (P4, P5 … P10, P46). Días pendiente en ámbar desde {{ umbrales.diasAmbar }} días y en
        rojo desde {{ umbrales.diasRojo }} (se configura en Configuración).
      </p>

      <template v-else-if="tab === 'malla'">
        <div v-if="mallaPorTipo.length" class="pl-table">
          <div class="in">
            <div class="pl-th c-tipo"><span>TIPO</span><span class="pl-r">ÁREA (M²)</span></div>
            <div v-for="t in mallaPorTipo" :key="t.tipo" class="pl-tr c-tipo"><span class="pl-semi">{{ t.tipo }}</span><span class="pl-r pl-strong">{{ formatearNumero(t.total) }}</span></div>
          </div>
        </div>
        <div class="pl-table">
          <div class="in">
            <div class="pl-th c-elem"><span>CÓDIGO DE PAÑO</span><span>ZONA</span><span>TIPO</span><span class="pl-r">ÁREA (M²)</span><span>FECHA</span></div>
            <div v-for="m in mallaFiltrada" :key="`${m.reporte_id}-${m.codigo_norm}`" class="pl-tr c-elem">
              <span class="mono pl-strong">{{ m.codigo }}</span><span>{{ m.zona || '—' }}</span><span>{{ m.tipo || '—' }}</span>
              <span class="pl-r">{{ formatearNumero(m.area_m2) }}</span><span>{{ fechaCorta(m.fecha) }}</span>
            </div>
            <div v-if="!mallaFiltrada.length" class="pl-vacio">No hay malla para mostrar.</div>
          </div>
        </div>
        <p class="nota-pie">Desglosado por tipo — sumar tipos distintos de malla en un solo total no tendría sentido.</p>
      </template>

      <template v-else>
        <div v-if="cablePorTipo.length" class="pl-table">
          <div class="in">
            <div class="pl-th c-tipo"><span>TIPO</span><span class="pl-r">LONGITUD (ML)</span></div>
            <div v-for="t in cablePorTipo" :key="t.tipo" class="pl-tr c-tipo"><span class="pl-semi">{{ t.tipo }}</span><span class="pl-r pl-strong">{{ formatearNumero(t.total) }}</span></div>
          </div>
        </div>
        <div class="pl-table">
          <div class="in">
            <div class="pl-th c-elem"><span>TRAMO</span><span>ZONA</span><span>TIPO</span><span class="pl-r">LONGITUD (ML)</span><span>FECHA</span></div>
            <div v-for="c in cableFiltrado" :key="`${c.reporte_id}-${c.codigo}`" class="pl-tr c-elem">
              <span class="mono pl-strong">{{ c.codigo }}</span><span>{{ c.zona || '—' }}</span><span>{{ c.tipo || '—' }}</span>
              <span class="pl-r">{{ formatearNumero(c.longitud_ml) }}</span><span>{{ fechaCorta(c.fecha) }}</span>
            </div>
            <div v-if="!cableFiltrado.length" class="pl-vacio">No hay cable para mostrar.</div>
          </div>
        </div>
        <p class="nota-pie">Desglosado por tipo — sumar tipos distintos de cable en un solo total no tendría sentido.</p>
      </template>
    </template>
  
    <CambiarCodigoPernoModal
      v-if="pernoEnEdicion"
      :frente-id="frenteId"
      :perno="pernoEnEdicion"
      :catalogo="catalogoPernos"
      :reportados="pernos"
      @cerrar="pernoEnEdicion = null"
      @listo="alCambiarCodigo"
    />
  </div>
</template>

<style scoped>
.ed-lapiz {
  border: 0;
  background: transparent;
  color: var(--p-muted);
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.ed-lapiz {
  opacity: 0.5;
}
.pl-tr:hover .ed-lapiz,
.ed-lapiz:focus-visible {
  opacity: 1;
}
.ed-lapiz:hover {
  background: var(--p-hover);
  color: inherit;
}
.reintentar {
  margin-left: 8px;
  border: 0;
  border-radius: 8px;
  padding: 4px 10px;
  background: var(--p-hover);
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.aviso-codigo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.12);
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.4);
  font-size: 14px;
  font-weight: 700;
  color: #22a05b;
}
.aviso-codigo button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
}
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
.chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.pl-filters .pl-search {
  flex: 1 1 260px;
}
.sobre-total {
  font-size: 16px;
  font-weight: 600;
  color: var(--p-faint);
}
.zona-n {
  margin-right: 10px;
}
.ubic-resumen {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.filtro-activo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(246, 168, 0, 0.18);
  color: var(--p-text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
/* Botones que despliegan los resúmenes */
.cmp-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cmp-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--p-card);
  box-shadow: 0 0 0 1px var(--p-line, rgba(128, 128, 128, 0.25));
  color: var(--p-text);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.cmp-toggle svg {
  transition: transform 0.15s;
  color: var(--p-faint);
}
.cmp-toggle.on {
  background: var(--p-text);
  color: var(--p-card);
}
.cmp-toggle.on svg {
  transform: rotate(180deg);
  color: inherit;
}
.cmp-cuenta {
  font-size: 11.5px;
  font-weight: 700;
  opacity: 0.65;
}
/* Resumen compacto por zona / ubicación */
.cmp-bloque {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cmp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
}
.cmp-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--p-card);
  box-shadow: 0 0 0 1px var(--p-line, rgba(128, 128, 128, 0.25));
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.cmp-item:hover {
  background: var(--p-hover);
}
.cmp-fila {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.cmp-nom {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--p-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.cmp-ok {
  font-style: normal;
  margin-left: 5px;
  color: var(--p-ok-fg);
}
.cmp-n {
  font-size: 12px;
  font-weight: 600;
  color: var(--p-faint);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cmp-n b {
  font-size: 15px;
  font-weight: 800;
  color: var(--p-text);
}
.cmp-item.listo .cmp-n b {
  color: var(--p-ok-fg);
}
.cmp-barra {
  height: 4px;
  border-radius: 999px;
  background: var(--p-chip, rgba(128, 128, 128, 0.2));
  overflow: hidden;
}
.cmp-barra > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #f6a800;
}
.cmp-item.listo .cmp-barra > span {
  background: var(--p-ok-fg);
}
.cmp-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--p-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ubic-titulo {
  font-size: 12px;
  font-weight: 700;
  color: var(--p-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.zona-listo {
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--p-ok-bg);
  color: var(--p-ok-fg);
  font-size: 11px;
  font-weight: 700;
}
.zona-ok {
  color: var(--p-ok-fg);
}
.c-pernos {
  grid-template-columns: 100px 120px minmax(160px, 1fr) 130px 120px 120px 140px 80px;
}
.c-tipo {
  grid-template-columns: minmax(160px, 1fr) 150px;
}
.c-elem {
  grid-template-columns: 150px 120px minmax(140px, 1fr) 130px 110px;
}
.mono {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
}
.pl-tr.ambar {
  background: var(--p-warn-bg);
}
.pl-tr.rojo {
  background: var(--p-low-bg);
}
.dias-pendiente {
  color: var(--p-amber-txt);
}
.nota-pie {
  font-size: 13px;
  color: var(--p-faint);
  margin: 0 2px;
}
</style>

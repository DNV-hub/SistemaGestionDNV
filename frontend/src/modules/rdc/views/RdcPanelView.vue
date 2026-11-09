<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { useFrentesStore } from '../../frentes/store/frentes'
import { ENVIO, ESTADO } from '../services/rdcDb'
import { hoyLocal, obtenerActualizacionCatalogo } from '../services/rdcRepository'
import { nombreDe } from '../services/rdcCalculos'
import { formatearNumero } from '../../../utils/formatearNumero'
import { descargarExcel } from '../../../utils/exportarExcel'
import { usarCabeceraPlaneamiento } from '../../planeamiento/composables/useCabeceraPlaneamiento'
import { useEsMovil } from '../../../composables/useEsMovil'
import RdcMovilSupervisor from '../components/RdcMovilSupervisor.vue'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'
import '../estilos/rdc-referencia.css'

// UN solo componente para todos los roles (rdc-referencia.html): el
// administrador/planeamiento ve todos los frentes y filtra por frente y
// supervisor; el supervisor ve solo lo suyo, con chips de frente y la tarjeta
// de Avance. Los datos son los de siempre: reportes locales + histórico
// remoto del store del RDC.
const rdc = useRdcStore()
const auth = useAuthStore()
const frentesStore = useFrentesStore()
const router = useRouter()

const esCampo = computed(() => ['Supervisor', 'Residencia'].includes(auth.nombreRol))
// En celular el Supervisor ve la versión móvil (RdcMovilSupervisor).
const esMovil = useEsMovil()
const movilSupervisor = computed(() => auth.nombreRol === 'Supervisor' && esMovil.value)
// Perfiles de Administración en celular: mismos datos, presentados en
// cuadrícula 2×2 + chips + lista de 2 líneas (RDC dentro de Planeamiento).
const movilAdmin = computed(() => esMovil.value && !esCampo.value)
const enLinea = computed(() => navigator.onLine)

onMounted(async () => {
  if (!esCampo.value) frentesStore.cargar()
  await rdc.iniciar()
  rdc.cargarHistorico()
})

const nombre = (clave, id) => nombreDe(rdc.catalogos, clave, id) || '—'
const fmtCorta = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '—')

// ---- Fechas: un reporte con fecha de AYER es un reporte al día ------------
// Los supervisores terminan y envían su reporte al día siguiente (lo cierran
// por la noche), así que el atraso se mide contra ayer, no contra hoy.
const hoy = hoyLocal()
function restarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ayer = restarDias(hoy, 1)

// ---- Reportes normalizados (locales + remotos) ---------------------------
function claveEstadoLocal(r) {
  if (r.estado === ESTADO.BORRADOR) return 'borrador'
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return 'enviado'
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return 'error'
  return 'pendiente'
}
function claveEstadoRemoto(r) {
  if (r.estado === ESTADO.BORRADOR) return 'borrador'
  if (r.estado_sharepoint === 'enviado') return 'enviado'
  if (r.estado_sharepoint === 'error') return 'error'
  return 'pendiente'
}

const propioSupervisorId = computed(() => rdc.supervisorPropio?.id ?? null)

const todos = computed(() => {
  const locales = rdc.reportes.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    frente: nombre('frentes', r.frenteId),
    supervisor: nombre('supervisores', r.supervisorId),
    clave: claveEstadoLocal(r),
    sharepoint: r.estadoSharepoint === ENVIO.ENVIADO ? 'enviado' : r.estadoSharepoint === ENVIO.ERROR ? 'error' : 'pendiente',
    esLocal: true,
    raw: r,
  }))
  let remotos = rdc.historicoRemoto
  // Un usuario de campo solo ve lo suyo, aunque el servidor devuelva más.
  if (esCampo.value) {
    remotos = remotos.filter((r) => r.creado_por === auth.perfil?.id || (propioSupervisorId.value && r.supervisor_id === propioSupervisorId.value))
  }
  const remotosItems = remotos.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    frente: r.frentes?.nombre ?? '—',
    supervisor: r.rdc_supervisores?.nombre ?? '—',
    clave: claveEstadoRemoto(r),
    sharepoint: r.estado_sharepoint === 'enviado' ? 'enviado' : r.estado_sharepoint === 'error' ? 'error' : 'pendiente',
    esLocal: false,
    raw: r,
  }))
  return [...locales, ...remotosItems].sort((a, b) => b.fecha.localeCompare(a.fecha))
})

const esFinalizado = (i) => i.clave !== 'borrador'

// ---- Frente seleccionado (solo campo) -------------------------------------
const frentesChips = computed(() => {
  const nombres = new Set(todos.value.map((i) => i.frente).filter((n) => n && n !== '—'))
  if (rdc.frenteActual?.nombre) nombres.add(rdc.frenteActual.nombre)
  return [...nombres].sort()
})
const frenteSel = computed(() => rdc.frenteActual?.nombre ?? frentesChips.value[0] ?? '')
function elegirFrente(nombreFrente) {
  const f = (rdc.catalogos?.frentes ?? []).find((x) => x.nombre === nombreFrente)
  if (f) rdc.elegirFrenteActual(f.id)
}

const delFrente = computed(() => (esCampo.value ? todos.value.filter((i) => i.frente === frenteSel.value) : todos.value))

// ---- Indicadores ----------------------------------------------------------
const frentesActivos = computed(() => (frentesStore.frentes ?? []).filter((f) => f.estado === 'activo'))
const alDia = computed(() => {
  const conReporte = new Set(todos.value.filter((i) => esFinalizado(i) && i.fecha >= ayer).map((i) => i.frente))
  return frentesActivos.value.filter((f) => conReporte.has(f.nombre))
})
const sinReporte = computed(() => {
  const conReporte = new Set(todos.value.filter((i) => esFinalizado(i) && i.fecha >= ayer).map((i) => i.frente))
  return frentesActivos.value.filter((f) => !conReporte.has(f.nombre)).map((f) => f.codigo || f.nombre)
})
const textoSinReporte = computed(() => {
  const n = sinReporte.value
  if (!n.length) return 'solo cuenta si falta el de ayer'
  return n.slice(0, 3).join(', ') + (n.length > 3 ? ` y ${n.length - 3} más` : '')
})
const borradores = computed(() => delFrente.value.filter((i) => i.clave === 'borrador').length)
const fallidos = computed(() => delFrente.value.filter((i) => i.sharepoint === 'error' && esFinalizado(i)).length)

const ultimoEnviado = computed(() => delFrente.value.find((i) => esFinalizado(i)) ?? null)
const ultimoTexto = computed(() => {
  const u = ultimoEnviado.value
  if (!u) return '—'
  if (u.fecha === hoy) return 'Hoy'
  if (u.fecha === ayer) return 'Ayer'
  return fmtCorta(u.fecha)
})
const ultimoAlDia = computed(() => !!ultimoEnviado.value && ultimoEnviado.value.fecha >= ayer)
const enviadosFrente = computed(() => delFrente.value.filter(esFinalizado).length)

// ---- Avance del frente (campo): mismos catálogos que ya descarga el RDC ----
const frenteId = computed(() => rdc.frenteActualId)
const controlActivo = computed(() => !!rdc.frenteActual?.rdc_control_pernos)
const pernosBiblioteca = computed(() => (rdc.catalogos?.pernos ?? []).filter((p) => p.frente_id === frenteId.value))
const pernosEstadoFrente = computed(() => (rdc.catalogos?.pernosEstado ?? []).filter((p) => p.frente_id === frenteId.value))
const totalCatalogo = computed(() => pernosBiblioteca.value.length)
const perforados = computed(() => pernosEstadoFrente.value.length)
const inyectados = computed(() => pernosEstadoFrente.value.filter((p) => p.estado === 'inyectado').length)
const faltaInyectar = computed(() => Math.max(perforados.value - inyectados.value, 0))
// Malla y Cable nunca se suman entre tipos distintos (Minax y Tecco, por
// ejemplo): se muestra un renglón por tipo.
function porTipo(filas, campo) {
  const mapa = new Map()
  for (const f of filas) {
    const tipo = f.tipo || 'Sin tipo'
    mapa.set(tipo, (mapa.get(tipo) ?? 0) + (Number(f[campo]) || 0))
  }
  return [...mapa.entries()].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => a.tipo.localeCompare(b.tipo))
}
const mallaPorTipo = computed(() => porTipo((rdc.catalogos?.mallaEstado ?? []).filter((f) => f.frente_id === frenteId.value), 'area_m2'))
const cablePorTipo = computed(() => porTipo((rdc.catalogos?.cableEstado ?? []).filter((f) => f.frente_id === frenteId.value), 'longitud_ml'))
const horaCatalogo = ref(null)
onMounted(async () => {
  const ts = await obtenerActualizacionCatalogo('pernosEstado')
  if (ts) horaCatalogo.value = new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
})
function irAControl(tipo) {
  router.push({ name: 'rdc-control-detalle', params: { tipo } })
}

// ---- Filtros --------------------------------------------------------------
const busqueda = ref('')
const filtroFrente = ref('')
const filtroSupervisor = ref('')
const filtroEstado = ref('')
const filtroFecha = ref('')

const opcionesFrente = computed(() => [...new Set(todos.value.map((i) => i.frente))].filter((n) => n !== '—').sort())
const opcionesSupervisor = computed(() => [...new Set(todos.value.map((i) => i.supervisor))].filter((n) => n !== '—').sort())

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return delFrente.value.filter((i) => {
    if (!esCampo.value && filtroFrente.value && i.frente !== filtroFrente.value) return false
    if (!esCampo.value && filtroSupervisor.value && i.supervisor !== filtroSupervisor.value) return false
    if (filtroEstado.value === 'Enviado' && !esFinalizado(i)) return false
    if (filtroEstado.value === 'Borrador' && esFinalizado(i)) return false
    if (filtroFecha.value && i.fecha !== filtroFecha.value) return false
    if (q && !`${i.frente} ${i.supervisor}`.toLowerCase().includes(q)) return false
    return true
  })
})

// ---- Celular (Administración) ---------------------------------------------
// Frentes activos que todavía no tienen su reporte de ayer, con su nombre
// completo (para poder filtrar la lista por ese frente al tocarlos).
const frentesSinReporte = computed(() => {
  const conReporte = new Set(todos.value.filter((i) => esFinalizado(i) && i.fecha >= ayer).map((i) => i.frente))
  return frentesActivos.value.filter((f) => !conReporte.has(f.nombre))
})
const verSinReporte = ref(false)
const hojaFiltro = ref(null) // 'frente' | 'supervisor' | null
function alternarSinReporte() {
  verSinReporte.value = !verSinReporte.value
}
function verFrenteSinReporte(f) {
  filtroFrente.value = f.nombre
  verSinReporte.value = false
}
function elegirEnHoja(valor) {
  if (hojaFiltro.value === 'frente') filtroFrente.value = valor
  else filtroSupervisor.value = valor
  hojaFiltro.value = null
}
const opcionesHoja = computed(() => (hojaFiltro.value === 'frente' ? opcionesFrente.value : opcionesSupervisor.value))
const valorHoja = computed(() => (hojaFiltro.value === 'frente' ? filtroFrente.value : filtroSupervisor.value))
const CHIPS_ESTADO = [
  ['', 'Todos'],
  ['Enviado', 'Enviado'],
  ['Borrador', 'Borrador'],
]

const PILL = {
  enviado: { clase: 'ok', texto: 'Enviado' },
  borrador: { clase: 'dr', texto: 'Borrador' },
  pendiente: { clase: 'dr', texto: 'Pendiente' },
  error: { clase: 'er', texto: 'Con problemas' },
}
function envioDe(i) {
  if (!esFinalizado(i)) return { texto: '—', clase: 'rx-envio-mut' }
  if (i.sharepoint === 'enviado') return { texto: 'SharePoint OK', clase: 'rx-envio-ok' }
  if (i.sharepoint === 'error') return { texto: 'Error', clase: 'rx-envio-er' }
  return { texto: 'Pendiente', clase: 'rx-envio-mut' }
}

// ---- Abrir / crear (misma lógica de siempre) ------------------------------
const adoptando = ref(false)
async function abrirItem(item) {
  if (item.esLocal) {
    if (item.raw.estado === ESTADO.BORRADOR) router.push({ name: 'rdc-editar', params: { id: item.id } })
    else router.push({ name: 'rdc-detalle', params: { id: item.id } })
    return
  }
  // Un borrador remoto viene de OTRO dispositivo: hay que traerlo entero y
  // adoptarlo para seguir editándolo. Los ya finalizados quedan en solo lectura.
  if (item.raw.estado === ESTADO.BORRADOR) {
    if (adoptando.value) return
    adoptando.value = true
    try {
      const reporte = await rdc.adoptarRemoto(item.id)
      if (reporte) router.push({ name: 'rdc-editar', params: { id: reporte.id } })
    } catch (e) {
      console.error(e)
      alert('No se pudo traer ese borrador. Revisa tu conexión e intenta de nuevo.')
    } finally {
      adoptando.value = false
    }
    return
  }
  router.push({ name: 'rdc-detalle', params: { id: item.id } })
}

// Mismo resguardo de siempre: si ya hay un reporte de hoy en este
// dispositivo (borrador o finalizado), se reabre en vez de crear uno nuevo.
async function nuevoReporte() {
  const deHoy = rdc.reportes.find((r) => r.fecha === hoyLocal())
  if (deHoy?.estado === ESTADO.FINALIZADO) {
    router.push({ name: 'rdc-detalle', params: { id: deHoy.id } })
    return
  }
  const reporte = deHoy ? await rdc.abrir(deHoy.id).then(() => rdc.actual) : await rdc.nuevo()
  // Como ya no se vuelve a preguntar el frente en el paso Datos, el personal
  // indirecto de Sala Eléctrica se ajusta acá si el frente cambió de sector.
  await rdc.ajustarPersonalIndirecto()
  router.push({ name: 'rdc-editar', params: { id: reporte.id } })
}

function exportar() {
  descargarExcel(`rdc_${hoy}.xlsx`, [
    {
      nombre: 'Reportes',
      filas: filtrados.value.map((i) => ({
        FECHA: i.fecha,
        FRENTE: i.frente,
        SUPERVISOR: i.supervisor,
        ESTADO: PILL[i.clave].texto,
        ENVIO: envioDe(i).texto,
      })),
    },
  ])
}

const puedeCrear = computed(() => auth.tienePermiso('rdc.crear'))
if (!esCampo.value) {
  usarCabeceraPlaneamiento(
    () => ({ texto: 'Nuevo reporte', visible: puedeCrear.value, ejecutar: nuevoReporte }),
    () => [
      { texto: 'Exportar Excel', ejecutar: exportar },
      ...(puedeCrear.value ? [{ texto: 'Cargar reporte en nombre de un supervisor', ejecutar: nuevoReporte }] : []),
    ]
  )
}
</script>

<template>
  <RdcMovilSupervisor v-if="movilSupervisor" />

  <!-- ===== Celular · Administración ===== -->
  <div v-else-if="movilAdmin" class="rm-adm">
    <div v-if="rdc.sinCatalogos" class="rm-aviso">Todavía no se descargaron los catálogos. Conéctate una vez a internet.</div>
    <div v-if="rdc.hayPendientes" class="rm-aviso">Hay reportes esperando salir. {{ enLinea ? 'Se están enviando.' : 'Se enviarán solos en cuanto haya señal.' }}</div>

    <div class="rm-kpis">
      <button type="button" class="rm-kp" :aria-pressed="filtroEstado === 'Borrador'" @click="filtroEstado = filtroEstado === 'Borrador' ? '' : 'Borrador'">
        <span class="rm-lab">BORRADORES</span>
        <b :class="{ am: borradores }">{{ borradores }}</b>
      </button>
      <button type="button" class="rm-kp" :aria-pressed="verSinReporte" @click="alternarSinReporte">
        <span class="rm-lab">SIN REPORTE AYER</span>
        <b :class="{ am: sinReporte.length }">{{ sinReporte.length }}</b>
        <i>{{ textoSinReporte }}</i>
      </button>
      <div class="rm-kp">
        <span class="rm-lab">AL DÍA</span>
        <b>{{ alDia.length }}<small> / {{ frentesActivos.length }}</small></b>
      </div>
      <div class="rm-kp">
        <span class="rm-lab">SHAREPOINT</span>
        <b :class="fallidos ? 're' : 'ok'">{{ fallidos }}<small> {{ fallidos === 1 ? 'error' : 'errores' }}</small></b>
      </div>
    </div>

    <template v-if="verSinReporte">
      <div class="rm-fila-t">
        <b>Sin reporte de ayer</b>
        <button type="button" class="rm-lnk" @click="verSinReporte = false">Ver reportes</button>
      </div>
      <div class="rm-card">
        <p v-if="!frentesSinReporte.length" class="rm-vacio">Todos los frentes activos tienen su reporte de ayer.</p>
        <button v-for="f in frentesSinReporte" :key="f.id" type="button" class="rm-r" @click="verFrenteSinReporte(f)">
          <span class="rm-r-t"><b>{{ f.nombre }}</b><small>Sin reporte de ayer ({{ fmtCorta(ayer) }})</small></span>
          <span class="rm-pill am">Falta</span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="rm-hs" role="group" aria-label="Estado">
        <button v-for="c in CHIPS_ESTADO" :key="c[0]" type="button" class="rm-chip" :class="{ on: filtroEstado === c[0] }" @click="filtroEstado = c[0]">{{ c[1] }}</button>
      </div>
      <div class="rm-hs">
        <button type="button" class="rm-chip" :class="{ on: filtroFrente }" @click="hojaFiltro = 'frente'">Frente: {{ filtroFrente || 'todos' }} ▾</button>
        <button type="button" class="rm-chip" :class="{ on: filtroSupervisor }" @click="hojaFiltro = 'supervisor'">Supervisor: {{ filtroSupervisor || 'todos' }} ▾</button>
      </div>

      <p v-if="rdc.cargando" class="rm-vacio">Cargando…</p>
      <div v-else class="rm-card">
        <button v-for="i in filtrados" :key="i.id" type="button" class="rm-r" @click="abrirItem(i)">
          <span class="rm-r-t"><b>{{ i.frente }}</b><small>{{ fmtCorta(i.fecha) }} · {{ i.supervisor }}</small></span>
          <span class="rm-pill" :class="i.clave === 'borrador' ? 'am' : i.clave === 'error' ? 're' : 'ok'">{{ PILL[i.clave].texto }}</span>
          <span v-if="i.clave === 'borrador'" class="rm-cont">Continuar</span>
        </button>
        <p v-if="!filtrados.length" class="rm-vacio">{{ todos.length ? 'Sin reportes con estos filtros.' : 'Todavía no hay reportes. Toca «Nuevo» para empezar.' }}</p>
      </div>
    </template>

    <!-- Hoja inferior: elegir frente o supervisor -->
    <template v-if="hojaFiltro">
      <div class="rm-scrim" @click="hojaFiltro = null"></div>
      <div class="rm-hoja" role="dialog" :aria-label="hojaFiltro === 'frente' ? 'Elegir frente' : 'Elegir supervisor'">
        <div class="rm-manija"></div>
        <div class="rm-lab" style="margin: 2px 4px 6px">{{ hojaFiltro === 'frente' ? 'FRENTE' : 'SUPERVISOR' }}</div>
        <div class="rm-opciones">
          <button type="button" class="rm-op" :class="{ on: !valorHoja }" @click="elegirEnHoja('')">Todos</button>
          <button v-for="o in opcionesHoja" :key="o" type="button" class="rm-op" :class="{ on: valorHoja === o }" @click="elegirEnHoja(o)">{{ o }}</button>
        </div>
      </div>
    </template>
  </div>

  <div v-else class="rdc-app rdc-ref">
    <div :class="esCampo ? 'rx-pagina' : 'rx-col'">
      <!-- Cabecera propia solo para campo: el resto usa la de Planeamiento -->
      <div v-if="esCampo" class="rx-hd">
        <div class="rx-row" style="gap: 14px">
          <h1 class="rx-h1">Reporte diario</h1>
          <span class="rx-conn"><span class="rx-conn-dot" :class="{ off: !enLinea }"></span>{{ enLinea ? 'En línea' : 'Sin conexión' }}</span>
        </div>
        <button v-if="puedeCrear" type="button" class="rb pri" @click="nuevoReporte">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo reporte
        </button>
      </div>

      <div v-if="rdc.sinCatalogos" class="alert alert-red">
        <i class="ti ti-alert-triangle" />
        <span>Todavía no se descargaron los catálogos. Conéctate una vez a internet para poder llenar reportes sin señal después.</span>
      </div>
      <div v-if="rdc.borradoresViejos.length" class="alert alert-red">
        <i class="ti ti-alert-triangle" />
        <span style="flex: 1">
          Tienes {{ rdc.borradoresViejos.length === 1 ? 'un reporte' : `${rdc.borradoresViejos.length} reportes` }} sin terminar de días anteriores:
          <button
            v-for="r in rdc.borradoresViejos"
            :key="r.id"
            type="button"
            class="rb sm"
            style="margin: 6px 6px 0 0"
            @click="router.push({ name: 'rdc-editar', params: { id: r.id } })"
          >{{ fmtCorta(r.fecha) }}</button>
        </span>
      </div>
      <div v-if="rdc.hayPendientes" class="alert alert-amber">
        <i class="ti ti-cloud-off" />
        <span>Hay reportes esperando salir. {{ enLinea ? 'Se están enviando.' : 'Se enviarán solos en cuanto haya señal.' }}</span>
      </div>
      <div v-if="adoptando" class="alert alert-amber"><i class="ti ti-cloud-download" /><span>Trayendo el borrador desde el otro dispositivo…</span></div>

      <!-- Campo: chips de frente -->
      <div v-if="esCampo && frentesChips.length > 1" class="rx-row" style="gap: 6px" role="group" aria-label="Frente">
        <button v-for="f in frentesChips" :key="f" type="button" class="rseg" :class="{ on: frenteSel === f }" :aria-pressed="frenteSel === f" @click="elegirFrente(f)">{{ f }}</button>
      </div>

      <!-- Indicadores: UNA franja -->
      <div class="rgrid-k" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))">
        <template v-if="esCampo">
          <div class="rkpi">
            <div class="rmu rx-kl">Último reporte</div>
            <div class="rx-kv" :style="ultimoAlDia ? 'color: var(--ok-fg)' : ultimoEnviado ? 'color: var(--am-fg)' : ''">{{ ultimoTexto }}</div>
            <div class="rmu rx-ks">{{ ultimoEnviado ? `${fmtCorta(ultimoEnviado.fecha)} · ${ultimoAlDia ? 'al día' : 'atrasado'}` : 'sin reportes' }}</div>
          </div>
          <div class="rkpi"><div class="rmu rx-kl">Enviados</div><div class="rx-kv">{{ enviadosFrente }}</div><div class="rmu rx-ks">de {{ frenteSel || 'este frente' }}</div></div>
          <div class="rkpi"><div class="rmu rx-kl">Borradores</div><div class="rx-kv">{{ borradores }}</div><div class="rmu rx-ks">sin enviar</div></div>
          <div class="rkpi"><div class="rmu rx-kl">Envío fallido</div><div class="rx-kv" :style="fallidos ? 'color: var(--er-fg)' : ''">{{ fallidos }}</div><div class="rmu rx-ks">a SharePoint</div></div>
        </template>
        <template v-else>
          <div class="rkpi">
            <div class="rmu rx-kl">Reportes de ayer</div>
            <div class="rx-kv" :style="frentesActivos.length && alDia.length === frentesActivos.length ? 'color: var(--ok-fg)' : ''">{{ alDia.length }} / {{ frentesActivos.length }}</div>
            <div class="rmu rx-ks">frentes activos al día</div>
          </div>
          <div class="rkpi">
            <div class="rmu rx-kl">Sin reporte de ayer</div>
            <div class="rx-kv" :style="sinReporte.length ? 'color: var(--am-fg)' : ''">{{ sinReporte.length }}</div>
            <div class="rmu rx-ks">{{ textoSinReporte }}</div>
          </div>
          <div class="rkpi"><div class="rmu rx-kl">Borradores</div><div class="rx-kv" :style="borradores ? 'color: var(--am-fg)' : ''">{{ borradores }}</div><div class="rmu rx-ks">sin enviar</div></div>
          <div class="rkpi"><div class="rmu rx-kl">Envío a SharePoint fallido</div><div class="rx-kv" :style="fallidos ? 'color: var(--er-fg)' : ''">{{ fallidos }}</div><div class="rmu rx-ks">{{ fallidos ? 'revisar' : 'sin errores' }}</div></div>
        </template>
      </div>

      <!-- Campo: avance del frente seleccionado -->
      <div v-if="esCampo && rdc.frenteActual && controlActivo" class="rp" style="padding: 20px 24px; gap: 14px">
        <div class="rx-row" style="justify-content: space-between">
          <div class="rsh">AVANCE DE {{ rdc.frenteActual.nombre.toUpperCase() }}</div>
          <div v-if="horaCatalogo" class="rmu rx-ks">Lista actualizada a las {{ horaCatalogo }}</div>
        </div>
        <div class="rx-avance">
          <button type="button" class="rin rx-av" @click="irAControl('perforacion')">
            <div class="rmu rx-kl">Perforados</div>
            <div class="rx-av-v">{{ perforados }}<span class="rmu rx-av-s"> / {{ totalCatalogo }}</span></div>
          </button>
          <button type="button" class="rin rx-av" @click="irAControl('inyeccion')">
            <div class="rmu rx-kl">Inyectados</div>
            <div class="rx-av-v" style="color: var(--ok-fg)">{{ inyectados }}<span class="rmu rx-av-s"> / {{ totalCatalogo }}</span></div>
          </button>
          <button type="button" class="rin rx-av" @click="irAControl('inyeccion')">
            <div class="rmu rx-kl">Pendientes de inyectar</div>
            <div class="rx-av-v">{{ faltaInyectar }}</div>
          </button>
          <button type="button" class="rin rx-av" @click="irAControl('malla')">
            <div class="rmu rx-kl">Malla instalada</div>
            <div v-if="!mallaPorTipo.length" class="rx-av-v">0<span class="rmu rx-av-s"> m²</span></div>
            <div v-for="m in mallaPorTipo" :key="m.tipo" class="rx-av-v" :class="{ multi: mallaPorTipo.length > 1 }">
              {{ formatearNumero(m.total) }}<span class="rmu rx-av-s"> m²<template v-if="mallaPorTipo.length > 1"> · {{ m.tipo }}</template></span>
            </div>
          </button>
          <button type="button" class="rin rx-av" @click="irAControl('cable')">
            <div class="rmu rx-kl">Cable</div>
            <div v-if="!cablePorTipo.length" class="rx-av-v">0<span class="rmu rx-av-s"> ML</span></div>
            <div v-for="c in cablePorTipo" :key="c.tipo" class="rx-av-v" :class="{ multi: cablePorTipo.length > 1 }">
              {{ formatearNumero(c.total) }}<span class="rmu rx-av-s"> ML<template v-if="cablePorTipo.length > 1"> · {{ c.tipo }}</template></span>
            </div>
          </button>
        </div>
      </div>

      <!-- Filtros -->
      <div class="rx-row">
        <label class="rx-buscar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input v-model="busqueda" type="search" placeholder="Buscar por frente o supervisor…" aria-label="Buscar reporte" />
        </label>
        <template v-if="!esCampo">
          <select v-model="filtroFrente" class="rf rx-sel" style="width: 230px" aria-label="Frente">
            <option value="">Frente: todos</option>
            <option v-for="f in opcionesFrente" :key="f" :value="f">{{ f }}</option>
          </select>
          <select v-model="filtroSupervisor" class="rf rx-sel" style="width: 210px" aria-label="Supervisor">
            <option value="">Supervisor: todos</option>
            <option v-for="s in opcionesSupervisor" :key="s" :value="s">{{ s }}</option>
          </select>
        </template>
        <select v-model="filtroEstado" class="rf rx-sel" style="width: 160px" aria-label="Estado">
          <option value="">Estado: todos</option>
          <option value="Enviado">Enviado</option>
          <option value="Borrador">Borrador</option>
        </select>
        <input v-model="filtroFecha" type="date" class="rf rx-sel" style="width: 170px" aria-label="Fecha" />
      </div>

      <p v-if="rdc.cargando" class="empty-msg">Cargando…</p>
      <div v-else class="rtabla">
        <div class="in">
          <div class="rtr rth rx-cols">
            <span>FECHA</span><span>FRENTE</span><span>SUPERVISOR</span><span>ESTADO</span><span>ENVÍO</span><span style="text-align: right">ACCIONES</span>
          </div>
          <button
            v-for="i in filtrados"
            :key="i.id"
            type="button"
            class="rrow rx-cols"
            :aria-label="`${i.clave === 'borrador' ? 'Continuar' : 'Ver'} reporte de ${i.frente} del ${fmtCorta(i.fecha)}`"
            @click="abrirItem(i)"
          >
            <span class="rmu" style="font-weight: 600">{{ fmtCorta(i.fecha) }}</span>
            <span class="rx-frente"><span class="rx-punto" :class="i.clave === 'borrador' ? 'dr' : 'ok'"></span>{{ i.frente }}</span>
            <span class="rx-sup">{{ i.supervisor }}</span>
            <span><span class="rpl" :class="PILL[i.clave].clase">{{ PILL[i.clave].texto }}</span></span>
            <span :class="envioDe(i).clase">{{ envioDe(i).texto }}</span>
            <span class="rx-acc">{{ i.clave === 'borrador' ? 'Continuar' : 'Ver' }}</span>
          </button>
          <div v-if="!filtrados.length" class="rem" style="margin: 12px 8px">
            {{ todos.length ? 'Sin reportes con estos filtros.' : 'Todavía no hay reportes. Toca «Nuevo reporte» para empezar.' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ----- Celular · Administración ----- */
.rm-adm {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 16px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}
.rm-aviso {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  font-size: 12.5px;
  font-weight: 600;
}
.rm-kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rm-kp {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 64px;
  padding: 10px 12px;
  border: 0;
  border-radius: 16px;
  background: var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-border);
  text-align: left;
  color: inherit;
  font: inherit;
}
.rm-kp[aria-pressed='true'] {
  box-shadow: 0 0 0 2px var(--color-primary);
}
button.rm-kp {
  cursor: pointer;
}
.rm-lab {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.07em;
  color: var(--color-text-muted);
}
.rm-kp b {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
}
.rm-kp b small {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
}
.rm-kp b.am {
  color: var(--color-primary);
}
.rm-kp b.ok {
  color: var(--color-success);
}
.rm-kp b.re {
  color: var(--color-danger);
}
.rm-kp i {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rm-hs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -16px;
  padding: 0 16px;
  scrollbar-width: none;
}
.rm-hs::-webkit-scrollbar {
  display: none;
}
.rm-chip {
  flex: 0 0 auto;
  height: 32px;
  padding: 0 13px;
  border: 0;
  border-radius: 999px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}
.rm-chip.on {
  background: var(--color-text);
  color: var(--color-bg);
}
.rm-card {
  border-radius: 18px;
  background: var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-border);
  padding: 2px 14px;
}
.rm-r {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: none;
  text-align: left;
  color: inherit;
  font: inherit;
}
.rm-r:last-child {
  border-bottom: 0;
}
.rm-r-t {
  flex: 1;
  min-width: 0;
}
.rm-r-t b {
  display: block;
  font-size: 14px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-r-t small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-pill {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  white-space: nowrap;
}
.rm-pill.ok {
  background: color-mix(in srgb, var(--color-success) 16%, transparent);
  color: color-mix(in srgb, var(--color-success) 70%, var(--color-text));
}
.rm-pill.am {
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  color: color-mix(in srgb, var(--color-primary) 62%, var(--color-text));
}
.rm-pill.re {
  background: color-mix(in srgb, var(--color-danger) 16%, transparent);
  color: color-mix(in srgb, var(--color-danger) 75%, var(--color-text));
}
.rm-cont {
  flex: none;
  padding: 6px 10px;
  border-radius: 11px;
  background: var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-border);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--color-text-muted);
}
.rm-fila-t {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 15px;
}
.rm-lnk {
  border: 0;
  background: none;
  color: var(--color-info);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}
.rm-vacio {
  margin: 0;
  padding: 18px 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.rm-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 40;
}
.rm-hoja {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 41;
  max-height: 70dvh;
  overflow-y: auto;
  padding: 12px 18px calc(18px + env(safe-area-inset-bottom, 0px));
  border-radius: 26px 26px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.35);
}
.rm-manija {
  width: 40px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 2px;
  background: var(--color-border);
}
.rm-opciones {
  display: flex;
  flex-direction: column;
}
.rm-op {
  height: 48px;
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  color: inherit;
  border-bottom: 1px solid var(--color-border);
}
.rm-op.on {
  color: var(--color-primary);
}
.rx-cols {
  grid-template-columns: 90px minmax(200px, 1.5fr) minmax(170px, 1fr) 130px 150px 130px;
}
.rx-conn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
}
.rx-conn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
}
.rx-conn-dot.off {
  background: var(--fa);
}
.rx-kl {
  font-size: 12px;
  font-weight: 600;
}
.rx-kv {
  font-size: 30px;
  font-weight: 800;
  margin-top: 6px;
  letter-spacing: -0.02em;
}
.rx-ks {
  font-size: 12px;
  font-weight: 500;
  margin-top: 2px;
}
.rx-avance {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
}
.rx-av {
  border: 0;
  text-align: left;
  padding: 14px 16px;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.rx-av:hover {
  background: var(--hv);
}
.rx-av-v {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.rx-av-v.multi {
  font-size: 16px;
  letter-spacing: 0;
  margin-top: 2px;
}
.rx-av-s {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
}
.rx-buscar {
  flex: 1 1 260px;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  background: var(--sf);
  border-radius: 14px;
  padding: 0 16px;
  color: var(--mu);
  box-shadow: 0 0 0 1px var(--ln);
}
.rx-buscar input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 15px;
  color: var(--tx);
  min-width: 0;
}
.rx-sel {
  width: auto;
}
.rx-frente {
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px;
}
.rx-sup {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px;
}
.rx-punto {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 10px;
}
.rx-punto.ok {
  background: #22c55e;
}
.rx-punto.dr {
  background: #f59e0b;
}
.rx-envio-ok {
  font-size: 13px;
  font-weight: 600;
  color: var(--ok-fg);
}
.rx-envio-er {
  font-size: 13px;
  font-weight: 600;
  color: var(--er-fg);
}
.rx-envio-mut {
  font-size: 13px;
  font-weight: 600;
  color: var(--mu);
}
.rx-acc {
  text-align: right;
  font-size: 13px;
  font-weight: 800;
  color: var(--am-fg);
}
</style>

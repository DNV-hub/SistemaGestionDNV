<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '../store/dashboard'
import { useAuthStore } from '../../../store/auth'
import MapaActividadCard from '../components/MapaActividadCard.vue'
import { useEsMovil } from '../../../composables/useEsMovil'

const dashboard = useDashboardStore()
const auth = useAuthStore()
const router = useRouter()

const permisos = computed(() => ({
  rdcCampo: auth.tienePermiso('rdc.ver_resumen_campo'),
  frentes: auth.tienePermiso('frentes.ver'),
}))

// "Frentes en campo" la ven roles que la ficha de frente NO deja entrar
// (Almacén/Supervisor tienen rdc.ver_resumen_campo, ver 20260914180000) —
// mismo criterio exacto que la guarda de router.index.js (meta.rolesExcluidos
// de la ruta ficha-frente), para no mandar a nadie a una ruta que le va a
// rebotar.
const puedeAbrirFichaFrente = computed(() => permisos.value.frentes && !['Almacen', 'Supervisor'].includes(auth.nombreRol))
function abrirFicha(frenteId) {
  if (!puedeAbrirFichaFrente.value || !frenteId) return
  router.push(`/frentes/${frenteId}`)
}

dashboard.cargar(permisos.value)

// ---------------------------------------------------------------------------
// Encabezado: fecha larga + hora REAL de la última carga de datos
// ---------------------------------------------------------------------------
// Solo la primera letra en mayúscula (el día de la semana): en español no se
// escribe "13 De Setiembre De 2026".
const fechaLegible = computed(() => {
  const texto = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
})
const horaActualizado = computed(() =>
  dashboard.actualizadoEn ? dashboard.actualizadoEn.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
)

// ---------------------------------------------------------------------------
// Frentes en campo
// ---------------------------------------------------------------------------
const PERSONAL_DIRECTO = ['Capataz', 'Operario', 'Oficial', 'Peón', 'Vigía']

// Vista Tarjetas | Lista: se recuerda la elección de cada usuario.
const CLAVE_VISTA = 'dnv-dashboard-vista'
function leerVista() {
  try {
    return localStorage.getItem(CLAVE_VISTA) === 'lista' ? 'lista' : 'tarjetas'
  } catch {
    return 'tarjetas'
  }
}
const vista = ref(leerVista())
function fijarVista(v) {
  vista.value = v
  try {
    localStorage.setItem(CLAVE_VISTA, v)
  } catch {
    /* sin almacenamiento disponible: la elección vale solo en esta sesión */
  }
}

// "¿Qué frentes estaban activos tal fecha?": el selector ancla la lista a
// cualquier día pasado; "Hoy" la vuelve a la vista en vivo.
const hoyStr = new Date().toLocaleDateString('en-CA')
const fechaCampoInput = ref(hoyStr)
const viendoPasado = computed(() => dashboard.fechaFrentesCampo && dashboard.fechaFrentesCampo !== hoyStr)
function cambiarFechaCampo() {
  if (!fechaCampoInput.value) return
  dashboard.cargarFrentesEnCampo(fechaCampoInput.value)
}
function volverAHoy() {
  fechaCampoInput.value = hoyStr
  dashboard.cargarFrentesEnCampo(null)
}

function personalDe(fila, categoria) {
  return fila.personal.filter((p) => p.categoria === categoria).reduce((s, p) => s + p.cantidad, 0)
}
function totalPersonalFrente(fila) {
  return fila.personal.reduce((s, p) => s + p.cantidad, 0)
}
function equiposAgrupados(fila) {
  const porTipo = new Map()
  for (const m of fila.maquinaria) porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + m.cantidad)
  return [...porTipo.entries()]
    .map(([tipo, cantidad]) => ({ tipo, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
}
function totalMaquinariaFrente(fila) {
  return fila.maquinaria.reduce((s, m) => s + m.cantidad, 0)
}
// Desglose del panelito de Personal: categorías con gente + "Otros" para que
// la suma siempre cuadre con el número de la tarjeta.
function desglosePersonal(fila) {
  const filas = PERSONAL_DIRECTO.map((categoria) => ({ nombre: categoria, cantidad: personalDe(fila, categoria) })).filter((x) => x.cantidad > 0)
  const otros = totalPersonalFrente(fila) - filas.reduce((s, x) => s + x.cantidad, 0)
  if (otros > 0) filas.push({ nombre: 'Otros', cantidad: otros })
  return filas
}
function horaCorta(t) {
  return t ? t.slice(0, 5) : ''
}
function textoRestriccion(fila) {
  const r = fila.restriccion
  if (!r) return null
  const rango = r.inicio && r.fin ? ` ${horaCorta(r.inicio)}–${horaCorta(r.fin)}` : ''
  return `${r.descripcion || 'Restricción de acceso'}${rango}`
}

// Contrato de cada frente: ya viene en el mapa de actividad (contrato_id /
// contrato_nombre por frente) — no hace falta otra consulta.
const contratoPorFrente = computed(() => {
  const m = new Map()
  for (const f of dashboard.mapaActividad.frentes) m.set(f.id, f.contrato_nombre ?? null)
  return m
})
function siglas(nombre) {
  if (!nombre) return ''
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}
// Contrato Marco primero y el resto (Sala Eléctrica…) al final, sin títulos
// de grupo.
function rangoContrato(nombre) {
  return /marco/i.test(nombre ?? '') ? 0 : 1
}

// Un reporte de AYER es un reporte al día: los supervisores envían al día
// siguiente. Solo hay atraso cuando falta el de ayer o uno más antiguo.
const refFecha = computed(() => dashboard.fechaFrentesCampo ?? hoyStr)
function diasDesde(fechaIso) {
  const a = new Date(`${refFecha.value}T00:00:00`)
  const b = new Date(`${fechaIso}T00:00:00`)
  return Math.round((a - b) / 86_400_000)
}

const esMesActual = computed(() => {
  const h = new Date()
  return dashboard.mapaActividadAnio === h.getFullYear() && dashboard.mapaActividadMes === h.getMonth() + 1
})

const frentes = computed(() => {
  const filas = dashboard.frentesEnCampo.map((f) => ({
    id: f.frente?.id,
    nombre: f.frente?.nombre ?? f.frente?.codigo ?? '—',
    supervisor: f.supervisor,
    capataz: f.capataz,
    fecha: f.fecha,
    dias: diasDesde(f.fecha),
    fila: f,
    restriccion: textoRestriccion(f),
  }))

  // Un frente activo que NO entró en la ventana ayer/hoy sigue siendo parte
  // del cuadro: aparece con "Hace N días" en ámbar (último reporte del mes
  // del mapa). Solo en la vista en vivo del mes actual.
  if (!viendoPasado.value && esMesActual.value) {
    const conFila = new Set(filas.map((x) => x.id))
    const ultimo = new Map()
    for (const r of dashboard.mapaActividad.reportes) {
      const previo = ultimo.get(r.frente_id)
      if (!previo || r.fecha > previo.fecha) ultimo.set(r.frente_id, r)
    }
    for (const f of dashboard.mapaActividad.frentes) {
      if (f.estado !== 'activo' || conFila.has(f.id)) continue
      const r = ultimo.get(f.id)
      filas.push({
        id: f.id,
        nombre: f.nombre,
        supervisor: r?.supervisor ?? '—',
        capataz: r?.capataz ?? '',
        fecha: r?.fecha ?? null,
        dias: r ? diasDesde(r.fecha) : null,
        fila: { personal: [], maquinaria: [] },
        restriccion: null,
      })
    }
  }

  return filas
    .map((x) => ({ ...x, contrato: contratoPorFrente.value.get(x.id) ?? null }))
    .sort((a, b) => rangoContrato(a.contrato) - rangoContrato(b.contrato) || (a.contrato ?? '').localeCompare(b.contrato ?? '') || a.nombre.localeCompare(b.nombre))
})

function etiquetaReporte(x) {
  if (x.dias === null) return { texto: 'Sin reporte', atrasado: true }
  if (x.dias <= 0) return { texto: 'Hoy', atrasado: false }
  if (x.dias === 1) return { texto: 'Ayer', atrasado: false }
  return { texto: `Hace ${x.dias} días`, atrasado: true }
}

// ---------------------------------------------------------------------------
// Totales (suma de todas las tarjetas)
// ---------------------------------------------------------------------------
function totalCategoria(categoria) {
  return dashboard.frentesEnCampo.reduce((acc, f) => acc + personalDe(f, categoria), 0)
}
const totalesPersonal = computed(() => {
  const directos = PERSONAL_DIRECTO.map((categoria) => ({ categoria, total: totalCategoria(categoria) }))
  const totalDirecto = directos.reduce((s, d) => s + d.total, 0)
  const totalGeneral = dashboard.frentesEnCampo.reduce((acc, f) => acc + totalPersonalFrente(f), 0)
  return { directos, otros: totalGeneral - totalDirecto, total: totalGeneral }
})
const totalesMaquinaria = computed(() => {
  const porTipo = new Map()
  for (const f of dashboard.frentesEnCampo) {
    for (const m of f.maquinaria) porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + m.cantidad)
  }
  const todos = [...porTipo.entries()].map(([tipo, cantidad]) => ({ tipo, cantidad })).sort((a, b) => b.cantidad - a.cantidad)
  const lista = todos.slice(0, 5)
  const total = dashboard.frentesEnCampo.reduce((acc, f) => acc + totalMaquinariaFrente(f), 0)
  // "Otros" junta lo que no entra en los 5 renglones, para que la suma cuadre.
  const otros = total - lista.reduce((s, e) => s + e.cantidad, 0)
  return { lista, otros, total }
})

// ---------------------------------------------------------------------------
// Próximos frentes / Paralizados
// ---------------------------------------------------------------------------
const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
function diaMes(fechaIso) {
  const [, m, d] = fechaIso.split('-').map(Number)
  return `${d} ${MESES_ABREV[m - 1]}`
}
function diasEntre(fechaIso) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const [y, m, d] = fechaIso.split('-').map(Number)
  return Math.round((new Date(y, m - 1, d) - hoy) / 86_400_000)
}
function etiquetaProximo(fechaIso) {
  const dias = diasEntre(fechaIso)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}
function diasParalizado(fecha) {
  return Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 86_400_000))
}
function etiquetaParalizado(fecha) {
  const dias = diasParalizado(fecha)
  if (dias === 0) return 'hoy'
  if (dias === 1) return '1 día'
  return `${dias} días`
}
// "DD/MM/AAAA" a partir de un ISO — se corta al pedazo de fecha antes de
// armar nada, para no depender de a qué hora cae el corte UTC/local.
function fechaCorta(iso) {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// ---------------------------------------------------------------------------
// Celular (Supervisor): "Dashboard general" compacto, solo desde el avatar
// ---------------------------------------------------------------------------
const esMovil = useEsMovil()
// El mismo diseño compacto sirve para los perfiles de Administración en celular
// (Developer, Administrador, Coordinador, Planeamiento): para ellos es la primera
// pestaña de la barra, sin flecha de volver; el Supervisor llega desde su avatar.
const esSupervisorMovil = computed(() => auth.nombreRol === 'Supervisor')
const movilSup = computed(
  () => esMovil.value && (esSupervisorMovil.value || ['Developer', 'Administrador', 'Coordinador', 'Planeamiento'].includes(auth.nombreRol))
)
const fechaMovil = computed(() => {
  const t = new Date().toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
})
const ABREV_PERSONAL = { Operario: 'Oper.', Oficial: 'Of.', Peón: 'Peón', Capataz: 'Cap.', Vigía: 'Vig.' }
const resumenPersonal = computed(() =>
  totalesPersonal.value.directos
    .filter((d) => d.total > 0 && ['Operario', 'Oficial', 'Peón'].includes(d.categoria))
    .map((d) => `${ABREV_PERSONAL[d.categoria]} ${d.total}`)
    .join(' · ')
)
const resumenEquipos = computed(() =>
  totalesMaquinaria.value.lista
    .slice(0, 2)
    .map((e) => `${e.tipo.split(' ')[0].slice(0, 9)} ${e.cantidad}`)
    .join(' · ')
)
const primerNombre = (n) => (n ?? '').trim().split(/\s+/)[0] ?? ''
function irAReporte() {
  router.push({ name: 'rdc' })
}

onMounted(() => {
  fechaCampoInput.value = dashboard.fechaFrentesCampo ?? hoyStr
})
</script>

<template>
  <!-- ===================== Celular: Dashboard general ===================== -->
  <div v-if="movilSup" class="dash dm">
    <header class="dm-top">
      <button v-if="esSupervisorMovil" type="button" class="dm-atras" aria-label="Volver" @click="irAReporte">‹</button>
      <div class="dm-tit">
        <h1>{{ esSupervisorMovil ? 'Dashboard general' : 'Dashboard' }}</h1>
        <div v-if="!dashboard.cargando" class="dm-sub">{{ fechaMovil }} · <span class="dm-pto"></span> {{ horaActualizado }}</div>
      </div>
    </header>

    <p v-if="dashboard.cargando" class="cargando">Cargando…</p>
    <template v-else>
      <div v-if="permisos.rdcCampo" class="dm-2">
        <div class="dm-card dm-k">
          <div class="dm-lab">PERSONAL</div>
          <div class="dm-kv">{{ totalesPersonal.total }}</div>
          <div class="dm-ks">{{ resumenPersonal || '—' }}</div>
        </div>
        <div class="dm-card dm-k">
          <div class="dm-lab">EQUIPOS</div>
          <div class="dm-kv">{{ totalesMaquinaria.total }}</div>
          <div class="dm-ks">{{ resumenEquipos || '—' }}</div>
        </div>
      </div>

      <div v-if="permisos.rdcCampo" class="dm-card dm-mapa"><MapaActividadCard /></div>

      <template v-if="permisos.rdcCampo">
        <div class="dm-fh"><b>Frentes en campo</b><span class="dm-lab">{{ frentes.length }} ACTIVOS</span></div>
        <p v-if="dashboard.cargandoFrentesCampo" class="vacio">Cargando…</p>
        <div v-else class="dm-lista">
          <div v-for="x in frentes" :key="x.id" class="dm-card dm-fr">
            <div class="dm-fr1">
              <b class="dm-fn">{{ x.nombre }}</b>
              <span v-if="x.contrato" class="ct" :title="x.contrato" style="margin: 0">{{ siglas(x.contrato) }}</span>
              <span class="rep" :class="etiquetaReporte(x).atrasado ? 'tarde' : 'dia'">{{ etiquetaReporte(x).texto }}</span>
            </div>
            <div class="dm-fr2">
              <span class="dm-fs">{{ x.supervisor }}<template v-if="x.capataz"> · {{ primerNombre(x.capataz) }}</template></span>
              <span class="dm-fp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M3 20v-1a5 5 0 015-5h2a5 5 0 015 5v1" /></svg>{{ totalPersonalFrente(x.fila) }}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 18.5a1.5 1.5 0 100-.01M17.5 18.5a1.5 1.5 0 100-.01" /></svg>{{ totalMaquinariaFrente(x.fila) }}
              </span>
            </div>
          </div>
        </div>
      </template>

      <div v-if="permisos.frentes && (dashboard.frentesParalizados.length || dashboard.frentesProximos.length)" class="dm-card dm-pp">
        <template v-if="dashboard.frentesParalizados.length">
          <div class="dm-ppt"><b>Paralizados</b><span class="dm-pill rojo">{{ dashboard.frentesParalizados.length }}</span></div>
          <div class="dm-pps">{{ dashboard.frentesParalizados.map((f) => `${f.nombre} · ${etiquetaParalizado(f.fecha_paralizacion ?? f.updated_at)}`).join('  |  ') }}</div>
        </template>
        <template v-if="dashboard.frentesProximos.length">
          <div class="dm-ppt" :style="dashboard.frentesParalizados.length ? 'margin-top: 10px' : ''"><b>Próximos</b><span class="dm-pill azul">{{ dashboard.frentesProximos.length }}</span></div>
          <div class="dm-pps">
            <div v-for="f in dashboard.frentesProximos" :key="f.id">{{ f.nombre }} · inicia el {{ diaMes(f.fecha_inicio) }} · {{ etiquetaProximo(f.fecha_inicio) }}</div>
          </div>
        </template>
      </div>
    </template>
  </div>

  <div v-else class="dash">
    <main>
      <div class="cab">
        <h1>Dashboard</h1>
        <div v-if="!dashboard.cargando" class="meta-linea">
          <span>{{ fechaLegible }}</span><span aria-hidden="true">·</span>
          <span class="act"><span class="punto"></span>Actualizado a las {{ horaActualizado }}</span>
        </div>
        <a class="manuales" href="https://sites.google.com/view/desnivel-docs/inicio?pli=1&authuser=0" target="_blank" rel="noopener noreferrer">Manuales ↗</a>
      </div>

      <p v-if="dashboard.cargando" class="cargando">Cargando…</p>

      <section v-else class="dos-col">
        <!-- IZQUIERDA -->
        <div class="izq">
          <MapaActividadCard v-if="permisos.rdcCampo" />

          <!-- FRENTES EN CAMPO -->
          <div v-if="permisos.rdcCampo" class="frentes-campo">
            <div class="fc-cab">
              <h2>Frentes en campo</h2>
              <div class="fc-ctrl">
                <div class="grupo-seg" role="group" aria-label="Vista de frentes">
                  <button type="button" class="seg" :class="{ on: vista === 'tarjetas' }" :aria-pressed="vista === 'tarjetas'" @click="fijarVista('tarjetas')">Tarjetas</button>
                  <button type="button" class="seg" :class="{ on: vista === 'lista' }" :aria-pressed="vista === 'lista'" @click="fijarVista('lista')">Lista</button>
                </div>
                <input v-model="fechaCampoInput" type="date" class="fecha-sel" :max="hoyStr" aria-label="Fecha" @change="cambiarFechaCampo" />
                <button v-if="viendoPasado" type="button" class="seg" @click="volverAHoy">Hoy</button>
              </div>
            </div>

            <p v-if="dashboard.cargandoFrentesCampo" class="vacio">Cargando…</p>
            <p v-else-if="!frentes.length" class="vacio">
              {{ viendoPasado ? 'Ningún frente tuvo reporte diario en esa fecha.' : 'Ningún frente activo ni con reporte diario reciente.' }}
            </p>

            <!-- TARJETAS -->
            <div v-else-if="vista === 'tarjetas'" class="tarjetas">
              <article
                v-for="x in frentes"
                :key="x.id"
                class="dc"
                :class="{ clic: puedeAbrirFichaFrente }"
                :tabindex="puedeAbrirFichaFrente ? 0 : undefined"
                :role="puedeAbrirFichaFrente ? 'link' : undefined"
                @click="abrirFicha(x.id)"
                @keydown.enter="abrirFicha(x.id)"
              >
                <div class="dc-nombre" :title="x.nombre">{{ x.nombre }}</div>
                <div class="dc-fila">
                  <div class="dc-sup">{{ x.supervisor }}</div>
                  <span class="rep" :class="etiquetaReporte(x).atrasado ? 'tarde' : 'dia'">{{ etiquetaReporte(x).texto }}</span>
                </div>
                <div class="dc-esp"></div>
                <div class="dc-nums">
                  <div class="dc-cap" :title="x.capataz">
                    <template v-if="x.capataz">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Capataz"><path d="M4 17h16M6 17v-3a6 6 0 0112 0v3M12 8V5M9.5 9.5L8 8M14.5 9.5L16 8" /></svg><span class="dc-cap-n">{{ x.capataz }}</span>
                    </template>
                  </div>
                  <span class="hv" tabindex="0" :aria-label="`Personal ${totalPersonalFrente(x.fila)}, ver detalle`">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Personal"><path d="M16 20v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M20 20v-1a3 3 0 00-2-2.8M15 4.2a3.5 3.5 0 010 6.6" /></svg>{{ totalPersonalFrente(x.fila) }}
                    <span class="pop">
                      <span class="pt">PERSONAL</span>
                      <span v-if="!desglosePersonal(x.fila).length" class="pr"><span>Sin registro</span></span>
                      <span v-for="p in desglosePersonal(x.fila)" :key="p.nombre" class="pr"><span>{{ p.nombre }}</span><b>{{ p.cantidad }}</b></span>
                    </span>
                  </span>
                  <span class="hv" tabindex="0" :aria-label="`Equipos ${totalMaquinariaFrente(x.fila)}, ver detalle`">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Equipos"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 18.5a1.5 1.5 0 100-.01M17.5 18.5a1.5 1.5 0 100-.01" /></svg>{{ totalMaquinariaFrente(x.fila) }}
                    <span class="pop">
                      <span class="pt">EQUIPOS</span>
                      <span v-if="!equiposAgrupados(x.fila).length" class="pr"><span>Sin equipos registrados</span></span>
                      <span v-for="e in equiposAgrupados(x.fila)" :key="e.tipo" class="pr"><span>{{ e.tipo }}</span><b>{{ e.cantidad }}</b></span>
                    </span>
                  </span>
                  <span v-if="x.contrato" class="ct" :title="x.contrato" style="margin: 0; align-self: center">{{ siglas(x.contrato) }}</span>
                </div>
                <div v-if="x.restriccion" class="restr" :title="x.restriccion">Restricción: {{ x.restriccion }}</div>
              </article>
            </div>

            <!-- LISTA -->
            <div v-else class="lista">
              <div class="l-fila l-cab">
                <span>FRENTE</span><span>SUPERVISOR</span><span>CAPATAZ</span><span>REPORTE</span><span class="der">PERSONAL</span><span class="der">EQUIPOS</span>
              </div>
              <div
                v-for="x in frentes"
                :key="x.id"
                class="l-fila dd"
                :class="{ clic: puedeAbrirFichaFrente }"
                :tabindex="puedeAbrirFichaFrente ? 0 : undefined"
                :role="puedeAbrirFichaFrente ? 'link' : undefined"
                @click="abrirFicha(x.id)"
                @keydown.enter="abrirFicha(x.id)"
              >
                <span class="l-nombre">{{ x.nombre }}<span v-if="x.contrato" class="ct" :title="x.contrato" style="margin: 0 0 0 8px">{{ siglas(x.contrato) }}</span></span>
                <span class="l-sup">{{ x.supervisor }}</span>
                <span class="l-cap">{{ x.capataz }}</span>
                <span class="rep" :class="etiquetaReporte(x).atrasado ? 'tarde' : 'dia'">{{ etiquetaReporte(x).texto }}</span>
                <span class="hv der" tabindex="0" :aria-label="`Personal ${totalPersonalFrente(x.fila)}, ver detalle`">{{ totalPersonalFrente(x.fila) }}
                  <span class="pop">
                    <span class="pt">PERSONAL</span>
                    <span v-if="!desglosePersonal(x.fila).length" class="pr"><span>Sin registro</span></span>
                    <span v-for="p in desglosePersonal(x.fila)" :key="p.nombre" class="pr"><span>{{ p.nombre }}</span><b>{{ p.cantidad }}</b></span>
                  </span>
                </span>
                <span class="hv der" tabindex="0" :aria-label="`Equipos ${totalMaquinariaFrente(x.fila)}, ver detalle`">{{ totalMaquinariaFrente(x.fila) }}
                  <span class="pop">
                    <span class="pt">EQUIPOS</span>
                    <span v-if="!equiposAgrupados(x.fila).length" class="pr"><span>Sin equipos registrados</span></span>
                    <span v-for="e in equiposAgrupados(x.fila)" :key="e.tipo" class="pr"><span>{{ e.tipo }}</span><b>{{ e.cantidad }}</b></span>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- DERECHA: sin cajas -->
        <div class="der-col">
          <div v-if="permisos.rdcCampo && dashboard.frentesEnCampo.length">
            <div class="tot2">
              <div><div class="tot-l">Personal</div><div class="tot-v">{{ totalesPersonal.total }}</div></div>
              <div><div class="tot-l">Equipos</div><div class="tot-v">{{ totalesMaquinaria.total }}</div></div>
            </div>
            <div class="tot2 listas">
              <div>
                <div v-for="d in totalesPersonal.directos" :key="d.categoria" class="fila-r"><span class="fr-l">{{ d.categoria }}</span><span class="fr-n">{{ d.total }}</span></div>
                <div v-if="totalesPersonal.otros" class="fila-r"><span class="fr-l">Otros</span><span class="fr-n">{{ totalesPersonal.otros }}</span></div>
              </div>
              <div>
                <div v-for="e in totalesMaquinaria.lista" :key="e.tipo" class="fila-r"><span class="fr-l elip">{{ e.tipo }}</span><span class="fr-n">{{ e.cantidad }}</span></div>
                <div v-if="totalesMaquinaria.otros" class="fila-r"><span class="fr-l elip">Otros</span><span class="fr-n">{{ totalesMaquinaria.otros }}</span></div>
              </div>
            </div>
          </div>

          <div v-if="permisos.frentes && dashboard.frentesParalizados.length" class="sec-borde">
            <h2 class="h2-chico">Frentes paralizados</h2>
            <div v-for="f in dashboard.frentesParalizados" :key="f.id" class="mini-fila">
              <div>
                <div class="mini-n">{{ f.nombre }}</div>
                <div class="mini-s">desde {{ fechaCorta(f.fecha_paralizacion ?? f.updated_at) }}</div>
              </div>
              <span class="mini-rojo">{{ etiquetaParalizado(f.fecha_paralizacion ?? f.updated_at) }}</span>
            </div>
          </div>

          <div v-if="permisos.frentes && dashboard.frentesProximos.length" class="sec-borde">
            <h2 class="h2-chico">Próximos frentes</h2>
            <div v-for="f in dashboard.frentesProximos" :key="f.id" class="mini-fila">
              <div>
                <div class="mini-n">{{ f.nombre }}</div>
                <div class="mini-s">inicia el {{ diaMes(f.fecha_inicio) }}<template v-if="f.codigo || f.area"> · {{ f.codigo || f.area }}</template></div>
              </div>
              <span class="mini-amb">{{ etiquetaProximo(f.fecha_inicio) }}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Mismos tokens que el resto de módulos (Planeamiento): tarjetas = superficie
   + borde de 1px de la app; las celdas del mapa se derivan del fondo. */
.dash {
  --sf: var(--color-surface);
  --so: var(--color-surface-2);
  --ln: var(--color-border);
  --tx: var(--color-text);
  --mu: var(--color-text-muted);
  --em: color-mix(in srgb, var(--color-bg), var(--color-text) 14%);
  --fu: color-mix(in srgb, var(--color-bg), var(--color-text) 6%);
  --ok: #4ade80;
  --am: #f5b93a;
  --rj: #f87171;
  --sombra-pop: 0 12px 28px rgba(0, 0, 0, 0.45);
  color: var(--tx);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
:root[data-theme='light'] .dash {
  --ok: #1b8a4c;
  --am: #b86f00;
  --rj: #b42318;
  --sombra-pop: 0 12px 28px rgba(17, 17, 17, 0.16);
}
.dash * {
  box-sizing: border-box;
}
.dash button,
.dash select,
.dash input {
  font-family: inherit;
}
.dash button {
  cursor: pointer;
}
.dash :focus-visible {
  outline: 2px solid #f6a800;
  outline-offset: 2px;
}
/* Mismo contenedor y padding que Planeamiento (.pl); abajo, 24px. */
main {
  width: 100%;
  max-width: 1800px;
  padding: 32px 40px 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.cab {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 18px;
  row-gap: 4px;
}
h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.02em;
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.cargando,
.vacio {
  color: var(--mu);
  font-size: 14px;
  margin: 0;
}
.manuales {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
  text-decoration: none;
  opacity: 0.7;
}
.manuales:hover {
  opacity: 1;
  text-decoration: underline;
}
.meta-linea {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mu);
}
.act {
  display: flex;
  align-items: center;
  gap: 6px;
}
.punto {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
}

/* Dos columnas: izquierda flexible, derecha fija de 272px con línea vertical */
.dos-col {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 0;
  align-items: flex-start;
}
.izq {
  flex: 999 1 720px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding-right: 28px;
}

/* Frentes en campo */
.frentes-campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fc-cab {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.fc-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.grupo-seg {
  display: flex;
  gap: 2px;
}
.seg {
  border: 0;
  background: transparent;
  color: var(--mu);
  font-size: 14px;
  font-weight: 600;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.seg:hover {
  color: var(--tx);
  background: var(--so);
}
.seg.on {
  background: var(--tx);
  color: var(--color-bg);
}
.fecha-sel {
  border: 0;
  background: transparent;
  font-size: 14px;
  font-weight: 700;
  color: var(--mu);
  padding: 6px 4px;
  color-scheme: dark;
}
:root[data-theme='light'] .fecha-sel {
  color-scheme: light;
}

/* Tarjetas: 3 columnas fijas en escritorio */
.tarjetas {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 1100px) {
  .tarjetas {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .tarjetas {
    grid-template-columns: minmax(0, 1fr);
  }
}
.dc {
  background: var(--sf);
  border: 1px solid var(--ln);
  border-radius: 18px;
  padding: 15px 14px;
  min-height: 112px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s;
}
.dc.clic {
  cursor: pointer;
}
.dc:hover {
  border-color: var(--mu);
}
.dc-fila {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.dc-nombre {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 800;
  min-width: 0;
}
.rep {
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}
.rep.dia {
  color: var(--ok);
}
.rep.tarde {
  color: var(--am);
}
.dc-sup {
  min-width: 0;
  font-size: 13.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dc-esp {
  flex: 1;
  min-height: 8px;
}
.dc-nums {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 800;
}
.dc-nums .hv svg {
  color: var(--mu);
}
.dc-cap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--mu);
  font-weight: 500;
}
.dc-cap svg {
  flex: 0 0 auto;
}
.dc-cap-n {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.restr {
  font-size: 12px;
  font-weight: 600;
  color: var(--am);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ct {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--mu);
  background: var(--so);
  border-radius: 5px;
  padding: 2px 5px;
  vertical-align: 1px;
}

/* Panelito flotante: solo hover / foco, sin estado. Abre hacia la izquierda
   (right:0) y hacia ARRIBA, para que no se corte por el borde inferior de la
   pantalla ni fuerce scroll. */
.hv {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: default;
  border-radius: 8px;
  outline: none;
}
.hv .pop {
  display: none;
  position: absolute;
  right: 0;
  left: auto;
  bottom: calc(100% + 8px);
  top: auto;
  z-index: 30;
  min-width: 190px;
  background: var(--sf);
  color: var(--tx);
  border-radius: 14px;
  border: 1px solid var(--ln);
  padding: 12px 14px;
  box-shadow: var(--sombra-pop);
  font-size: 13px;
  font-weight: 500;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
}
.hv:hover .pop,
.hv:focus-visible .pop {
  display: flex;
}
.hv .pt {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--mu);
  margin-bottom: 4px;
}
.hv .pr {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}
.hv .pr b {
  font-weight: 800;
}
.hv:focus-visible {
  box-shadow: 0 0 0 2px #f6a800;
}

/* Lista */
.l-fila {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) 100px 80px 80px;
  column-gap: 16px;
  align-items: center;
}
.l-cab {
  padding: 0 4px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--mu);
  border-bottom: 1px solid var(--ln);
}
.dd {
  height: 40px;
  padding: 0 4px;
  font-size: 14px;
  border-bottom: 1px solid var(--ln);
}
.dd.clic {
  cursor: pointer;
}
.dd:hover {
  background: var(--so);
}
.l-nombre {
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.l-sup {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.l-cap {
  color: var(--mu);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.der {
  justify-self: end;
  text-align: right;
}
.l-cab .der {
  justify-self: stretch;
}
.dd .hv.der {
  font-weight: 800;
}
.dd .rep {
  font-size: 13px;
}

/* Columna derecha: fija de 272px, línea vertical, sin cajas */
.der-col {
  flex: 0 0 272px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding-left: 28px;
  border-left: 1px solid var(--ln);
  align-self: stretch;
}
.tot2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.tot2.listas {
  margin-top: 18px;
}
.tot-l {
  font-size: 13px;
  font-weight: 600;
  color: var(--mu);
}
.tot-v {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.fila-r {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 13px;
}
.fr-l {
  color: var(--mu);
  font-weight: 500;
}
.fr-l.elip {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 8px;
}
.fr-n {
  font-weight: 800;
}
.sec-borde {
  border-top: 1px solid var(--ln);
  padding-top: 24px;
}
.h2-chico {
  font-size: 15px;
  margin-bottom: 14px;
}
.mini-fila {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}
.mini-n {
  font-size: 14px;
  font-weight: 700;
}
.mini-s {
  font-size: 12px;
  color: var(--mu);
  font-weight: 500;
}
.mini-rojo {
  font-size: 13px;
  font-weight: 800;
  color: var(--rj);
  white-space: nowrap;
}
.mini-amb {
  font-size: 13px;
  font-weight: 800;
  color: var(--am);
  white-space: nowrap;
}

/* Pantalla baja (alto útil < 700px): solo se reduce espacio, no información */
@media (max-height: 700px) {
  .dc {
    min-height: 92px;
    padding: 12px 14px;
  }
  main {
    padding: 18px 40px 12px 28px;
    gap: 14px;
  }
  .izq {
    gap: 16px;
  }
  .der-col {
    gap: 20px;
  }
}

@media (max-width: 900px) {
  .izq {
    padding-right: 0;
  }
  .der-col {
    flex: 1 1 100%;
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid var(--ln);
    padding-top: 20px;
  }
}
@media (max-width: 760px) {
  main {
    padding: 20px 16px 96px;
  }
  .l-fila {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 80px 56px 56px;
  }
  .l-fila > :nth-child(3) {
    display: none;
  }
}

/* ---- Celular: Dashboard general ---- */
.dm {
  --card-ln: var(--ln);
  min-height: 100%;
  padding: 0 16px calc(104px + env(safe-area-inset-bottom, 0px));
}
.dm-top {
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 -16px;
  padding: 12px 16px 10px;
}
.dm-atras {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 11px;
  background: var(--sf);
  box-shadow: 0 0 0 1px var(--ln);
  color: var(--tx);
  font-size: 20px;
  padding: 0;
  touch-action: manipulation;
}
.dm-tit h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.dm-sub {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
}
.dm-pto {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
}
.dm-card {
  background: var(--sf);
  border-radius: 18px;
  box-shadow: 0 0 0 1px var(--ln);
  padding: 14px;
}
.dm-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 4px 0 12px;
}
.dm-k {
  padding: 12px 14px;
  min-width: 0;
}
.dm-lab {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.07em;
  color: var(--mu);
}
.dm-kv {
  font-size: 30px;
  font-weight: 800;
  line-height: 1.1;
}
.dm-ks {
  font-size: 11.5px;
  color: var(--mu);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dm-mapa {
  padding: 14px 12px;
  margin-bottom: 12px;
}
.dm-fh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 2px 10px;
  font-size: 15px;
}
.dm-lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dm-fr {
  padding: 12px 14px;
}
.dm-fr1 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dm-fn {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.dm-fr2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
}
.dm-fs {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dm-fp {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--tx);
  font-weight: 800;
  font-size: 13px;
  flex: 0 0 auto;
}
.dm-pp {
  margin-top: 12px;
  padding: 12px 14px;
}
.dm-ppt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}
.dm-pps {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
  margin-top: 4px;
}
.dm-pill {
  font-size: 11.5px;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 9px;
}
.dm-pill.rojo {
  background: rgba(239, 68, 68, 0.16);
  color: #e5484d;
}
.dm-pill.azul {
  background: rgba(76, 141, 246, 0.16);
  color: #4c8df6;
}
</style>

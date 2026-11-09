<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '../store/dashboard'
import { useAuthStore } from '../../../store/auth'
import { actualizarColorSupervisor } from '../services/dashboardService'
import { useEsMovil } from '../../../composables/useEsMovil'

const dashboard = useDashboardStore()
const auth = useAuthStore()
const router = useRouter()

const esMovil = useEsMovil()
const puedeAbrirReporte = computed(() => auth.tienePermiso('rdc.ver_todos'))
const puedeEditarColores = computed(() => auth.tienePermiso('rdc.catalogos_gestionar'))

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]
const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const nombreMes = computed(() => {
  const m = MESES[dashboard.mapaActividadMes - 1]
  return m.charAt(0).toUpperCase() + m.slice(1)
})
const diasEnMes = computed(() => new Date(dashboard.mapaActividadAnio, dashboard.mapaActividadMes, 0).getDate())

function fechaIso(dia) {
  return `${dashboard.mapaActividadAnio}-${String(dashboard.mapaActividadMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Hoy (fecha local, no UTC): de hoy en adelante la celda es "futura" — el
// reporte de hoy llega mañana.
const hoyIso = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const esFuturo = (dia) => fechaIso(dia) > hoyIso
const esHoy = (dia) => fechaIso(dia) === hoyIso

// Letra del día de la semana sobre cada número (L M X J V S D) — X para
// miércoles, no M, para no repetir la misma letra que martes.
const LETRAS_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
function letraDia(dia) {
  return LETRAS_DIA[new Date(dashboard.mapaActividadAnio, dashboard.mapaActividadMes - 1, dia).getDay()]
}
const esDomingo = (dia) => new Date(dashboard.mapaActividadAnio, dashboard.mapaActividadMes - 1, dia).getDay() === 0

// Frentes que de verdad tuvieron algún reporte EN EL MES QUE SE ESTÁ
// MIRANDO — sin esto, "Todos"/"Cerrados"/"Paralizados" mostraba cualquier
// frente con ese estado en TODO el histórico del Sistema, la mayoría sin
// nada que ver con el mes visible (filas enteras en gris, puro ruido).
const frenteIdsConReporteEsteMes = computed(() => new Set(dashboard.mapaActividad.reportes.map((r) => r.frente_id)))

// "Activo" es el filtro por defecto — es lo que casi siempre se quiere ver
// al entrar. Es también el único que se queda con la lista completa de
// frentes activos, tengan o no reporte este mes.
const filtroEstado = ref('activo')
const frentesFiltrados = computed(() => {
  const porEstado = dashboard.mapaActividad.frentes.filter((f) => filtroEstado.value === 'todos' || f.estado === filtroEstado.value)
  return filtroEstado.value === 'activo' ? porEstado : porEstado.filter((f) => frenteIdsConReporteEsteMes.value.has(f.id))
})

// Agrupados por contrato: Contrato Marco primero, el resto (Sala Eléctrica…)
// después; dentro de cada grupo, alfabético por nombre.
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
const rangoContrato = (nombre) => (/marco/i.test(nombre ?? '') ? 0 : 1)
const grupos = computed(() => {
  const mapa = new Map()
  for (const f of frentesFiltrados.value) {
    const clave = f.contrato_id ?? '—'
    if (!mapa.has(clave)) mapa.set(clave, { clave, nombre: f.contrato_nombre ?? null, frentes: [] })
    mapa.get(clave).frentes.push(f)
  }
  const lista = [...mapa.values()]
  for (const g of lista) g.frentes.sort((a, b) => a.nombre.localeCompare(b.nombre))
  return lista.sort((a, b) => rangoContrato(a.nombre) - rangoContrato(b.nombre) || (a.nombre ?? '').localeCompare(b.nombre ?? ''))
})

// Un frente/fecha puede tener más de un reporte (relevo, turno partido) —
// se agrupan acá para no recorrer todo `reportes` en cada celda.
const reportesPorCelda = computed(() => {
  const mapa = new Map()
  for (const r of dashboard.mapaActividad.reportes) {
    const clave = `${r.frente_id}::${r.fecha}`
    if (!mapa.has(clave)) mapa.set(clave, [])
    mapa.get(clave).push(r)
  }
  return mapa
})
function reportesDeCelda(frenteId, dia) {
  return reportesPorCelda.value.get(`${frenteId}::${fechaIso(dia)}`) ?? []
}

// Color por supervisor: arranca de un hash de su id (para que tienda a ser
// el mismo mes a mes), pero el hash solo puede repartir entre 20 colores —
// con varios supervisores visibles a la vez, dos podían caer en el mismo
// número y quedar indistinguibles en el mapa. Por eso el color final no es
// el hash crudo: se resuelve una sola vez por mes, en orden de hash, y si
// el color "natural" de alguien ya lo tomó otro supervisor DE ESTE MISMO
// MES, se le corre al siguiente libre.
const PALETA = [
  '#3B82F6', '#A855F7', '#14B8A6', '#F43F5E', '#F59E0B', '#84CC16',
  '#EC4899', '#06B6D4', '#8B5CF6', '#F97316', '#10B981', '#EF4444',
  '#0EA5E9', '#D946EF', '#65A30D', '#CA8A04', '#7C3AED', '#DB2777',
  '#059669', '#DC2626',
]
function hashId(id) {
  let hash = 0
  for (const c of id ?? '') hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return hash
}

// Nombre + color por supervisor, ya sin colisiones — el mapa de celdas y la
// leyenda leen los dos de acá, así siempre coinciden entre sí. Quien tiene
// un color fijado a mano (rdc_supervisores.color) lo usa tal cual.
const supervisoresDelMes = computed(() => {
  const nombres = new Map()
  for (const r of dashboard.mapaActividad.reportes) {
    if (r.supervisor_id && !nombres.has(r.supervisor_id)) {
      nombres.set(r.supervisor_id, { nombre: r.supervisor, colorFijo: r.supervisor_color ?? null })
    }
  }

  const resultado = new Map()
  const usados = new Set()
  const conColorFijo = [...nombres.entries()].filter(([, v]) => v.colorFijo)
  const automaticos = [...nombres.entries()].filter(([, v]) => !v.colorFijo).sort((a, b) => hashId(a[0]) - hashId(b[0]))

  for (const [id, v] of conColorFijo) {
    resultado.set(id, { id, nombre: v.nombre, color: v.colorFijo })
    const idxOcupado = PALETA.indexOf(v.colorFijo)
    if (idxOcupado !== -1) usados.add(idxOcupado)
  }
  for (const [id, v] of automaticos) {
    let idx = hashId(id) % PALETA.length
    while (usados.has(idx)) idx = (idx + 1) % PALETA.length
    usados.add(idx)
    resultado.set(id, { id, nombre: v.nombre, color: PALETA[idx] })
  }
  return resultado
})

// Cambiar color: se actualiza local (para verse al toque en el mapa y la
// leyenda) y en paralelo se guarda en rdc_supervisores. `null` = volver al
// color automático.
async function cambiarColor(supervisorId, nuevoColor) {
  for (const r of dashboard.mapaActividad.reportes) {
    if (r.supervisor_id === supervisorId) r.supervisor_color = nuevoColor
  }
  try {
    await actualizarColorSupervisor(supervisorId, nuevoColor)
  } catch (e) {
    console.error(e)
    alert('No se pudo guardar el color. Intenta de nuevo.')
  }
}

function colorSupervisor(id) {
  return supervisoresDelMes.value.get(id)?.color ?? '#9CA3AF'
}

// Celda: con reporte → color del supervisor (dos colores si hubo relevo);
// hoy y días futuros → --fu; cualquier día anterior sin reporte → --em
// (uniforme, también antes de que el frente inicie).
function estiloCelda(frenteId, dia) {
  const reps = reportesDeCelda(frenteId, dia)
  if (!reps.length) return { background: esFuturo(dia) || esHoy(dia) ? 'var(--fu)' : 'var(--em)' }
  if (reps.length === 1) return { background: colorSupervisor(reps[0].supervisor_id) }
  const [a, b] = reps
  return { background: `linear-gradient(135deg, ${colorSupervisor(a.supervisor_id)} 50%, ${colorSupervisor(b.supervisor_id)} 50%)` }
}
function etiquetaCelda(f, dia) {
  const reps = reportesDeCelda(f.id, dia)
  const fecha = `${dia} ${MESES_ABREV[dashboard.mapaActividadMes - 1]}`
  if (reps.length) return `${f.nombre} · ${fecha} · ${reps.map((r) => r.supervisor).join(' / ')}`
  if (esHoy(dia)) return `${f.nombre} · ${fecha} · el reporte llega mañana`
  if (esFuturo(dia)) return `${f.nombre} · ${fecha}`
  return `${f.nombre} · ${fecha} · sin reporte`
}

// Un supervisor que ya no está en el contrato deja de reportar, pero sus
// reportes viejos de este mes seguían "ganándole" un puesto en la leyenda
// hasta fin de mes. Por eso la leyenda solo lista a quien reportó en los
// últimos 5 días; fuera del mes actual se muestra el mes completo.
const HOY = new Date()
const esMesActual = computed(() => dashboard.mapaActividadAnio === HOY.getFullYear() && dashboard.mapaActividadMes === HOY.getMonth() + 1)
function fechaIsoHace(dias) {
  const d = new Date(HOY)
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const leyenda = computed(() => {
  const lista = [...supervisoresDelMes.value.values()]
  if (!esMesActual.value) return lista.sort((a, b) => a.nombre.localeCompare(b.nombre))

  const limite = fechaIsoHace(5)
  const idsRecientes = new Set(
    dashboard.mapaActividad.reportes.filter((r) => r.fecha >= limite).map((r) => r.supervisor_id),
  )
  return lista.filter((s) => idsRecientes.has(s.id)).sort((a, b) => a.nombre.localeCompare(b.nombre))
})

// Franja de detalle: al hacer clic en una celda con reporte aparece debajo
// del mapa — mismo clic la cierra, otra celda la reemplaza.
const celdaAbierta = ref(null)
function onClickCelda(f, dia) {
  const reps = reportesDeCelda(f.id, dia)
  if (!reps.length) {
    celdaAbierta.value = null
    return
  }
  const clave = `${f.id}::${dia}`
  celdaAbierta.value = celdaAbierta.value?.clave === clave
    ? null
    : { clave, frenteNombre: f.nombre, fecha: `${dia} ${MESES_ABREV[dashboard.mapaActividadMes - 1]} ${dashboard.mapaActividadAnio}`, reportes: reps }
}

function irAlReporte(id) {
  celdaAbierta.value = null
  router.push({ name: 'rdc-detalle', params: { id } })
}

// Al entrar, en pantallas angostas el calendario arrancaba en el día 1: se
// centra en hoy (solo si el mes visible es el actual).
// Ancho de la columna de nombres: el del frente más largo, para que todos
// entren completos (aprox. 7.6px por carácter a 13px/700).
const anchoNombre = computed(() => {
  const mayor = Math.max(0, ...frentesFiltrados.value.map((f) => (f.nombre ?? '').length))
  return `${Math.max(204, Math.ceil(mayor * 7.4) + 4)}px`
})
const scrollRef = ref(null)
function centrarEnHoy() {
  const hoy = new Date()
  if (dashboard.mapaActividadAnio !== hoy.getFullYear() || dashboard.mapaActividadMes !== hoy.getMonth() + 1) return
  nextTick(() => {
    const el = scrollRef.value?.querySelector(`[data-dia="${hoy.getDate()}"]`)
    if (!el || !scrollRef.value) return
    scrollRef.value.scrollLeft = Math.max(0, el.offsetLeft - scrollRef.value.clientWidth / 2)
  })
}
watch(() => dashboard.mapaActividad, centrarEnHoy, { immediate: true })

// ---- Celular: últimos 14 días, sin scroll horizontal ----------------------
// El ancho de cada celda NO puede depender de cuántos días se muestran: a
// inicio de mes (p. ej. día 9) hay menos de 14 días y, con `repeat(N, 1fr)`,
// las celdas se estiraban para llenar todo el ancho. La grilla siempre tiene
// 14 columnas del mismo ancho; si hay menos días, el resto queda vacío.
const COLUMNAS_MOVIL = 14
const plantillaColsMovil = `78px repeat(${COLUMNAS_MOVIL}, minmax(0, 1fr))`
const dias14 = computed(() => {
  const fin = esMesActual.value ? HOY.getDate() : diasEnMes.value
  const ini = Math.max(1, fin - (COLUMNAS_MOVIL - 1))
  return Array.from({ length: fin - ini + 1 }, (_, i) => ini + i)
})
const filasMovil = computed(() => grupos.value.flatMap((g) => g.frentes))
const mostrarLeyenda = ref(false)
</script>

<template>
  <!-- ===== Celular: últimos 14 días, una fila por frente ===== -->
  <div v-if="esMovil" class="mm">
    <div class="mm-cab">
      <b class="mm-tit">Mapa de actividad</b>
      <div class="mm-mes">
        <button type="button" aria-label="Mes anterior" @click="dashboard.cambiarMesMapaActividad(-1)">‹</button>
        <span>{{ nombreMes.slice(0, 3) }} {{ dashboard.mapaActividadAnio }}</span>
        <button type="button" aria-label="Mes siguiente" @click="dashboard.cambiarMesMapaActividad(1)">›</button>
      </div>
    </div>
    <p v-if="dashboard.cargandoMapaActividad" class="mm-aviso">Cargando…</p>
    <p v-else-if="!filasMovil.length" class="mm-aviso">No hay frentes para mostrar.</p>
    <template v-else>
      <div class="mm-grid mm-dias" :style="{ gridTemplateColumns: plantillaColsMovil }">
        <span></span>
        <div v-for="d in dias14" :key="d" class="mm-dia" :class="{ dom: esDomingo(d) }">
          {{ letraDia(d) }}<br /><b>{{ d }}</b>
        </div>
      </div>
      <div
        v-for="f in filasMovil"
        :key="f.id"
        class="mm-grid mm-fila"
        :style="{ gridTemplateColumns: plantillaColsMovil }"
      >
        <b class="mm-n" :title="f.nombre">{{ f.nombre }}</b>
        <button
          v-for="d in dias14"
          :key="d"
          type="button"
          class="mm-celda"
          :style="estiloCelda(f.id, d)"
          :aria-label="etiquetaCelda(f, d)"
          @click="onClickCelda(f, d)"
        ></button>
      </div>
      <div class="mm-pie">
        <span>Últimos 14 días · toca una celda</span>
        <button type="button" class="mm-ley-btn" :aria-expanded="mostrarLeyenda" @click="mostrarLeyenda = !mostrarLeyenda">Leyenda</button>
      </div>
      <div v-if="mostrarLeyenda" class="mm-ley">
        <span v-for="s in leyenda" :key="s.id" class="mm-ley-i"><span class="mm-sq" :style="{ background: s.color }"></span>{{ s.nombre }}</span>
        <span class="mm-ley-i"><span class="mm-sq" style="background: var(--em)"></span>Sin reporte</span>
      </div>
      <div v-if="celdaAbierta" class="mm-sel">
        <div v-for="(r, i) in celdaAbierta.reportes" :key="r.id" class="mm-sel-f">
          <span class="mm-sq" :style="{ background: colorSupervisor(r.supervisor_id) }"></span>
          <div class="mm-sel-t"><b>{{ celdaAbierta.frenteNombre }} · {{ celdaAbierta.fecha }}</b><span> — {{ r.supervisor }}</span></div>
          <button v-if="puedeAbrirReporte" type="button" class="mm-ley-btn" @click="irAlReporte(r.id)">Abrir</button>
          <button v-if="i === 0" type="button" class="mm-x" aria-label="Cerrar" @click="celdaAbierta = null">✕</button>
        </div>
      </div>
    </template>
  </div>

  <div v-else class="mapa">
    <div class="m-cab">
      <div class="m-nav">
        <h2>Mapa de actividad</h2>
        <button type="button" class="ic" aria-label="Mes anterior" @click="dashboard.cambiarMesMapaActividad(-1)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <span class="m-mes">{{ nombreMes }} {{ dashboard.mapaActividadAnio }}</span>
        <button type="button" class="ic" aria-label="Mes siguiente" @click="dashboard.cambiarMesMapaActividad(1)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      <select v-model="filtroEstado" class="m-filtro" aria-label="Filtrar frentes">
        <option value="activo">Solo activos</option>
        <option value="todos">Todos los frentes</option>
        <option value="paralizado">Solo paralizados</option>
        <option value="cerrado">Solo cerrados</option>
        <option value="planificado">Solo planificados</option>
      </select>
    </div>

    <p v-if="dashboard.cargandoMapaActividad" class="m-aviso">Cargando…</p>
    <p v-else-if="!frentesFiltrados.length" class="m-aviso">No hay frentes para mostrar con este filtro.</p>

    <template v-else>
      <div ref="scrollRef" class="m-scroll" :style="{ '--w-nombre': anchoNombre }">
        <div class="m-min">
          <!-- Cabecera de días -->
          <div class="m-cab-dias">
            <span></span>
            <div class="m-grid" :style="{ gridTemplateColumns: `repeat(${diasEnMes}, var(--cel))` }">
              <span v-for="d in diasEnMes" :key="d" class="m-dia" :class="{ dom: esDomingo(d) }" :data-dia="d">
                <span class="m-dia-l">{{ letraDia(d) }}</span>
                <span class="m-dia-n" :class="{ fut: esFuturo(d) || esHoy(d) }">{{ d }}</span>
              </span>
            </div>
          </div>

          <!-- Grupos por contrato -->
          <div v-for="(g, gi) in grupos" :key="g.clave" class="m-grupo" :style="gi > 0 ? 'margin-top: 8px' : ''">
            <div class="m-tag" :title="g.nombre ?? ''">
              <template v-if="g.nombre">
                <span class="m-linea"></span><span class="ct">{{ siglas(g.nombre) }}</span><span class="m-linea"></span>
              </template>
            </div>
            <div class="m-filas">
              <div v-for="f in g.frentes" :key="f.id" class="m-fila">
                <span class="m-nombre" :title="f.nombre">{{ f.nombre }}</span>
                <div class="m-grid" :style="{ gridTemplateColumns: `repeat(${diasEnMes}, var(--cel))` }">
                  <button
                    v-for="d in diasEnMes"
                    :key="d"
                    type="button"
                    class="m-celda"
                    :class="{ clic: reportesDeCelda(f.id, d).length }"
                    :style="estiloCelda(f.id, d)"
                    :title="etiquetaCelda(f, d)"
                    :aria-label="etiquetaCelda(f, d)"
                    @click="onClickCelda(f, d)"
                  ></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Leyenda -->
      <div class="m-leyenda">
        <span v-for="s in leyenda" :key="s.id" class="m-ley">
          <label v-if="puedeEditarColores" class="m-sq m-sq-edit" :style="{ background: s.color }" :title="`Cambiar el color de ${s.nombre}`">
            <input type="color" :value="s.color" :aria-label="`Color de ${s.nombre}`" @input="cambiarColor(s.id, $event.target.value)" />
          </label>
          <span v-else class="m-sq" :style="{ background: s.color }"></span>
          {{ s.nombre }}
        </span>
        <span class="m-ley"><span class="m-sq" style="background: var(--em)"></span>Sin reporte</span>
      </div>

      <!-- Franja de detalle de la celda elegida -->
      <div v-if="celdaAbierta" class="m-sel">
        <div v-for="(r, i) in celdaAbierta.reportes" :key="r.id" class="m-sel-fila">
          <span class="m-sq grande" :style="{ background: colorSupervisor(r.supervisor_id) }"></span>
          <div class="m-sel-txt"><b>{{ celdaAbierta.frenteNombre }} · {{ celdaAbierta.fecha }}</b><span class="m-sel-sup"> — {{ r.supervisor }}</span></div>
          <button v-if="puedeAbrirReporte" type="button" class="m-abrir" @click="irAlReporte(r.id)">Abrir reporte</button>
          <button v-if="i === 0" type="button" class="ic" aria-label="Cerrar" @click="celdaAbierta = null">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mapa *,
.mapa {
  box-sizing: border-box;
}
.mapa {
  --cel: 19px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
h2 {
  margin: 0 14px 0 0;
  font-size: 18px;
  font-weight: 800;
}
.m-cab {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.m-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}
.m-mes {
  font-size: 14px;
  font-weight: 700;
  min-width: 104px;
  text-align: center;
}
.ic {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--mu);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
}
.ic:hover {
  background: var(--so);
  color: var(--tx);
}
.m-filtro {
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--mu);
  padding: 6px 4px;
  color-scheme: dark;
}
:root[data-theme='light'] .m-filtro {
  color-scheme: light;
}
.m-aviso {
  color: var(--mu);
  font-size: 14px;
  margin: 0;
}

.m-scroll {
  overflow-x: auto;
}
.m-min {
  min-width: 780px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}
.m-cab-dias {
  display: grid;
  grid-template-columns: calc(26px + 12px + var(--w-nombre)) 1fr;
  column-gap: 12px;
  align-items: end;
}
.m-grid {
  display: grid;
  gap: 4px;
  justify-content: center;
}
.m-dia {
  text-align: center;
  line-height: 1.25;
  border-radius: 8px;
  padding: 3px 0;
}
.m-dia.dom {
  background: var(--so);
}
.m-dia-l {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--mu);
}
.m-dia.dom .m-dia-l {
  color: #d98a84;
}
.m-dia-n {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: var(--tx);
}
.m-dia-n.fut {
  color: var(--mu);
}
.m-dia.dom .m-dia-n {
  color: #d9534f;
}
.m-grupo {
  display: grid;
  grid-template-columns: 26px 1fr;
  column-gap: 12px;
}
.m-tag {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.m-linea {
  flex: 1;
  width: 1px;
  background: var(--ln);
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
}
.m-filas {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.m-fila {
  display: grid;
  grid-template-columns: var(--w-nombre) 1fr;
  column-gap: 12px;
  align-items: center;
}
.m-nombre {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-celda {
  width: 100%;
  justify-self: stretch;
  aspect-ratio: 1 / 1;
  height: auto;
  border-radius: 5px;
  border: 0;
  padding: 0;
  cursor: default;
}
.m-celda.clic {
  cursor: pointer;
}

.m-leyenda {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 4px;
}
.m-ley {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mu);
}
.m-sq {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}
.m-sq.grande {
  width: 12px;
  height: 12px;
  border-radius: 4px;
}
.m-sq-edit {
  position: relative;
  cursor: pointer;
}
.m-sq-edit input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  padding: 0;
  border: 0;
}

.m-sel {
  border-top: 1px solid var(--ln);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.m-sel-fila {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.m-sel-txt {
  flex: 1;
  min-width: 200px;
  font-size: 14px;
}
.m-sel-sup {
  color: var(--mu);
  font-weight: 500;
}
.m-abrir {
  border: 0;
  background: var(--sf);
  color: var(--mu);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  box-shadow: 0 0 0 1px var(--ln);
  cursor: pointer;
}
.m-abrir:hover {
  color: var(--tx);
}

/* Pantalla baja (alto útil < 700px): menos aire, mismos datos */
@media (max-height: 700px) {
  .mapa {
    gap: 8px;
  }
  .mapa {
    --cel: 17px;
  }
}

/* ---- Celular ---- */
.mm {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.mm * {
  box-sizing: border-box;
}
.mm-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.mm-tit {
  font-size: 15px;
  font-weight: 800;
}
.mm-mes {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--mu);
}
.mm-mes button {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 20px;
  line-height: 1;
  touch-action: manipulation;
}
.mm-aviso {
  margin: 0;
  font-size: 13px;
  color: var(--mu);
}
.mm-grid {
  display: grid;
  column-gap: 3px;
  align-items: center;
}
.mm-dias {
  margin-bottom: 2px;
}
.mm-dia {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--mu);
  text-align: center;
  line-height: 1.15;
}
.mm-dia b {
  font-size: 9.5px;
  color: var(--tx);
}
.mm-dia.dom,
.mm-dia.dom b {
  color: #e5484d;
}
.mm-fila {
  margin-top: 3px;
}
.mm-n {
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 4px;
}
.mm-celda {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 0;
  border-radius: 4px;
  padding: 0;
  touch-action: manipulation;
}
/* Navegadores viejos (Chrome < 88) no conocen aspect-ratio y la celda salía
   como un rectángulo alto: el padding en % se mide sobre el ancho y la deja
   cuadrada igual. */
@supports not (aspect-ratio: 1 / 1) {
  .mm-celda {
    height: 0;
    padding-bottom: 100%;
  }
}
.mm-pie {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--mu);
  font-weight: 600;
}
.mm-ley-btn {
  border: 0;
  background: var(--sf);
  box-shadow: 0 0 0 1px var(--ln);
  color: var(--mu);
  height: 30px;
  padding: 0 12px;
  border-radius: 10px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  touch-action: manipulation;
}
.mm-ley {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 6px;
}
.mm-ley-i {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mu);
}
.mm-sq {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: 0 0 auto;
}
.mm-sel {
  border-top: 1px solid var(--ln);
  margin-top: 8px;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mm-sel-f {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mm-sel-t {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
}
.mm-sel-t span {
  color: var(--mu);
}
.mm-x {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--mu);
  touch-action: manipulation;
}
</style>

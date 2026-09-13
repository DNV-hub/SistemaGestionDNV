<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useDashboardStore } from '../store/dashboard'
import { useAuthStore } from '../../../store/auth'
import SupervisorPanelView from '../../vales/views/SupervisorPanelView.vue'

const dashboard = useDashboardStore()
const auth = useAuthStore()

// El Supervisor trabaja desde el celular y no necesita este dashboard: su
// "dashboard" es directamente su panel de stock + solicitud + historial.
const esSupervisor = computed(() => auth.nombreRol === 'Supervisor')

const permisos = computed(() => ({
  rdcCampo: auth.tienePermiso('rdc.ver_todos'),
  frentes: auth.tienePermiso('frentes.ver'),
  stock: auth.tienePermiso('stock.ver'),
  alertas: auth.tienePermiso('alertas.ver'),
}))

if (!esSupervisor.value) dashboard.cargar(permisos.value)

const saludo = computed(() => {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
})

// Solo la primera letra en mayúscula (el día de la semana) — el resto
// queda en minúscula tal como lo arma toLocaleDateString, que es lo
// correcto en español ("domingo, 13 de setiembre de 2026"). Antes había un
// text-transform:capitalize en el CSS que ponía mayúscula a CADA palabra,
// incluido el conector "de" ("13 De Setiembre De 2026") — se ve mal y no
// es cómo se escribe en español.
const fechaLegible = computed(() => {
  const texto = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
})

// "Actualizado hace X min", igual que un feed en vivo — se recalcula solo
// cada 30s mientras la pantalla sigue abierta, sin volver a pedir nada.
const ahora = ref(Date.now())
let intervaloReloj = null
onMounted(() => {
  intervaloReloj = setInterval(() => (ahora.value = Date.now()), 30_000)
})
onUnmounted(() => clearInterval(intervaloReloj))
const hace = computed(() => {
  if (!dashboard.actualizadoEn) return ''
  const seg = Math.floor((ahora.value - dashboard.actualizadoEn.getTime()) / 1000)
  if (seg < 60) return 'justo ahora'
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h`
})

// ---------------------------------------------------------------------------
// Frentes en campo
// ---------------------------------------------------------------------------
const PERSONAL_DIRECTO = ['Capataz', 'Operario', 'Oficial', 'Peón', 'Vigía']
const ICONOS_PERSONAL = {
  Capataz: '<path d="M2 9.5a6 6 0 0112 0"/><rect x="1.5" y="9.5" width="13" height="2.3" rx="1"/>',
  Operario: '<circle cx="8" cy="5" r="2.4"/><path d="M3.5 14c0-2.8 2-4.7 4.5-4.7s4.5 1.9 4.5 4.7"/>',
  Oficial: '<path d="M2 14l4-4M13 2l1 1-8 8-2.5 1.5L5 6z"/>',
  Peón: '<path d="M3 13l3.5-3.5M9 3l4 4-6 6-4-4z"/>',
  Vigía: '<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>',
}
const ICONO_EQUIPO = '<rect x="1.5" y="6" width="8" height="5.5" rx="1"/><path d="M9.5 8h2.3L14 10.2V11.5h-4.5"/>'
const ICONO_GRUPO = '<circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><path d="M1.5 14c0-2.2 1.6-4 3.5-4s3.5 1.8 3.5 4M8.5 14c0-2.2 1.6-4 3.5-4s3.5 1.8 3.5 4"/>'

// En celular la tarjeta de cada frente no muestra el detalle de Personal/
// Equipos siempre abierto (no entra en la pantalla) — arranca en dos
// "píldoras" con el total, y se despliega la lista al tocarlas. En
// escritorio esto no se usa: ahí las dos columnas van siempre visibles
// (ver .fc-cols-desktop / .fc-cols-movil en el CSS).
const detallesAbiertos = ref(new Set())
function alternarDetalle(frenteId, tipo) {
  const clave = `${frenteId}:${tipo}`
  const copia = new Set(detallesAbiertos.value)
  if (copia.has(clave)) copia.delete(clave)
  else copia.add(clave)
  detallesAbiertos.value = copia
}
function detalleAbierto(frenteId, tipo) {
  return detallesAbiertos.value.has(`${frenteId}:${tipo}`)
}

// Colores estables por frente (por id, no por posición): para que un mismo
// frente no cambie de color cada vez que la lista se reordena.
const PALETA_FRENTE = ['#8B5CF6', '#14B8A6', '#EC4899', '#6366F1', '#06B6D4', '#F59E0B', '#84CC16', '#F43F5E']
function colorFrente(id) {
  let hash = 0
  for (const c of id ?? '') hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return PALETA_FRENTE[hash % PALETA_FRENTE.length]
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
const MAX_EQUIPOS_VISIBLES = 4
function equiposVisibles(fila) {
  return equiposAgrupados(fila).slice(0, MAX_EQUIPOS_VISIBLES)
}
function equiposRestantes(fila) {
  return Math.max(0, equiposAgrupados(fila).length - MAX_EQUIPOS_VISIBLES)
}
function totalMaquinariaFrente(fila) {
  return fila.maquinaria.reduce((s, m) => s + m.cantidad, 0)
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

// ---------------------------------------------------------------------------
// Totales "Total in site" (personal y equipos, sumados entre todos los
// frentes en campo)
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
  // Se muestran los 5 tipos con más unidades, pero el total de arriba suma
  // TODO lo que hay en mina, no solo lo que entra en esos 5 renglones.
  const lista = [...porTipo.entries()]
    .map(([tipo, cantidad]) => ({ tipo, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5)
  const total = dashboard.frentesEnCampo.reduce((acc, f) => acc + totalMaquinariaFrente(f), 0)
  return { lista, total }
})

// ---------------------------------------------------------------------------
// Próximos frentes / Paralizados
// ---------------------------------------------------------------------------
const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
function fechaBox(fechaIso) {
  const [, m, d] = fechaIso.split('-').map(Number)
  return { d, m: MESES_ABREV[m - 1] }
}
function diasEntre(fechaIso) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const [y, m, d] = fechaIso.split('-').map(Number)
  return Math.round((new Date(y, m - 1, d) - hoy) / 86_400_000)
}
function etiquetaProximo(fechaIso) {
  const dias = diasEntre(fechaIso)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  return `En ${dias} días`
}
function diasParalizado(updatedAt) {
  return Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 86_400_000))
}
function etiquetaParalizado(updatedAt) {
  const dias = diasParalizado(updatedAt)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return '1 día'
  return `${dias} días`
}
</script>

<template>
  <SupervisorPanelView v-if="esSupervisor" />

  <div v-else class="dashboard">
    <header class="page-head">
      <div class="greet">{{ saludo }}, {{ auth.perfil?.nombre }} <span>· {{ fechaLegible }}</span></div>
      <div v-if="!dashboard.cargando" class="live"><span class="live-dot"></span>Actualizado {{ hace }}</div>
    </header>

    <p v-if="dashboard.cargando">Cargando…</p>

    <div v-else class="grid">
      <!-- FRENTES EN CAMPO -->
      <section v-if="permisos.rdcCampo" class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Frentes en campo</div>
            <div class="card-desc">Según el reporte diario de cada supervisor — hoy o el más reciente disponible</div>
          </div>
        </div>

        <p v-if="!dashboard.frentesEnCampo.length" class="vacio">Ningún frente tiene reporte diario de ayer ni de hoy todavía.</p>

        <div v-else class="frentes-scroll">
          <div v-for="f in dashboard.frentesEnCampo" :key="f.frente?.id" class="frente-card">
            <div class="fc-top">
              <span class="fc-dot" :style="{ background: colorFrente(f.frente?.id) }"></span>
              <span class="fc-code">{{ f.frente?.codigo ?? f.frente?.nombre }}</span>
              <span class="fc-status" :class="{ ayer: !f.esHoy }"><span class="lamp"></span>{{ f.esHoy ? 'HOY' : 'AYER' }}</span>
            </div>
            <div class="fc-sup-name">{{ f.supervisor }}</div>
            <div v-if="f.capataz" class="fc-sup-cap">Capataz {{ f.capataz }}</div>

            <!-- Escritorio: las dos columnas siempre visibles (hay lugar de sobra). -->
            <div class="fc-cols fc-cols-desktop">
              <div class="fc-col">
                <div class="fc-col-label">Personal ({{ totalPersonalFrente(f) }})</div>
                <div v-for="categoria in PERSONAL_DIRECTO" :key="categoria" class="role-row">
                  <svg viewBox="0 0 16 16" v-html="ICONOS_PERSONAL[categoria]"></svg>
                  <span class="lbl">{{ categoria }}</span>
                  <span class="cnt">{{ personalDe(f, categoria) }}</span>
                </div>
              </div>
              <div class="fc-col">
                <div class="fc-col-label">Equipos ({{ totalMaquinariaFrente(f) }})</div>
                <div v-if="!equiposAgrupados(f).length" class="eq-vacio">Sin equipos registrados</div>
                <div v-for="eq in equiposVisibles(f)" :key="eq.tipo" class="eq-row">
                  <svg viewBox="0 0 16 16" v-html="ICONO_EQUIPO"></svg>
                  <span class="name">{{ eq.tipo }}</span>
                  <span class="cnt">{{ eq.cantidad }}</span>
                </div>
                <div v-if="equiposRestantes(f)" class="eq-row">
                  <svg viewBox="0 0 16 16" v-html="ICONO_EQUIPO"></svg>
                  <span class="name">+ {{ equiposRestantes(f) }} más</span>
                  <span class="cnt"></span>
                </div>
              </div>
            </div>

            <!-- Celular: dos píldoras con el total, se despliegan al tocarlas
                 (no entran las dos columnas completas en una pantalla angosta). -->
            <div class="fc-stats fc-cols-movil">
              <button
                type="button"
                class="fc-stat"
                :class="{ open: detalleAbierto(f.frente?.id, 'personal') }"
                @click="alternarDetalle(f.frente?.id, 'personal')"
              >
                <svg viewBox="0 0 16 16" v-html="ICONO_GRUPO"></svg>
                <span class="lbl">Personal</span>
                <span class="num">{{ totalPersonalFrente(f) }}</span>
                <svg class="chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3"/></svg>
              </button>
              <button
                type="button"
                class="fc-stat"
                :class="{ open: detalleAbierto(f.frente?.id, 'equipos') }"
                @click="alternarDetalle(f.frente?.id, 'equipos')"
              >
                <svg viewBox="0 0 16 16" v-html="ICONO_EQUIPO"></svg>
                <span class="lbl">Equipos</span>
                <span class="num">{{ totalMaquinariaFrente(f) }}</span>
                <svg class="chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3"/></svg>
              </button>
            </div>
            <div v-if="detalleAbierto(f.frente?.id, 'personal')" class="fc-detail fc-cols-movil">
              <div v-for="categoria in PERSONAL_DIRECTO" :key="categoria" class="fc-detail-row">
                <svg viewBox="0 0 16 16" v-html="ICONOS_PERSONAL[categoria]"></svg>
                <span class="lbl">{{ categoria }}</span>
                <span class="cnt">{{ personalDe(f, categoria) }}</span>
              </div>
            </div>
            <div v-if="detalleAbierto(f.frente?.id, 'equipos')" class="fc-detail fc-cols-movil">
              <div v-if="!equiposAgrupados(f).length" class="eq-vacio">Sin equipos registrados</div>
              <div v-for="eq in equiposAgrupados(f)" :key="eq.tipo" class="fc-detail-row">
                <svg viewBox="0 0 16 16" v-html="ICONO_EQUIPO"></svg>
                <span class="lbl">{{ eq.tipo }}</span>
                <span class="cnt">{{ eq.cantidad }}</span>
              </div>
            </div>

            <div v-if="f.restriccion" class="fc-restriccion">
              <svg viewBox="0 0 16 16"><path d="M8 1.5L1.5 13.5h13L8 1.5z"/><path d="M8 6.5v3"/><circle cx="8" cy="11.2" r="0.6" fill="currentColor" stroke="none"/></svg>
              <div class="fc-restriccion-text"><b>Restricción:</b> {{ textoRestriccion(f) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- COLUMNA DERECHA -->
      <div class="side-col">
        <section v-if="permisos.frentes && dashboard.frentesProximos.length" class="card">
          <div class="card-head compacto"><div class="card-title chico">Próximos frentes</div></div>
          <div class="mini-body">
            <div v-for="f in dashboard.frentesProximos" :key="f.id" class="mini-row">
              <div class="prox-date"><div class="d">{{ fechaBox(f.fecha_inicio).d }}</div><div class="m">{{ fechaBox(f.fecha_inicio).m }}</div></div>
              <div class="mini-info">
                <div class="mini-name">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</div>
                <div class="mini-sub">{{ f.area ?? 'Sin área asignada' }}</div>
              </div>
              <span class="mini-chip soon">{{ etiquetaProximo(f.fecha_inicio) }}</span>
            </div>
          </div>
        </section>

        <section v-if="permisos.frentes && dashboard.frentesParalizados.length" class="card">
          <div class="card-head compacto"><div class="card-title chico">Frentes paralizados</div></div>
          <div class="mini-body">
            <div v-for="f in dashboard.frentesParalizados" :key="f.id" class="mini-row">
              <div class="stop-icon"><svg viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M1.5 10.5h13"/></svg></div>
              <div class="mini-info">
                <div class="mini-name">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</div>
                <div class="mini-sub">{{ f.area ?? 'Sin área asignada' }}</div>
              </div>
              <span class="mini-chip stop">{{ etiquetaParalizado(f.updated_at) }}</span>
            </div>
          </div>
        </section>

        <div v-if="permisos.rdcCampo && dashboard.frentesEnCampo.length" class="totals-row">
          <section class="card">
            <div class="card-head compacto"><div class="card-title chico">Personal</div><div class="summary-num">{{ totalesPersonal.total }}</div></div>
            <div class="summary-grid una-col">
              <div v-for="d in totalesPersonal.directos" :key="d.categoria" class="role-row">
                <svg viewBox="0 0 16 16" v-html="ICONOS_PERSONAL[d.categoria]"></svg>
                <span class="lbl">{{ d.categoria }}</span>
                <span class="cnt">{{ d.total }}</span>
              </div>
              <div v-if="totalesPersonal.otros" class="role-row">
                <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/></svg>
                <span class="lbl">Otros</span>
                <span class="cnt">{{ totalesPersonal.otros }}</span>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head compacto"><div class="card-title chico">Equipos</div><div class="summary-num">{{ totalesMaquinaria.total }}</div></div>
            <div class="summary-grid una-col">
              <div v-for="eq in totalesMaquinaria.lista" :key="eq.tipo" class="eq-row">
                <svg viewBox="0 0 16 16" v-html="ICONO_EQUIPO"></svg>
                <span class="name">{{ eq.tipo }}</span>
                <span class="cnt">{{ eq.cantidad }}</span>
              </div>
            </div>
          </section>
        </div>

        <section v-if="permisos.stock && dashboard.stockCritico.length" class="card">
          <div class="card-head compacto"><div class="card-title chico">Materiales con stock crítico</div></div>
          <div class="mat-body">
            <div class="mat-hero"><div class="mat-num">{{ dashboard.stockCritico.length }}</div><div class="mat-label">materiales bajo el mínimo</div></div>
            <div class="mat-list">
              <div v-for="(m, i) in dashboard.stockCritico.slice(0, 6)" :key="i" class="mat-list-row">
                <span class="n">{{ m.material_codigo }} — {{ m.material_descripcion }}</span>
                <span class="q">{{ m.cantidad_disponible }} {{ m.material_unidad }}</span>
              </div>
            </div>
          </div>
        </section>

        <section v-if="permisos.alertas && dashboard.alertasRecientes.length" class="card">
          <div class="card-head compacto"><div class="card-title chico">Alertas</div></div>
          <div class="mini-body">
            <div v-for="a in dashboard.alertasRecientes" :key="a.id" class="mini-row">
              <div class="alerta-icon" :class="a.nivel === 'critica' ? 'danger' : a.nivel === 'info' ? 'info' : 'warn'">
                <svg viewBox="0 0 16 16"><path d="M8 1.5L1.5 13.5h13L8 1.5z"/><path d="M8 6v4M8 11v1"/></svg>
              </div>
              <div>
                <div class="alerta-title">{{ a.mensaje }}</div>
                <div class="alerta-sub">{{ new Date(a.created_at).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 1.25rem 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  height: 100%;
  min-height: 0;
}
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.greet {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
}
.greet span {
  font-weight: 400;
  color: var(--color-text-muted);
}
.live {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-success);
  white-space: nowrap;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
}

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 0.9rem;
  min-height: 0;
}
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card-head {
  padding: 0.85rem 1rem 0.6rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
  flex-shrink: 0;
}
.card-head.compacto {
  padding-bottom: 0.4rem;
}
.card-title {
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--color-text);
}
.card-title.chico {
  font-size: 0.94rem;
}
.card-desc {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin-top: 0.15rem;
}
.vacio {
  padding: 0 1rem 1rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

/* FRENTES — grid de 2 columnas */
.frentes-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 1rem 0.9rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  align-content: start;
}
.frente-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0.75rem 0.8rem;
}
.fc-top {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.fc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.fc-code {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--color-text);
}
.fc-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-success);
}
.fc-status .lamp {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 3px var(--color-success-soft);
}
.fc-status.ayer {
  color: var(--color-warning);
}
.fc-status.ayer .lamp {
  background: var(--color-warning);
  box-shadow: 0 0 0 3px var(--color-warning-soft);
}
.fc-sup-name {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text);
  margin-top: 0.3rem;
}
.fc-sup-cap {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  margin-top: 0.05rem;
}

.fc-cols {
  display: flex;
  gap: 0.9rem;
  margin-top: 0.55rem;
}
.fc-col {
  flex: 1;
  min-width: 0;
}
.fc-col-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 0.3rem;
}
.role-row,
.eq-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.12rem 0;
}
.role-row svg,
.eq-row svg {
  width: 13px;
  height: 13px;
  stroke: var(--color-text-muted);
  stroke-width: 1.8;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.role-row .lbl {
  flex: 1;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.role-row .cnt,
.eq-row .cnt {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text);
}
.eq-row .name {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.eq-vacio {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* Por defecto (escritorio) se ve la versión de dos columnas siempre
   abiertas; la de píldoras colapsables es solo para celular angosto — se
   invierte dentro del media query de abajo. Selector compuesto (no solo
   ".fc-cols-movil") a propósito: así gana siempre por especificidad,
   sin depender del orden en que aparecen las reglas en la hoja de estilos
   frente al display:flex propio de .fc-stats/.fc-detail. */
.fc-stats.fc-cols-movil,
.fc-detail.fc-cols-movil {
  display: none;
}
.fc-stats {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.55rem;
}
.fc-stat {
  flex: 1;
  min-width: 0;
  background: var(--color-surface-2);
  border: none;
  border-radius: var(--radius-control);
  padding: 0.45rem 0.55rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.fc-stat svg {
  width: 14px;
  height: 14px;
  stroke: var(--color-text-muted);
  stroke-width: 1.8;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.fc-stat .lbl {
  flex: 1;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: left;
}
.fc-stat .num {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--color-text);
}
.fc-stat .chev {
  width: 10px;
  height: 10px;
  stroke: var(--color-text-muted);
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s;
}
.fc-stat.open {
  background: var(--color-primary-soft);
}
.fc-stat.open .chev {
  transform: rotate(180deg);
  stroke: var(--color-primary);
}
.fc-detail {
  margin-top: 0.5rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.fc-detail-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.fc-detail-row svg {
  width: 13px;
  height: 13px;
  stroke: var(--color-text-muted);
  stroke-width: 1.8;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.fc-detail-row .lbl {
  flex: 1;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.fc-detail-row .cnt {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text);
}

.fc-restriccion {
  margin-top: 0.6rem;
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-control);
  padding: 0.4rem 0.55rem;
}
.fc-restriccion svg {
  width: 13px;
  height: 13px;
  stroke: var(--color-danger);
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
  margin-top: 1px;
}
.fc-restriccion-text {
  font-size: 0.8rem;
  color: var(--color-danger);
  line-height: 1.35;
}
.fc-restriccion-text b {
  font-weight: 700;
}

/* COLUMNA DERECHA */
.side-col {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  overflow-y: auto;
}

.mini-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
.mini-row:last-child {
  border-bottom: none;
}
.mini-body {
  padding: 0.1rem 0 0.4rem;
}

.prox-date {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  background: var(--color-info-soft);
  color: var(--color-info);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.prox-date .d {
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1;
}
.prox-date .m {
  font-size: 0.56rem;
  font-weight: 700;
  text-transform: uppercase;
}
.mini-info {
  flex: 1;
  min-width: 0;
}
.mini-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-sub {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  margin-top: 0.05rem;
}
.mini-chip {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.12rem 0.45rem;
  border-radius: var(--radius-pill);
  white-space: nowrap;
  flex-shrink: 0;
}
.mini-chip.soon {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.mini-chip.stop {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.stop-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stop-icon svg {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  stroke-width: 1.9;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.totals-row {
  display: flex;
  gap: 0.6rem;
}
.totals-row .card {
  flex: 1;
  min-width: 0;
}
.summary-num {
  font-size: 0.94rem;
  font-weight: 800;
  color: var(--color-primary);
}
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.1rem 0.75rem;
  padding: 0 1rem 0.75rem;
}
.summary-grid.una-col {
  grid-template-columns: 1fr;
}

.mat-body {
  padding: 0.6rem 1rem 0.75rem;
}
.mat-hero {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.mat-num {
  font-size: 1.55rem;
  font-weight: 800;
  color: var(--color-primary);
}
.mat-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  line-height: 1.25;
}
.mat-list {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.mat-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.mat-list-row .n {
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mat-list-row .q {
  color: var(--color-danger);
  font-weight: 700;
  white-space: nowrap;
}

.alerta-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.alerta-icon svg {
  width: 13px;
  height: 13px;
  stroke: currentColor;
  stroke-width: 1.8;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.alerta-icon.warn {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.alerta-icon.danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.alerta-icon.info {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.alerta-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
}
.alerta-sub {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  margin-top: 0.05rem;
  text-transform: capitalize;
}

/* El layout de dos paneles con scroll independiente (uno para "Frentes en
   campo", otro para la columna derecha) solo tiene sentido en escritorio,
   con el sidebar fijo y el viewport completo a la vista. Apenas el grid
   pasa a una sola columna, esa idea deja de aplicar: acá abajo se apaga
   del todo (alto automático, sin recortar nada) y la página entera pasa a
   desplazarse de una — la misma pantalla que ya usa el resto del Sistema
   en celular. Sin esto, cualquier tarjeta que no entrara en el alto fijo
   quedaba cortada (le pasó a "Próximos frentes"/"Paralizados") y Alertas,
   al ser la última, quedaba directamente inalcanzable debajo de la barra
   de pestañas flotante — y esto solo iba a empeorar a medida que se
   agreguen más tarjetas, no es una excepción de hoy.
   */
@media (max-width: 980px) {
  .dashboard {
    height: auto;
  }
  .grid {
    grid-template-columns: 1fr;
    flex: none;
  }
  .card {
    overflow: visible;
  }
  .frentes-scroll {
    flex: none;
    overflow-y: visible;
  }
  .side-col {
    overflow-y: visible;
  }
}
@media (max-width: 640px) {
  .dashboard {
    padding: 1rem 0.85rem 1.25rem;
  }
  .page-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }
  .frentes-scroll {
    grid-template-columns: 1fr;
    padding: 0 0.8rem 0.8rem;
  }
  /* Acá se invierte: la versión de dos columnas siempre abiertas no entra
     cómoda en una pantalla angosta — se usan las píldoras colapsables. */
  .fc-cols.fc-cols-desktop {
    display: none;
  }
  .fc-stats.fc-cols-movil,
  .fc-detail.fc-cols-movil {
    display: flex;
  }
  .totals-row {
    gap: 0.5rem;
  }
}
</style>

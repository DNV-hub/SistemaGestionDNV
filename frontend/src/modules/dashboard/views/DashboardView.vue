<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '../store/dashboard'
import { useAuthStore } from '../../../store/auth'
import SupervisorPanelView from '../../vales/views/SupervisorPanelView.vue'
import GraficoArea from '../../../components/GraficoArea.vue'
import IconoNav from '../../../components/IconoNav.vue'

const dashboard = useDashboardStore()
const auth = useAuthStore()
const router = useRouter()

// El Supervisor trabaja desde el celular y no necesita KPIs de todo el
// sistema: su "dashboard" es directamente su panel de stock + solicitud +
// historial (ver SupervisorPanelView).
const esSupervisor = computed(() => auth.nombreRol === 'Supervisor')

const permisos = computed(() => ({
  alertas: auth.tienePermiso('alertas.ver'),
  vales: auth.tienePermiso('vales.ver_propios'),
  reservas: auth.tienePermiso('reservas.ver'),
  frentes: auth.tienePermiso('frentes.ver'),
  stock: auth.tienePermiso('stock.ver'),
  kardex: auth.tienePermiso('kardex.ver'),
  procura: auth.tienePermiso('procura.ver_comparacion'),
}))

if (!esSupervisor.value) dashboard.cargar(permisos.value)

function ir(ruta) {
  router.push(ruta)
}

const saludo = computed(() => {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
})

const fechaLegible = computed(() =>
  new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
)

const tiles = computed(() =>
  [
    {
      mostrar: permisos.value.vales,
      icono: 'vales',
      color: 'info',
      valor: dashboard.valesPorAprobar ?? 0,
      etiqueta: 'Vales por aprobar',
      ruta: '/vales',
    },
    {
      mostrar: permisos.value.alertas,
      icono: 'alertas',
      color: dashboard.alertas?.criticas ? 'danger' : 'warning',
      valor: dashboard.alertas?.total ?? 0,
      etiqueta: 'Alertas activas',
      detalle: dashboard.alertas?.criticas ? `${dashboard.alertas.criticas} críticas` : 'sin críticas',
      ruta: '/alertas',
    },
    {
      mostrar: permisos.value.procura,
      icono: 'procura',
      color: dashboard.frentesSobreconsumo.length ? 'danger' : 'success',
      valor: dashboard.frentesSobreconsumo.length,
      etiqueta: 'Frentes con sobreconsumo',
      ruta: '/procura',
    },
    {
      mostrar: permisos.value.stock,
      icono: 'almacen',
      color: dashboard.stockCritico.length ? 'warning' : 'success',
      valor: dashboard.stockCritico.length,
      etiqueta: 'Materiales con stock crítico',
      ruta: '/almacen',
    },
    {
      mostrar: permisos.value.reservas,
      icono: 'reservas',
      color: 'info',
      valor: dashboard.reservasActivas ?? 0,
      etiqueta: 'Reservas activas',
      ruta: '/reservas',
    },
    {
      mostrar: permisos.value.frentes,
      icono: 'frentes',
      color: 'primary',
      valor: dashboard.frentesActivos ?? 0,
      etiqueta: 'Frentes activos',
      ruta: '/frentes',
    },
  ].filter((t) => t.mostrar)
)

const serieMovimientos = computed(() => [
  { nombre: 'Entradas', color: '#22c55e', datos: dashboard.movimientosSemana.map((d) => ({ etiqueta: d.etiqueta, valor: d.entradas })) },
  { nombre: 'Salidas', color: '#f5a800', datos: dashboard.movimientosSemana.map((d) => ({ etiqueta: d.etiqueta, valor: d.salidas })) },
])

function colorSalud(pct) {
  if (pct >= 80) return 'var(--color-success)'
  if (pct >= 50) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

const ETIQUETAS_MOVIMIENTO = {
  ingreso: 'Entrada',
  salida: 'Salida',
  ajuste_positivo: 'Ajuste +',
  ajuste_negativo: 'Ajuste −',
}

function ratioStock(item) {
  const ratio = Number(item.cantidad_disponible) / Number(item.minimo || 1)
  return Math.max(0, Math.min(1, ratio))
}

function claseStock(item) {
  return Number(item.cantidad_disponible) <= 0 ? 'Agotado' : 'Crítico'
}
</script>

<template>
  <SupervisorPanelView v-if="esSupervisor" />

  <div v-else class="dashboard">
    <header class="cabecera">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitulo">{{ saludo }}, {{ auth.perfil?.nombre }} · {{ fechaLegible }}</p>
      </div>
    </header>

    <p v-if="dashboard.cargando">Cargando…</p>

    <template v-else>
      <div v-if="dashboard.alertas?.criticas" class="banner-critico" @click="ir('/alertas')">
        <IconoNav nombre="alertas" />
        <span>
          <strong>{{ dashboard.alertas.criticas }}</strong>
          {{ dashboard.alertas.criticas === 1 ? 'alerta crítica requiere' : 'alertas críticas requieren' }} atención inmediata
        </span>
        <span class="banner-link">Ver alertas →</span>
      </div>

      <div class="tiles">
        <button v-for="t in tiles" :key="t.etiqueta" type="button" class="tile" @click="ir(t.ruta)">
          <span class="icono-tile" :class="t.color">
            <IconoNav :nombre="t.icono" />
          </span>
          <span class="tile-texto">
            <span class="valor">{{ t.valor }}</span>
            <span class="etiqueta">{{ t.etiqueta }}</span>
          </span>
          <span v-if="t.detalle" class="detalle" :class="t.color">{{ t.detalle }}</span>
        </button>
      </div>

      <div class="fila-principal">
        <section v-if="permisos.kardex" class="panel panel-grande">
          <h2>Movimientos semanales</h2>
          <p class="ayuda">Entradas vs. salidas registradas — últimos 7 días.</p>
          <GraficoArea :series="serieMovimientos" />
        </section>

        <section v-if="permisos.stock && dashboard.stockPorCategoria.length" class="panel">
          <h2>Stock por categoría</h2>
          <p class="ayuda">% de materiales en buen nivel, por categoría.</p>
          <ul class="barras">
            <li v-for="c in dashboard.stockPorCategoria" :key="c.nombre">
              <div class="barra-cabecera">
                <span>{{ c.nombre }}</span>
                <span class="numero" :style="{ color: colorSalud(c.porcentajeSano) }">{{ c.porcentajeSano }}%</span>
              </div>
              <div class="barra-fondo">
                <div class="barra-relleno" :style="{ width: c.porcentajeSano + '%', background: colorSalud(c.porcentajeSano) }"></div>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <div class="fila-secundaria">
        <section v-if="permisos.stock && dashboard.stockCritico.length" class="panel">
          <div class="panel-cabecera">
            <h2>Stock crítico</h2>
            <span class="chip-vivo">en vivo</span>
          </div>
          <ul class="lista-stock">
            <li v-for="(item, i) in dashboard.stockCritico.slice(0, 6)" :key="i">
              <span class="punto" :class="claseStock(item) === 'Agotado' ? 'danger' : 'warning'"></span>
              <span class="texto">{{ item.materiales?.codigo }} — {{ item.materiales?.descripcion }}</span>
              <span class="numero">{{ item.cantidad_disponible }} {{ item.materiales?.unidad }}</span>
              <span class="badge-estado" :class="claseStock(item) === 'Agotado' ? 'danger' : 'warning'">{{ claseStock(item) }}</span>
            </li>
          </ul>
        </section>

        <section v-if="permisos.kardex && dashboard.ultimosMovimientos.length" class="panel panel-ancho">
          <div class="panel-cabecera">
            <h2>Últimos movimientos</h2>
            <button type="button" class="ver-todo" @click="ir('/kardex')">Ver todo →</button>
          </div>
          <div class="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Tipo</th>
                  <th>Cant.</th>
                  <th>Responsable</th>
                  <th>Hora</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in dashboard.ultimosMovimientos" :key="m.id">
                  <td class="col-material">{{ m.materiales?.codigo }} — {{ m.materiales?.descripcion }}</td>
                  <td><span class="badge-tipo" :class="m.tipo_movimiento">{{ ETIQUETAS_MOVIMIENTO[m.tipo_movimiento] }}</span></td>
                  <td>{{ m.cantidad }} {{ m.materiales?.unidad }}</td>
                  <td>{{ m.usuarios?.nombre ?? '—' }}</td>
                  <td>{{ new Date(m.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div
        v-if="permisos.procura && (dashboard.frentesSobreconsumo.length || dashboard.materialesSinMetrado.length)"
        class="fila-secundaria"
      >
        <section v-if="dashboard.frentesSobreconsumo.length" class="panel panel-ancho">
          <h2>Frentes con sobreconsumo</h2>
          <p class="ayuda">% de lo previsto en Procura ya entregado.</p>
          <ul class="lista-stock">
            <li v-for="f in dashboard.frentesSobreconsumo" :key="f.frente?.codigo" class="clicable" @click="ir(`/procura/${f.frente?.id}`)">
              <span class="punto" :class="f.porcentajeConsumo >= 100 ? 'danger' : 'warning'"></span>
              <span class="texto">{{ f.frente?.codigo }} — {{ f.frente?.nombre }}</span>
              <span class="badge-estado" :class="f.porcentajeConsumo >= 100 ? 'danger' : 'warning'">{{ f.porcentajeConsumo }}%</span>
            </li>
          </ul>
        </section>

        <section v-if="dashboard.materialesSinMetrado.length" class="panel panel-ancho">
          <h2>Consumo sin metrado Procura</h2>
          <p class="ayuda">Frentes que ya reservaron o entregaron un material sin metrado cargado todavía.</p>
          <ul class="lista-stock">
            <li
              v-for="a in dashboard.materialesSinMetrado"
              :key="a.id"
              class="clicable"
              @click="ir(`/procura/${a.frentes?.id}`)"
            >
              <span class="punto warning"></span>
              <span class="texto">{{ a.frentes?.codigo }} — {{ a.materiales?.codigo }} {{ a.materiales?.descripcion }}</span>
              <span class="badge-estado warning">Sin metrado</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 1.5rem 2rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.cabecera h1 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--color-text);
}
.subtitulo {
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  text-transform: capitalize;
}
.banner-critico {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  padding: 0.85rem 1.1rem;
  border-radius: var(--radius-card);
  cursor: pointer;
  font-size: 0.88rem;
}
.banner-critico strong {
  font-weight: 800;
}
.banner-link {
  margin-left: auto;
  font-weight: 700;
  white-space: nowrap;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
.tile {
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1.1rem 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  font: inherit;
  color: inherit;
}
.tile:hover {
  border-color: var(--color-primary);
}
.icono-tile {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-control);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.icono-tile :deep(svg) {
  width: 20px;
  height: 20px;
}
.icono-tile.primary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.icono-tile.info {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.icono-tile.success {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.icono-tile.warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.icono-tile.danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.tile-texto {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.tile .valor {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.tile .etiqueta {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile .detalle {
  margin-left: auto;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  align-self: flex-start;
}
.tile .detalle.danger {
  color: var(--color-danger);
}
.tile .detalle.warning {
  color: var(--color-warning);
}
.fila-principal {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.25rem;
}
.fila-secundaria {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 1.25rem;
}
@media (max-width: 980px) {
  .fila-principal,
  .fila-secundaria {
    grid-template-columns: 1fr;
  }
}
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1.1rem 1.2rem;
  min-width: 0;
}
.panel-cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.3rem;
}
h2 {
  font-size: 0.95rem;
  margin: 0 0 0.3rem;
  color: var(--color-text);
}
.ayuda {
  margin: 0 0 0.9rem;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
.chip-vivo {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-success);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.chip-vivo::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--color-success);
}
.ver-todo {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.barras {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.barra-cabecera {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--color-text);
  margin-bottom: 0.3rem;
}
.barra-cabecera .numero {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.barra-fondo {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  overflow: hidden;
}
.barra-relleno {
  height: 100%;
  border-radius: var(--radius-pill);
}
.lista-stock {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.lista-stock li {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.83rem;
}
.lista-stock .clicable {
  cursor: pointer;
}
.lista-stock .clicable:hover .texto {
  color: var(--color-primary);
}
.punto {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
.punto.danger {
  background: var(--color-danger);
}
.punto.warning {
  background: var(--color-warning);
}
.lista-stock .texto {
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lista-stock .numero {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.badge-estado,
.badge-tipo {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}
.badge-estado.danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge-estado.warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge-tipo.ingreso {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge-tipo.salida {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.badge-tipo.ajuste_positivo {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge-tipo.ajuste_negativo {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.tabla-scroll {
  overflow-x: auto;
  margin-top: 0.5rem;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.82rem;
  white-space: nowrap;
}
th {
  color: var(--color-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
td.col-material {
  white-space: normal;
  color: var(--color-text);
}
tbody tr:last-child td {
  border-bottom: none;
}
</style>

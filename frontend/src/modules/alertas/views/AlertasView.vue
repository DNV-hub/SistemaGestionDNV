<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAlertasStore } from '../store/alertas'
import { useAuthStore } from '../../../store/auth'

const alertas = useAlertasStore()
const auth = useAuthStore()
const router = useRouter()
const puedeAbrirReporteRdc = computed(() => auth.tienePermiso('rdc.ver_todos'))
function verReporteRdc(id) {
  router.push({ name: 'rdc-detalle', params: { id } })
}
// `new Date('2026-10-16').toLocaleDateString()` se corre un día en zonas
// detrás de UTC (Perú incluido): la fecha sin hora se interpreta como
// medianoche UTC, que cae en la tarde del día anterior en hora local. Igual
// que `hoyLocal()`/`fmtFecha` en el resto del módulo RDC: se arma a mano
// desde el string, nunca pasando por un Date.
function fmtFechaIso(iso) {
  return iso ? iso.split('-').reverse().join('/') : '—'
}

const puedeResolver = computed(() => auth.tienePermiso('alertas.resolver'))
const puedeConfigurar = computed(() => auth.tienePermiso('alertas.configurar_umbrales'))

const ETIQUETAS_TIPO = {
  stock_bajo: 'Stock bajo',
  stock_agotado: 'Stock agotado',
  vale_pendiente: 'Vale pendiente',
  material_no_previsto: 'Material no previsto',
  riesgo_sobreconsumo: 'Riesgo de sobreconsumo',
  sobreconsumo: 'Sobreconsumo',
  reserva_prolongada: 'Reserva prolongada',
  inconsistencia_stock: 'Inconsistencia de stock',
  rdc_sin_sharepoint: 'RDC sin enviar a SharePoint',
}

const filtros = reactive({ estado: 'activa', tipo: '', nivel: '', frenteId: '' })

function filtrosActuales() {
  return {
    estado: filtros.estado || null,
    tipo: filtros.tipo || null,
    nivel: filtros.nivel || null,
    frenteId: filtros.frenteId || null,
  }
}

function buscar() {
  alertas.buscar(filtrosActuales())
}

function limpiarFiltros() {
  filtros.estado = 'activa'
  filtros.tipo = ''
  filtros.nivel = ''
  filtros.frenteId = ''
  buscar()
}

async function actualizar() {
  await alertas.evaluarYRecargar(filtrosActuales())
}

async function resolver(alerta) {
  if (!confirm(`¿Marcar como resuelta esta alerta?\n\n${alerta.mensaje}`)) return
  await alertas.resolver(alerta.id, auth.session.user.id)
}

onMounted(async () => {
  await alertas.cargarFiltros()
  buscar()
  if (puedeConfigurar.value) await alertas.cargarConfiguracion()
})

// --- Configuración de umbrales ---
const umbralRiesgo = computed(() => alertas.configuracion.find((c) => c.clave === 'umbral_riesgo_sobreconsumo'))
const diasReserva = computed(() => alertas.configuracion.find((c) => c.clave === 'dias_reserva_prolongada'))
const formConfig = reactive({ umbral: '', dias: '' })
const avisoConfig = ref('')
const guardandoConfig = ref(false)

watch(
  [umbralRiesgo, diasReserva],
  () => {
    if (umbralRiesgo.value) formConfig.umbral = umbralRiesgo.value.valor
    if (diasReserva.value) formConfig.dias = diasReserva.value.valor
  },
  { immediate: true }
)

async function guardarConfig() {
  avisoConfig.value = ''
  guardandoConfig.value = true
  try {
    await alertas.guardarConfiguracion('umbral_riesgo_sobreconsumo', Number(formConfig.umbral), auth.session.user.id)
    await alertas.guardarConfiguracion('dias_reserva_prolongada', Number(formConfig.dias), auth.session.user.id)
    avisoConfig.value = 'Umbrales actualizados.'
  } catch (e) {
    console.error(e)
    avisoConfig.value = 'No se pudo guardar los umbrales.'
  } finally {
    guardandoConfig.value = false
  }
}
</script>

<template>
  <div class="alertas">
    <header class="cabecera">
      <h1>Alertas</h1>
      <button v-if="puedeResolver" :disabled="alertas.evaluando" @click="actualizar">
        {{ alertas.evaluando ? 'Actualizando…' : '↻ Actualizar alertas' }}
      </button>
    </header>

    <div class="filtros">
      <select v-model="filtros.estado" @change="buscar">
        <option value="activa">Activas</option>
        <option value="resuelta">Resueltas</option>
        <option value="">Todas</option>
      </select>
      <select v-model="filtros.nivel" @change="buscar">
        <option value="">Todos los niveles</option>
        <option value="critica">Crítica</option>
        <option value="advertencia">Advertencia</option>
        <option value="info">Info</option>
      </select>
      <select v-model="filtros.tipo" @change="buscar">
        <option value="">Todos los tipos</option>
        <option v-for="(etiqueta, clave) in ETIQUETAS_TIPO" :key="clave" :value="clave">{{ etiqueta }}</option>
      </select>
      <select v-model="filtros.frenteId" @change="buscar">
        <option value="">Todos los frentes</option>
        <option v-for="f in alertas.frentesActivos" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
      </select>
      <button type="button" class="secundario" @click="limpiarFiltros">Limpiar</button>
    </div>

    <section v-if="puedeConfigurar" class="config-umbrales">
      <h2>Umbrales</h2>
      <div class="config-form">
        <label>
          Riesgo de sobreconsumo desde
          <div class="con-sufijo">
            <input v-model="formConfig.umbral" type="number" min="1" max="100" />
            <span>%</span>
          </div>
        </label>
        <label>
          Reserva prolongada desde
          <div class="con-sufijo">
            <input v-model="formConfig.dias" type="number" min="1" />
            <span>días</span>
          </div>
        </label>
        <button type="button" :disabled="guardandoConfig" @click="guardarConfig">Guardar umbrales</button>
      </div>
      <p v-if="avisoConfig" class="aviso">{{ avisoConfig }}</p>
    </section>

    <p v-if="alertas.error" class="error">{{ alertas.error }}</p>
    <p v-if="alertas.cargando">Cargando…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Nivel</th>
          <th>Tipo</th>
          <th>Referencia</th>
          <th>Mensaje</th>
          <th>Estado</th>
          <th v-if="puedeResolver"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in alertas.alertas" :key="a.id">
          <td>{{ new Date(a.created_at).toLocaleString() }}</td>
          <td><span class="badge-nivel" :class="a.nivel">{{ a.nivel }}</span></td>
          <td>{{ ETIQUETAS_TIPO[a.tipo] ?? a.tipo }}</td>
          <td class="referencia">
            <span v-if="a.frentes">{{ a.frentes.codigo }}</span>
            <span v-if="a.materiales"> · {{ a.materiales.descripcion }}</span>
            <span v-if="a.almacenes"> · {{ a.almacenes.codigo }}</span>
            <span v-if="a.vales"> · {{ a.vales.numero }}</span>
            <span v-if="a.rdc_reportes"> · {{ fmtFechaIso(a.rdc_reportes.fecha) }}</span>
            <span v-if="!a.frentes && !a.materiales && !a.almacenes && !a.vales && !a.rdc_reportes">—</span>
          </td>
          <td class="mensaje">
            {{ a.mensaje }}
            <button v-if="a.rdc_reportes && puedeAbrirReporteRdc" type="button" class="ver-reporte" @click="verReporteRdc(a.rdc_reportes.id)">
              Ver reporte →
            </button>
          </td>
          <td>
            <span class="badge-estado" :class="a.estado">{{ a.estado === 'activa' ? 'Activa' : 'Resuelta' }}</span>
            <div v-if="a.estado === 'resuelta'" class="detalle-resuelta">
              {{ a.usuarios?.nombre ?? '—' }} · {{ new Date(a.resuelta_at).toLocaleDateString() }}
            </div>
          </td>
          <td v-if="puedeResolver" class="acciones-fila">
            <button v-if="a.estado === 'activa'" class="mini" @click="resolver(a)">Resolver</button>
          </td>
        </tr>
        <tr v-if="!alertas.alertas.length">
          <td :colspan="puedeResolver ? 7 : 6" class="vacio">No hay alertas para estos filtros.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.alertas {
  padding: 1.5rem 2rem;
}
.cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
h2 {
  font-size: 0.95rem;
  margin: 0 0 0.6rem;
  color: var(--color-text);
}
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.filtros select {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.config-umbrales {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1rem 1.1rem;
  margin-bottom: 1.25rem;
}
.config-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
}
.config-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
.con-sufijo {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.con-sufijo input {
  width: 90px;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.con-sufijo span {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
button.mini {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
}
.tabla th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.referencia {
  white-space: nowrap;
  color: var(--color-text);
}
.mensaje {
  max-width: 320px;
}
.ver-reporte {
  display: block;
  margin-top: 0.3rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.badge-nivel,
.badge-estado {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  text-transform: capitalize;
}
.badge-nivel.info {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge-nivel.advertencia {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge-nivel.critica {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge-estado.activa {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge-estado.resuelta {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.detalle-resuelta {
  margin-top: 0.2rem;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
.acciones-fila {
  white-space: nowrap;
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
}
.aviso {
  color: var(--color-success);
  font-size: 0.85rem;
  margin: 0.6rem 0 0;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

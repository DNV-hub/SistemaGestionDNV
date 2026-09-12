<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import { useDevolucionesStore } from '../../devoluciones/store/devoluciones'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'

const vales = useValesStore()
const auth = useAuthStore()
const devoluciones = useDevolucionesStore()
const router = useRouter()

const busquedaStock = ref('')
const lineas = ref([{ material_id: '', cantidad_solicitada: '' }])
const enviando = ref(false)
const aviso = ref('')
const error = ref('')

const puedeDevolver = computed(() => auth.tienePermiso('devoluciones.crear'))

onMounted(async () => {
  const tareas = [vales.cargarLista(), vales.cargarStockDisponible()]
  if (puedeDevolver.value) tareas.push(devoluciones.cargar())
  await Promise.all(tareas)
})

const frenteAsignado = computed(() => vales.frentesActivos.find((f) => f.id === auth.perfil?.frente_id) ?? null)
const frenteId = ref('')
// Si el perfil ya trae un frente asignado, no hace falta elegirlo cada vez.
const necesitaElegirFrente = computed(() => !frenteAsignado.value)

const stockFiltrado = computed(() => {
  const q = busquedaStock.value.trim().toLowerCase()
  if (!q) return vales.stockDisponible.slice(0, 20)
  return vales.stockDisponible.filter(
    (s) =>
      s.materiales?.codigo.toLowerCase().includes(q) || s.materiales?.descripcion.toLowerCase().includes(q)
  )
})

function unidadDe(materialId) {
  return vales.materialesActivos.find((m) => m.id === materialId)?.unidad ?? ''
}

function agregarLinea() {
  lineas.value.push({ material_id: '', cantidad_solicitada: '' })
}

function quitarLinea(idx) {
  if (lineas.value.length > 1) lineas.value.splice(idx, 1)
}

const lineasValidas = computed(() =>
  lineas.value.filter((l) => l.material_id && Number(l.cantidad_solicitada) > 0)
)

async function enviarSolicitud() {
  error.value = ''
  aviso.value = ''
  const frente = frenteAsignado.value?.id || frenteId.value
  if (!frente) {
    error.value = 'Selecciona tu frente.'
    return
  }
  if (!lineasValidas.value.length) {
    error.value = 'Agrega al menos un material con cantidad.'
    return
  }

  enviando.value = true
  try {
    await vales.crearYEnviar({
      frente_id: frente,
      supervisor_id: auth.session.user.id,
      observaciones: null,
      lineas: lineasValidas.value.map((l) => ({
        material_id: l.material_id,
        cantidad_solicitada: Number(l.cantidad_solicitada),
      })),
    })
    lineas.value = [{ material_id: '', cantidad_solicitada: '' }]
    aviso.value = 'Solicitud enviada a Almacén.'
  } catch (e) {
    console.error(e)
    error.value = `No se pudo enviar la solicitud${e?.message ? ': ' + e.message : '.'}`
  } finally {
    enviando.value = false
  }
}

const misVales = computed(() => [...vales.vales].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))

function fechaHoraEnvio(v) {
  const iso = v.fecha_envio ?? v.created_at
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

function abrirVale(vale) {
  router.push(`/vales/${vale.id}`)
}

// Mismo criterio que el badge del sidebar (App.vue/contarValesNovedades):
// hubo una decisión (aprobado/rechazado/atendido) que el supervisor todavía
// no vio. Abrir el detalle lo marca como visto (ValeDetalleView.vue).
const ESTADOS_CON_DECISION = ['Aprobado', 'Rechazado', 'Parcialmente atendido', 'Atendido', 'Cerrado']
function tieneNovedad(v) {
  return ESTADOS_CON_DECISION.includes(v.estado) && (!v.visto_supervisor_en || v.visto_supervisor_en < v.updated_at)
}

// ---------------------------------------------------------------------------
// Devolver material: espeja el vale al revés — el supervisor solicita,
// Almacén confirma la recepción antes de que se mueva cualquier stock.
// ---------------------------------------------------------------------------
const devolucionForm = reactive({ material_id: '', cantidad: '', estado_material: 'bueno', observacion: '' })
const enviandoDevolucion = ref(false)
const avisoDevolucion = ref('')
const errorDevolucion = ref('')

const misDevoluciones = computed(() =>
  [...devoluciones.devoluciones].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
)

async function solicitarDevolucion() {
  errorDevolucion.value = ''
  avisoDevolucion.value = ''
  const frente = frenteAsignado.value?.id || frenteId.value
  if (!frente) {
    errorDevolucion.value = 'Selecciona tu frente.'
    return
  }
  if (!devolucionForm.material_id || Number(devolucionForm.cantidad) <= 0) {
    errorDevolucion.value = 'Selecciona un material y una cantidad válida.'
    return
  }

  enviandoDevolucion.value = true
  try {
    await devoluciones.crear({
      frente_id: frente,
      material_id: devolucionForm.material_id,
      cantidad: Number(devolucionForm.cantidad),
      estado_material: devolucionForm.estado_material,
      observacion: devolucionForm.observacion.trim() || null,
      supervisor_id: auth.session.user.id,
    })
    devolucionForm.material_id = ''
    devolucionForm.cantidad = ''
    devolucionForm.estado_material = 'bueno'
    devolucionForm.observacion = ''
    avisoDevolucion.value = 'Devolución solicitada — queda pendiente hasta que Almacén confirme que la recibió.'
  } catch (e) {
    console.error(e)
    errorDevolucion.value = `No se pudo registrar la devolución${e?.message ? ': ' + e.message : '.'}`
  } finally {
    enviandoDevolucion.value = false
  }
}
</script>

<template>
  <div class="panel">
    <header class="cabecera">
      <p class="saludo">Hola, {{ auth.perfil?.nombre }}</p>
      <p class="frente" v-if="frenteAsignado">{{ frenteAsignado.codigo ? frenteAsignado.codigo + ' — ' : '' }}{{ frenteAsignado.nombre }}</p>
    </header>

    <section class="tarjeta">
      <h2>Stock disponible ahora</h2>
      <input v-model="busquedaStock" type="search" placeholder="Buscar material…" class="buscador-stock" />
      <ul class="lista-stock">
        <li v-for="(s, i) in stockFiltrado" :key="i">
          <div class="stock-material">
            <strong>{{ s.materiales?.codigo }}</strong>
            <span>{{ s.materiales?.descripcion }}</span>
          </div>
          <div class="stock-cantidad">
            <span class="numero">{{ s.cantidad_disponible }}</span>
            <span class="unidad">{{ s.materiales?.unidad }}</span>
            <span class="almacen">{{ s.almacenes?.nombre }}</span>
          </div>
        </li>
        <li v-if="!stockFiltrado.length" class="vacio">Sin resultados.</li>
      </ul>
    </section>

    <section class="tarjeta">
      <h2>Nueva solicitud</h2>

      <label v-if="necesitaElegirFrente" class="campo">
        Frente
        <select v-model="frenteId">
          <option value="" disabled>Selecciona tu frente…</option>
          <option v-for="f in vales.frentesActivos" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
        </select>
      </label>

      <div v-for="(linea, idx) in lineas" :key="idx" class="linea">
        <BuscadorMaterial v-model="linea.material_id" :materiales="vales.materialesActivos" class="linea-material" />
        <div class="linea-cantidad">
          <input v-model="linea.cantidad_solicitada" type="number" step="0.001" min="0.001" placeholder="Cantidad" />
          <span class="unidad-badge">{{ unidadDe(linea.material_id) }}</span>
        </div>
        <button v-if="lineas.length > 1" type="button" class="quitar" @click="quitarLinea(idx)">Quitar</button>
      </div>
      <button type="button" class="secundario" @click="agregarLinea">+ Agregar otro material</button>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="aviso" class="aviso">{{ aviso }}</p>

      <button type="button" class="enviar" :disabled="enviando" @click="enviarSolicitud">
        {{ enviando ? 'Enviando…' : 'Enviar solicitud a Almacén' }}
      </button>
    </section>

    <section class="tarjeta">
      <h2>Mis solicitudes</h2>
      <ul class="lista-vales">
        <li v-for="v in misVales" :key="v.id" class="vale-card" @click="abrirVale(v)">
          <div>
            <strong>{{ v.numero }}</strong>
            <span class="fecha">{{ fechaHoraEnvio(v) }}</span>
          </div>
          <span v-if="tieneNovedad(v)" class="punto-novedad" title="Tiene una novedad sin ver"></span>
          <span class="badge" :class="v.estado.toLowerCase().replace(/\s+/g, '-')">{{ v.estado }}</span>
        </li>
        <li v-if="!misVales.length" class="vacio">Todavía no enviaste ninguna solicitud.</li>
      </ul>
    </section>

    <section v-if="puedeDevolver" class="tarjeta">
      <h2>Devolver material</h2>

      <BuscadorMaterial v-model="devolucionForm.material_id" :materiales="vales.materialesActivos" />

      <div class="linea-cantidad">
        <input v-model="devolucionForm.cantidad" type="number" step="0.001" min="0.001" placeholder="Cantidad" />
        <span class="unidad-badge">{{ unidadDe(devolucionForm.material_id) }}</span>
      </div>

      <div class="opciones-estado">
        <label class="opcion-estado">
          <input v-model="devolucionForm.estado_material" type="radio" value="bueno" />
          Bueno
        </label>
        <label class="opcion-estado">
          <input v-model="devolucionForm.estado_material" type="radio" value="danado" />
          Dañado
        </label>
      </div>

      <textarea v-model="devolucionForm.observacion" rows="2" placeholder="Observación (opcional)"></textarea>

      <p v-if="errorDevolucion" class="error">{{ errorDevolucion }}</p>
      <p v-if="avisoDevolucion" class="aviso">{{ avisoDevolucion }}</p>

      <button type="button" class="enviar" :disabled="enviandoDevolucion" @click="solicitarDevolucion">
        {{ enviandoDevolucion ? 'Enviando…' : 'Solicitar devolución' }}
      </button>
    </section>

    <section v-if="puedeDevolver" class="tarjeta">
      <h2>Mis devoluciones</h2>
      <ul class="lista-vales">
        <li v-for="d in misDevoluciones" :key="d.id" class="vale-card">
          <div>
            <strong>{{ d.materiales?.codigo }} — {{ d.materiales?.descripcion }}</strong>
            <span class="fecha">
              {{ d.cantidad }} {{ d.materiales?.unidad }} · {{ d.estado_material === 'bueno' ? 'Bueno' : 'Dañado' }} ·
              {{ d.fecha }}
            </span>
          </div>
          <span class="badge" :class="d.estado.toLowerCase()">{{ d.estado }}</span>
        </li>
        <li v-if="!misDevoluciones.length" class="vacio">Todavía no registraste devoluciones.</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.panel {
  max-width: 480px;
  margin: 0 auto;
  padding: 1rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.cabecera {
  padding: 0.25rem 0.25rem 0.5rem;
}
.saludo {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text);
}
.frente {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.tarjeta {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
h2 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text);
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
input,
select,
textarea {
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font-size: 1rem;
  font-family: inherit;
}
textarea {
  width: 100%;
  resize: vertical;
}
.opciones-estado {
  display: flex;
  gap: 1rem;
}
.opcion-estado {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--color-text);
}
.opcion-estado input {
  width: auto;
  padding: 0;
}
.buscador-stock {
  width: 100%;
}
.lista-stock {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 260px;
  overflow-y: auto;
}
.lista-stock li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  font-size: 0.85rem;
}
.stock-material {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.stock-material span {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stock-cantidad {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.stock-cantidad .numero {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}
.stock-cantidad .unidad {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
.stock-cantidad .almacen {
  font-size: 0.68rem;
  color: var(--color-text-muted);
}
.linea {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.linea-material {
  flex: 1;
  min-width: 160px;
}
.linea-cantidad {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.linea-cantidad input {
  width: 100px;
}
.unidad-badge {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 600;
  min-width: 2.2rem;
}
.quitar {
  background: none;
  border: none;
  color: var(--color-danger);
  font-size: 0.8rem;
  padding: 0.4rem;
  cursor: pointer;
}
.secundario {
  align-self: flex-start;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius-control);
  font-weight: 600;
  cursor: pointer;
}
.enviar {
  width: 100%;
  padding: 0.85rem;
  border: none;
  border-radius: var(--radius-card);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
}
.enviar:disabled {
  opacity: 0.6;
  cursor: default;
}
.lista-vales {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.vale-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.75rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-card);
  cursor: pointer;
}
.vale-card > div {
  display: flex;
  flex-direction: column;
}
.vale-card strong {
  color: var(--color-text);
  font-size: 0.9rem;
}
.vale-card .fecha {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.punto-novedad {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-danger);
  flex-shrink: 0;
  margin-right: 0.4rem;
}
.badge {
  padding: 0.2rem 0.55rem;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.borrador {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.badge.enviado,
.badge.en-revision {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.aprobado,
.badge.reservado {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.parcialmente-atendido {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.atendido,
.badge.recibida {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.solicitada {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.rechazado,
.badge.rechazada,
.badge.cancelado {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge.cerrado {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: 0.5rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin: 0;
}
.aviso {
  color: var(--color-success);
  font-size: 0.85rem;
  margin: 0;
}
</style>

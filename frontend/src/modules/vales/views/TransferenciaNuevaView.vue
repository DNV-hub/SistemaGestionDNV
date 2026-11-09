<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import { useCerrarConEscape } from '../../../composables/useCerrarConEscape'
import { useTransferenciasStore } from '../../transferencias/store/transferencias'
import { obtenerInfoConversion, obtenerMovimientosEnFrente, obtenerStockEnFrente } from '../../transferencias/services/transferenciasService'

// Dos formas de usarla: pantalla completa (celular, ruta propia) o ventana
// centrada (escritorio, abierta desde Almacén o Vales), igual que Nuevo vale.
const props = defineProps({ comoModal: { type: Boolean, default: false } })
const emit = defineEmits(['cerrar', 'creado'])

const vales = useValesStore()
const auth = useAuthStore()
const transferencias = useTransferenciasStore()
const router = useRouter()
const cerrar = () => (props.comoModal ? emit('cerrar') : router.back())
// Esc cierra: en la ventana lo maneja el cuadro estándar; en la pantalla
// completa vuelve atrás (si no se está escribiendo en un campo).
if (!props.comoModal) useCerrarConEscape(cerrar, { ignorarCampos: true })

onMounted(async () => {
  const tareas = [transferencias.cargar()]
  if (!vales.frentesActivos.length || !vales.materialesActivos.length) tareas.push(vales.cargarLista())
  await Promise.all(tareas)
})

const frenteAsignado = computed(() => vales.frentesActivos.find((f) => f.id === auth.perfil?.frente_id) ?? null)
const necesitaElegirOrigen = computed(() => !frenteAsignado.value)

const form = reactive({ frente_origen_id: '', frente_destino_id: '', material_id: '', cantidad: '', observacion: '' })
const enviando = ref(false)
const error = ref('')
const aviso = ref('')

const propsRaiz = computed(() =>
  props.comoModal
    ? {
        titulo: 'Transferir material',
        subtitulo: 'Pasa material de un frente a otro sin devolverlo a Almacén.',
        ancho: '1040px',
        guardando: enviando.value,
        textoGuardar: 'Transferir material',
        textoGuardando: 'Enviando…',
        error: error.value,
      }
    : {},
)
const Raiz = computed(() => (props.comoModal ? ModalFormulario : 'div'))

function unidadDe(materialId) {
  return vales.materialesActivos.find((m) => m.id === materialId)?.unidad ?? ''
}

const nombreFrente = (id) => {
  const f = vales.frentesActivos.find((x) => x.id === id)
  return f ? f.codigo || f.nombre : ''
}
const origenId = computed(() => frenteAsignado.value?.id || form.frente_origen_id)
const origenNombre = computed(() => nombreFrente(origenId.value))
const destinoNombre = computed(() => nombreFrente(form.frente_destino_id))

// Invertir origen y destino (solo si el origen se elige a mano).
function invertir() {
  if (!necesitaElegirOrigen.value) return
  const o = form.frente_origen_id
  form.frente_origen_id = form.frente_destino_id
  form.frente_destino_id = o
}

// Material con conversión (barra de 5 m, malla…): se puede transferir en ML/M2
// y la app lo pasa a unidades. Ej.: cortaron una barra de 5 m, 3 m se quedan y
// 2 m pasan a otro frente → 2 ML = 0.4 UND.
const info = ref(null)
const modo = ref('und') // 'und' | 'edp'
watch(
  () => form.material_id,
  async (id) => {
    info.value = null
    modo.value = 'und'
    if (!id) return
    try {
      const r = await obtenerInfoConversion(id)
      if (form.material_id === id) info.value = r
    } catch (e) {
      console.error(e)
    }
  },
)
const redondear3 = (n) => Math.round(n * 1000) / 1000

// Cuánto figura en el frente de origen: avisa antes de pasar más de lo que hay.
const stockOrigen = ref(null)
const movimientos = ref([])
const verTodos = ref(false)
watch(
  [origenId, () => form.material_id],
  async ([frente, material]) => {
    stockOrigen.value = null
    movimientos.value = []
    verTodos.value = false
    if (!frente || !material) return
    try {
      const [r, mov] = await Promise.all([obtenerStockEnFrente(frente, material), obtenerMovimientosEnFrente(frente, material)])
      if (origenId.value === frente && form.material_id === material) {
        stockOrigen.value = r
        movimientos.value = mov
      }
    } catch (e) {
      console.error(e)
    }
  },
  { immediate: true },
)
const ETIQUETA_MOV = {
  salida: 'Salida',
  devolucion: 'Devolución',
  transferencia_sale: 'Transferido a otro frente',
  transferencia_entra: 'Recibido por transferencia',
}
const movimientosVisibles = computed(() => (verTodos.value ? movimientos.value : movimientos.value.slice(0, 4)))
function fechaDia(f) {
  if (!f) return '—'
  const [y, m, d] = String(f).slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}
const libreEnOrigen = computed(() => (stockOrigen.value ? redondear3(stockOrigen.value.disponible - stockOrigen.value.comprometido) : null))
const excede = computed(() => libreEnOrigen.value !== null && cantidadUnd.value > libreEnOrigen.value + 0.0005)

// Corte: se pasa un retazo (ej. 2 ML) de una barra entera (5 ML). Se calcula
// cuántas barras se cortaron y qué retazo queda en el frente de origen.
const corte = computed(() => {
  if (!info.value || modo.value !== 'edp') return null
  const ml = Number(form.cantidad)
  if (!(ml > 0)) return null
  const barras = Math.max(1, Math.ceil(ml / info.value.factor - 1e-9))
  const queda = redondear3(barras * info.value.factor - ml)
  return queda > 0.0005 ? { barras, queda } : null
})
const cantidadUnd = computed(() => {
  const n = Number(form.cantidad)
  if (!(n > 0)) return 0
  return modo.value === 'edp' && info.value ? redondear3(n / info.value.factor) : n
})
const cantidadEdp = computed(() => (info.value && cantidadUnd.value ? redondear3(cantidadUnd.value * info.value.factor) : 0))
const unidadMat = computed(() => unidadDe(form.material_id))
const resumen = computed(() => {
  if (!(cantidadUnd.value > 0)) return ''
  const base = `${cantidadUnd.value} ${unidadMat.value}`
  return info.value && modo.value === 'edp' ? `${base} (${form.cantidad} ${info.value.unidad})` : info.value ? `${base} (${cantidadEdp.value} ${info.value.unidad})` : base
})

// El destino nunca puede ser el mismo frente de origen — ni por error de
// dedo: no tendría sentido "transferir" un material a donde ya está.
const frentesDestino = computed(() => {
  const origenId = frenteAsignado.value?.id || form.frente_origen_id
  return vales.frentesActivos.filter((f) => f.id !== origenId)
})

// La observación incluye, si hubo corte, el detalle de lo que pasó y lo que quedó.
const observacionFinal = computed(() => {
  const partes = []
  if (form.observacion.trim()) partes.push(form.observacion.trim())
  if (corte.value) {
    partes.push(
      `Corte: ${corte.value.barras} ${unidadMat.value || 'und'} de ${info.value.factor} ${info.value.unidad}; pasan ${form.cantidad} ${info.value.unidad} y quedan ${corte.value.queda} ${info.value.unidad} en ${origenNombre.value}.`,
    )
  }
  return partes.join(' · ') || null
})

async function enviar() {
  error.value = ''
  aviso.value = ''
  const origen = frenteAsignado.value?.id || form.frente_origen_id
  if (!origen) {
    error.value = 'Selecciona el frente de origen.'
    return
  }
  if (!form.frente_destino_id) {
    error.value = 'Selecciona a qué frente transfieres el material.'
    return
  }
  if (!form.material_id || !(cantidadUnd.value > 0)) {
    error.value = 'Selecciona un material y una cantidad válida.'
    return
  }

  const detalle = resumen.value
  enviando.value = true
  try {
    await transferencias.crear({
      frente_origen_id: origen,
      frente_destino_id: form.frente_destino_id,
      material_id: form.material_id,
      cantidad: cantidadUnd.value,
      observacion: observacionFinal.value,
      supervisor_id: auth.session.user.id,
    })
    form.frente_destino_id = ''
    form.material_id = ''
    form.cantidad = ''
    form.observacion = ''
    aviso.value = `Transferencia registrada: ${detalle}.`
    if (props.comoModal) {
      emit('creado', aviso.value)
      return
    }
  } catch (e) {
    console.error(e)
    error.value = `No se pudo registrar la transferencia${e?.message ? ': ' + e.message : '.'}`
  } finally {
    enviando.value = false
  }
}

const misTransferencias = computed(() =>
  [...transferencias.transferencias].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
)

function fechaCorta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

const CATEGORIA = { Confirmada: 'ok', Rechazada: 'err' }
const categoria = (estado) => CATEGORIA[estado] ?? 'draft'
</script>

<template>
  <component :is="Raiz" v-bind="propsRaiz" @cerrar="cerrar" @enviar="enviar">
  <div class="transferencia" :class="{ 'en-modal': comoModal }">
    <header v-if="!comoModal" class="appbar">
      <button type="button" class="icon-btn" aria-label="Cancelar" @click="cerrar">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5.5 5.5l11 11M16.5 5.5l-11 11"/></svg>
      </button>
      <div class="appbar-title">Transferir material</div>
      <div class="icon-btn"></div>
    </header>

    <main class="content">
      <div class="cols">
        <!-- Columna del formulario -->
        <div class="col-form">
          <section class="tarjeta ruta" aria-label="Ruta de la transferencia">
            <div class="punto">
              <span class="punto-rot"><i class="dot origen"></i>Sale de</span>
              <div v-if="!necesitaElegirOrigen" class="punto-fijo">{{ origenNombre }}</div>
              <select v-else v-model="form.frente_origen_id" class="campo-input" aria-label="Frente de origen">
                <option value="" disabled>Elige el frente…</option>
                <option v-for="f in vales.frentesActivos" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
              </select>
            </div>

            <button type="button" class="flecha" :disabled="!necesitaElegirOrigen" :title="necesitaElegirOrigen ? 'Invertir origen y destino' : ''" aria-label="Invertir origen y destino" @click="invertir">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" class="f-v" /><path d="M5 12h14M13 6l6 6-6 6" class="f-h" /></svg>
            </button>

            <div class="punto">
              <span class="punto-rot"><i class="dot destino"></i>Llega a</span>
              <select v-model="form.frente_destino_id" class="campo-input" aria-label="Frente de destino">
                <option value="" disabled>Elige el frente…</option>
                <option v-for="f in frentesDestino" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
              </select>
            </div>
          </section>

          <section class="tarjeta">
            <label class="campo">
              <span class="campo-label">Material</span>
              <select v-model="form.material_id" class="campo-input">
                <option value="" disabled>Selecciona un material…</option>
                <option v-for="m in vales.materialesActivos" :key="m.id" :value="m.id">{{ m.descripcion }}</option>
              </select>
            </label>

            <div class="campo">
              <div class="campo-cab">
                <span class="campo-label">Cantidad a transferir</span>
                <div v-if="info" class="modo" role="group" aria-label="Unidad de la cantidad">
                  <button type="button" :class="{ on: modo === 'und' }" :aria-pressed="modo === 'und'" @click="modo = 'und'">{{ unidadMat || 'UND' }}</button>
                  <button type="button" :class="{ on: modo === 'edp' }" :aria-pressed="modo === 'edp'" @click="modo = 'edp'">{{ info.unidad }}</button>
                </div>
              </div>
              <div class="fila-cant">
                <input v-model="form.cantidad" type="number" step="0.001" min="0.001" inputmode="decimal" class="campo-input grande" placeholder="0" />
                <span class="unidad-badge">{{ modo === 'edp' && info ? info.unidad : unidadMat || '—' }}</span>
              </div>
              <p v-if="info" class="equiv">
                Cada {{ unidadMat || 'unidad' }} equivale a <b>{{ info.factor }} {{ info.unidad }}</b>.
                <template v-if="cantidadUnd > 0">Se transfieren <b>{{ cantidadUnd }} {{ unidadMat }}</b> ({{ cantidadEdp }} {{ info.unidad }}).</template>
                <template v-else>Puedes escribirla en {{ info.unidad }} (ej. el retazo que cortaste) y se convierte sola.</template>
              </p>
            </div>

            <label class="campo">
              <span class="campo-label">Observación (opcional)</span>
              <textarea v-model="form.observacion" class="campo-input textarea" rows="2" placeholder="Ej.: vale de David G a Alexandra M"></textarea>
            </label>
          </section>
        </div>

        <!-- Columna de contexto: qué tiene el frente de origen y cómo queda -->
        <aside class="col-info">
          <section class="tarjeta info-card">
            <h3 class="info-tit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" /></svg>
              En el frente de origen
            </h3>

            <p v-if="!stockOrigen" class="vacio-info">
              {{ origenNombre && form.material_id ? 'Consultando…' : 'Elige el frente de origen y el material para ver cuánto tiene.' }}
            </p>

            <template v-else>
              <div class="stock-num" :class="{ alerta: excede }">
                <b>{{ libreEnOrigen }}</b>
                <span>{{ unidadMat }}<template v-if="info"> · {{ redondear3(libreEnOrigen * info.factor) }} {{ info.unidad }}</template></span>
              </div>
              <p class="stock-sub">
                figuran en <b>{{ origenNombre }}</b>
                <template v-if="stockOrigen.comprometido"> (ya hay {{ stockOrigen.comprometido }} {{ unidadMat }} pedidos en otras transferencias)</template>
              </p>
              <p v-if="excede" class="aviso-excede">
                ⚠ Estás pasando más de lo que figura en ese frente; revisa la cantidad.
              </p>

              <ul v-if="movimientos.length" class="movs" aria-label="De dónde sale ese stock">
                <li v-for="(m, i) in movimientosVisibles" :key="i" :class="{ resta: m.cantidad < 0 }">
                  <span class="mov-f">{{ fechaDia(m.fecha) }}</span>
                  <span class="mov-d">{{ m.documento || ETIQUETA_MOV[m.tipo] }}<small v-if="m.documento && m.tipo !== 'salida'"> · {{ ETIQUETA_MOV[m.tipo] }}</small></span>
                  <span class="mov-c">{{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad }}</span>
                </li>
              </ul>
              <button v-if="movimientos.length > 4" type="button" class="ver-mas" @click="verTodos = !verTodos">
                {{ verTodos ? 'Ver menos' : `Ver los ${movimientos.length} movimientos` }}
              </button>
            </template>
          </section>

          <p v-if="corte" class="corte">
            ✂ <b>Corte:</b> cortaste {{ corte.barras }} {{ unidadMat || 'unidad(es)' }} de {{ info.factor }} {{ info.unidad }}.
            Pasan <b>{{ form.cantidad }} {{ info.unidad }}</b> a {{ destinoNombre || 'el destino' }} y
            <b>quedan {{ corte.queda }} {{ info.unidad }}</b> en {{ origenNombre || 'el origen' }}. Se anota en la observación.
          </p>

          <p v-if="origenNombre && destinoNombre && resumen" class="resumen">
            <b>{{ resumen }}</b>
            <span>{{ origenNombre }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <span>{{ destinoNombre }}</span>
          </p>
        </aside>
      </div>

      <p v-if="error && !comoModal" class="error">{{ error }}</p>
      <p v-if="aviso && !comoModal" class="aviso">{{ aviso }}</p>

      <div v-if="!comoModal" class="historial">
        <div class="seccion-head">
          <span class="seccion-titulo">MIS TRANSFERENCIAS</span>
        </div>
        <div v-for="t in misTransferencias" :key="t.id" class="tarjeta-dev">
          <div class="tarjeta-dev-main">
            <div class="tarjeta-dev-nombre">{{ t.materiales?.descripcion }}</div>
            <div class="tarjeta-dev-meta">
              {{ t.cantidad }} {{ t.materiales?.unidad }} · {{ t.frente_origen?.codigo ?? t.frente_origen?.nombre }} →
              {{ t.frente_destino?.codigo ?? t.frente_destino?.nombre }} · {{ fechaCorta(t.created_at) }}
            </div>
          </div>
          <span class="badge-movil" :class="categoria(t.estado)">{{ t.estado }}</span>
        </div>
        <p v-if="!misTransferencias.length" class="vacio">Todavía no registraste transferencias.</p>
      </div>
    </main>

    <div v-if="!comoModal" class="actionbar">
      <button type="button" class="btn btn-sec" @click="cerrar">Cancelar</button>
      <button type="button" class="btn btn-pri" :disabled="enviando" @click="enviar">
        {{ enviando ? 'Enviando…' : 'Transferir material' }}
      </button>
    </div>
  </div>
  </component>
</template>

<style scoped>
/* Como ventana: sin altura de pantalla ni marco propio; el cuadro estándar
   pone el título, el error y los botones. */
.transferencia.en-modal {
  height: auto;
  display: block;
  background: transparent;
  max-width: none;
  margin: 0;
  box-shadow: none;
}
.transferencia.en-modal .content {
  overflow: visible;
  padding: 0;
}
.transferencia.en-modal .col-info {
  position: static;
}
.transferencia {
  --bg: #f4f5f7;
  --card: #ffffff;
  --border-lista: #e4e7ec;
  --text: #1e293b;
  --text-2: #667085;
  --text-3: #98a2b3;
  --amber: #f5a800;
  --amber-soft: #fff7e5;
  --amber-ink: #b45309;
  --gray-bg: #f2f4f7;
  --ok: #059669;
  --ok-bg: #ecfdf5;
  --err: #dc2626;
  --err-bg: #fef2f2;
  --info: #2563eb;
  --info-bg: #eff6ff;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  color: var(--text);
  background: var(--bg);
  height: 100vh;
  height: calc(100dvh - env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
}
/* Modo oscuro: mismo criterio que el resto del módulo (ver el comentario
   largo en ValesView.vue/rdc-tema.css) — redefine estas mismas variables
   con los tokens del Sistema. */
:root[data-theme='dark'] .transferencia {
  --bg: var(--color-bg);
  --card: var(--color-surface);
  --border-lista: var(--color-border);
  --text: var(--color-text);
  --text-2: var(--color-text-muted);
  --text-3: #6b7280;
  --amber: var(--color-primary);
  --amber-soft: var(--color-primary-soft);
  --amber-ink: var(--color-primary);
  --gray-bg: var(--color-surface-2);
  --ok: var(--color-success);
  --ok-bg: var(--color-success-soft);
  --err: var(--color-danger);
  --err-bg: var(--color-danger-soft);
  --info: var(--color-info);
  --info-bg: var(--color-info-soft);
}
@media (min-width: 1025px) {
  .transferencia {
    max-width: 1080px;
    margin: 0 auto;
    box-shadow: 0 0 0 1px var(--border-lista);
  }
}
.appbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border-lista);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
}
.icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
}
.appbar-title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cols {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.col-form,
.col-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
@media (min-width: 900px) {
  .content {
    padding: 22px 28px;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .col-info {
    position: sticky;
    top: 0;
  }
}
.tarjeta {
  background: var(--card);
  border: 1px solid var(--border-lista);
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tarjeta.ruta {
  display: grid;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.dot.origen {
  background: var(--err);
}
.dot.destino {
  background: var(--ok);
}
.campo-input.grande {
  font-size: 22px;
  font-weight: 800;
  height: 56px;
}
.info-card {
  gap: 10px;
}
.info-tit {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.vacio-info {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}
.stock-num {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.stock-num b {
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.stock-num span {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-2);
}
.stock-num.alerta b {
  color: var(--err);
}
.stock-sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.aviso-excede {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--err-bg);
  color: var(--err);
  font-size: 12.5px;
  font-weight: 600;
}
.movs {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  border-top: 1px solid var(--border-lista);
}
.movs li {
  display: grid;
  grid-template-columns: 62px 1fr auto;
  gap: 8px;
  align-items: baseline;
  padding: 7px 0;
  border-bottom: 1px solid var(--border-lista);
  font-size: 12.5px;
}
.mov-f {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.mov-d {
  font-weight: 700;
  min-width: 0;
}
.mov-d small {
  font-weight: 500;
  color: var(--text-3);
}
.mov-c {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--ok);
}
.movs li.resta .mov-c {
  color: var(--err);
}
.ver-mas {
  align-self: flex-start;
  border: 0;
  background: none;
  padding: 2px 0;
  color: var(--info);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
@media (max-width: 520px) {
  .content {
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
    gap: 10px;
  }
  .tarjeta {
    padding: 12px;
    gap: 12px;
    border-radius: 14px;
  }
  .stock-num b {
    font-size: 28px;
  }
}

.ayuda {
  margin: 0;
  padding: 10px 12px;
  background: var(--info-bg);
  color: var(--info);
  border-radius: 11px;
  font-size: 13px;
  line-height: 1.4;
}

.ruta {
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: end;
}
.punto {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.punto-rot {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.punto-fijo {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 13px;
  border-radius: 11px;
  background: var(--gray-bg);
  font-weight: 700;
}
.flecha {
  width: 44px;
  height: 48px;
  border: 0;
  border-radius: 12px;
  background: var(--amber-soft);
  color: var(--amber-ink);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.flecha:disabled {
  cursor: default;
}
.flecha .f-v {
  display: none;
}
@media (max-width: 520px) {
  .ruta {
    grid-template-columns: 1fr;
  }
  .flecha {
    width: 100%;
    height: 36px;
  }
  .flecha .f-h {
    display: none;
  }
  .flecha .f-v {
    display: inline;
  }
}
.campo-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.modo {
  display: inline-flex;
  background: var(--gray-bg);
  border-radius: 10px;
  padding: 3px;
}
.modo button {
  min-width: 52px;
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.modo button.on {
  background: var(--amber);
  color: #1a1206;
}
.equiv {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.4;
}
.equiv b {
  color: var(--text);
}
.corte {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--amber-soft);
  color: var(--amber-ink);
  font-size: 13px;
  line-height: 1.45;
}
.stock-origen {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--gray-bg);
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.45;
}
.stock-origen.alerta {
  background: var(--err-bg);
  color: var(--err);
}
.resumen {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ok-bg);
  color: var(--ok);
  font-size: 13.5px;
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.campo-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.campo-input {
  height: 48px;
  border-radius: 11px;
  border: 1.5px solid var(--border-lista);
  background: var(--card);
  padding: 0 13px;
  font-size: 16px;
  font-family: inherit;
  color: var(--text);
}
.campo-input.textarea {
  height: auto;
  padding: 11px 13px;
  resize: vertical;
}
.fila-cant {
  display: flex;
  align-items: center;
  gap: 10px;
}
.fila-cant .campo-input {
  flex: 1;
  min-width: 0;
}
.unidad-badge {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--gray-bg);
  border-radius: 11px;
}

.error {
  color: var(--err);
  font-size: 13px;
}
.aviso {
  color: var(--ok);
  font-size: 13px;
}

.historial {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.seccion-head {
  display: flex;
  align-items: center;
}
.seccion-titulo {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: var(--text-3);
}
.tarjeta-dev {
  background: var(--card);
  border: 1px solid var(--border-lista);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.tarjeta-dev-nombre {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.tarjeta-dev-meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 2px;
}
.badge-movil {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
}
.badge-movil.wait {
  background: var(--amber-soft);
  color: var(--amber-ink);
}
.badge-movil.ok {
  background: var(--ok-bg);
  color: var(--ok);
}
.badge-movil.err {
  background: var(--err-bg);
  color: var(--err);
}
.badge-movil.draft {
  background: var(--gray-bg);
  color: var(--text-3);
}
.vacio {
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  padding: 16px 0;
}

.actionbar {
  flex-shrink: 0;
  background: var(--card);
  border-top: 1px solid var(--border-lista);
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  gap: 10px;
}
.btn {
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  flex: 1;
  border: none;
  cursor: pointer;
}
.btn-sec {
  background: var(--card);
  border: 1.5px solid var(--border-lista);
  color: var(--text-3);
}
.btn-pri {
  background: var(--amber);
  color: #1a1206;
}
.btn-pri:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

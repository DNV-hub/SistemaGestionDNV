<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import { useCerrarConEscape } from '../../../composables/useCerrarConEscape'
import { useDevolucionesStore } from '../../devoluciones/store/devoluciones'

// Dos formas de usarla: pantalla completa (celular, ruta propia) o ventana
// centrada (escritorio, abierta desde Almacén o Vales), igual que Nuevo vale.
const props = defineProps({ comoModal: { type: Boolean, default: false } })
const emit = defineEmits(['cerrar', 'creado'])

const vales = useValesStore()
const auth = useAuthStore()
const devoluciones = useDevolucionesStore()
const router = useRouter()
const cerrar = () => (props.comoModal ? emit('cerrar') : router.back())
// Esc cierra: en la ventana lo maneja el cuadro estándar; en la pantalla
// completa vuelve atrás (si no se está escribiendo en un campo).
if (!props.comoModal) useCerrarConEscape(cerrar, { ignorarCampos: true })

onMounted(async () => {
  const tareas = [devoluciones.cargar(), vales.cargarFrentesParaDevolucion()]
  if (!vales.frentesActivos.length || !vales.materialesActivos.length) tareas.push(vales.cargarLista())
  await Promise.all(tareas)
})

// Frentes activos Y paralizados: uno recién parado suele ser justo cuando
// aparece material suelto por devolver, así que no puede quedar afuera.
const frenteAsignado = computed(() => vales.frentesParaDevolucion.find((f) => f.id === auth.perfil?.frente_id) ?? null)
const necesitaElegirFrente = computed(() => !frenteAsignado.value)

const form = reactive({ frente_id: '', material_id: '', cantidad: '', estado_material: 'bueno', observacion: '' })
const enviando = ref(false)
const error = ref('')
const aviso = ref('')

const propsRaiz = computed(() =>
  props.comoModal
    ? {
        titulo: 'Devolver material',
        subtitulo: 'Material que sobra en un frente y vuelve a Almacén.',
        ancho: '680px',
        guardando: enviando.value,
        textoGuardar: 'Solicitar devolución',
        textoGuardando: 'Enviando…',
        error: error.value,
      }
    : {},
)
const Raiz = computed(() => (props.comoModal ? ModalFormulario : 'div'))

function unidadDe(materialId) {
  return vales.materialesActivos.find((m) => m.id === materialId)?.unidad ?? ''
}

async function enviar() {
  error.value = ''
  aviso.value = ''
  const frente = frenteAsignado.value?.id || form.frente_id
  if (!frente) {
    error.value = 'Selecciona el frente.'
    return
  }
  if (!form.material_id || Number(form.cantidad) <= 0) {
    error.value = 'Selecciona un material y una cantidad válida.'
    return
  }

  enviando.value = true
  try {
    await devoluciones.crear({
      frente_id: frente,
      material_id: form.material_id,
      cantidad: Number(form.cantidad),
      estado_material: form.estado_material,
      observacion: form.observacion.trim() || null,
      supervisor_id: auth.session.user.id,
    })
    form.material_id = ''
    form.cantidad = ''
    form.estado_material = 'bueno'
    form.observacion = ''
    aviso.value = 'Devolución solicitada — queda pendiente hasta que Almacén confirme que la recibió.'
    if (props.comoModal) {
      emit('creado', aviso.value)
      return
    }
  } catch (e) {
    console.error(e)
    error.value = `No se pudo registrar la devolución${e?.message ? ': ' + e.message : '.'}`
  } finally {
    enviando.value = false
  }
}

const misDevoluciones = computed(() =>
  [...devoluciones.devoluciones].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
)

function fechaCorta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

const CATEGORIA = { Solicitada: 'wait', Recibida: 'ok', Rechazada: 'err' }
const categoria = (estado) => CATEGORIA[estado] ?? 'draft'
</script>

<template>
  <component :is="Raiz" v-bind="propsRaiz" @cerrar="cerrar" @enviar="enviar">
  <div class="devolucion" :class="{ 'en-modal': comoModal }">
    <header v-if="!comoModal" class="appbar">
      <button type="button" class="icon-btn" aria-label="Cancelar" @click="cerrar">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5.5 5.5l11 11M16.5 5.5l-11 11"/></svg>
      </button>
      <div class="appbar-title">Devolver material</div>
      <div class="icon-btn"></div>
    </header>

    <main class="content">
      <label v-if="necesitaElegirFrente" class="campo">
        <span class="campo-label">Frente</span>
        <select v-model="form.frente_id" class="campo-input">
          <option value="" disabled>Selecciona tu frente…</option>
          <option v-for="f in vales.frentesParaDevolucion" :key="f.id" :value="f.id">
            {{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}
          </option>
        </select>
      </label>

      <label class="campo">
        <span class="campo-label">Material</span>
        <select v-model="form.material_id" class="campo-input">
          <option value="" disabled>Selecciona un material…</option>
          <option v-for="m in vales.materialesActivos" :key="m.id" :value="m.id">{{ m.descripcion }}</option>
        </select>
      </label>

      <div class="fila-cant">
        <label class="campo campo-cant">
          <span class="campo-label">Cantidad</span>
          <input v-model="form.cantidad" type="number" step="0.001" min="0.001" class="campo-input" placeholder="0" />
        </label>
        <span class="unidad-badge">{{ unidadDe(form.material_id) || '—' }}</span>
      </div>

      <div class="campo">
        <span class="campo-label">Estado del material</span>
        <div class="opciones-estado">
          <label class="opcion-estado" :class="{ activa: form.estado_material === 'bueno' }">
            <input v-model="form.estado_material" type="radio" value="bueno" />
            Bueno
          </label>
          <label class="opcion-estado" :class="{ activa: form.estado_material === 'danado' }">
            <input v-model="form.estado_material" type="radio" value="danado" />
            Dañado
          </label>
        </div>
      </div>

      <label class="campo">
        <span class="campo-label">Observación (opcional)</span>
        <textarea v-model="form.observacion" class="campo-input textarea" rows="3" placeholder="Detalles adicionales…"></textarea>
      </label>

      <p v-if="error && !comoModal" class="error">{{ error }}</p>
      <p v-if="aviso && !comoModal" class="aviso">{{ aviso }}</p>

      <div v-if="!comoModal" class="historial">
        <div class="seccion-head">
          <span class="seccion-titulo">MIS DEVOLUCIONES</span>
        </div>
        <div v-for="d in misDevoluciones" :key="d.id" class="tarjeta-dev">
          <div class="tarjeta-dev-main">
            <div class="tarjeta-dev-nombre">{{ d.materiales?.descripcion }}</div>
            <div class="tarjeta-dev-meta">{{ d.cantidad }} {{ d.materiales?.unidad }} · {{ d.estado_material === 'bueno' ? 'Bueno' : 'Dañado' }} · {{ fechaCorta(d.created_at) }}</div>
          </div>
          <span class="badge-movil" :class="categoria(d.estado)">{{ d.estado }}</span>
        </div>
        <p v-if="!misDevoluciones.length" class="vacio">Todavía no registraste devoluciones.</p>
      </div>
    </main>

    <div v-if="!comoModal" class="actionbar">
      <button type="button" class="btn btn-sec" @click="cerrar">Cancelar</button>
      <button type="button" class="btn btn-pri" :disabled="enviando" @click="enviar">
        {{ enviando ? 'Enviando…' : 'Solicitar devolución' }}
      </button>
    </div>
  </div>
  </component>
</template>

<style scoped>
/* Como ventana: sin altura de pantalla ni marco propio; el cuadro estándar
   pone el título, el error y los botones. */
.devolucion.en-modal {
  height: auto;
  display: block;
  background: transparent;
  max-width: none;
  margin: 0;
  box-shadow: none;
}
.devolucion.en-modal .content {
  overflow: visible;
  padding: 0;
}
.devolucion.en-modal .col-info {
  position: static;
}
.devolucion {
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
:root[data-theme='dark'] .devolucion {
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
}
@media (min-width: 1025px) {
  .devolucion {
    max-width: 640px;
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
  gap: 16px;
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
  align-items: flex-end;
  gap: 10px;
}
.campo-cant {
  flex: 1;
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
.opciones-estado {
  display: flex;
  gap: 10px;
}
.opcion-estado {
  flex: 1;
  height: 48px;
  border-radius: 11px;
  border: 1.5px solid var(--border-lista);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
}
.opcion-estado.activa {
  border-color: var(--amber);
  background: var(--amber-soft);
  color: var(--amber-ink);
}
.opcion-estado input {
  accent-color: var(--amber);
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

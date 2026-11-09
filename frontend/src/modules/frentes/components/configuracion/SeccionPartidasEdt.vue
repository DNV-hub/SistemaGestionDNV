<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CATALOGOS_RDC, OPCIONES_FIJAS } from '../../../catalogo/rdc/definicionesCatalogos'
import {
  listarCatalogo,
  crearFilaCatalogo,
  actualizarFilaCatalogo,
  eliminarFilaCatalogo,
  crearFilasCatalogoEnLote,
} from '../../../catalogo/rdc/services/catalogosRdcService'
import ImportarPartidasEdtModal from './ImportarPartidasEdtModal.vue'

const props = defineProps({
  frenteId: { type: String, required: true },
})
const emit = defineEmits(['contado'])

// Misma definición (columnas, tabla) que ya usa /catalogo para "Partidas
// EDT" — se reusa tal cual para no mantener dos formas distintas de lo mismo.
const DEF = CATALOGOS_RDC.find((d) => d.clave === 'partidasEdt')

const todas = ref([])
const cargando = ref(true)
const error = ref('')
const mostrarImportar = ref(false)
const aviso = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    todas.value = await listarCatalogo(DEF.tabla, { orderBy: DEF.ordenarPor ?? 'orden' })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo cargar las partidas EDT.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

const filas = computed(() => todas.value.filter((f) => f.frente_id === props.frenteId))
watch(() => filas.value.length, (n) => emit('contado', n), { immediate: true })

async function alCrear(datos) {
  const fila = await crearFilaCatalogo(DEF.tabla, datos)
  todas.value = [...todas.value, fila]
}
async function alActualizar(id, cambios) {
  const actualizada = await actualizarFilaCatalogo(DEF.tabla, id, cambios)
  todas.value = todas.value.map((f) => (f.id === id ? { ...f, ...actualizada } : f))
}
async function alEliminar(id) {
  await eliminarFilaCatalogo(DEF.tabla, id)
  todas.value = todas.value.filter((f) => f.id !== id)
}

async function importar(filasAImportar) {
  aviso.value = ''
  const payloads = filasAImportar.map((f) => ({
    frente_id: props.frenteId,
    codigo_edt: f.codigo_edt,
    nombre: f.nombre,
    seccion: f.seccion,
    unidad: f.unidad,
    metrado_previsto: f.metrado_previsto,
    // No 'digitado': un Excel de cronograma real suele traer decenas de
    // ítems, y 'digitado' le agrega cada uno como campo nuevo al RDC del
    // supervisor. 'solo_seguimiento' no le cambia nada al RDC — el
    // acumulado de estas partidas se llena solo cuando Planeamiento
    // confirma un metrado libre y lo enlaza acá (por parecido de texto).
    // Las que sí correspondan a pernos/malla/cable se ajustan a mano
    // después, en la tabla.
    tipo_medicion: 'solo_seguimiento',
  }))
  const creadas = await crearFilasCatalogoEnLote(DEF.tabla, payloads)
  todas.value = [...todas.value, ...creadas]
  aviso.value = `Se importaron ${creadas.length} partidas.`
}

// ---- Tabla (solo las 7 columnas principales) ----
const ETIQUETA_MEDICION = Object.fromEntries(OPCIONES_FIJAS.tipoMedicion.map((o) => [o.value, o.label]))
const etiquetaMedicion = (v) => ETIQUETA_MEDICION[v] ?? (v === 'digitado' ? 'Digitado' : v ?? '—')
const fmtPrevisto = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('es-PE', { maximumFractionDigits: 3 }))

const alternando = ref(null)
async function alternarActivo(fila, ev) {
  ev.stopPropagation()
  const nuevo = ev.target.checked
  alternando.value = fila.id
  error.value = ''
  try {
    await alActualizar(fila.id, { [DEF.campoActivo]: nuevo })
  } catch (e) {
    ev.target.checked = !nuevo
    error.value = e?.message ?? 'No se pudo guardar el cambio.'
  } finally {
    alternando.value = null
  }
}

// ---- Panel lateral "Editar partida" (todos los campos y validaciones) ----
const panelAbierto = ref(false)
const editandoId = ref(null) // null = partida nueva
const form = reactive({})
const errorPanel = ref('')
const guardando = ref(false)

function valoresIniciales(fila) {
  const v = {}
  for (const c of DEF.columnas) {
    const primera = c.tipo === 'seleccion' && c.requerido ? OPCIONES_FIJAS[c.opciones]?.[0]?.value ?? '' : ''
    v[c.clave] = fila ? fila[c.clave] ?? '' : primera
  }
  v[DEF.campoActivo] = fila ? !!fila[DEF.campoActivo] : true
  return v
}
function abrirPanel(fila) {
  editandoId.value = fila?.id ?? null
  Object.keys(form).forEach((k) => delete form[k])
  Object.assign(form, valoresIniciales(fila))
  errorPanel.value = ''
  panelAbierto.value = true
}
function cerrarPanel() {
  panelAbierto.value = false
}
const faltaRequerido = computed(() => DEF.columnas.some((c) => c.requerido && (form[c.clave] === '' || form[c.clave] == null)))

function limpiar(valores) {
  const salida = {}
  for (const c of DEF.columnas) {
    const v = valores[c.clave]
    salida[c.clave] = c.tipo === 'numero' ? (v === '' || v == null ? null : Number(v)) : v
  }
  if (DEF.campoActivo) salida[DEF.campoActivo] = !!valores[DEF.campoActivo]
  return salida
}

async function guardarPanel() {
  if (faltaRequerido.value || guardando.value) return
  guardando.value = true
  errorPanel.value = ''
  try {
    const nuevos = limpiar(form)
    if (editandoId.value) {
      const original = filas.value.find((f) => f.id === editandoId.value)
      const cambios = {}
      for (const [k, v] of Object.entries(nuevos)) {
        if ((original?.[k] ?? null) !== (v ?? null) && !(original?.[k] == null && v === '')) cambios[k] = v
      }
      if (Object.keys(cambios).length) await alActualizar(editandoId.value, cambios)
    } else {
      await alCrear({ ...nuevos, frente_id: props.frenteId })
    }
    cerrarPanel()
  } catch (e) {
    errorPanel.value = e?.message ?? 'No se pudo guardar la partida.'
  } finally {
    guardando.value = false
  }
}

async function eliminarPanel() {
  const fila = filas.value.find((f) => f.id === editandoId.value)
  if (!fila) return
  if (!confirm(`¿Borrar "${fila.nombre ?? fila.codigo_edt}"? Si algún reporte ya la usó, la base va a impedirlo.`)) return
  guardando.value = true
  errorPanel.value = ''
  try {
    await alEliminar(fila.id)
    cerrarPanel()
  } catch (e) {
    errorPanel.value = e?.message ?? 'No se pudo borrar: probablemente algún reporte ya la está usando.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <section class="pl-panel">
    <div class="cabecera">
      <div>
        <div class="pl-sh">Partidas EDT</div>
        <div class="pl-sub">Previsto por partida y cómo se mide. Haz clic en una fila para editar todos sus campos.</div>
      </div>
      <div class="pl-acts">
        <button type="button" class="pl-ghost" @click="mostrarImportar = true">Importar Excel</button>
        <button type="button" class="pl-ghost" @click="abrirPanel(null)">+ Agregar</button>
      </div>
    </div>
    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando" class="pl-empty">Cargando…</p>

    <div v-else class="pl-table tabla-edt">
      <div class="in">
        <div class="pl-th cols">
          <span>CÓDIGO EDT</span><span>NOMBRE</span><span>GRUPO</span><span>U.M.</span><span class="pl-r">PREVISTO</span><span>MEDICIÓN</span><span class="pl-c">ACTIVO</span>
        </div>
        <div
          v-for="f in filas"
          :key="f.id"
          class="pl-tr cols clic"
          role="button"
          tabindex="0"
          :aria-label="`Editar partida ${f.codigo_edt} ${f.nombre}`"
          @click="abrirPanel(f)"
          @keydown.enter="abrirPanel(f)"
        >
          <span class="pl-strong">{{ f.codigo_edt }}</span>
          <span class="pl-semi wrap">{{ f.nombre }}</span>
          <span>{{ f.seccion || '—' }}</span>
          <span>{{ f.unidad }}</span>
          <span class="pl-r">{{ fmtPrevisto(f.metrado_previsto) }}</span>
          <span>{{ etiquetaMedicion(f.tipo_medicion) }}</span>
          <span class="pl-c">
            <input
              type="checkbox"
              class="pl-sw"
              role="switch"
              aria-label="Activo"
              :checked="f[DEF.campoActivo]"
              :disabled="alternando === f.id"
              @click.stop
              @change="alternarActivo(f, $event)"
            />
          </span>
        </div>
        <div v-if="!filas.length" class="pl-vacio">Todavía no hay partidas EDT en este frente.</div>
      </div>
    </div>

    <ImportarPartidasEdtModal
      v-if="mostrarImportar"
      :existentes="filas"
      @importar="importar"
      @cerrar="mostrarImportar = false"
    />

    <div v-if="panelAbierto" class="fondo-panel" @click.self="cerrarPanel" @keydown.esc="cerrarPanel">
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="Editar partida">
        <header class="drawer-cab">
          <div class="pl-sh">{{ editandoId ? 'Editar partida' : 'Nueva partida' }}</div>
          <button type="button" class="pl-ic" aria-label="Cerrar" @click="cerrarPanel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div class="drawer-cuerpo">
          <div v-for="c in DEF.columnas" :key="c.clave" class="campo">
            <label class="pl-lbl" :for="`edt-${c.clave}`">{{ c.etiqueta }}<template v-if="c.requerido"> *</template></label>
            <select v-if="c.tipo === 'seleccion'" :id="`edt-${c.clave}`" v-model="form[c.clave]" class="pl-sel">
              <option v-if="c.permiteVacio" value="">—</option>
              <option v-for="o in OPCIONES_FIJAS[c.opciones]" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input v-else-if="c.tipo === 'numero'" :id="`edt-${c.clave}`" v-model="form[c.clave]" type="number" step="any" class="pl-fld" />
            <input v-else :id="`edt-${c.clave}`" v-model="form[c.clave]" type="text" class="pl-fld" />
          </div>
          <label v-if="DEF.campoActivo" class="activo-fila">
            <input v-model="form[DEF.campoActivo]" type="checkbox" class="pl-sw" role="switch" aria-label="Activo" />
            <b>Activo</b>
          </label>
          <p v-if="errorPanel" class="error">{{ errorPanel }}</p>
        </div>

        <footer class="drawer-pie">
          <button v-if="editandoId" type="button" class="pl-ghost peligro" :disabled="guardando" @click="eliminarPanel">Borrar</button>
          <span class="espacio"></span>
          <button type="button" class="pl-ghost" :disabled="guardando" @click="cerrarPanel">Cancelar</button>
          <button type="button" class="pl-cta" :disabled="faltaRequerido || guardando" @click="guardarPanel">
            {{ guardando ? 'Guardando…' : 'Guardar' }}
          </button>
        </footer>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.cols {
  grid-template-columns: 110px minmax(220px, 1fr) 150px 70px 110px 220px 70px;
}
.pl-tr.clic {
  cursor: pointer;
}
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
.aviso {
  color: var(--p-ok-fg);
  font-size: 14px;
  margin: 0;
}
.fondo-panel {
  position: fixed;
  inset: 0;
  background: rgba(17, 17, 17, 0.4);
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: 440px;
  max-width: 100vw;
  height: 100%;
  background: var(--p-card);
  display: flex;
  flex-direction: column;
  box-shadow: -18px 0 40px rgba(17, 17, 17, 0.15);
}
.drawer-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--p-line);
}
.drawer-cuerpo {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.activo-fila {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}
.drawer-pie {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--p-line);
}
.espacio {
  flex: 1;
}
.peligro {
  color: var(--p-low-fg);
}
</style>

<script setup>
import { useCerrarConEscape } from '../../../../composables/useCerrarConEscape'
import { computed, ref, useAttrs } from 'vue'
import EstructuraCopiable from '../../../../components/EstructuraCopiable.vue'
import { leerArchivoPernos, procesarFilasPernos } from '../../utils/importarPernos'

const props = defineProps({
  existentes: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

// Las filas leídas se guardan crudas y el resultado se calcula aparte: así,
// marcar o desmarcar "Reemplazar" actualiza los avisos sin volver a leer el
// archivo.
const filasCrudas = ref(null)
const reemplazar = ref(false)
const resultado = computed(() =>
  filasCrudas.value ? procesarFilasPernos(filasCrudas.value, { existentes: reemplazar.value ? [] : props.existentes }) : null
)
const nombreArchivo = ref('')
const leyendo = ref(false)
const importando = ref(false)
const error = ref('')
const hecho = ref(false)
const cantidadImportada = ref(0)
const nActualizan = computed(() => (resultado.value?.aImportar ?? []).filter((f) => f.existe).length)
const nNuevos = computed(() => (resultado.value?.aImportar.length ?? 0) - nActualizan.value)

// Encabezados en el orden del formato. Se copian separados por TABULACIÓN:
// al pegar en la celda A1 de un Excel, cada uno cae en su propia columna.
const ENCABEZADOS = ['Código', 'Zona', 'Sistema', 'Ubicación', 'Diámetro', 'Longitud', 'Ángulo', 'Plano']

async function onArchivoSeleccionado(ev) {
  const file = ev.target.files?.[0]
  if (!file) return

  error.value = ''
  filasCrudas.value = null
  hecho.value = false
  nombreArchivo.value = file.name
  leyendo.value = true
  try {
    filasCrudas.value = await leerArchivoPernos(file)
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx), CSV o .xls válido.'
  } finally {
    leyendo.value = false
  }
}

async function confirmarImportacion() {
  if (!resultado.value?.aImportar.length) return
  error.value = ''
  importando.value = true
  try {
    cantidadImportada.value = resultado.value.aImportar.length
    await attrs.onImportar(resultado.value.aImportar, { reemplazar: reemplazar.value })
    hecho.value = true
  } catch (e) {
    console.error(e)
    error.value = `No se pudo completar la importación${e?.message ? ': ' + e.message : '.'}`
  } finally {
    importando.value = false
  }
}

useCerrarConEscape()
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal" :class="{ 'con-resultado': resultado && !hecho }">
      <h2>Importar catálogo de pernos del plano</h2>

      <div class="panel-izq">
        <div class="formato">
          <p class="formato-titulo">El archivo (.xlsx, .xls o .csv) debe traer estas columnas en la primera fila:</p>
          <EstructuraCopiable :encabezados="ENCABEZADOS" />
          <table class="tabla-formato">
            <thead>
              <tr>
                <th>Columna</th>
                <th>Obligatoria</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>Código</code></td><td>Sí</td></tr>
              <tr><td><code>Zona</code></td><td>No</td></tr>
              <tr><td><code>Sistema</code></td><td>No</td></tr>
              <tr><td><code>Ubicación</code></td><td>No</td></tr>
              <tr><td><code>Diámetro</code></td><td>No</td></tr>
              <tr><td><code>Longitud</code></td><td>No</td></tr>
              <tr><td><code>Ángulo</code></td><td>No</td></tr>
              <tr><td><code>Plano</code></td><td>No</td></tr>
            </tbody>
          </table>
          <p class="formato-nota">
            Un código repetido no se bloquea (puede ser un perno que se re-perforó) — solo se avisa antes de confirmar.
          </p>
        </div>

        <label class="reemplazo" :class="{ activo: reemplazar }">
          <input v-model="reemplazar" type="checkbox" />
          <span>
            <b>Reemplazar toda la biblioteca</b>
            <small v-if="reemplazar">Se borrarán los {{ existentes.length }} pernos actuales de este frente y quedarán solo los del archivo.</small>
            <small v-else>Sin marcar: los pernos nuevos se <b>agregan</b> a los {{ existentes.length }} que ya hay, y los códigos que ya existen se <b>actualizan</b> con los datos del archivo.</small>
          </span>
        </label>

        <label class="archivo">
          <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
        </label>

        <p v-if="leyendo">Leyendo {{ nombreArchivo }}…</p>
        <p v-if="error" class="error">{{ error }}</p>

        <template v-if="hecho">
          <p class="aviso">{{ reemplazar ? 'Biblioteca reemplazada' : 'Pernos agregados' }}: {{ cantidadImportada }} pernos.</p>
          <button type="button" @click="$emit('cerrar')">Cerrar</button>
        </template>

        <button v-else-if="!resultado" type="button" class="secundario" @click="$emit('cerrar')">Cerrar</button>
      </div>

      <div v-if="resultado && !hecho" class="panel-der">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div v-if="reemplazar" class="ok"><strong>{{ resultado.aImportar.length }}</strong> reemplazarán a los actuales</div>
          <template v-else>
            <div class="ok"><strong>{{ nNuevos }}</strong> nuevos se agregarán</div>
            <div v-if="nActualizan" class="advertencia"><strong>{{ nActualizan }}</strong> ya existen y se actualizarán</div>
          </template>
          <div v-if="reemplazar && existentes.length" class="advertencia">Se borrarán <strong>{{ existentes.length }}</strong> pernos actuales.</div>
          <div v-if="resultado.conError.length" class="advertencia">
            <strong>{{ resultado.conError.length }}</strong> omitidas por error
          </div>
        </div>

        <div class="tabla-wrap">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fila</th>
                <th>Código</th>
                <th>Zona</th>
                <th>Diámetro</th>
                <th>Longitud</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.estado === 'error' }">
                <td>{{ f.fila }}</td>
                <td>{{ f.codigo }}</td>
                <td>{{ f.zona ?? '—' }}</td>
                <td>{{ f.diametro ?? '—' }}</td>
                <td>{{ f.longitud ?? '—' }}</td>
                <td>
                  <template v-if="f.estado === 'ok'">{{ f.advertencia ?? 'Se importa' }}</template>
                  <template v-else>{{ f.motivo }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
          <button type="button" :disabled="importando || !resultado.aImportar.length" @click="confirmarImportacion">
            {{ importando ? 'Importando…' : reemplazar ? `Reemplazar con ${resultado.aImportar.length} pernos` : `Importar ${resultado.aImportar.length} pernos` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: grid;
  place-items: center;
  z-index: 40;
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 680px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
.modal.con-resultado {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  width: min(90vw, 1200px);
  gap: 0;
  overflow: hidden;
}
.modal.con-resultado > h2 {
  flex: 0 0 100%;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.25rem;
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.panel-izq {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.modal.con-resultado .panel-izq {
  flex: 0 0 320px;
  max-height: calc(100vh - 9rem);
  overflow-y: auto;
  padding-right: 1.25rem;
  border-right: 1px solid var(--color-border);
}
.panel-der {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-left: 1.25rem;
  max-height: calc(100vh - 9rem);
  overflow-y: auto;
}
.formato {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--color-info-soft);
  border-radius: var(--radius-control);
  padding: 0.75rem 0.9rem;
}
.formato-titulo {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
}
.tabla-formato {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  background: var(--color-surface);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.tabla-formato th,
.tabla-formato td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
}
.tabla-formato th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tabla-formato code {
  background: var(--color-surface-2);
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  font-size: 0.78rem;
}
.formato-nota {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.archivo input {
  font-size: 0.85rem;
}
.encabezados {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.encabezados code {
  flex: 1 1 220px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0.45rem 0.6rem;
  font-size: 0.78rem;
  line-height: 1.4;
}
.copiar {
  padding: 0.45rem 0.8rem;
  font-size: 0.8rem;
}
.reemplazo {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font-size: 0.85rem;
  cursor: pointer;
}
.reemplazo.activo {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}
.reemplazo input {
  margin-top: 0.2rem;
}
.reemplazo span {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.reemplazo small {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}
.resumen {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0.75rem;
}
.ok {
  color: var(--color-success);
}
.advertencia {
  color: var(--color-warning);
}
.tabla-wrap {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
.tabla th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
}
.tabla tr.conflicto {
  color: var(--color-danger);
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
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
.error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin: 0;
}
.aviso {
  color: var(--color-success);
  font-size: 0.9rem;
}
</style>

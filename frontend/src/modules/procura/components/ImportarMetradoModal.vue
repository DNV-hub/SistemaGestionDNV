<script setup>
import { ref, useAttrs } from 'vue'
import { leerArchivoMetrado, procesarFilasMetrado } from '../utils/importarMetrado'

const props = defineProps({
  materiales: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre — invocamos
// attrs.onImportar directamente para que el try/catch capture fallos reales.
const attrs = useAttrs()

const resultado = ref(null)
const nombreArchivo = ref('')
const leyendo = ref(false)
const importando = ref(false)
const error = ref('')
const hecho = ref(false)

async function onArchivoSeleccionado(ev) {
  const file = ev.target.files?.[0]
  if (!file) return

  error.value = ''
  resultado.value = null
  hecho.value = false
  nombreArchivo.value = file.name
  leyendo.value = true
  try {
    const filasCrudas = await leerArchivoMetrado(file)
    resultado.value = procesarFilasMetrado(filasCrudas, { materialesActivos: props.materiales })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.'
  } finally {
    leyendo.value = false
  }
}

async function confirmarImportacion() {
  if (!resultado.value?.aImportar.length) return
  error.value = ''
  importando.value = true
  try {
    await attrs.onImportar(resultado.value.aImportar)
    hecho.value = true
  } catch (e) {
    console.error(e)
    error.value = `No se pudo completar la importación${e?.message ? ': ' + e.message : '.'}`
  } finally {
    importando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Importar metrado masivo</h2>

      <div class="formato">
        <p class="formato-titulo">El archivo (.xlsx, .xls o .csv) debe traer estas columnas en la primera fila:</p>
        <table class="tabla-formato">
          <thead>
            <tr>
              <th>Columna</th>
              <th>Obligatoria</th>
              <th>Qué va ahí</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>CODIGO</code></td>
              <td>Sí</td>
              <td>El código tal como está en el catálogo de Materiales — si no existe, esa fila se omite.</td>
            </tr>
            <tr>
              <td><code>CANTIDAD CONTRACTUAL</code> <span class="alias">(o <code>CONTRACTUAL</code>)</span></td>
              <td rowspan="2" class="centrado">Al menos una de las dos</td>
              <td>Cantidad prevista en el contrato para ese material en este frente.</td>
            </tr>
            <tr>
              <td><code>CANTIDAD PROCURA</code> <span class="alias">(o <code>PROCURA</code>)</span></td>
              <td>Cantidad que Procura tiene planeado conseguir.</td>
            </tr>
            <tr>
              <td><code>OBSERVACION</code> <span class="alias">(o <code>OBSERVACIONES</code>)</span></td>
              <td>No</td>
              <td>Cualquier nota adicional para esa fila.</td>
            </tr>
          </tbody>
        </table>
        <p class="formato-nota">
          Si un material ya tiene metrado en este frente, importarlo de nuevo reemplaza los valores con una nueva
          versión — igual que editarlo a mano. El historial anterior no se pierde.
        </p>
      </div>

      <label class="archivo">
        <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
      </label>

      <p v-if="leyendo">Leyendo {{ nombreArchivo }}…</p>
      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="hecho">
        <p class="aviso">Se importaron {{ resultado.aImportar.length }} materiales al metrado.</p>
        <button type="button" @click="$emit('cerrar')">Cerrar</button>
      </template>

      <template v-else-if="resultado">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div class="ok"><strong>{{ resultado.aImportar.length }}</strong> se importarán</div>
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
                <th>Descripción</th>
                <th>Contractual</th>
                <th>Procura</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.estado === 'error' }">
                <td>{{ f.fila }}</td>
                <td>{{ f.codigo }}</td>
                <td>{{ f.descripcion ?? '—' }}</td>
                <td>{{ f.cantidad_contractual ?? '—' }}</td>
                <td>{{ f.cantidad_procura ?? '—' }}</td>
                <td>{{ f.estado === 'ok' ? 'Se importa' : f.motivo }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
          <button type="button" :disabled="importando || !resultado.aImportar.length" @click="confirmarImportacion">
            {{ importando ? 'Importando…' : `Importar ${resultado.aImportar.length} materiales` }}
          </button>
        </div>
      </template>

      <button v-else type="button" class="secundario" @click="$emit('cerrar')">Cerrar</button>
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
  width: 720px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.ayuda {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
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
  white-space: normal;
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
.tabla-formato .alias {
  color: var(--color-text-muted);
  font-size: 0.72rem;
}
.tabla-formato .centrado {
  text-align: center;
  color: var(--color-text-muted);
}
.formato-nota {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.archivo input {
  font-size: 0.85rem;
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
  max-height: 320px;
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

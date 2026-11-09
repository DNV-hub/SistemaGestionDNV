<script setup>
import { useCerrarConEscape } from '../../../../composables/useCerrarConEscape'
import { ref, useAttrs } from 'vue'
import EstructuraCopiable from '../../../../components/EstructuraCopiable.vue'
import { leerArchivoPartidasEdt, procesarFilasPartidasEdt } from '../../utils/importarPartidasEdt'

const props = defineProps({
  existentes: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
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
    const filasCrudas = await leerArchivoPartidasEdt(file)
    resultado.value = procesarFilasPartidasEdt(filasCrudas, { existentes: props.existentes })
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

useCerrarConEscape()
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal" :class="{ 'con-resultado': resultado && !hecho }">
      <h2>Importar partidas EDT</h2>

      <div class="panel-izq">
        <div class="formato">
          <p class="formato-titulo">El archivo (.xlsx, .xls o .csv) debe traer estas columnas en la primera fila:</p>
          <EstructuraCopiable :encabezados="['Ítem EDT', 'Partida', 'Grupo', 'U.M.', 'Metrado previsto']" />
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
                <td><code>Ítem</code> <span class="alias">(o <code>Código EDT</code>)</span></td>
                <td>Sí</td>
                <td>No se puede repetir dentro de este frente.</td>
              </tr>
              <tr>
                <td><code>Partida</code></td>
                <td>Sí</td>
                <td>Nombre de la partida.</td>
              </tr>
              <tr>
                <td><code>U.M.</code></td>
                <td>Sí</td>
                <td>Unidad de medida (ML, M2, GLB, UND…).</td>
              </tr>
              <tr>
                <td><code>Grupo</code></td>
                <td>No</td>
                <td>Para agrupar partidas en el calendario de Metrados.</td>
              </tr>
              <tr>
                <td><code>Previsto</code></td>
                <td>No</td>
                <td>Metrado previsto de esa partida.</td>
              </tr>
            </tbody>
          </table>
          <p class="formato-nota">
            Los nombres de columna no tienen que ser exactos — reconoce variantes como "EDT", "Partidas cronograma" o
            "Met. previsto". Si tu Excel trae las secciones como filas intercaladas (ej. "01 ACTIVIDADES PRELIMINARES"
            con un guion en U.M.), se detectan solas y agrupan las partidas siguientes — no hace falta una columna
            "Grupo" aparte.
          </p>
          <p class="formato-nota">
            Todas entran como "Digitado" — si alguna se calcula de pernos, malla o cable, ajusta su tipo de medición
            después, en la tabla.
          </p>
        </div>

        <label class="archivo">
          <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
        </label>

        <p v-if="leyendo">Leyendo {{ nombreArchivo }}…</p>
        <p v-if="error" class="error">{{ error }}</p>

        <template v-if="hecho">
          <p class="aviso">Se importaron {{ resultado.aImportar.length }} partidas.</p>
          <button type="button" @click="$emit('cerrar')">Cerrar</button>
        </template>

        <button v-else-if="!resultado" type="button" class="secundario" @click="$emit('cerrar')">Cerrar</button>
      </div>

      <div v-if="resultado && !hecho" class="panel-der">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div class="ok"><strong>{{ resultado.aImportar.length }}</strong> se importarán</div>
          <div v-if="resultado.secciones.length" class="info">
            <strong>{{ resultado.secciones.length }}</strong> detectadas como título de sección
          </div>
          <div v-if="resultado.conError.length" class="advertencia">
            <strong>{{ resultado.conError.length }}</strong> omitidas por error
          </div>
        </div>

        <div class="tabla-wrap">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fila</th>
                <th>Ítem</th>
                <th>Partida</th>
                <th>U.M.</th>
                <th>Previsto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.estado === 'error' }">
                <td>{{ f.fila }}</td>
                <td>{{ f.codigo_edt }}</td>
                <td>{{ f.nombre ?? '—' }}</td>
                <td>{{ f.unidad ?? '—' }}</td>
                <td>{{ f.metrado_previsto ?? '—' }}</td>
                <td>
                  <template v-if="f.estado === 'ok'">Se importa</template>
                  <template v-else>{{ f.motivo }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
          <button type="button" :disabled="importando || !resultado.aImportar.length" @click="confirmarImportacion">
            {{ importando ? 'Importando…' : `Importar ${resultado.aImportar.length} partidas` }}
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
  width: min(90vw, 1300px);
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
  flex: 0 0 400px;
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
.info {
  color: var(--color-text-muted);
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

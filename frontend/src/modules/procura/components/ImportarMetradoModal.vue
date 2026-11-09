<script setup>
import { computed, nextTick, reactive, ref, useAttrs } from 'vue'
import EstructuraCopiable from '../../../components/EstructuraCopiable.vue'
import { useCerrarConEscape } from '../../../composables/useCerrarConEscape'
import { leerArchivoMetrado, procesarFilasMetrado, sugerirNombresEdp } from '../utils/importarMetrado'

const props = defineProps({
  nombresEdp: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
useCerrarConEscape()
// emit() no espera de verdad ni propaga errores del padre — invocamos
// attrs.onImportar directamente para que el try/catch capture fallos reales.
const attrs = useAttrs()

const resultado = ref(null)
const nombreArchivo = ref('')
const leyendo = ref(false)
const importando = ref(false)
const error = ref('')
const hecho = ref(false)
const reemplazar = ref(false)

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
    resultado.value = procesarFilasMetrado(filasCrudas, { nombresEdp: props.nombresEdp })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.'
  } finally {
    leyendo.value = false
  }
}

const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

function recalcular(filas) {
  resultado.value = {
    ...resultado.value,
    filas,
    aImportar: filas.filter((f) => f.estado === 'ok'),
    conError: filas.filter((f) => f.estado === 'error'),
  }
}

// Fila original (con su error y sus sugerencias), para poder cambiar la elección.
const originales = reactive({})
const busqueda = reactive({})

/** Aplica el material elegido a la fila y a TODAS las demás filas con el mismo
 * nombre que tampoco existía (cada una conserva su zona y su cantidad). */
function corregirFila(filaConError, grupo) {
  const clave = normalizar(filaConError.nombre_edp)
  const filas = resultado.value.filas.map((f) => {
    if (f.estado !== 'error' || !f.sugerencias || normalizar(f.nombre_edp) !== clave) return f
    originales[f.fila] = f
    delete busqueda[f.fila]
    return {
      fila: f.fila,
      nombre_edp: grupo.nombre,
      zona: f.zona,
      unidad: grupo.unidad_edp,
      descripcion_edp_id: grupo.id,
      cantidad_contractual: 0,
      cantidad_procura: f.cantidad_procura,
      observacion: f.observacion ?? null,
      estado: 'ok',
    }
  })
  recalcular(filas)
}

function cambiarElegida(fila) {
  const original = originales[fila.fila]
  if (!original) return
  delete originales[fila.fila]
  recalcular(resultado.value.filas.map((f) => (f.fila === fila.fila ? original : f)))
}

// Buscar otro material: con solo escribir se filtran los existentes.
function resultadosBusqueda(fila) {
  const q = normalizar(busqueda[fila.fila])
  if (!q) return []
  const palabras = q.split(' ')
  const exactos = props.nombresEdp.filter((n) => {
    const nombre = normalizar(n.nombre)
    return palabras.every((p) => nombre.includes(p))
  })
  return (exactos.length ? exactos : sugerirNombresEdp(busqueda[fila.fila], props.nombresEdp, 8)).slice(0, 8)
}

// Teclado en la búsqueda: ↑ ↓ mueven la selección resaltada, Enter o Tab eligen.
const activo = reactive({})
function teclaBusqueda(e, fila) {
  const lista = resultadosBusqueda(fila)
  if (!lista.length) return
  const i = Math.min(activo[fila.fila] ?? 0, lista.length - 1)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activo[fila.fila] = (i + 1) % lista.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activo[fila.fila] = (i - 1 + lista.length) % lista.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    corregirFila(fila, lista[i])
  }
}

async function confirmarImportacion() {
  if (!resultado.value?.aImportar.length && !reemplazar.value) return
  error.value = ''
  importando.value = true
  try {
    await attrs.onImportar(resultado.value.aImportar, { reemplazar: reemplazar.value })
    hecho.value = true
  } catch (e) {
    console.error(e)
    error.value = `No se pudo completar la importación${e?.message ? ': ' + e.message : '.'}`
  } finally {
    importando.value = false
  }
}

const hayZonas = computed(() => resultado.value?.filas.some((f) => f.zona))
void nextTick
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Importar metrado masivo</h2>

      <!-- Archivo + encabezados para copiar -->
      <div class="arriba">
        <label class="archivo">
          <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
        </label>
        <div class="formato">
          <EstructuraCopiable :encabezados="['ZONA', 'NOMBRE EDP', 'CANTIDAD']" />
          <p class="pista">La columna ZONA es opcional.</p>
        </div>
      </div>

      <p v-if="leyendo" class="estado-lectura">Leyendo {{ nombreArchivo }}…</p>
      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="hecho">
        <p class="aviso">Se importaron {{ resultado.aImportar.length }} materiales al metrado.</p>
        <div class="acciones"><button type="button" @click="$emit('cerrar')">Cerrar</button></div>
      </template>

      <template v-else-if="resultado">
        <div class="resumen">
          <span><strong>{{ resultado.total }}</strong> filas leídas</span>
          <span class="ok"><strong>{{ resultado.aImportar.length }}</strong> se importarán</span>
          <span v-if="resultado.conError.length" class="advertencia"><strong>{{ resultado.conError.length }}</strong> por corregir u omitidas</span>
        </div>

        <div class="tabla-wrap">
          <table class="tabla" data-sin-filtro>
            <colgroup>
              <col class="c-fila" />
              <col v-if="hayZonas" class="c-zona" />
              <col class="c-mat" />
              <col class="c-und" />
              <col class="c-cant" />
              <col class="c-est" />
            </colgroup>
            <thead>
              <tr>
                <th>N°</th>
                <th v-if="hayZonas">Zona</th>
                <th>Material</th>
                <th>Und</th>
                <th class="num">Cant.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.estado === 'error' }">
                <td>{{ f.fila }}</td>
                <td v-if="hayZonas">{{ f.zona || '—' }}</td>
                <td class="mat">{{ f.nombre_edp }}</td>
                <td>{{ f.estado === 'ok' ? f.unidad || '—' : '' }}</td>
                <td class="num">{{ f.cantidad_procura ?? '—' }}</td>
                <td class="est">
                  <template v-if="f.estado === 'ok'">
                    <span class="se-importa">Se importa</span>
                    <button v-if="originales[f.fila]" type="button" class="otro" @click="cambiarElegida(f)">Cambiar</button>
                  </template>
                  <template v-else>
                    <span class="motivo">{{ f.motivo }}</span>
                    <!-- Sugerencias a la vista: un clic y listo -->
                    <div v-if="f.sugerencias?.length" class="sug">
                      <span class="sug-et">¿Quisiste decir…?</span>
                      <button v-for="s in f.sugerencias" :key="s.id" type="button" class="chip-sug" @click="corregirFila(f, s)">
                        {{ s.nombre }}<small v-if="s.unidad_edp"> · {{ s.unidad_edp }}</small>
                      </button>
                    </div>
                    <!-- Si ninguna es: se escribe y se filtran los materiales existentes -->
                    <div v-if="f.sugerencias" class="buscar">
                      <input
                        v-model="busqueda[f.fila]"
                        type="text"
                        class="buscar-input"
                        placeholder="Ninguna es: escribe para buscar otro material…"
                        @input="activo[f.fila] = 0"
                        @keydown="teclaBusqueda($event, f)"
                      />
                      <ul v-if="resultadosBusqueda(f).length" class="resultados">
                        <li v-for="(r, k) in resultadosBusqueda(f)" :key="r.id">
                          <button type="button" tabindex="-1" :class="{ activo: k === (activo[f.fila] ?? 0) }" @mouseenter="activo[f.fila] = k" @click="corregirFila(f, r)">
                            {{ r.nombre }}<small v-if="r.unidad_edp"> · {{ r.unidad_edp }}</small>
                          </button>
                        </li>
                      </ul>
                    </div>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pie">
          <label class="reemplazar">
            <input v-model="reemplazar" type="checkbox" />
            <span>
              <strong>Reemplazar todo el metrado actual del frente</strong>
              <small>Lo que ya estaba y no viene en este archivo queda en 0. El historial se conserva.</small>
            </span>
          </label>
          <div class="acciones">
            <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
            <button type="button" :disabled="importando || (!resultado.aImportar.length && !reemplazar)" @click="confirmarImportacion">
              {{ importando ? 'Importando…' : `Importar ${resultado.aImportar.length} materiales` }}
            </button>
          </div>
        </div>
      </template>

      <div v-else class="acciones"><button type="button" class="secundario" @click="$emit('cerrar')">Cerrar</button></div>
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
  gap: 0.9rem;
  width: min(1100px, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.1rem;
}
.arriba {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
@media (max-width: 760px) {
  .arriba {
    grid-template-columns: 1fr;
  }
}
.archivo input {
  font-size: 0.85rem;
  max-width: 280px;
}
.formato {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}
.pista {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
.estado-lectura {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.resumen {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.4rem;
  font-size: 0.88rem;
  padding: 0.7rem 0.9rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.ok {
  color: var(--color-success);
}
.advertencia {
  color: var(--color-warning);
}
/* La tabla ocupa todo el ancho: sin scroll horizontal, solo vertical. */
.tabla-wrap {
  overflow-y: auto;
  max-height: 52vh;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.tabla {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.c-fila {
  width: 52px;
}
.c-zona {
  width: 110px;
}
.c-und {
  width: 70px;
}
.c-cant {
  width: 84px;
}
.c-est {
  width: 42%;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
  overflow-wrap: anywhere;
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
  z-index: 1;
}
.tabla .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tabla td.mat {
  font-weight: 600;
}
.tabla tr.conflicto td.mat,
.tabla tr.conflicto td:first-child {
  color: var(--color-danger);
}
.motivo {
  display: block;
  color: var(--color-danger);
  font-size: 0.78rem;
  margin-bottom: 0.3rem;
}
.se-importa {
  color: var(--color-success);
  font-weight: 600;
}
.sug {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}
.sug-et {
  font-size: 0.74rem;
  color: var(--color-text-muted);
}
.chip-sug {
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.chip-sug:hover,
.resultados button:hover,
.resultados button.activo {
  background: var(--color-primary-soft, var(--color-surface-2));
}
.chip-sug small,
.resultados small {
  font-weight: 500;
  color: var(--color-text-muted);
}
.buscar {
  margin-top: 0.4rem;
}
.buscar-input {
  width: 100%;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
}
.resultados {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.resultados button {
  width: 100%;
  padding: 0.35rem 0.6rem;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
  border-radius: 0;
  font-weight: 600;
}
.resultados button.activo {
  background: var(--color-primary-soft, var(--color-surface-2));
  box-shadow: inset 3px 0 0 var(--color-primary);
}
.resultados button:focus,
.resultados button:focus-visible {
  outline: none;
}
.resultados li:last-child button {
  border-bottom: 0;
}
.otro {
  margin-left: 0.5rem;
  padding: 0.15rem 0.6rem;
  font-size: 0.76rem;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.pie {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem 1.2rem;
  align-items: center;
  justify-content: space-between;
}
.reemplazar {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  max-width: 520px;
  cursor: pointer;
}
.reemplazar input {
  margin-top: 0.2rem;
}
.reemplazar small {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.76rem;
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-left: auto;
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
  margin: 0;
}
</style>

<script setup>
import { computed, ref, useAttrs } from 'vue'
import { leerArchivoExcel, procesarFilas } from '../utils/importarExcel'

const props = defineProps({
  materialesExistentes: { type: Array, required: true },
  nombresEdpExistentes: { type: Array, required: true },
  categoriasExistentes: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onImportar directamente para que el
// try/catch de abajo capture fallos reales de la importación.
const attrs = useAttrs()

const resultado = ref(null) // salida de procesarFilas
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
    const filasCrudas = await leerArchivoExcel(file)
    resultado.value = procesarFilas(filasCrudas, {
      materialesExistentes: props.materialesExistentes,
      nombresEdpExistentes: props.nombresEdpExistentes,
      categoriasExistentes: props.categoriasExistentes,
    })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.'
  } finally {
    leyendo.value = false
  }
}

const filasRenombradas = computed(() => resultado.value?.filas.filter((f) => f.renombrado) ?? [])
const hayAlgoQueHacer = computed(() => resultado.value && (resultado.value.aImportar.length || resultado.value.aActualizar.length))

async function confirmarImportacion() {
  if (!resultado.value || !hayAlgoQueHacer.value) return
  error.value = ''
  importando.value = true
  try {
    if (resultado.value.aImportar.length) {
      await attrs.onImportar({
        filas: resultado.value.aImportar,
        nombresEdpNuevos: resultado.value.nombresEdpNuevos,
        categoriasNuevas: resultado.value.categoriasNuevas,
      })
    }
    if (resultado.value.aActualizar.length) {
      await attrs.onActualizarConversion(resultado.value.aActualizar)
    }
    hecho.value = true
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo completar la importación.'
  } finally {
    importando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Importar catálogo desde Excel</h2>
      <p class="ayuda">
        Columnas esperadas: <strong>CODIGO</strong>, <strong>DESCRIPCION ALMACEN</strong>,
        <strong>UNIDAD ALMACEN</strong> (obligatorias) — <strong>DESCRIPCION EDP</strong>,
        <strong>UNIDAD EDP</strong>, <strong>CATEGORIA</strong>, <strong>STOCK MINIMO</strong> y
        <strong>CONVERSION</strong> (ninguna / area / longitud) son opcionales.
        Si el nombre EDP o la categoría no existen todavía, se crean automáticamente. Un código que <strong>ya
        existe</strong> no se vuelve a crear, pero si trae algo en CONVERSION esa columna sí se actualiza — así se
        puede exportar el catálogo, corregir esa columna en Excel, y volver a subir el mismo archivo.
      </p>

      <label class="archivo">
        <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
      </label>

      <p v-if="leyendo">Leyendo {{ nombreArchivo }}…</p>
      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="hecho">
        <p class="aviso">
          <span v-if="resultado.aImportar.length">Se importaron {{ resultado.aImportar.length }} materiales nuevos. </span>
          <span v-if="resultado.aActualizar.length">Se actualizó la conversión de {{ resultado.aActualizar.length }} materiales. </span>
          <span v-if="resultado.nombresEdpNuevos.length">Se crearon {{ resultado.nombresEdpNuevos.length }} nombres EDP nuevos.</span>
        </p>
        <button type="button" @click="$emit('cerrar')">Cerrar</button>
      </template>

      <template v-else-if="resultado">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div class="ok"><strong>{{ resultado.aImportar.length }}</strong> se crearán</div>
          <div v-if="resultado.aActualizar.length" class="ok">
            <strong>{{ resultado.aActualizar.length }}</strong> ya existen y se les actualiza la conversión
          </div>
          <div v-if="resultado.conConflicto.length" class="advertencia">
            <strong>{{ resultado.conConflicto.length }}</strong> omitidas: el código ya existe y no traen nada en CONVERSION
          </div>
          <div v-if="resultado.errores.length" class="advertencia">
            <strong>{{ resultado.errores.length }}</strong> con errores (falta código/descripción/unidad, o CONVERSION inválida)
          </div>
          <div v-if="filasRenombradas.length" class="info">
            <strong>{{ filasRenombradas.length }}</strong> códigos repetidos en el archivo se renombraron
            con sufijo -1, -2… para que queden únicos
          </div>
          <div v-if="resultado.nombresEdpNuevos.length" class="info">
            <strong>{{ resultado.nombresEdpNuevos.length }}</strong> nombres EDP nuevos se crearán:
            {{ resultado.nombresEdpNuevos.join(', ') }}
          </div>
          <div v-if="resultado.categoriasNuevas.length" class="info">
            <strong>{{ resultado.categoriasNuevas.length }}</strong> categorías nuevas se crearán:
            {{ resultado.categoriasNuevas.join(', ') }}
          </div>
        </div>

        <div class="tabla-wrap">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fila</th>
                <th>Código</th>
                <th>Descripción Almacén</th>
                <th>Descripción EDP</th>
                <th>Unidad Almacén</th>
                <th>Unidad EDP</th>
                <th>Categoría</th>
                <th>Stock mínimo</th>
                <th>Conversión</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.yaExiste && !f.tipoConversion }">
                <td>{{ f.fila }}</td>
                <td>
                  {{ f.codigo }}
                  <span v-if="f.renombrado" class="etiqueta">antes: {{ f.codigoOriginal }}</span>
                </td>
                <td>{{ f.descripcion }}</td>
                <td>{{ f.descripcionEdpNombre ?? '—' }}</td>
                <td>{{ f.unidad }}</td>
                <td>{{ f.unidad_edp ?? '—' }}</td>
                <td>
                  {{ f.categoriaNombre ?? '—' }}
                  <span v-if="f.categoriaNueva" class="etiqueta">nueva</span>
                </td>
                <td>{{ f.stock_minimo_default ?? '—' }}</td>
                <td>{{ f.tipoConversion === undefined ? 'inválida' : f.tipoConversion ?? '—' }}</td>
                <td>
                  {{
                    f.tipoConversion === undefined
                      ? 'Error: CONVERSION inválida'
                      : f.yaExiste
                        ? f.tipoConversion
                          ? 'Se actualiza la conversión'
                          : 'Omitido (ya existe)'
                        : 'Se crea'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
          <button type="button" :disabled="importando || !hayAlgoQueHacer" @click="confirmarImportacion">
            {{
              importando
                ? 'Aplicando…'
                : `Aplicar (${resultado.aImportar.length} nuevos, ${resultado.aActualizar.length} actualizados)`
            }}
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
  z-index: 10;
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
  color: var(--color-text);
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
  color: var(--color-text-muted);
}
.etiqueta {
  display: block;
  font-size: 0.7rem;
  color: var(--color-text-muted);
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

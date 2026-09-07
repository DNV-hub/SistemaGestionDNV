<script setup>
import { computed, ref, useAttrs } from 'vue'
import { leerArchivoExcel, procesarFilas } from '../utils/importarExcel'

const props = defineProps({
  codigosExistentes: { type: Array, required: true },
  nombresEdpExistentes: { type: Array, required: true },
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
      codigosExistentes: props.codigosExistentes,
      nombresEdpExistentes: props.nombresEdpExistentes,
    })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.'
  } finally {
    leyendo.value = false
  }
}

const filasRenombradas = computed(() => resultado.value?.filas.filter((f) => f.renombrado) ?? [])

async function confirmarImportacion() {
  if (!resultado.value || !resultado.value.aImportar.length) return
  error.value = ''
  importando.value = true
  try {
    await attrs.onImportar({
      filas: resultado.value.aImportar,
      nombresEdpNuevos: resultado.value.nombresEdpNuevos,
    })
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
        <strong>DESCRIPCION EDP</strong>, <strong>UNIDAD ALMACEN</strong>, <strong>UNIDAD EDP</strong>
        (la columna de nombres EDP y de categoría son opcionales).
      </p>

      <label class="archivo">
        <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
      </label>

      <p v-if="leyendo">Leyendo {{ nombreArchivo }}…</p>
      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="hecho">
        <p class="aviso">
          Se importaron {{ resultado.aImportar.length }} materiales
          <span v-if="resultado.nombresEdpNuevos.length">
            y se crearon {{ resultado.nombresEdpNuevos.length }} nombres EDP nuevos</span
          >.
        </p>
        <button type="button" @click="$emit('cerrar')">Cerrar</button>
      </template>

      <template v-else-if="resultado">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div class="ok"><strong>{{ resultado.aImportar.length }}</strong> se importarán</div>
          <div v-if="resultado.conConflicto.length" class="advertencia">
            <strong>{{ resultado.conConflicto.length }}</strong> omitidas: el código ya existe en el catálogo
          </div>
          <div v-if="resultado.errores.length" class="advertencia">
            <strong>{{ resultado.errores.length }}</strong> omitidas: falta código, descripción o unidad
          </div>
          <div v-if="filasRenombradas.length" class="info">
            <strong>{{ filasRenombradas.length }}</strong> códigos repetidos en el archivo se renombraron
            con sufijo -1, -2… para que queden únicos
          </div>
          <div v-if="resultado.nombresEdpNuevos.length" class="info">
            <strong>{{ resultado.nombresEdpNuevos.length }}</strong> nombres EDP nuevos se crearán:
            {{ resultado.nombresEdpNuevos.join(', ') }}
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
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.yaExiste }">
                <td>{{ f.fila }}</td>
                <td>
                  {{ f.codigo }}
                  <span v-if="f.renombrado" class="etiqueta">antes: {{ f.codigoOriginal }}</span>
                </td>
                <td>{{ f.descripcion }}</td>
                <td>{{ f.descripcionEdpNombre ?? '—' }}</td>
                <td>{{ f.unidad }}</td>
                <td>{{ f.unidad_edp ?? '—' }}</td>
                <td>{{ f.yaExiste ? 'Omitido (ya existe)' : 'Se importa' }}</td>
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
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.ayuda {
  margin: 0;
  font-size: 0.8rem;
  color: #6b7280;
}
.archivo input {
  font-size: 0.85rem;
}
.resumen {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0.75rem;
}
.ok {
  color: #166534;
}
.advertencia {
  color: #b45309;
}
.info {
  color: #374151;
}
.tabla-wrap {
  max-height: 320px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
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
  border-bottom: 1px solid #f3f4f6;
  white-space: nowrap;
}
.tabla th {
  background: #f3f4f6;
  position: sticky;
  top: 0;
}
.tabla tr.conflicto {
  color: #9ca3af;
}
.etiqueta {
  display: block;
  font-size: 0.7rem;
  color: #9ca3af;
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid #d1d5db;
  color: #374151;
}
.error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0;
}
.aviso {
  color: #166534;
  font-size: 0.9rem;
}
</style>

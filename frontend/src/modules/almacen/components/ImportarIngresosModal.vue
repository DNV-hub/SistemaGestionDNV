<script setup>
import { ref, watch, useAttrs } from 'vue'
import { leerArchivoIngresos, procesarFilasIngreso } from '../utils/importarIngresos'

const props = defineProps({
  almacenes: { type: Array, default: () => [] },
  contratos: { type: Array, default: () => [] },
  materiales: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre — invocamos
// attrs.onImportar directamente para que el try/catch capture fallos reales.
const attrs = useAttrs()

const almacenId = ref(props.almacenes[0]?.id ?? '')
const contratoId = ref(props.contratos[0]?.id ?? '')
const filasCrudas = ref(null)
const resultado = ref(null)
const nombreArchivo = ref('')
const leyendo = ref(false)
const importando = ref(false)
const error = ref('')
const hecho = ref(false)

function reprocesar() {
  if (!filasCrudas.value) return
  resultado.value = procesarFilasIngreso(filasCrudas.value, {
    materialesActivos: props.materiales,
    contratosDisponibles: props.contratos,
    contratoIdPorDefecto: contratoId.value,
  })
}

// Si el archivo no trae columna CONTRATO por fila, todo cae al contrato
// elegido acá arriba — si lo cambian después de leer el archivo, hay que
// re-procesar para que la vista previa quede consistente.
watch(contratoId, reprocesar)

async function onArchivoSeleccionado(ev) {
  const file = ev.target.files?.[0]
  if (!file) return

  error.value = ''
  resultado.value = null
  hecho.value = false
  nombreArchivo.value = file.name
  leyendo.value = true
  try {
    filasCrudas.value = await leerArchivoIngresos(file)
    reprocesar()
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.'
  } finally {
    leyendo.value = false
  }
}

async function confirmarImportacion() {
  if (!resultado.value?.aImportar.length || !almacenId.value) return
  error.value = ''
  importando.value = true
  try {
    // Los materiales nuevos se crean primero: sus filas pendientes necesitan
    // el id real para poder mandarse como ingreso. Se resuelven por NOMBRE
    // (la clave real del material), no por código.
    if (resultado.value.materialesACrear.length) {
      const creados = await attrs.onCrearMateriales(resultado.value.materialesACrear)
      const idPorNombre = new Map(creados.map((m) => [m.descripcion.toUpperCase(), m.id]))
      for (const fila of resultado.value.aImportar) {
        if (fila.materialPendienteClave) fila.material_id = idPorNombre.get(fila.materialPendienteClave)
      }
    }
    await attrs.onImportar({
      almacen_id: almacenId.value,
      filas: resultado.value.aImportar,
    })
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
      <h2>Importar ingreso masivo</h2>
      <p class="ayuda">
        Para cargar de una vez el stock actual desde Excel (¿no sabes qué columnas van? "Descargar plantilla" te da
        un archivo con todos los materiales activos ya puestos). Columnas esperadas: <strong>CODIGO</strong>,
        <strong>DESCRIPCION ALMACEN</strong>, <strong>UNIDAD ALMACEN</strong> y <strong>CANTIDAD</strong>. Cada fila
        se identifica por su descripción, no por el código — dos filas con el mismo código pero nombres distintos
        (ej. "Cable 15mm rojo" y "Cable 15mm verde", ambos código CA.15) son materiales distintos, cada uno con su
        propio stock. Si el nombre no existe todavía en el catálogo, se crea automáticamente. Documento, proveedor
        y observación son opcionales. Si el material lleva conversión (agrega la columna <strong>CONVERSION</strong>
        con "area" o "longitud"), también hacen falta <strong>ANCHO</strong> y <strong>LARGO</strong> (o solo LARGO
        si es de tipo longitud). <strong>CONTRATO</strong> también es opcional: si tu archivo mezcla materiales de
        los dos contratos, agrega esa columna con el nombre o código del contrato de cada fila; si no la traes,
        todas las filas usan el contrato por defecto que elijas abajo.
      </p>

      <div class="fila-selects">
        <label>
          Almacén
          <select v-model="almacenId" required>
            <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
          </select>
        </label>
        <label>
          Contrato por defecto
          <select v-model="contratoId" required>
            <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </label>
      </div>

      <label class="archivo">
        <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
      </label>

      <p v-if="leyendo">Leyendo {{ nombreArchivo }}…</p>
      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="hecho">
        <p class="aviso">
          Se registraron {{ resultado.aImportar.length }} ingresos.
          <span v-if="resultado.materialesACrear.length">
            Se dieron de alta {{ resultado.materialesACrear.length }} materiales nuevos.
          </span>
        </p>
        <button type="button" @click="$emit('cerrar')">Cerrar</button>
      </template>

      <template v-else-if="resultado">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div class="ok"><strong>{{ resultado.aImportar.length }}</strong> se importarán</div>
          <div v-if="resultado.materialesACrear.length" class="ok">
            <strong>{{ resultado.materialesACrear.length }}</strong> materiales nuevos se darán de alta
          </div>
          <div v-if="resultado.conError.length" class="advertencia">
            <strong>{{ resultado.conError.length }}</strong> omitidas por error
          </div>
        </div>

        <p v-if="resultado.materialesACrear.length" class="ayuda">
          Materiales nuevos que se van a crear:
          <strong>{{ resultado.materialesACrear.map((m) => `${m.codigo} — ${m.descripcion}`).join(', ') }}</strong>
        </p>

        <div class="tabla-wrap">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fila</th>
                <th>Código</th>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Ancho</th>
                <th>Largo</th>
                <th>Contrato</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.estado === 'error' }">
                <td>{{ f.fila }}</td>
                <td>{{ f.codigo }}</td>
                <td>{{ f.descripcion ?? '—' }}</td>
                <td>{{ f.cantidad ?? '—' }} {{ f.unidad ?? '' }}</td>
                <td>{{ f.ancho ?? '—' }}</td>
                <td>{{ f.largo ?? '—' }}</td>
                <td>{{ f.contrato_nombre ?? '—' }}</td>
                <td>{{ f.estado === 'ok' ? 'Se importa' : f.motivo }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
          <button
            type="button"
            :disabled="importando || !resultado.aImportar.length"
            @click="confirmarImportacion"
          >
            {{ importando ? 'Importando…' : `Importar ${resultado.aImportar.length} ingresos` }}
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
.fila-selects {
  display: flex;
  gap: 0.75rem;
}
.fila-selects label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
.fila-selects select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
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

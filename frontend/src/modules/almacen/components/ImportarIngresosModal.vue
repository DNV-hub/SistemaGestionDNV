<script setup>
import { useCerrarConEscape } from '../../../composables/useCerrarConEscape'
import { onMounted, ref, watch, useAttrs } from 'vue'
import { leerArchivoIngresos, procesarFilasIngreso } from '../utils/importarIngresos'
import EstructuraCopiable from '../../../components/EstructuraCopiable.vue'
import { cargarGuiasEdp, sugerirNombresEdp } from '../../catalogo/composables/useGuiasEdp'
import { listarNombresEdp } from '../../catalogo/services/catalogoService'

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

// Nombres EDP existentes y descripciones por guía: un material NUEVO necesita
// nombre EDP; si el archivo no lo trae, se sugiere uno de los que ya existen.
const nombresEdp = ref([])
onMounted(async () => {
  try {
    const [lista] = await Promise.all([listarNombresEdp(), cargarGuiasEdp()])
    nombresEdp.value = lista
    reprocesar()
  } catch (e) {
    console.error('No se pudieron cargar los nombres EDP', e)
  }
})

function reprocesar() {
  if (!filasCrudas.value) return
  resultado.value = procesarFilasIngreso(filasCrudas.value, {
    materialesActivos: props.materiales,
    contratosDisponibles: props.contratos,
    contratoIdPorDefecto: contratoId.value,
    nombresEdp: nombresEdp.value,
    sugerirEdp: (texto) => sugerirNombresEdp(texto, 1)[0] ?? null,
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
    // Materiales que YA existían sin conversión configurada, pero esta fila
    // trae una: se actualiza el catálogo antes de registrar los ingresos,
    // para que el trigger que calcula factor_conversion ya vea el tipo
    // correcto al insertarlos.
    if (resultado.value.materialesAActualizarConversion.length) {
      await attrs.onActualizarConversion(resultado.value.materialesAActualizarConversion)
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

useCerrarConEscape()
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal" :class="{ 'con-resultado': resultado && !hecho }">
      <div class="cabecera-modal">
        <h2>Importar ingreso masivo</h2>
      </div>

      <div class="panel-izq">
        <p class="ayuda">
          Para cargar de una vez el stock actual desde Excel (copia la estructura de abajo y pégala en la celda A1).
          Columnas esperadas:
          <strong>DESCRIPCION ALMACEN</strong>, <strong>UNIDAD ALMACEN</strong> y <strong>CANTIDAD</strong> (obligatorias).
          Cada fila se identifica por su descripción — dos filas con nombres distintos (ej. "Cable 15mm rojo" y "Cable
          15mm verde") son materiales distintos, cada uno con su propio stock. Si el nombre no existe todavía en el
          catálogo, se crea automáticamente. Documento, proveedor y observación son opcionales. Si el material lleva conversión
          (agrega la columna <strong>CONVERSION</strong> con "area" o "longitud"), también hacen falta
          <strong>ANCHO</strong> y <strong>LARGO</strong> (o solo LARGO si es de tipo longitud).
          <strong>NOMBRE EDP</strong> es obligatorio para un material nuevo (el grupo con el que Procura lo cuenta): si no lo
          pones, el sistema sugiere uno de los que ya existen según las guías, y si no encuentra ninguno parecido esa fila
          se omite hasta que lo agregues.
          <strong>CONTRATO</strong> también es opcional: si tu archivo mezcla materiales de los dos contratos, agrega
          esa columna con el nombre o código del contrato de cada fila; si no la traes, todas las filas usan el
          contrato por defecto que elijas abajo.
        </p>

        <EstructuraCopiable
          :encabezados="['DESCRIPCION ALMACEN', 'UNIDAD ALMACEN', 'CANTIDAD', 'NOMBRE EDP', 'CONVERSION', 'ANCHO', 'LARGO', 'CONTRATO', 'DOCUMENTO', 'PROVEEDOR', 'OBSERVACION']"
          nota="Pégalos en la celda A1. NOMBRE EDP es obligatorio para materiales nuevos: si lo dejas vacío, el sistema sugiere uno según las guías."
        />

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
            <span v-if="resultado.materialesAActualizarConversion.length">
              Se completó la conversión de {{ resultado.materialesAActualizarConversion.length }} materiales que ya existían.
            </span>
          </p>
          <button type="button" @click="$emit('cerrar')">Cerrar</button>
        </template>

        <button v-else-if="!resultado" type="button" class="secundario" @click="$emit('cerrar')">Cerrar</button>
      </div>

      <div v-if="resultado && !hecho" class="panel-der">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div class="ok"><strong>{{ resultado.aImportar.length }}</strong> se importarán</div>
          <div v-if="resultado.materialesACrear.length" class="ok">
            <strong>{{ resultado.materialesACrear.length }}</strong> materiales nuevos se darán de alta
          </div>
          <div v-if="resultado.materialesAActualizarConversion.length" class="ok">
            <strong>{{ resultado.materialesAActualizarConversion.length }}</strong> materiales existentes completan su conversión (ANCHO/LARGO)
          </div>
          <div v-if="resultado.conError.length" class="advertencia">
            <strong>{{ resultado.conError.length }}</strong> omitidas por error
          </div>
        </div>

        <details v-if="resultado.materialesACrear.length" class="detalle-nuevos">
          <summary>Ver los {{ resultado.materialesACrear.length }} materiales nuevos que se van a crear</summary>
          <p class="ayuda">
            <strong>{{ resultado.materialesACrear.map((m) => m.descripcion).join(', ') }}</strong>
          </p>
        </details>

        <div class="tabla-wrap">
          <div class="fila-cabecera">
            <span>Fila</span>
            <span>Descripción</span>
            <span>Nombre EDP</span>
            <span>Cantidad</span>
            <span>Ancho</span>
            <span>Largo</span>
            <span>Contrato</span>
            <span>Estado</span>
          </div>
          <div
            v-for="f in resultado.filas"
            :key="f.fila"
            class="fila-datos"
            :class="{ conflicto: f.estado === 'error' }"
          >
            <span>{{ f.fila }}</span>
            <span>{{ f.descripcion ?? '—' }}</span>
            <span :title="f.edp_sugerido ? 'Sugerido según las guías' : ''">
              {{ f.nombre_edp ?? '—' }}<em v-if="f.edp_sugerido" class="sugerido"> (sugerido)</em>
            </span>
            <span>{{ f.cantidad ?? '—' }} {{ f.unidad ?? '' }}</span>
            <span>{{ f.ancho ?? '—' }}</span>
            <span>{{ f.largo ?? '—' }}</span>
            <span>{{ f.contrato_nombre ?? '—' }}</span>
            <span>{{ f.estado === 'ok' ? 'Se importa' : f.motivo }}</span>
          </div>
          <p v-if="!resultado.filas.length" class="vacio">No hay filas para mostrar.</p>
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
  width: 720px;
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
.modal.con-resultado > .cabecera-modal {
  flex: 0 0 100%;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.25rem;
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.cabecera-modal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.ayuda {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.detalle-nuevos {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.detalle-nuevos summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--color-text);
}
.detalle-nuevos .ayuda {
  margin-top: 0.4rem;
  max-height: 120px;
  overflow-y: auto;
}
.panel-izq {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.modal.con-resultado .panel-izq {
  flex: 0 0 380px;
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
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
  min-width: 0;
  transform: translateZ(0);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.fila-cabecera,
.fila-datos {
  display: grid;
  grid-template-columns:
    minmax(0, 0.5fr) minmax(0, 2fr) minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.6fr) minmax(0, 0.6fr)
    minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
  border-bottom: 1px solid var(--color-border);
}
.fila-cabecera span,
.fila-datos span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sugerido {
  font-style: normal;
  color: var(--color-warning);
  font-size: 0.72rem;
}
.fila-cabecera {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
}
.fila-datos {
  color: var(--color-text);
}
.fila-datos.conflicto {
  color: var(--color-danger);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
  padding: 1rem;
  margin: 0;
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

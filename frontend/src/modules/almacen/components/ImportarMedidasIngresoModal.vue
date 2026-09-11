<script setup>
import { ref, useAttrs } from 'vue'
import { leerArchivoMedidas, procesarFilasMedidas } from '../utils/importarMedidasIngreso'

const props = defineProps({
  ingresosSinMedidas: { type: Array, required: true },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const resultado = ref(null)
const nombreArchivo = ref('')
const leyendo = ref(false)
const aplicando = ref(false)
const error = ref('')
const hecho = ref(false)
const fallidos = ref([])

async function onArchivoSeleccionado(ev) {
  const file = ev.target.files?.[0]
  if (!file) return

  error.value = ''
  resultado.value = null
  hecho.value = false
  nombreArchivo.value = file.name
  leyendo.value = true
  try {
    const filasCrudas = await leerArchivoMedidas(file)
    resultado.value = procesarFilasMedidas(filasCrudas, props.ingresosSinMedidas)
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.'
  } finally {
    leyendo.value = false
  }
}

async function confirmarAplicacion() {
  if (!resultado.value?.aAplicar.length) return
  error.value = ''
  aplicando.value = true
  try {
    fallidos.value = await attrs.onAplicar(resultado.value.aAplicar)
    hecho.value = true
  } catch (e) {
    console.error(e)
    error.value = `No se pudo completar la actualización${e?.message ? ': ' + e.message : '.'}`
  } finally {
    aplicando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Importar medidas de ingresos</h2>
      <p class="ayuda">
        Subí el mismo Excel que exportaste desde "Ingresos sin medidas", ya completado. Columnas: <strong>ID</strong>
        (no se toca, identifica cada ingreso), <strong>ANCHO</strong> y <strong>LARGO</strong>. No cambia cantidades
        ni stock — solo agrega las medidas para calcular el EDP de esos lotes.
      </p>

      <label class="archivo">
        <input type="file" accept=".xlsx,.xls,.csv" @change="onArchivoSeleccionado" />
      </label>

      <p v-if="leyendo">Leyendo {{ nombreArchivo }}…</p>
      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="hecho">
        <p class="aviso">
          Se actualizaron {{ resultado.aAplicar.length - fallidos.length }} ingresos.
          <span v-if="fallidos.length">{{ fallidos.length }} fallaron.</span>
        </p>
        <button type="button" @click="$emit('cerrar')">Cerrar</button>
      </template>

      <template v-else-if="resultado">
        <div class="resumen">
          <div><strong>{{ resultado.total }}</strong> filas leídas</div>
          <div class="ok"><strong>{{ resultado.aAplicar.length }}</strong> se actualizarán</div>
          <div v-if="resultado.conError.length" class="advertencia">
            <strong>{{ resultado.conError.length }}</strong> con error
          </div>
        </div>

        <div class="tabla-wrap">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fila</th>
                <th>Código</th>
                <th>Ancho</th>
                <th>Largo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in resultado.filas" :key="f.fila" :class="{ conflicto: f.estado === 'error' }">
                <td>{{ f.fila }}</td>
                <td>{{ f.codigo ?? '—' }}</td>
                <td>{{ f.ancho ?? '—' }}</td>
                <td>{{ f.largo ?? '—' }}</td>
                <td>{{ f.estado === 'ok' ? 'Se actualiza' : f.motivo }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
          <button type="button" :disabled="aplicando || !resultado.aAplicar.length" @click="confirmarAplicacion">
            {{ aplicando ? 'Aplicando…' : `Aplicar ${resultado.aAplicar.length} medidas` }}
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
  width: 640px;
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

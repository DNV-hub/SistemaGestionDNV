<script setup>
import { computed, reactive, ref, useAttrs } from 'vue'
import MaterialIngresoBuscador from './MaterialIngresoBuscador.vue'

const props = defineProps({
  almacenes: { type: Array, default: () => [] },
  materiales: { type: Array, default: () => [] },
  contratos: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onGuardar directamente para que el
// try/catch capture fallos reales (ej. stock negativo, RLS, etc.).
const attrs = useAttrs()

const form = reactive({
  almacen_id: props.almacenes[0]?.id ?? '',
  contrato_id: props.contratos[0]?.id ?? '',
  material_id: '',
  cantidad: '',
  ancho: '',
  largo: '',
  documento_referencia: '',
  proveedor: '',
  observacion: '',
})
const guardando = ref(false)
const error = ref('')

// Igual que el importador masivo: la identidad del material es su nombre,
// no el código — si el almacenero escribe un nombre que no existe todavía,
// se crea un material nuevo al guardar (nunca se fusiona con uno existente
// solo porque comparte código).
const materialNuevo = ref(null) // { descripcion, unidad, codigo } | null

function alSeleccionarExistente(m) {
  materialNuevo.value = null
  form.material_id = m.id
}
function alConfirmarNuevo(payload) {
  form.material_id = ''
  materialNuevo.value = payload
}

const materialSeleccionado = computed(() => props.materiales.find((m) => m.id === form.material_id))
// Antes solo miraba materialSeleccionado (un material ya existente en el
// catálogo) — un material recién creado en este mismo ingreso no tenía de
// dónde sacar su tipo_conversion, así que nunca pedía ancho/largo en su
// primer lote. Ahora también lo toma de materialNuevo, que ya lo trae desde
// el buscador (ver MaterialIngresoBuscador.vue).
const tipoConversion = computed(
  () => materialSeleccionado.value?.tipo_conversion ?? materialNuevo.value?.tipo_conversion ?? 'ninguna'
)
const unidadActual = computed(() => materialSeleccionado.value?.unidad ?? materialNuevo.value?.unidad ?? null)

// Vista previa del factor, para que el almacenero vea el m2/ml antes de
// guardar y pueda notar si se equivocó de medida.
const factorPreview = computed(() => {
  if (tipoConversion.value === 'area') {
    const a = Number(form.ancho)
    const l = Number(form.largo)
    return a > 0 && l > 0 ? a * l : null
  }
  if (tipoConversion.value === 'longitud') {
    const l = Number(form.largo)
    return l > 0 ? l : null
  }
  return null
})

async function onSubmit() {
  error.value = ''
  if (!form.almacen_id || !form.contrato_id || (!form.material_id && !materialNuevo.value) || !form.cantidad) {
    error.value = 'Almacén, contrato, material y cantidad son obligatorios.'
    return
  }
  if (Number(form.cantidad) <= 0) {
    error.value = 'La cantidad debe ser mayor a cero.'
    return
  }
  if (tipoConversion.value === 'area' && (!Number(form.ancho) || !Number(form.largo))) {
    error.value = 'Este material necesita ancho y largo del rollo.'
    return
  }
  if (tipoConversion.value === 'longitud' && !Number(form.largo)) {
    error.value = 'Este material necesita la longitud de la pieza.'
    return
  }

  guardando.value = true
  try {
    let materialId = form.material_id
    if (materialNuevo.value) {
      const [creado] = await attrs.onCrearMaterial([materialNuevo.value])
      materialId = creado.id
    }
    await attrs.onGuardar({
      almacen_id: form.almacen_id,
      contrato_id: form.contrato_id,
      material_id: materialId,
      cantidad: Number(form.cantidad),
      ancho: tipoConversion.value === 'area' ? Number(form.ancho) : null,
      largo: tipoConversion.value !== 'ninguna' ? Number(form.largo) : null,
      documento_referencia: form.documento_referencia.trim() || null,
      proveedor: form.proveedor.trim() || null,
      observacion: form.observacion.trim() || null,
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo registrar el ingreso${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>Registrar ingreso</h2>

      <label>
        Almacén
        <select v-model="form.almacen_id" required>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </label>

      <label>
        Contrato
        <select v-model="form.contrato_id" required>
          <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </label>

      <label>
        Material
        <MaterialIngresoBuscador
          :materiales="materiales"
          @seleccionar-existente="alSeleccionarExistente"
          @confirmar-nuevo="alConfirmarNuevo"
        />
      </label>

      <label>
        Cantidad
        <div class="cantidad-con-unidad">
          <input v-model="form.cantidad" type="number" step="0.001" min="0.001" required />
          <span v-if="unidadActual" class="unidad-badge">{{ unidadActual }}</span>
        </div>
      </label>

      <template v-if="tipoConversion === 'area'">
        <div class="fila-medidas">
          <label>
            Ancho del rollo (m)
            <input v-model="form.ancho" type="number" step="0.01" min="0.01" required />
          </label>
          <label>
            Largo del rollo (m)
            <input v-model="form.largo" type="number" step="0.01" min="0.01" required />
          </label>
        </div>
        <p v-if="factorPreview" class="factor-preview">
          = {{ factorPreview.toFixed(2) }} m2 por {{ unidadActual ?? 'unidad' }} ({{ Number(form.cantidad || 0) * factorPreview }} m2 en total)
        </p>
      </template>

      <label v-else-if="tipoConversion === 'longitud'">
        Longitud de la pieza (m)
        <input v-model="form.largo" type="number" step="0.01" min="0.01" required />
        <p v-if="factorPreview" class="factor-preview">
          = {{ Number(form.cantidad || 0) * factorPreview }} ml en total
        </p>
      </label>

      <label>
        Documento de referencia (opcional)
        <input v-model="form.documento_referencia" type="text" placeholder="Guía, factura…" />
      </label>

      <label>
        Proveedor (opcional)
        <input v-model="form.proveedor" type="text" />
      </label>

      <label>
        Observación (opcional)
        <textarea v-model="form.observacion" rows="2"></textarea>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Registrar ingreso' }}
        </button>
      </div>
    </form>
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
  width: 380px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
input,
select,
textarea {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
.cantidad-con-unidad {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.fila-medidas {
  display: flex;
  gap: 0.5rem;
}
.fila-medidas label {
  flex: 1;
}
.factor-preview {
  margin: -0.35rem 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
.cantidad-con-unidad input {
  flex: 1;
}
.unidad-badge {
  padding: 0.3rem 0.6rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  font-size: 0.8rem;
  color: var(--color-text);
  font-weight: 600;
  white-space: nowrap;
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
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
</style>

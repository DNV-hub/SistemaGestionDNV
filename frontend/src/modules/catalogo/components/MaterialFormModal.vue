<script setup>
import { reactive, ref, useAttrs, watch } from 'vue'

const props = defineProps({
  material: { type: Object, default: null }, // null = creando, objeto = editando
  categorias: { type: Array, default: () => [] },
  nombresEdp: { type: Array, default: () => [] },
  puedeEditarEstado: { type: Boolean, default: false },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onGuardar directamente para que el try/catch
// de abajo funcione con la operación real.
const attrs = useAttrs()

function estadoInicial() {
  return {
    codigo: props.material?.codigo ?? '',
    descripcion: props.material?.descripcion ?? '',
    unidad: props.material?.unidad ?? '',
    descripcion_edp_id: props.material?.descripcion_edp_id ?? '',
    unidad_edp: props.material?.unidad_edp ?? '',
    tipo_conversion: props.material?.tipo_conversion ?? 'ninguna',
    categoria_id: props.material?.categoria_id ?? '',
    estado: props.material?.estado ?? 'activo',
    stock_minimo_default: props.material?.stock_minimo_default ?? '',
    observaciones: props.material?.observaciones ?? '',
  }
}

const form = reactive(estadoInicial())
const guardando = ref(false)
const error = ref('')

watch(
  () => props.material,
  () => Object.assign(form, estadoInicial())
)

async function onSubmit() {
  error.value = ''
  if (!form.codigo.trim() || !form.descripcion.trim() || !form.unidad.trim()) {
    error.value = 'Código, descripción y unidad son obligatorios.'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      codigo: form.codigo.trim(),
      descripcion: form.descripcion.trim(),
      unidad: form.unidad.trim(),
      descripcion_edp_id: form.descripcion_edp_id || null,
      unidad_edp: form.unidad_edp.trim() || null,
      tipo_conversion: form.tipo_conversion,
      categoria_id: form.categoria_id || null,
      estado: form.estado,
      stock_minimo_default: form.stock_minimo_default === '' ? null : Number(form.stock_minimo_default),
      observaciones: form.observaciones.trim() || null,
    })
  } catch (e) {
    error.value = e?.message?.includes('duplicate')
      ? 'Ya existe un material con ese código.'
      : 'No se pudo guardar el material.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>{{ material ? 'Editar material' : 'Nuevo material' }}</h2>

      <label>
        Código
        <input v-model="form.codigo" type="text" required :disabled="!!material" />
      </label>

      <label>
        Descripción Almacén
        <input v-model="form.descripcion" type="text" required />
      </label>

      <label>
        Unidad Almacén
        <input v-model="form.unidad" type="text" required placeholder="m3, kg, und…" />
      </label>

      <label class="destacado">
        ¿Este material necesita conversión de unidades? (rollos de malla, barras, cables…)
        <select v-model="form.tipo_conversion">
          <option value="ninguna">No — se controla y se paga en la misma unidad</option>
          <option value="area">Sí, por área — cada ingreso pide ancho × largo del rollo (→ m2)</option>
          <option value="longitud">Sí, por longitud — cada ingreso pide el largo de la pieza (→ ml)</option>
        </select>
        <span class="ayuda">
          Si esto se queda en "No" y en realidad el material sí necesita conversión (como una malla), el ingreso
          nunca va a pedir las medidas y el EDP va a salir mal. Revísalo también al editar un material ya creado.
        </span>
      </label>

      <label>
        Descripción EDP
        <select v-model="form.descripcion_edp_id">
          <option value="">Sin nombre EDP</option>
          <option v-for="n in nombresEdp" :key="n.id" :value="n.id">{{ n.nombre }}</option>
        </select>
      </label>

      <label>
        Unidad EDP
        <input v-model="form.unidad_edp" type="text" placeholder="m3, kg, und…" />
      </label>

      <label>
        Categoría
        <select v-model="form.categoria_id">
          <option value="">Sin categoría</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </label>

      <label v-if="material" v-show="puedeEditarEstado">
        Estado
        <select v-model="form.estado">
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </label>

      <label>
        Stock mínimo por defecto
        <input v-model="form.stock_minimo_default" type="number" step="0.001" min="0" />
      </label>

      <label>
        Observaciones
        <textarea v-model="form.observaciones" rows="2"></textarea>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Guardar' }}
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
input:disabled {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.ayuda {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text-muted);
}
.destacado {
  padding: 0.6rem 0.7rem;
  background: var(--color-warning-soft);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-control);
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

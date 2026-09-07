<script setup>
import { reactive, ref, useAttrs, watch } from 'vue'

const props = defineProps({
  frente: { type: Object, default: null }, // null = creando, objeto = editando
  puedeEditarEstado: { type: Boolean, default: false },
})

defineEmits(['cerrar'])
// emit() de Vue siempre devuelve undefined y no propaga errores del padre —
// invocamos attrs.onGuardar directamente para que el try/catch de abajo
// capture fallos reales (ver la corrección aplicada en el resto de modales).
const attrs = useAttrs()

function estadoInicial() {
  return {
    codigo: props.frente?.codigo ?? '',
    nombre: props.frente?.nombre ?? '',
    area: props.frente?.area ?? '',
    estado: props.frente?.estado ?? 'activo',
    fecha_inicio: props.frente?.fecha_inicio ?? new Date().toISOString().slice(0, 10),
    fecha_cierre: props.frente?.fecha_cierre ?? '',
  }
}

const form = reactive(estadoInicial())
const guardando = ref(false)
const error = ref('')

watch(
  () => props.frente,
  () => Object.assign(form, estadoInicial())
)

async function onSubmit() {
  error.value = ''
  if (!form.codigo.trim() || !form.nombre.trim()) {
    error.value = 'Código y nombre son obligatorios.'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      area: form.area.trim() || null,
      estado: form.estado,
      fecha_inicio: form.fecha_inicio,
      fecha_cierre: form.fecha_cierre || null,
    })
  } catch (e) {
    console.error(e)
    error.value = e?.message?.includes('duplicate')
      ? 'Ya existe un frente con ese código.'
      : `No se pudo guardar el frente${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>{{ frente ? 'Editar frente' : 'Nuevo frente' }}</h2>

      <label>
        Código
        <input v-model="form.codigo" type="text" required :disabled="!!frente" />
      </label>

      <label>
        Nombre
        <input v-model="form.nombre" type="text" required />
      </label>

      <label>
        Área (opcional)
        <input v-model="form.area" type="text" />
      </label>

      <label>
        Fecha de inicio
        <input v-model="form.fecha_inicio" type="date" required />
      </label>

      <label v-if="frente" v-show="puedeEditarEstado">
        Estado
        <select v-model="form.estado">
          <option value="activo">Activo</option>
          <option value="cerrado">Cerrado</option>
        </select>
      </label>

      <label v-if="frente && form.estado === 'cerrado'">
        Fecha de cierre
        <input v-model="form.fecha_cierre" type="date" />
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
  z-index: 10;
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
  background: #fff;
  border-radius: 8px;
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
  color: #374151;
}
input,
select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font: inherit;
}
input:disabled {
  background: #f3f4f6;
  color: #6b7280;
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
</style>

<script setup>
import { reactive, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

defineProps({
  nombresEdp: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no propaga errores del padre ni espera de verdad (siempre devuelve
// undefined) — invocamos attrs.onCrear directamente para poder hacer
// try/catch real sobre la operación.
const attrs = useAttrs()

const form = reactive({ nombre: '' })
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (!form.nombre.trim()) {
    error.value = 'El nombre es obligatorio.'
    return
  }

  guardando.value = true
  try {
    await attrs.onCrear({ nombre: form.nombre.trim() })
    form.nombre = ''
  } catch (e) {
    error.value = 'No se pudo crear el nombre EDP.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Nombres EDP"
    subtitulo="Nombres con los que el cliente identifica los materiales en el EDP (Estado de Pago), independientes de la descripción de Almacén."
    ancho="600px"
    texto-guardar="Cerrar"
    solo-cerrar
    @cerrar="$emit('cerrar')"
  >
    <ul class="lista">
      <li v-for="n in nombresEdp" :key="n.id">{{ n.nombre }}</li>
      <li v-if="!nombresEdp.length" class="vacio">Todavía no hay nombres EDP.</li>
    </ul>

    <form class="agregar-fila una" @submit.prevent="onSubmit">
      <div class="mf-campo">
        <span class="mf-rotulo">Nuevo nombre EDP</span>
        <input v-model="form.nombre" type="text" placeholder="Nombre según el EDP" required />
      </div>
      <button type="submit" class="btn-agregar" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Agregar' }}</button>
    </form>
    <p v-if="error" class="mf-error">{{ error }}</p>
  </ModalFormulario>
</template>

<style scoped>
.lista {
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.lista li {
  padding: 0.55rem 0.8rem;
  font-size: 0.88rem;
  border-bottom: 1px solid var(--color-border);
}
.lista li:last-child {
  border-bottom: none;
}
.lista .vacio {
  color: var(--color-text-muted);
}
.padre {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}
.agregar-fila {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 0.6rem;
  align-items: end;
}
.agregar-fila.una {
  grid-template-columns: minmax(0, 1fr) auto;
}
.btn-agregar {
  padding: 0.65rem 1.1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
.btn-agregar:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>

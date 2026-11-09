<script setup>
import { reactive, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

defineProps({
  categorias: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// `emit()` de Vue siempre devuelve undefined y nunca propaga lo que lance el
// handler del padre, así que para poder esperar la operación real y mostrar
// el error si falla, invocamos directamente el listener vía attrs (Vue
// expone @crear="..." del padre como attrs.onCrear).
const attrs = useAttrs()

const form = reactive({ nombre: '', categoria_padre_id: '' })
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
    await attrs.onCrear({
      nombre: form.nombre.trim(),
      categoria_padre_id: form.categoria_padre_id || null,
    })
    form.nombre = ''
    form.categoria_padre_id = ''
  } catch (e) {
    error.value = 'No se pudo crear la categoría.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Categorías"
    ancho="600px"
    texto-guardar="Cerrar"
    solo-cerrar
    @cerrar="$emit('cerrar')"
  >
    <ul class="lista">
      <li v-for="c in categorias" :key="c.id">
        {{ c.nombre }}
        <span v-if="c.categoria_padre_id" class="padre">
          (subcategoría de {{ categorias.find((p) => p.id === c.categoria_padre_id)?.nombre ?? '—' }})
        </span>
      </li>
      <li v-if="!categorias.length" class="vacio">Todavía no hay categorías.</li>
    </ul>

    <form class="agregar-fila" @submit.prevent="onSubmit">
      <div class="mf-campo">
        <span class="mf-rotulo">Nueva categoría</span>
        <input v-model="form.nombre" type="text" placeholder="Nombre" required />
      </div>
      <div class="mf-campo">
        <span class="mf-rotulo">Categoría padre <em>(opcional)</em></span>
        <select v-model="form.categoria_padre_id">
          <option value="">Ninguna</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
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

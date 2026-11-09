<script setup>
import { textoCrudo } from '../../../utils/mensajeError'
import { reactive, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

defineEmits(['cerrar'])
// Igual que CategoriasModal: attrs.onCrear en vez de $emit para poder
// esperar la operación real y mostrar el error del padre si falla.
const attrs = useAttrs()

const form = reactive({ nombre: '', descripcion: '' })
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
      descripcion: form.descripcion.trim(),
    })
  } catch (e) {
    error.value = textoCrudo(e).includes('duplicate')
      ? 'Ya existe un rol con ese nombre.'
      : e?.message ?? 'No se pudo crear el rol.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Nuevo rol"
    subtitulo="Nace sin ningún permiso: después de crearlo, márcale los que corresponda en esta pantalla."
    ancho="560px"
    texto-guardar="Crear rol"
    texto-guardando="Creando…"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Nombre</span>
        <input v-model="form.nombre" type="text" placeholder="Ej. Jefe de Almacén" required />
      </div>
      <div class="mf-campo">
        <span class="mf-rotulo">Descripción <em>(opcional)</em></span>
        <input v-model="form.descripcion" type="text" placeholder="Para qué es este rol" />
      </div>
    </div>
  </ModalFormulario>
</template>

<script setup>
import { reactive, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

defineProps({
  usuario: { type: Object, required: true },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const form = reactive({ password: '' })
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (form.password && form.password.length < 8) {
    error.value = 'La contraseña debe tener al menos 8 caracteres.'
    return
  }

  guardando.value = true
  try {
    await attrs.onConfirmar(form.password.trim() || null)
  } catch (e) {
    console.error(e)
    error.value = e?.message || 'No se pudo restablecer la contraseña.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Restablecer contraseña"
    ancho="560px"
    texto-guardar="Restablecer"
    texto-guardando="Restableciendo…"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <p class="mf-info">
      Vas a definir una nueva contraseña para <strong>{{ usuario.nombre }}</strong> ({{ usuario.email }}). La anterior
      deja de funcionar de inmediato.
    </p>
    <div class="mf-campo">
      <span class="mf-rotulo">Nueva contraseña <em>(opcional)</em></span>
      <input v-model="form.password" type="text" placeholder="En blanco: se genera una automática" minlength="8" />
    </div>
  </ModalFormulario>
</template>

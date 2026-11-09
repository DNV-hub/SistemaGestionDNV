<script setup>
import { ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

defineEmits(['cerrar'])
const attrs = useAttrs()

const motivo = ref('')
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (!motivo.value.trim()) {
    error.value = 'Indica el motivo de la cancelación.'
    return
  }

  guardando.value = true
  try {
    await attrs.onConfirmar(motivo.value.trim())
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cancelar el vale${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Cancelar vale"
    subtitulo="Las líneas ya reservadas liberarán su stock reservado; las pendientes quedarán canceladas."
    ancho="520px"
    texto-guardar="Confirmar cancelación"
    texto-guardando="Cancelando…"
    texto-cancelar="Volver"
    peligro
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <div class="mf-campo">
      <span class="mf-rotulo">Motivo</span>
      <textarea v-model="motivo" rows="3" required></textarea>
    </div>
  </ModalFormulario>
</template>

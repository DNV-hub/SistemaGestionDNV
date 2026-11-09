<script setup>
import { ref } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { formatearNumero } from '../../../utils/formatearNumero'

// Para cuando una devolución se marcó como Recibida y en realidad debía
// rechazarse: deshace el ingreso a stock y la deja como Rechazada. La base
// valida que ese material no se haya usado todavía.
defineProps({
  devolucion: { type: Object, required: true },
  guardando: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['confirmar', 'cerrar'])

const motivo = ref('')
function enviar() {
  if (!motivo.value.trim()) return
  emit('confirmar', { motivo: motivo.value.trim() })
}
</script>

<template>
  <ModalFormulario
    titulo="Rechazar devolución ya recibida"
    :subtitulo="`${devolucion.numero ?? ''} · ${devolucion.materiales?.descripcion ?? ''}`"
    ancho="560px"
    peligro
    texto-guardar="Rechazar y quitar de stock"
    texto-guardando="Rechazando…"
    :guardando="guardando"
    :bloquear-guardar="!motivo.trim()"
    :error="error"
    @cerrar="emit('cerrar')"
    @enviar="enviar"
  >
    <p class="mf-nota">
      Se quitarán del stock las
      <b>{{ formatearNumero(devolucion.cantidad_reutilizable ?? 0) }} {{ devolucion.materiales?.unidad }}</b>
      que entraron al recibirla, y la devolución quedará como <b>Rechazada</b>. Solo se puede si ese material todavía no se usó.
    </p>
    <label class="mf-campo">
      <span class="mf-rotulo">¿Por qué se rechaza?</span>
      <textarea v-model="motivo" rows="3" placeholder="Ej. El material no corresponde / llegó en mal estado…" autofocus></textarea>
    </label>
  </ModalFormulario>
</template>

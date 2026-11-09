<script setup>
import { reactive, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

const props = defineProps({
  fila: { type: Object, required: true },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre — invocamos
// attrs.onGuardar directamente para que el try/catch capture fallos reales.
const attrs = useAttrs()

const form = reactive({
  cantidad_contractual: props.fila.cantidad_contractual,
  cantidad_procura: props.fila.cantidad_procura,
  observaciones: props.fila.observaciones ?? '',
})
const guardando = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  const contractual = Number(form.cantidad_contractual)
  const procuraCant = Number(form.cantidad_procura)
  if (!Number.isFinite(contractual) || contractual < 0 || !Number.isFinite(procuraCant) || procuraCant < 0) {
    error.value = 'Las cantidades deben ser números válidos (0 o más).'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      cantidad_contractual: contractual,
      cantidad_procura: procuraCant,
      observaciones: form.observaciones.trim() || null,
    })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo guardar el cambio.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Editar metrado"
    :subtitulo="fila.nombres_edp?.nombre ?? ''"
    ancho="560px"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Cantidad contractual</span>
        <div class="mf-con-unidad">
          <input v-model="form.cantidad_contractual" type="number" step="0.001" min="0" required />
          <span class="mf-unidad">{{ fila.unidad }}</span>
        </div>
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Cantidad Procura</span>
        <div class="mf-con-unidad">
          <input v-model="form.cantidad_procura" type="number" step="0.001" min="0" required />
          <span class="mf-unidad">{{ fila.unidad }}</span>
        </div>
      </div>

      <div class="mf-campo mf-span">
        <span class="mf-rotulo">Observaciones <em>(opcional)</em></span>
        <textarea v-model="form.observaciones" rows="2" placeholder="Motivo del cambio, referencia del plano…"></textarea>
      </div>
    </div>

    <template #pie>Guardar crea una nueva versión: el historial conserva el valor anterior.</template>
  </ModalFormulario>
</template>

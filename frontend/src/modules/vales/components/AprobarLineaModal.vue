<script setup>
import { reactive, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

const props = defineProps({
  linea: { type: Object, required: true },
  almacenesActivos: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const form = reactive({
  almacen_id: props.almacenesActivos[0]?.id ?? '',
  cantidad: props.linea.cantidad_solicitada,
})
const guardando = ref(false)
const error = ref('')

async function noEntregar() {
  error.value = ''
  guardando.value = true
  try {
    await attrs.onRechazar()
  } catch (e) {
    console.error(e)
    error.value = `No se pudo rechazar la línea${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}

async function onSubmit() {
  error.value = ''
  // Cantidad 0 = "no se le va a entregar nada": es lo mismo que rechazar la línea.
  if (form.cantidad !== '' && Number(form.cantidad) === 0) {
    await noEntregar()
    return
  }
  if (!form.almacen_id || !form.cantidad || Number(form.cantidad) < 0) {
    error.value = 'Selecciona el almacén y una cantidad válida.'
    return
  }

  guardando.value = true
  try {
    await attrs.onAprobar({
      vale_detalle_id: props.linea.id,
      almacen_id: form.almacen_id,
      cantidad: Number(form.cantidad),
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo aprobar la línea${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Aprobar línea"
    :subtitulo="`${linea.materiales?.descripcion ?? ''} · solicitado: ${linea.cantidad_solicitada} ${linea.materiales?.unidad ?? ''}`"
    ancho="600px"
    texto-guardar="Aprobar y reservar"
    texto-guardando="Aprobando…"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Almacén de origen</span>
        <select v-model="form.almacen_id" required>
          <option v-for="a in almacenesActivos" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </div>
      <div class="mf-campo">
        <span class="mf-rotulo">Cantidad a aprobar</span>
        <div class="mf-con-unidad">
          <input v-model="form.cantidad" type="number" step="0.001" min="0" required />
          <span class="mf-unidad">{{ linea.materiales?.unidad }}</span>
        </div>
      </div>
    </div>
    <p class="mf-ayuda">Si no se le va a entregar nada de este material, pon 0 (o usa "No entregar") y la línea se rechaza.</p>

    <template #acciones>
      <button type="button" class="no-entregar" :disabled="guardando" @click="noEntregar">No entregar</button>
    </template>
  </ModalFormulario>
</template>

<style scoped>
.no-entregar {
  background: var(--color-danger-soft, none);
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
}
</style>

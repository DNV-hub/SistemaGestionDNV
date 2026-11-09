<script setup>
import { ref } from 'vue'
import { actualizarFrente } from '../../services/frentesService'

const props = defineProps({
  frente: { type: Object, required: true },
})
const emit = defineEmits(['actualizado'])

const error = ref('')
const guardandoCampo = ref('')

async function guardar(campo, valor) {
  guardandoCampo.value = campo
  error.value = ''
  try {
    const actualizado = await actualizarFrente(props.frente.id, { [campo]: valor })
    emit('actualizado', actualizado)
  } catch (e) {
    console.error(e)
    error.value = e?.message ?? 'No se pudo guardar el cambio.'
  } finally {
    guardandoCampo.value = ''
  }
}
</script>

<template>
  <section class="pl-panel">
    <div class="pl-sh">Control de sostenimiento</div>
    <p v-if="error" class="error">{{ error }}</p>

    <label class="fila-toggle">
      <input
        type="checkbox"
        class="pl-sw"
        role="switch"
        aria-label="Control de pernos activo"
        :checked="frente.rdc_control_pernos"
        :disabled="guardandoCampo === 'rdc_control_pernos'"
        @change="guardar('rdc_control_pernos', $event.target.checked)"
      />
      <span>
        <b class="titulo">Control de pernos activo</b>
        <span class="descripcion">
          En el RDC solo se puede inyectar lo ya perforado. Afecta el llenado del supervisor de inmediato; no lo
          actives sin que el frente ya esté listo para reportar así.
        </span>
      </span>
    </label>

    <div class="campos">
      <div>
        <label class="pl-lbl" for="cfg-dias-ambar">Pendiente en ámbar desde (días)</label>
        <input
          id="cfg-dias-ambar"
          class="pl-fld"
          type="number"
          min="1"
          :value="frente.rdc_dias_ambar ?? ''"
          placeholder="3 (global)"
          :disabled="guardandoCampo === 'rdc_dias_ambar'"
          @change="guardar('rdc_dias_ambar', $event.target.value === '' ? null : Number($event.target.value))"
        />
      </div>
      <div>
        <label class="pl-lbl" for="cfg-dias-rojo">Pendiente en rojo desde (días)</label>
        <input
          id="cfg-dias-rojo"
          class="pl-fld"
          type="number"
          min="1"
          :value="frente.rdc_dias_rojo ?? ''"
          placeholder="7 (global)"
          :disabled="guardandoCampo === 'rdc_dias_rojo'"
          @change="guardar('rdc_dias_rojo', $event.target.value === '' ? null : Number($event.target.value))"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
.fila-toggle {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  cursor: pointer;
}
.fila-toggle .titulo {
  display: block;
  font-size: 14px;
}
.fila-toggle .descripcion {
  display: block;
  font-size: 13px;
  color: var(--p-muted);
  margin-top: 2px;
}
.campos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  max-width: 560px;
}
</style>

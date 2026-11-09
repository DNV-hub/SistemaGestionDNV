<script setup>
import { computed, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { formatearNumero } from '../../../utils/formatearNumero'

const props = defineProps({
  devolucion: { type: Object, required: true },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const cantidadARecuperar = ref(props.devolucion.cantidad_baja)
const ancho = ref('')
const largo = ref('')
const motivo = ref('')
const guardando = ref(false)
const error = ref('')

const tipoConversion = computed(() => props.devolucion.materiales?.tipo_conversion ?? 'ninguna')
const necesitaMedida = computed(() => tipoConversion.value !== 'ninguna')

async function confirmar() {
  error.value = ''
  const valor = Number(cantidadARecuperar.value)
  if (!Number.isFinite(valor) || valor <= 0 || valor > props.devolucion.cantidad_baja) {
    error.value = `La cantidad a recuperar tiene que estar entre 0 y ${formatearNumero(props.devolucion.cantidad_baja)}.`
    return
  }
  if (necesitaMedida.value) {
    if (!largo.value || (tipoConversion.value === 'area' && !ancho.value)) {
      error.value = tipoConversion.value === 'area' ? 'Indica el ancho y el largo de lo que vuelve a stock.' : 'Indica el largo de lo que vuelve a stock.'
      return
    }
  }
  if (!motivo.value.trim()) {
    error.value = 'Indica por qué se corrige esta evaluación.'
    return
  }
  guardando.value = true
  try {
    await attrs.onConfirmar({
      cantidad_a_recuperar: valor,
      ancho: necesitaMedida.value && tipoConversion.value === 'area' ? Number(ancho.value) : null,
      largo: necesitaMedida.value ? Number(largo.value) : null,
      motivo: motivo.value.trim(),
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo corregir la evaluación${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Corregir evaluación"
    :subtitulo="`${devolucion.materiales?.descripcion ?? ''} · ${devolucion.frentes?.codigo ?? ''} — ${devolucion.frentes?.nombre ?? ''} · ${devolucion.numero}`"
    ancho="640px"
    texto-guardar="Confirmar corrección"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="confirmar"
  >
    <p class="mf-info">
      Actualmente dado de baja:
      <strong>{{ formatearNumero(devolucion.cantidad_baja) }} {{ devolucion.materiales?.unidad }}</strong>. Indica cuánto
      de eso en realidad sí sirve: vuelve a stock disponible y deja de contar como baja.
    </p>

    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Cantidad que recupera y vuelve a stock ({{ devolucion.materiales?.unidad }})</span>
        <input v-model.number="cantidadARecuperar" type="number" min="0.001" :max="devolucion.cantidad_baja" step="0.001" />
      </div>

      <template v-if="necesitaMedida">
        <p class="mf-nota mf-span">
          Este material necesita su medida para poder entregarse después: indica la del rollo o barra que recupera.
        </p>
        <div v-if="tipoConversion === 'area'" class="mf-campo">
          <span class="mf-rotulo">Ancho (m)</span>
          <input v-model="ancho" type="number" step="0.01" min="0.01" />
        </div>
        <div class="mf-campo">
          <span class="mf-rotulo">Largo (m)</span>
          <input v-model="largo" type="number" step="0.01" min="0.01" />
        </div>
      </template>

      <div class="mf-campo mf-span">
        <span class="mf-rotulo">Motivo de la corrección</span>
        <textarea v-model="motivo" rows="2" placeholder="Ej.: se había dado de baja por error, el material sí es reutilizable"></textarea>
      </div>
    </div>
  </ModalFormulario>
</template>

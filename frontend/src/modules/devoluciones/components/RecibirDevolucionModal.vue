<script setup>
import { computed, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { formatearNumero } from '../../../utils/formatearNumero'

const props = defineProps({
  devolucion: { type: Object, required: true },
  almacenes: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
const attrs = useAttrs()

const almacenId = ref(props.almacenes[0]?.id ?? '')
// Punto de partida, no un valor fijo: lo que el supervisor declaró al pedir
// la devolución es su primera impresión, pero quien de verdad evalúa el
// material físicamente es Almacén al recibirlo — puede ajustar este número
// para cualquier lado (encontrar que algo "bueno" en realidad no sirve, o
// que algo "dañado" sí se puede recuperar).
const cantidadReutilizable = ref(props.devolucion.estado_material === 'bueno' ? props.devolucion.cantidad : 0)
const ancho = ref('')
const largo = ref('')
const guardando = ref(false)
const error = ref('')

// Igual que en el ingreso normal: mallas/geomallas (área) necesitan
// ancho×largo, pernos/barras (longitud) solo largo. Si la parte reutilizable
// necesita un lote nuevo (ver 20260916100000_devoluciones_generan_lote), sin
// esta medida ese material queda entrando a stock sin lote elegible después.
const tipoConversion = computed(() => props.devolucion.materiales?.tipo_conversion ?? 'ninguna')
const necesitaMedida = computed(() => tipoConversion.value !== 'ninguna')

const cantidadBaja = computed(() => {
  const valor = Number(cantidadReutilizable.value)
  if (!Number.isFinite(valor)) return null
  return Math.round((props.devolucion.cantidad - valor) * 1000) / 1000
})

async function confirmar() {
  error.value = ''
  if (!almacenId.value) {
    error.value = 'Selecciona el almacén donde entró el material.'
    return
  }
  const valor = Number(cantidadReutilizable.value)
  if (!Number.isFinite(valor) || valor < 0 || valor > props.devolucion.cantidad) {
    error.value = `La cantidad que vuelve a stock tiene que estar entre 0 y ${formatearNumero(props.devolucion.cantidad)}.`
    return
  }
  if (valor > 0 && necesitaMedida.value) {
    if (!largo.value || (tipoConversion.value === 'area' && !ancho.value)) {
      error.value = tipoConversion.value === 'area' ? 'Indica el ancho y el largo de lo que vuelve a stock.' : 'Indica el largo de lo que vuelve a stock.'
      return
    }
  }
  guardando.value = true
  try {
    await attrs.onRecibir({
      devolucion_id: props.devolucion.id,
      almacen_id: almacenId.value,
      cantidad_reutilizable: valor,
      ancho: valor > 0 && necesitaMedida.value && tipoConversion.value === 'area' ? Number(ancho.value) : null,
      largo: valor > 0 && necesitaMedida.value ? Number(largo.value) : null,
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo confirmar la recepción${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Recibir devolución"
    :subtitulo="`${devolucion.materiales?.descripcion ?? ''} · ${devolucion.frentes?.codigo ?? ''} — ${devolucion.frentes?.nombre ?? ''}`"
    ancho="640px"
    texto-guardar="Confirmar recepción"
    texto-guardando="Confirmando…"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="confirmar"
  >
    <p class="mf-info">
      {{ devolucion.cantidad }} {{ devolucion.materiales?.unidad }} devueltos · declarado por el supervisor como
      <strong>{{ devolucion.estado_material === 'bueno' ? 'Bueno' : 'Dañado' }}</strong>.
      Evalúa el material físicamente y dinos cuánto puede volver a stock: el resto queda dado de baja, sin importar lo
      que se declaró.
    </p>

    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Almacén donde entró el material</span>
        <select v-model="almacenId" required>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Cantidad que vuelve a stock ({{ devolucion.materiales?.unidad }})</span>
        <input v-model.number="cantidadReutilizable" type="number" min="0" :max="devolucion.cantidad" step="0.001" />
      </div>

      <template v-if="Number(cantidadReutilizable) > 0 && necesitaMedida">
        <p class="mf-nota mf-span">
          Este material necesita su medida para poder entregarse después: indica la del rollo o barra que vuelve a stock.
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
    </div>

    <p class="mf-info">
      Vuelven a stock: <strong>{{ formatearNumero(Number(cantidadReutilizable) || 0) }}</strong> · Se dan de baja:
      <strong>{{ cantidadBaja !== null ? formatearNumero(cantidadBaja) : '—' }}</strong>
    </p>
  </ModalFormulario>
</template>

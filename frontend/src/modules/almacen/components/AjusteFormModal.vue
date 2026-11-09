<script setup>
import { textoCrudo } from '../../../utils/mensajeError'
import { computed, reactive, ref, useAttrs } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'

const props = defineProps({
  almacenes: { type: Array, default: () => [] },
  materiales: { type: Array, default: () => [] },
  contratos: { type: Array, default: () => [] },
  stock: { type: Array, default: () => [] },
  // Valores iniciales cuando se abre desde "Corregir" en una fila de
  // Ingresos/Ajustes: { almacen_id, contrato_id, material_id, tipo, cantidad, motivo }.
  prellenado: { type: Object, default: null },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onGuardar directamente para que el
// try/catch capture fallos reales (ej. stock negativo, RLS, etc.).
const attrs = useAttrs()

// "Corregir" desde Ingresos/Ajustes ya trae calculado el tipo/cantidad
// exactos que hay que revertir — ese caso sigue en modo "sumar o restar".
// Para todo lo demás (el uso real de la mayoría: un conteo físico /
// sinceramiento) el modo por defecto es más simple: decir cuánto hay de
// verdad y que el sistema calcule solo si sube o baja y por cuánto.
const modo = ref(props.prellenado ? 'delta' : 'real')

const form = reactive({
  almacen_id: props.prellenado?.almacen_id ?? props.almacenes[0]?.id ?? '',
  contrato_id: props.prellenado?.contrato_id ?? props.contratos[0]?.id ?? '',
  material_id: props.prellenado?.material_id ?? '',
  tipo: props.prellenado?.tipo ?? 'positivo',
  cantidad: props.prellenado?.cantidad ?? '',
  cantidad_real: '',
  motivo: props.prellenado?.motivo ?? '',
})
const ancho = ref('')
const largo = ref('')
const guardando = ref(false)
const error = ref('')

const materialSeleccionado = computed(() => props.materiales.find((m) => m.id === form.material_id))

// Un ajuste positivo en un material con conversión (mallas, cables, pernos
// por longitud…) necesita lote igual que un ingreso normal — sin la
// medida, esas unidades quedan "atrapadas" en el stock sin de dónde poder
// entregarse después (caso real: VR-0098, ver migración 20261016120000).
// Un ajuste negativo nunca la pide: no hace falta saber de qué lote
// específico se resta.
const tipoEfectivo = computed(() => (modo.value === 'real' ? (diferencia.value > 0 ? 'positivo' : 'negativo') : form.tipo))
const tipoConversion = computed(() => materialSeleccionado.value?.tipo_conversion ?? 'ninguna')
const necesitaMedida = computed(() => tipoEfectivo.value === 'positivo' && tipoConversion.value !== 'ninguna')

const filaStock = computed(() =>
  props.stock.find(
    (s) => s.almacen_id === form.almacen_id && s.material_id === form.material_id && s.contrato_id === form.contrato_id
  )
)
// Sin fila en `stock` = nunca hubo un movimiento ahí: el registrado es 0, no "no se sabe".
const cantidadRegistrada = computed(() => Number(filaStock.value?.cantidad_fisica ?? 0))

const diferencia = computed(() => {
  if (form.cantidad_real === '') return null
  return Math.round((Number(form.cantidad_real) - cantidadRegistrada.value) * 1000) / 1000
})

async function onSubmit() {
  error.value = ''
  if (!form.almacen_id || !form.contrato_id || !form.material_id || !form.motivo.trim()) {
    error.value = 'Almacén, contrato, material y motivo son obligatorios.'
    return
  }

  let tipo
  let cantidad
  if (modo.value === 'real') {
    if (form.cantidad_real === '' || Number(form.cantidad_real) < 0) {
      error.value = 'Indica la cantidad real que contaste en físico (puede ser 0).'
      return
    }
    if (diferencia.value === 0) {
      error.value = 'Esa cantidad es igual a la que ya está registrada — no hay nada que ajustar.'
      return
    }
    tipo = diferencia.value > 0 ? 'positivo' : 'negativo'
    cantidad = Math.abs(diferencia.value)
  } else {
    if (!form.cantidad || Number(form.cantidad) <= 0) {
      error.value = 'La cantidad debe ser mayor a cero.'
      return
    }
    tipo = form.tipo
    cantidad = Number(form.cantidad)
  }

  if (tipo === 'positivo' && tipoConversion.value !== 'ninguna') {
    if (!largo.value || (tipoConversion.value === 'area' && !ancho.value)) {
      error.value = tipoConversion.value === 'area' ? 'Indica el ancho y el largo del lote que genera este ajuste.' : 'Indica el largo del lote que genera este ajuste.'
      return
    }
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      almacen_id: form.almacen_id,
      contrato_id: form.contrato_id,
      material_id: form.material_id,
      tipo,
      cantidad,
      motivo: form.motivo.trim(),
      ancho: tipo === 'positivo' && tipoConversion.value === 'area' ? Number(ancho.value) : null,
      largo: tipo === 'positivo' && tipoConversion.value !== 'ninguna' ? Number(largo.value) : null,
    })
  } catch (e) {
    console.error(e)
    if (textoCrudo(e).includes('stock físico negativo')) {
      error.value = 'Ese ajuste dejaría el stock en negativo. Revisa la cantidad.'
    } else if (textoCrudo(e).includes('chk_stock_reservada_no_excede_fisica')) {
      error.value = 'Este material tiene cantidad reservada (hay vales pendientes de entregar): no puedes bajar el físico por debajo de lo reservado. Libera o entrega esas reservas primero.'
    } else if (textoCrudo(e).includes('no se puede aplicar un movimiento negativo')) {
      error.value = 'Este material no tiene ningún ingreso registrado en este almacén/contrato todavía, así que no se le puede restar. Verifica que elegiste el almacén y el contrato correctos.'
    } else {
      // Antes esto mostraba un mensaje genérico sin el motivo real — dejaba
      // al almacenero sin poder saber por qué "no funcionaba" el ajuste.
      error.value = `No se pudo registrar el ajuste${e?.message ? ': ' + e.message : '.'}`
    }
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Registrar ajuste de inventario"
    subtitulo="Corrige el stock cuando lo que hay en físico no coincide con el sistema."
    texto-guardar="Registrar ajuste"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <p v-if="prellenado?.nota" class="mf-nota">{{ prellenado.nota }}</p>

    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Almacén</span>
        <select v-model="form.almacen_id" required>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Contrato</span>
        <select v-model="form.contrato_id" required>
          <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>

      <div class="mf-campo mf-span">
        <span class="mf-rotulo">Material</span>
        <BuscadorMaterial v-model="form.material_id" :materiales="materiales" />
      </div>
    </div>

    <p v-if="form.material_id && form.almacen_id && form.contrato_id" class="mf-info">
      Stock registrado ahora: <strong>{{ cantidadRegistrada }} {{ materialSeleccionado?.unidad }}</strong>
    </p>

    <div v-if="!prellenado" class="mf-opciones">
      <button type="button" :class="{ activo: modo === 'real' }" @click="modo = 'real'">Conté y sé cuánto hay</button>
      <button type="button" :class="{ activo: modo === 'delta' }" @click="modo = 'delta'">Sé cuánto sumar o restar</button>
    </div>

    <div class="mf-grid">
      <template v-if="modo === 'real'">
        <div class="mf-campo">
          <span class="mf-rotulo">Cantidad real en físico (lo que contaste)</span>
          <div class="mf-con-unidad">
            <input v-model="form.cantidad_real" type="number" step="0.001" min="0" required />
            <span v-if="materialSeleccionado" class="mf-unidad">{{ materialSeleccionado.unidad }}</span>
          </div>
        </div>
        <p
          v-if="diferencia !== null"
          class="mf-info"
          style="align-self: end"
          :class="diferencia > 0 ? 'positivo' : diferencia < 0 ? 'negativo' : ''"
        >
          <template v-if="diferencia > 0">Esto sube el stock en {{ diferencia }} {{ materialSeleccionado?.unidad }}.</template>
          <template v-else-if="diferencia < 0">Esto baja el stock en {{ Math.abs(diferencia) }} {{ materialSeleccionado?.unidad }}.</template>
          <template v-else>No hay diferencia con lo ya registrado.</template>
        </p>
      </template>

      <template v-else>
        <div class="mf-campo">
          <span class="mf-rotulo">Tipo de ajuste</span>
          <select v-model="form.tipo">
            <option value="positivo">Positivo (aumenta el stock)</option>
            <option value="negativo">Negativo (reduce el stock)</option>
          </select>
        </div>

        <div class="mf-campo">
          <span class="mf-rotulo">Cantidad a {{ form.tipo === 'positivo' ? 'sumar' : 'restar' }}</span>
          <div class="mf-con-unidad">
            <input v-model="form.cantidad" type="number" step="0.001" min="0.001" required />
            <span v-if="materialSeleccionado" class="mf-unidad">{{ materialSeleccionado.unidad }}</span>
          </div>
        </div>
      </template>

      <template v-if="necesitaMedida">
        <p class="mf-nota mf-span">
          Este material necesita su medida para poder entregarse después: indica la del rollo o barra que genera este ajuste.
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
        <span class="mf-rotulo">Motivo</span>
        <textarea v-model="form.motivo" rows="2" placeholder="Conteo físico, merma, error de registro…" required></textarea>
      </div>
    </div>
  </ModalFormulario>
</template>

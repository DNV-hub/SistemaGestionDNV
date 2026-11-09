<script setup>
import { computed, reactive, ref, useAttrs } from 'vue'
import { textoCrudo } from '../../../utils/mensajeError'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { formatearNumero } from '../../../utils/formatearNumero'

// Corregir un ingreso ya registrado, todo en un solo lugar:
//  · los DATOS de la guía (N.º de guía, proveedor, observación), que no tocan stock;
//  · la CANTIDAD que llegó: se dice cuánto llegó de verdad y el sistema registra
//    solo el ajuste que falta (suma o resta la diferencia, con su motivo).
// Antes eran dos botones distintos (Editar y Corregir) para lo mismo: arreglar un ingreso.
const props = defineProps({
  ingreso: { type: Object, required: true },
  // otros materiales que entraron en la misma carga (misma guía)
  hermanos: { type: Array, default: () => [] },
  stock: { type: Array, default: () => [] },
  // catálogo de materiales: de ahí sale si el material necesita medida (tipo_conversion)
  materiales: { type: Array, default: () => [] },
})
const emit = defineEmits(['cerrar', 'listo'])
const attrs = useAttrs()

const unidad = computed(() => props.ingreso.materiales?.unidad ?? '')
const tipoConversion = computed(() => props.materiales.find((m) => m.id === props.ingreso.material_id)?.tipo_conversion ?? 'ninguna')

const form = reactive({
  documento_referencia: props.ingreso.documento_referencia ?? '',
  proveedor: props.ingreso.proveedor ?? '',
  observacion: props.ingreso.observacion ?? '',
  cantidad: String(props.ingreso.cantidad ?? ''),
  motivo: '',
})
const ancho = ref(props.ingreso.ancho != null ? String(props.ingreso.ancho) : '')
const largo = ref(props.ingreso.largo != null ? String(props.ingreso.largo) : '')
const aplicarATodos = ref(props.hermanos.length > 0)
const guardando = ref(false)
const error = ref('')
const aviso = ref('')

const norm = (v) => (v ?? '').toString().trim()
const datosCambiaron = computed(
  () =>
    norm(form.documento_referencia) !== norm(props.ingreso.documento_referencia) ||
    norm(form.proveedor) !== norm(props.ingreso.proveedor) ||
    norm(form.observacion) !== norm(props.ingreso.observacion)
)

// Cantidad: lo que dice el ingreso hoy vs. lo que debió ser.
const cantidadActual = computed(() => Number(props.ingreso.cantidad))
const cantidadNueva = computed(() => (form.cantidad === '' ? null : Number(form.cantidad)))
const diferencia = computed(() =>
  cantidadNueva.value === null ? null : Math.round((cantidadNueva.value - cantidadActual.value) * 1000) / 1000
)
const cantidadCambio = computed(() => diferencia.value !== null && diferencia.value !== 0)
const tipoAjuste = computed(() => (diferencia.value > 0 ? 'positivo' : 'negativo'))
const necesitaMedida = computed(() => cantidadCambio.value && tipoAjuste.value === 'positivo' && tipoConversion.value !== 'ninguna')
const yaSalio = computed(() => {
  const r = props.ingreso.cantidad_restante
  return r == null ? 0 : Math.max(0, Math.round((cantidadActual.value - Number(r)) * 1000) / 1000)
})

const filaStock = computed(() =>
  props.stock.find(
    (s) => s.almacen_id === props.ingreso.almacen_id && s.material_id === props.ingreso.material_id && s.contrato_id === props.ingreso.contrato_id
  )
)
const stockActual = computed(() => Number(filaStock.value?.cantidad_fisica ?? 0))
const stockQuedaria = computed(() => (diferencia.value === null ? null : Math.round((stockActual.value + diferencia.value) * 1000) / 1000))

const hayCambios = computed(() => datosCambiaron.value || cantidadCambio.value)
const motivoSugerido = computed(
  () => `Corrección del ingreso del ${props.ingreso.fecha}${props.ingreso.documento_referencia ? ' (doc. ' + props.ingreso.documento_referencia + ')' : ''}.`
)

function anularTodo() {
  form.cantidad = '0'
}
function restaurarCantidad() {
  form.cantidad = String(props.ingreso.cantidad ?? '')
}

function mensajeDeError(e) {
  const t = textoCrudo(e)
  if (t.includes('stock físico negativo')) return 'Ese ajuste dejaría el stock en negativo. Revisa la cantidad.'
  if (t.includes('chk_stock_reservada_no_excede_fisica'))
    return 'Este material tiene cantidad reservada (hay vales pendientes de entregar): no puedes bajar el físico por debajo de lo reservado. Libera o entrega esas reservas primero.'
  if (t.includes('no se puede aplicar un movimiento negativo'))
    return 'Este material no tiene ningún ingreso registrado en este almacén/contrato todavía, así que no se le puede restar.'
  return e?.message ?? 'No se pudo guardar.'
}

async function onSubmit() {
  error.value = ''
  aviso.value = ''
  if (!hayCambios.value) return
  if (cantidadNueva.value === null || cantidadNueva.value < 0) {
    error.value = 'Indica la cantidad correcta (puede ser 0 si el ingreso no debió registrarse).'
    return
  }
  if (cantidadCambio.value && !norm(form.motivo)) {
    error.value = 'Escribe el motivo de la corrección de cantidad.'
    return
  }
  if (necesitaMedida.value && (!largo.value || (tipoConversion.value === 'area' && !ancho.value))) {
    error.value = tipoConversion.value === 'area' ? 'Indica el ancho y el largo del lote que genera esta diferencia.' : 'Indica el largo del lote que genera esta diferencia.'
    return
  }

  guardando.value = true
  let datosGuardados = false
  try {
    if (datosCambiaron.value) {
      const ids = [props.ingreso.id, ...(aplicarATodos.value ? props.hermanos.map((h) => h.id) : [])]
      await attrs.onGuardarDatos(ids, {
        documento_referencia: norm(form.documento_referencia) || null,
        proveedor: norm(form.proveedor) || null,
        observacion: norm(form.observacion) || null,
      })
      datosGuardados = true
    }
    if (cantidadCambio.value) {
      await attrs.onAjustar({
        almacen_id: props.ingreso.almacen_id,
        contrato_id: props.ingreso.contrato_id,
        material_id: props.ingreso.material_id,
        tipo: tipoAjuste.value,
        cantidad: Math.abs(diferencia.value),
        motivo: norm(form.motivo),
        ancho: necesitaMedida.value && tipoConversion.value === 'area' ? Number(ancho.value) : null,
        largo: necesitaMedida.value ? Number(largo.value) : null,
      })
    }
    emit('listo', { datos: datosCambiaron.value, cantidad: cantidadCambio.value, ingresos: datosCambiaron.value && aplicarATodos.value ? props.hermanos.length + 1 : 1 })
  } catch (e) {
    console.error(e)
    error.value = datosGuardados
      ? `Los datos de la guía sí se guardaron, pero la cantidad no: ${mensajeDeError(e)}`
      : mensajeDeError(e)
    // Los datos ya quedaron guardados: se avisa al padre para que refresque la lista (el modal sigue abierto con el error).
    if (datosGuardados) emit('listo', { datos: true, cantidad: false, ingresos: 1, parcial: true })
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Corregir ingreso"
    :subtitulo="`${ingreso.materiales?.descripcion ?? ''} · ${ingreso.fecha}`"
    ancho="900px"
    texto-guardar="Guardar corrección"
    :guardando="guardando"
    :bloquear-guardar="!hayCambios"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <div class="ci-resumen">
      <span class="ci-dato"><small>Ingresó</small><b>{{ formatearNumero(ingreso.cantidad) }} {{ unidad }}</b></span>
      <span v-if="ingreso.cantidad_restante != null" class="ci-dato"><small>Queda del lote</small><b>{{ formatearNumero(ingreso.cantidad_restante) }} {{ unidad }}</b></span>
      <span class="ci-dato"><small>Almacén</small><b>{{ ingreso.almacenes?.nombre ?? '—' }}</b></span>
      <span class="ci-dato"><small>Stock ahora</small><b>{{ formatearNumero(stockActual) }} {{ unidad }}</b></span>
    </div>

    <div class="ci-cols">
      <!-- Datos de la guía -->
      <section class="ci-bloque">
        <h3><span class="ci-n">1</span> Datos de la guía</h3>
        <div class="mf-campo">
          <span class="mf-rotulo">N.º de guía o factura</span>
          <input v-model="form.documento_referencia" type="text" placeholder="Ej. T001-0003184" />
        </div>
        <div class="mf-campo">
          <span class="mf-rotulo">Proveedor</span>
          <input v-model="form.proveedor" type="text" />
        </div>
        <div class="mf-campo">
          <span class="mf-rotulo">Observación</span>
          <textarea v-model="form.observacion" rows="2"></textarea>
        </div>
        <label v-if="hermanos.length" class="ci-todos">
          <input v-model="aplicarATodos" type="checkbox" />
          <span>Aplicar también a los otros {{ hermanos.length }} {{ hermanos.length === 1 ? 'material' : 'materiales' }} de esta misma guía</span>
        </label>
        <p class="ci-ayuda">Cambiar estos datos no toca la cantidad ni el stock.</p>
      </section>

      <!-- Cantidad -->
      <section class="ci-bloque">
        <h3><span class="ci-n">2</span> Cantidad que llegó</h3>
        <div class="mf-campo">
          <span class="mf-rotulo">Cantidad correcta</span>
          <div class="mf-con-unidad">
            <input v-model="form.cantidad" type="number" step="0.001" min="0" inputmode="decimal" />
            <span class="mf-unidad">{{ unidad }}</span>
          </div>
        </div>
        <div class="ci-rapidos">
          <button v-if="cantidadCambio" type="button" class="ci-lnk" @click="restaurarCantidad">Volver a {{ formatearNumero(ingreso.cantidad) }}</button>
          <button type="button" class="ci-lnk peligro" @click="anularTodo">Quitar todo el ingreso (0)</button>
        </div>

        <p v-if="cantidadCambio" class="mf-info" :class="diferencia > 0 ? 'positivo' : 'negativo'">
          <template v-if="diferencia > 0">Se sumarán <b>{{ formatearNumero(diferencia) }} {{ unidad }}</b> al stock.</template>
          <template v-else>Se restarán <b>{{ formatearNumero(Math.abs(diferencia)) }} {{ unidad }}</b> del stock.</template>
          El stock pasará de {{ formatearNumero(stockActual) }} a <b>{{ formatearNumero(stockQuedaria) }} {{ unidad }}</b>.
        </p>
        <p v-else class="ci-ayuda">Si la cantidad está bien, déjala como está.</p>

        <p v-if="yaSalio > 0 && cantidadCambio && diferencia < 0" class="mf-nota">
          De este lote ya salieron {{ formatearNumero(yaSalio) }} {{ unidad }}: revisa que la corrección tenga sentido.
        </p>

        <template v-if="cantidadCambio">
          <div v-if="necesitaMedida" class="ci-medida">
            <div v-if="tipoConversion === 'area'" class="mf-campo">
              <span class="mf-rotulo">Ancho (m)</span>
              <input v-model="ancho" type="number" step="0.01" min="0.01" inputmode="decimal" />
            </div>
            <div class="mf-campo">
              <span class="mf-rotulo">{{ tipoConversion === 'area' ? 'Largo (m)' : 'Longitud de cada pieza (m)' }}</span>
              <input v-model="largo" type="number" step="0.01" min="0.01" inputmode="decimal" />
            </div>
          </div>
          <div class="mf-campo">
            <span class="mf-rotulo">Motivo de la corrección</span>
            <textarea v-model="form.motivo" rows="2" :placeholder="motivoSugerido"></textarea>
            <button v-if="!form.motivo" type="button" class="ci-lnk" @click="form.motivo = motivoSugerido">Usar: «{{ motivoSugerido }}»</button>
          </div>
        </template>
      </section>
    </div>

    <template #pie>{{ hayCambios ? (datosCambiaron && cantidadCambio ? 'Se corrigen los datos y la cantidad.' : datosCambiaron ? 'Solo cambian los datos de la guía.' : 'Solo cambia la cantidad.') : 'Cambia algo para poder guardar.' }}</template>
  </ModalFormulario>
</template>

<style scoped>
.ci-resumen {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  padding: 12px 14px;
  border-radius: var(--radius-control);
  background: var(--color-surface-2);
}
.ci-dato {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ci-dato small {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.ci-dato b {
  font-size: 14px;
  font-weight: 800;
}
.ci-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.ci-bloque {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.ci-bloque h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
}
.ci-n {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
}
.ci-todos {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  font-size: 13px;
  cursor: pointer;
}
.ci-ayuda {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.ci-rapidos {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.ci-lnk {
  border: 0;
  background: none;
  padding: 4px 0;
  color: var(--color-info);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.ci-lnk.peligro {
  color: var(--color-danger);
}
.ci-medida {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
@media (max-width: 720px) {
  .ci-cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .ci-resumen {
    gap: 8px 16px;
  }
}
</style>

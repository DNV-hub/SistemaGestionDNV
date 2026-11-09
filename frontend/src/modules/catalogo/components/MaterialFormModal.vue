<script setup>
import { reactive, ref, useAttrs, watch } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import SugerenciasEdp from './SugerenciasEdp.vue'

const props = defineProps({
  material: { type: Object, default: null }, // null = creando, objeto = editando
  categorias: { type: Array, default: () => [] },
  nombresEdp: { type: Array, default: () => [] },
  puedeEditarEstado: { type: Boolean, default: false },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onGuardar directamente para que el try/catch
// de abajo funcione con la operación real.
const attrs = useAttrs()

function estadoInicial() {
  return {
    descripcion: props.material?.descripcion ?? '',
    unidad: props.material?.unidad ?? '',
    descripcion_edp_id: props.material?.descripcion_edp_id ?? '',
    unidad_edp: props.material?.unidad_edp ?? '',
    tipo_conversion: props.material?.tipo_conversion ?? 'ninguna',
    categoria_id: props.material?.categoria_id ?? '',
    estado: props.material?.estado ?? 'activo',
    // % del último ingreso que se considera "stock mínimo" (0.2 = 20%). Un
    // material nuevo arranca en el estándar del sistema; no en vacío, porque
    // sin esto las alertas de stock bajo simplemente no se generan para él.
    stock_minimo_pct: props.material?.stock_minimo_pct ?? 0.2,
    observaciones: props.material?.observaciones ?? '',
  }
}

const form = reactive(estadoInicial())
const guardando = ref(false)
const error = ref('')

watch(
  () => props.material,
  () => Object.assign(form, estadoInicial())
)

async function onSubmit() {
  error.value = ''
  if (!form.descripcion.trim() || !form.unidad.trim()) {
    error.value = 'Descripción y unidad son obligatorios.'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      descripcion: form.descripcion.trim(),
      unidad: form.unidad.trim(),
      descripcion_edp_id: form.descripcion_edp_id || null,
      unidad_edp: form.unidad_edp.trim() || null,
      tipo_conversion: form.tipo_conversion,
      categoria_id: form.categoria_id || null,
      estado: form.estado,
      // stock_minimo_pct es NOT NULL en la base (default 20%) — si lo dejan
      // vacío, se manda el estándar en vez de un null que la base rechazaría.
      stock_minimo_pct: form.stock_minimo_pct === '' ? 0.2 : Number(form.stock_minimo_pct),
      observaciones: form.observaciones.trim() || null,
    })
  } catch (e) {
    error.value = 'No se pudo guardar el material.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    :titulo="material ? 'Editar material' : 'Nuevo material'"
    subtitulo="Los datos con los que se controla y se cuenta este material."
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <div class="mf-grid">
      <div class="mf-campo mf-span">
        <span class="mf-rotulo">Descripción en Almacén</span>
        <input v-model="form.descripcion" type="text" required />
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Unidad en Almacén</span>
        <input v-model="form.unidad" type="text" required placeholder="m3, kg, und…" />
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Categoría <em>(opcional)</em></span>
        <select v-model="form.categoria_id">
          <option value="">Sin categoría</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>

      <div class="mf-campo mf-span">
        <span class="mf-rotulo">¿Se mide distinto a como se cuenta? <em>(rollos de malla, barras, cables…)</em></span>
        <select v-model="form.tipo_conversion">
          <option value="ninguna">No: se controla y se paga en la misma unidad</option>
          <option value="area">Por área: cada ingreso pide ancho × largo del rollo (→ m2)</option>
          <option value="longitud">Por longitud: cada ingreso pide el largo de la pieza (→ ml)</option>
        </select>
        <p class="mf-ayuda">
          Si dejas "No" en un material que sí necesita conversión (como una malla), el ingreso nunca pedirá las medidas
          y el EDP saldrá mal. Revísalo también al editar un material ya creado.
        </p>
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Nombre EDP</span>
        <select v-model="form.descripcion_edp_id">
          <option value="">Sin nombre EDP</option>
          <option v-for="n in nombresEdp" :key="n.id" :value="n.id">{{ n.nombre }}</option>
        </select>
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Unidad EDP</span>
        <input v-model="form.unidad_edp" type="text" placeholder="m3, kg, und…" />
      </div>

      <div class="mf-span">
        <SugerenciasEdp :texto="form.descripcion" :elegido="form.descripcion_edp_id" @elegir="(id) => (form.descripcion_edp_id = id)" />
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Aviso de stock bajo <em>(fracción del último ingreso)</em></span>
        <input v-model="form.stock_minimo_pct" type="number" step="0.01" min="0" max="1" placeholder="0.2" />
        <p class="mf-ayuda">0.2 = 20%. Si el último lote fue de 100, se avisa al llegar a 20.</p>
      </div>

      <div v-if="material && puedeEditarEstado" class="mf-campo">
        <span class="mf-rotulo">Estado</span>
        <select v-model="form.estado">
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>

      <div class="mf-campo mf-span">
        <span class="mf-rotulo">Observaciones <em>(opcional)</em></span>
        <textarea v-model="form.observaciones" rows="2"></textarea>
      </div>
    </div>
  </ModalFormulario>
</template>

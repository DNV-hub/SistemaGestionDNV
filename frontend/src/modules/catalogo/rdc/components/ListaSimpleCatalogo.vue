<script setup>
import { computed, reactive, ref, watch } from 'vue'

// Lista simple para catálogos cortos (Capataces, Supervisores, Sectores,
// Maquinaria): alta en línea, arrastrar para ordenar, interruptor Activo y
// borrar al pasar el mouse. Misma regla que TablaCatalogo: no habla con
// Supabase — recibe alCrear / alActualizar / alEliminar como promesas.
const props = defineProps({
  columnas: { type: Array, required: true },
  filas: { type: Array, required: true },
  campoActivo: { type: String, default: null },
  opciones: { type: Object, default: () => ({}) },
  nuevaFilaBase: { type: Object, default: () => ({}) },
  etiquetaNueva: { type: String, default: 'elemento' },
  alCrear: { type: Function, required: true },
  alActualizar: { type: Function, required: true },
  alEliminar: { type: Function, required: true },
})

const error = ref('')

// La primera columna es el nombre del elemento (campo principal); 'orden' no
// se muestra, solo se actualiza al arrastrar.
const principal = computed(() => props.columnas[0])
const extras = computed(() => props.columnas.slice(1).filter((c) => c.clave !== 'orden'))
const tieneOrden = computed(() => props.columnas.some((c) => c.clave === 'orden'))

const items = ref([])
watch(
  () => props.filas,
  (filas) => {
    items.value = tieneOrden.value
      ? [...filas].sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity))
      : [...filas]
  },
  { immediate: true }
)

// ---- Alta en línea ----
const nuevaFila = reactive({ ...props.nuevaFilaBase })
const creando = ref(false)
const faltaRequerido = computed(() =>
  props.columnas.some((c) => c.requerido && (nuevaFila[c.clave] === '' || nuevaFila[c.clave] == null))
)
async function crear() {
  if (faltaRequerido.value || creando.value) return
  error.value = ''
  creando.value = true
  try {
    const datos = { ...nuevaFila }
    if (tieneOrden.value && (datos.orden === '' || datos.orden == null)) datos.orden = items.value.length + 1
    await props.alCrear(datos)
    Object.keys(nuevaFila).forEach((k) => delete nuevaFila[k])
    Object.assign(nuevaFila, props.nuevaFilaBase)
  } catch (e) {
    error.value = e?.message ?? 'No se pudo crear.'
  } finally {
    creando.value = false
  }
}

// ---- Edición en línea (se guarda al salir de la celda, con reversión) ----
const valorAlEntrar = new WeakMap()
function recordar(fila, clave) {
  if (!valorAlEntrar.has(fila)) valorAlEntrar.set(fila, {})
  valorAlEntrar.get(fila)[clave] = fila[clave]
}
const guardando = reactive(new Set())
async function guardarCampo(fila, clave) {
  const anterior = valorAlEntrar.get(fila)?.[clave]
  if (anterior === fila[clave]) return
  const k = `${fila.id}::${clave}`
  guardando.add(k)
  error.value = ''
  try {
    await props.alActualizar(fila.id, { [clave]: fila[clave] })
  } catch (e) {
    fila[clave] = anterior
    error.value = e?.message ?? 'No se pudo guardar el cambio.'
  } finally {
    guardando.delete(k)
  }
}
const ocupado = (fila, clave) => guardando.has(`${fila.id}::${clave}`)

// ---- Eliminar ----
const eliminando = reactive(new Set())
async function eliminar(fila) {
  const etiqueta = fila[principal.value.clave] ?? 'este elemento'
  if (!confirm(`¿Borrar "${etiqueta}"? Si algún reporte ya lo usó, la base va a impedirlo — no se puede deshacer si lo permite.`)) return
  eliminando.add(fila.id)
  error.value = ''
  try {
    await props.alEliminar(fila.id)
  } catch (e) {
    error.value = e?.message ?? 'No se pudo borrar: probablemente algún reporte ya lo está usando.'
  } finally {
    eliminando.delete(fila.id)
  }
}

// ---- Arrastrar para ordenar ----
const arrastrando = ref(null)
const sobre = ref(null)
function iniciarArrastre(i, ev) {
  arrastrando.value = i
  ev.dataTransfer.effectAllowed = 'move'
  const fila = ev.target.closest('.pl-lrow')
  if (fila) ev.dataTransfer.setDragImage(fila, 16, 16)
}
async function soltar(destino) {
  const origen = arrastrando.value
  arrastrando.value = null
  sobre.value = null
  if (origen == null || origen === destino || !tieneOrden.value) return
  const copia = [...items.value]
  const [movida] = copia.splice(origen, 1)
  copia.splice(destino, 0, movida)
  items.value = copia
  error.value = ''
  try {
    for (let i = 0; i < copia.length; i++) {
      if (copia[i].orden !== i + 1) {
        const anterior = copia[i].orden
        copia[i].orden = i + 1
        try {
          await props.alActualizar(copia[i].id, { orden: i + 1 })
        } catch (e) {
          copia[i].orden = anterior
          throw e
        }
      }
    }
  } catch (e) {
    error.value = e?.message ?? 'No se pudo guardar el orden.'
  }
}
</script>

<template>
  <div class="lista">
    <p v-if="error" class="error">{{ error }}</p>

    <div class="pl-lrow alta">
      <span class="asa vacio-asa"></span>
      <input
        v-model="nuevaFila[principal.clave]"
        type="text"
        class="celda principal"
        :placeholder="`Nuevo ${etiquetaNueva}…`"
        :aria-label="`Nuevo ${etiquetaNueva}`"
        @keydown.enter="crear"
      />
      <template v-for="c in extras" :key="c.clave">
        <select v-if="c.tipo === 'seleccion'" v-model="nuevaFila[c.clave]" class="celda extra" :aria-label="c.etiqueta">
          <option v-if="c.permiteVacio" :value="null">{{ c.etiqueta }}: —</option>
          <option v-else :value="undefined" disabled>{{ c.etiqueta }}</option>
          <option v-for="o in opciones[c.opciones]" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <input v-else-if="c.tipo === 'numero'" v-model.number="nuevaFila[c.clave]" type="number" class="celda extra corta" :placeholder="c.etiqueta" :aria-label="c.etiqueta" />
        <input v-else v-model="nuevaFila[c.clave]" type="text" class="celda extra" :placeholder="c.etiqueta" :aria-label="c.etiqueta" @keydown.enter="crear" />
      </template>
      <button type="button" class="pl-ghost sm" :disabled="faltaRequerido || creando" @click="crear">{{ creando ? 'Agregando…' : '+ Agregar' }}</button>
    </div>

    <div
      v-for="(fila, i) in items"
      :key="fila.id"
      class="pl-lrow"
      :class="{ arrastrando: arrastrando === i, sobre: sobre === i && arrastrando !== i }"
      @dragover.prevent="sobre = i"
      @dragleave="sobre === i && (sobre = null)"
      @drop.prevent="soltar(i)"
    >
      <span
        class="asa"
        :draggable="tieneOrden"
        :title="tieneOrden ? 'Arrastra para ordenar' : ''"
        aria-hidden="true"
        @dragstart="iniciarArrastre(i, $event)"
        @dragend="arrastrando = null; sobre = null"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
      </span>

      <input
        v-model="fila[principal.clave]"
        type="text"
        class="celda principal"
        :aria-label="principal.etiqueta"
        :disabled="ocupado(fila, principal.clave)"
        @focus="recordar(fila, principal.clave)"
        @blur="guardarCampo(fila, principal.clave)"
        @keydown.enter="$event.target.blur()"
      />

      <template v-for="c in extras" :key="c.clave">
        <select
          v-if="c.tipo === 'seleccion'"
          v-model="fila[c.clave]"
          class="celda extra"
          :aria-label="c.etiqueta"
          :disabled="ocupado(fila, c.clave)"
          @focus="recordar(fila, c.clave)"
          @change="guardarCampo(fila, c.clave)"
        >
          <option v-if="c.permiteVacio" :value="null">—</option>
          <option v-for="o in opciones[c.opciones]" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <input
          v-else-if="c.tipo === 'numero'"
          v-model.number="fila[c.clave]"
          type="number"
          class="celda extra corta"
          :aria-label="c.etiqueta"
          :disabled="ocupado(fila, c.clave)"
          @focus="recordar(fila, c.clave)"
          @blur="guardarCampo(fila, c.clave)"
        />
        <input
          v-else
          v-model="fila[c.clave]"
          type="text"
          class="celda extra"
          :placeholder="c.etiqueta"
          :aria-label="c.etiqueta"
          :disabled="ocupado(fila, c.clave)"
          @focus="recordar(fila, c.clave)"
          @blur="guardarCampo(fila, c.clave)"
          @keydown.enter="$event.target.blur()"
        />
      </template>

      <input
        v-if="campoActivo"
        v-model="fila[campoActivo]"
        type="checkbox"
        class="pl-sw"
        role="switch"
        aria-label="Activo"
        :disabled="ocupado(fila, campoActivo)"
        @focus="recordar(fila, campoActivo)"
        @change="guardarCampo(fila, campoActivo)"
      />

      <span class="macts">
        <button type="button" class="pl-ic" aria-label="Eliminar" title="Eliminar" :disabled="eliminando.has(fila.id)" @click="eliminar(fila)">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
        </button>
      </span>
    </div>

    <div v-if="!items.length" class="pl-vacio">Todavía no hay elementos.</div>
  </div>
</template>

<style scoped>
.lista {
  background: var(--p-card);
  border-radius: 20px;
  box-shadow: 0 0 0 1px var(--p-line);
  padding: 8px;
}
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 8px 12px;
}
.pl-lrow {
  min-height: 52px;
}
.pl-lrow.alta {
  background: var(--p-hover);
  margin-bottom: 4px;
}
.pl-lrow.arrastrando {
  opacity: 0.45;
}
.pl-lrow.sobre {
  box-shadow: inset 0 2px 0 #f6a800;
}
.asa {
  width: 18px;
  display: inline-flex;
  justify-content: center;
  color: var(--p-faint);
  cursor: grab;
  flex: 0 0 auto;
}
.vacio-asa {
  cursor: default;
}
.celda {
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--p-text);
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  min-width: 0;
}
.celda.principal {
  flex: 1;
  font-weight: 600;
}
.celda.extra {
  width: 200px;
  flex: 0 0 auto;
  color: var(--p-muted);
}
.celda.corta {
  width: 90px;
}
.celda:hover {
  border-color: var(--p-line);
}
.celda:focus {
  border-color: #f6a800;
  background: var(--p-card);
  outline: none;
}
.celda:disabled {
  opacity: 0.5;
}
.pl-lrow.alta .celda {
  border-color: var(--p-line);
  background: var(--p-card);
}
.macts {
  margin-left: 0;
}
</style>

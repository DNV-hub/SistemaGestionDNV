<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  materiales: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Escribe el nombre del material…' },
  // Opcional: id de material -> cantidad disponible ahora. Cuando viene, se
  // muestra al lado de cada resultado MIENTRAS se busca (no solo después de
  // elegir) — el almacenero pidió ver el stock en vivo justo ahí, no recién
  // en una línea aparte una vez seleccionado el material.
  stockPorMaterial: { type: Map, default: () => new Map() },
  // Con stock en la mano, los materiales sin disponible salen al final como
  // "Agotado" y no se pueden elegir (ni con mouse ni con teclado).
  bloquearAgotados: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const query = ref('')
const abierto = ref(false)
// Índice resaltado dentro de `filtrados` — con flechas se mueve, con mouse
// se sigue (mouseenter), y Enter/Tab confirman lo que esté resaltado. Antes
// este buscador solo se podía usar con mouse: Tab saltaba al siguiente
// campo sin elegir nada, y Enter no hacía nada.
const resaltado = ref(-1)
const opcionEls = ref([])

function etiqueta(m) {
  return m.descripcion
}

const materialSeleccionado = computed(
  () => props.materiales.find((m) => m.id === props.modelValue) ?? null
)

watch(
  materialSeleccionado,
  (m) => {
    query.value = m ? etiqueta(m) : ''
  },
  { immediate: true }
)

// Sin datos de stock todavía (aún cargando) no se bloquea nada.
function agotado(m) {
  return props.bloquearAgotados && props.stockPorMaterial.size > 0 && !(Number(props.stockPorMaterial.get(m.id) ?? 0) > 0)
}

const filtrados = computed(() => {
  const q = query.value.trim().toLowerCase()
  const lista = !q
    ? props.materiales
    : props.materiales.filter((m) => m.descripcion.toLowerCase().includes(q))
  // Los que tienen stock primero; los agotados al final (el orden de cada grupo se mantiene).
  const ordenada = props.bloquearAgotados ? [...lista.filter((m) => !agotado(m)), ...lista.filter(agotado)] : lista
  return ordenada.slice(0, 30)
})
// Cuántas filas se pueden elegir: las flechas nunca pasan a las agotadas.
const elegibles = computed(() => filtrados.value.filter((m) => !agotado(m)).length)

function onInput() {
  abierto.value = true
  resaltado.value = 0
  if (props.modelValue) emit('update:modelValue', '')
}

function onFocus() {
  abierto.value = true
  resaltado.value = elegibles.value ? 0 : -1
}

function elegir(m) {
  emit('update:modelValue', m.id)
  abierto.value = false
}

function onBlur() {
  // se cierra al perder foco; si no quedó nada seleccionado, limpia el texto
  abierto.value = false
  query.value = materialSeleccionado.value ? etiqueta(materialSeleccionado.value) : ''
}

function moverResaltado(delta) {
  if (!abierto.value || !elegibles.value) return
  const total = elegibles.value
  resaltado.value = (resaltado.value + delta + total) % total
  nextTick(() => opcionEls.value[resaltado.value]?.scrollIntoView({ block: 'nearest' }))
}

/** Confirma lo resaltado — con flechas, con el mouse (mouseenter) o, si
 * todavía no se tocó nada, la primera opción de la lista (consistente con
 * ver esa primera fila ya destacada apenas se abre). */
function elegirResaltado() {
  if (!abierto.value) return
  const m = filtrados.value[resaltado.value] ?? filtrados.value[0]
  if (m && !agotado(m)) elegir(m)
}

function onEscape() {
  abierto.value = false
  query.value = materialSeleccionado.value ? etiqueta(materialSeleccionado.value) : ''
}
</script>

<template>
  <div class="buscador-material">
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.down.prevent="moverResaltado(1)"
      @keydown.up.prevent="moverResaltado(-1)"
      @keydown.enter.prevent="elegirResaltado"
      @keydown.tab="elegirResaltado"
      @keydown.esc="onEscape"
    />
    <svg class="chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
    <ul v-if="abierto" class="opciones">
      <li
        v-for="(m, i) in filtrados"
        :key="m.id"
        :ref="(el) => (opcionEls[i] = el)"
        :class="{ resaltado: i === resaltado && !agotado(m), 'opcion-agotada': agotado(m) }"
        :aria-disabled="agotado(m) || undefined"
        @mousedown.prevent="!agotado(m) && elegir(m)"
        @mouseenter="!agotado(m) && (resaltado = i)"
      >
        <div class="linea-opcion">
          <span class="texto">{{ m.descripcion }}</span>
          <span v-if="agotado(m)" class="stock agotado">Agotado</span>
          <span v-else-if="stockPorMaterial.has(m.id)" class="stock" :class="{ agotado: !stockPorMaterial.get(m.id) }">
            {{ stockPorMaterial.get(m.id) }} {{ m.unidad }}
          </span>
          <span v-else class="unidad">{{ m.unidad }}</span>
        </div>
        <div v-if="m.observaciones" class="nota-opcion">⚠ {{ m.observaciones }}</div>
      </li>
      <li v-if="!filtrados.length" class="vacio">Sin resultados</li>
    </ul>
    <!-- Nota del material ya elegido: se queda visible aunque se cierre la
         lista — es justo el momento en que importa, antes de mandar el vale,
         no solo mientras se busca (ver 20260929: nota de "solo dar salida
         para OPB" que antes solo vivía en Kardex y nadie la veía acá). -->
    <p v-if="materialSeleccionado?.observaciones" class="nota-seleccionado">⚠ {{ materialSeleccionado.observaciones }}</p>
  </div>
</template>

<style scoped>
.buscador-material {
  position: relative;
}
.chevron {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  stroke: var(--color-text-muted);
  stroke-width: 1.8;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
input {
  width: 100%;
  padding: 0.5rem 1.8rem 0.5rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
.opciones {
  position: absolute;
  z-index: 20;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}
.opciones li {
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.linea-opcion {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
}
.nota-opcion {
  margin-top: 0.15rem;
  font-size: 0.75rem;
  color: var(--color-warning, #b45309);
}
.nota-seleccionado {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-warning, #b45309);
}
/* Antes se cortaba con "…" cuando el nombre no entraba en una línea, y el
   almacenero/supervisor no podía ver la descripción completa (ej. distinguir
   PERNO.B32L4 de PERNO.B32L5 por su longitud, que quedaba justo en la parte
   cortada). Ahora pasa a una segunda línea en vez de truncarse. */
.texto {
  min-width: 0;
  white-space: normal;
  overflow-wrap: break-word;
}
.stock {
  margin-left: auto;
  flex-shrink: 0;
  font-weight: 700;
  color: var(--color-success);
  white-space: nowrap;
}
.stock.agotado {
  color: var(--color-danger);
}
.opciones li:hover,
.opciones li.resaltado {
  background: var(--color-surface-2);
}
.opciones li.opcion-agotada {
  opacity: 0.5;
  cursor: not-allowed;
}
.opciones li.opcion-agotada:hover {
  background: none;
}
.opciones li.vacio {
  color: var(--color-text-muted);
  cursor: default;
}
.opciones li.vacio:hover {
  background: none;
}
.unidad {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
</style>

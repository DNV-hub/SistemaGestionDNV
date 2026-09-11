<script setup>
import { computed, ref } from 'vue'

// Buscador de material para registrar un ingreso: a medida que se escribe
// el nombre, muestra los materiales que ya existen (por si es el mismo,
// aunque varíe el color o la dimensión hay que escribir el nombre
// completo y crear uno nuevo — nunca se fusiona por escribir parecido). Si
// no hay ningún material con ese nombre exacto, se puede dar de alta uno
// nuevo ahí mismo, pero el código NO se escribe libre: se elige de los que
// ya existen en el catálogo (los códigos nuevos los da de alta
// Planeamiento), con una sugerencia según la primera palabra del nombre y
// un paso de confirmación para no cargar un código equivocado.
const props = defineProps({
  materiales: { type: Array, default: () => [] },
})

const emit = defineEmits(['seleccionar-existente', 'confirmar-nuevo'])

const query = ref('')
const abierto = ref(false)
const materialElegido = ref(null) // material existente ya confirmado
const creandoNuevo = ref(false)
const nuevoUnidad = ref('')
const nuevoCodigo = ref('')
const confirmado = ref(false)

const codigosExistentes = computed(() => {
  const set = new Set(props.materiales.map((m) => m.codigo))
  return [...set].sort((a, b) => a.localeCompare(b))
})

function primeraPalabra(texto) {
  return texto.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

/** Código más usado entre los materiales que empiezan con la misma
 * primera palabra que lo que se está escribiendo — ej. si escriben
 * "Tuerca…" y ya hay varias "Tuerca X"/"Tuerca Y" con código TUERCA, esa
 * es la sugerencia. Nunca se aplica sola: es solo el valor inicial del
 * selector, el almacenero tiene que confirmarla o cambiarla. */
const codigoSugerido = computed(() => {
  const palabra = primeraPalabra(query.value)
  if (!palabra) return ''
  const conteo = new Map()
  for (const m of props.materiales) {
    if (primeraPalabra(m.descripcion) === palabra) {
      conteo.set(m.codigo, (conteo.get(m.codigo) ?? 0) + 1)
    }
  }
  let mejor = ''
  let mejorConteo = 0
  for (const [codigo, n] of conteo) {
    if (n > mejorConteo) {
      mejor = codigo
      mejorConteo = n
    }
  }
  return mejor
})

const filtrados = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return props.materiales
    .filter((m) => m.codigo.toLowerCase().includes(q) || m.descripcion.toLowerCase().includes(q))
    .slice(0, 12)
})

const hayCoincidenciaExacta = computed(() =>
  props.materiales.some((m) => m.descripcion.toLowerCase() === query.value.trim().toLowerCase())
)

function onInput() {
  abierto.value = true
  materialElegido.value = null
  creandoNuevo.value = false
  confirmado.value = false
}

function elegirExistente(m) {
  materialElegido.value = m
  query.value = m.descripcion
  abierto.value = false
  creandoNuevo.value = false
  emit('seleccionar-existente', m)
}

function empezarNuevo() {
  abierto.value = false
  creandoNuevo.value = true
  nuevoUnidad.value = ''
  nuevoCodigo.value = codigoSugerido.value
  confirmado.value = false
}

function cancelarNuevo() {
  creandoNuevo.value = false
  query.value = ''
}

function confirmarNuevo() {
  if (!query.value.trim() || !nuevoUnidad.value.trim() || !nuevoCodigo.value) return
  confirmado.value = true
  emit('confirmar-nuevo', {
    descripcion: query.value.trim(),
    unidad: nuevoUnidad.value.trim(),
    codigo: nuevoCodigo.value,
  })
}
</script>

<template>
  <div class="material-ingreso-buscador">
    <input
      v-model="query"
      type="text"
      placeholder="Escribe el nombre completo del material…"
      autocomplete="off"
      :disabled="creandoNuevo"
      @input="onInput"
      @focus="abierto = true"
    />

    <ul v-if="abierto && query.trim()" class="opciones">
      <li v-for="m in filtrados" :key="m.id" @mousedown.prevent="elegirExistente(m)">
        <strong>{{ m.codigo }}</strong> — {{ m.descripcion }}
        <span class="unidad">{{ m.unidad }}</span>
      </li>
      <li v-if="!hayCoincidenciaExacta" class="crear-nuevo" @mousedown.prevent="empezarNuevo">
        + Crear material nuevo: "{{ query.trim() }}"
      </li>
      <li v-if="!filtrados.length && hayCoincidenciaExacta" class="vacio">Sin más resultados</li>
    </ul>

    <div v-if="materialElegido" class="material-info">
      <strong>{{ materialElegido.codigo }}</strong> — {{ materialElegido.descripcion }}
      <span class="unidad">{{ materialElegido.unidad }}</span>
    </div>

    <div v-if="creandoNuevo" class="panel-nuevo">
      <p class="titulo-nuevo">Material nuevo: "{{ query.trim() }}"</p>

      <label>
        Unidad
        <input v-model="nuevoUnidad" type="text" placeholder="RLL, UND, KG…" :disabled="confirmado" />
      </label>

      <label>
        Código de catálogo
        <select v-model="nuevoCodigo" :disabled="confirmado">
          <option value="" disabled>Selecciona un código…</option>
          <option v-for="c in codigosExistentes" :key="c" :value="c">{{ c }}</option>
        </select>
        <span v-if="codigoSugerido" class="ayuda-codigo">Sugerido: {{ codigoSugerido }} (verifica que sea el correcto)</span>
      </label>

      <p class="advertencia-codigo">
        ¿Estás seguro de que este es el código correcto? Si no lo sabes, consulta a Planeamiento antes de guardar —
        el código solo se usa para el reporte de pagos, pero tiene que ser el que corresponde.
      </p>

      <div v-if="!confirmado" class="acciones-nuevo">
        <button type="button" class="secundario" @click="cancelarNuevo">Cancelar</button>
        <button type="button" :disabled="!nuevoUnidad.trim() || !nuevoCodigo" @click="confirmarNuevo">
          Confirmar material nuevo
        </button>
      </div>
      <p v-else class="confirmado-aviso">✓ Se creará este material al guardar el ingreso.</p>
    </div>
  </div>
</template>

<style scoped>
.material-ingreso-buscador {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
input {
  width: 100%;
  padding: 0.5rem;
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
  max-height: 240px;
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
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
}
.opciones li:hover {
  background: var(--color-surface-2);
}
.opciones li.vacio {
  color: var(--color-text-muted);
  cursor: default;
}
.opciones li.crear-nuevo {
  color: var(--color-primary);
  font-weight: 600;
  border-top: 1px solid var(--color-border);
}
.unidad {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
.material-info {
  font-size: 0.85rem;
  padding: 0.5rem 0.6rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
}
.panel-nuevo {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-2);
}
.titulo-nuevo {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
}
.panel-nuevo label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--color-text);
}
.panel-nuevo select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
.ayuda-codigo {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
.advertencia-codigo {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-warning);
}
.acciones-nuevo {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.acciones-nuevo button {
  padding: 0.45rem 0.85rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
}
.acciones-nuevo button:disabled {
  opacity: 0.6;
  cursor: default;
}
.acciones-nuevo .secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.confirmado-aviso {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-success);
  font-weight: 600;
}
</style>

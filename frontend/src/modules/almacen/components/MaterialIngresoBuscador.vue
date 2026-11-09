<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import SugerenciasEdp from '../../catalogo/components/SugerenciasEdp.vue'
import { sugerirNombresEdp } from '../../catalogo/composables/useGuiasEdp'
import { listarNombresEdp } from '../../catalogo/services/catalogoService'

// Buscador de material para registrar un ingreso: a medida que se escribe
// el nombre, muestra los materiales que ya existen (por si es el mismo,
// aunque varíe el color o la dimensión hay que escribir el nombre
// completo y crear uno nuevo — nunca se fusiona por escribir parecido). Si
// no hay ningún material con ese nombre exacto, se puede dar de alta uno
// nuevo ahí mismo. El código de catálogo no se usa ni se pide — no es la
// identidad del material ni agrupa nada para el EDP (memoria
// catalogo-codigo-no-es-identidad), y el usuario pidió ocultarlo del todo
// porque en la práctica nadie busca ni identifica materiales por código.
const props = defineProps({
  materiales: { type: Array, default: () => [] },
})

const emit = defineEmits(['seleccionar-existente', 'confirmar-nuevo'])

const query = ref('')
const abierto = ref(false)
// Índice resaltado dentro de la lista visible — ojo que acá la lista no es
// solo `filtrados`: al final puede venir la opción "+ Crear material nuevo",
// que también tiene que poder elegirse con teclado (ver opcionesNavegables).
const resaltado = ref(-1)
const opcionEls = ref([])
const materialElegido = ref(null) // material existente ya confirmado
const creandoNuevo = ref(false)
const nuevoUnidad = ref('')
// Antes esto se fijaba en 'ninguna' sin preguntar y el almacenero recién
// podía marcarlo desde Catálogo, en un ingreso posterior — así el primer
// lote (justo el que trae la guía con las medidas reales) nunca pedía
// ancho/largo. Se pregunta acá porque es quien tiene el material en mano.
const nuevoTipoConversion = ref('ninguna')
// Medidas de la pieza, pedidas aquí mismo para que no se pasen por alto: la
// longitud (barras, cables) o el ancho × largo (rollos). Pasan a la línea del
// ingreso al confirmar.
const nuevoAncho = ref('')
const nuevoLargo = ref('')
// % de stock mínimo (0.2 = 20%) — mismo criterio que en Catálogo, pero
// puesto por quien sabe el tamaño real del lote que está entrando.
const nuevoStockMinimoPct = ref(0.2)
const confirmado = ref(false)
// Nombre EDP del material nuevo (opcional). Se sugiere según lo que dice la
// guía, pero puede dejarse otro o ninguno: las descripciones por guía son
// opciones, no una lista cerrada.
const nuevoNombreEdpId = ref('')
const NUEVO_EDP = '__nuevo__'
const nuevoNombreEdpTexto = ref('')
const nombresEdp = ref([])
onMounted(async () => {
  try {
    nombresEdp.value = await listarNombresEdp()
  } catch (e) {
    console.error('No se pudieron cargar los nombres EDP', e)
  }
})

const filtrados = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return props.materiales
    .filter((m) => m.descripcion.toLowerCase().includes(q))
    .slice(0, 12)
})

const hayCoincidenciaExacta = computed(() =>
  props.materiales.some((m) => m.descripcion.toLowerCase() === query.value.trim().toLowerCase())
)

// Cuántas filas hay para navegar con flechas: los materiales filtrados más,
// al final, la opción "+ Crear material nuevo" (si no hay ya una coincidencia
// exacta con ese nombre). Un índice >= filtrados.length cae en esa opción.
const totalNavegable = computed(() => filtrados.value.length + (hayCoincidenciaExacta.value ? 0 : 1))

function onInput() {
  abierto.value = true
  materialElegido.value = null
  creandoNuevo.value = false
  confirmado.value = false
  resaltado.value = 0
}

function onFocus() {
  abierto.value = true
  resaltado.value = totalNavegable.value ? 0 : -1
}

function moverResaltado(delta) {
  if (!abierto.value || !query.value.trim() || !totalNavegable.value) return
  resaltado.value = (resaltado.value + delta + totalNavegable.value) % totalNavegable.value
  nextTick(() => opcionEls.value[resaltado.value]?.scrollIntoView({ block: 'nearest' }))
}

function elegirResaltado() {
  if (!abierto.value || !query.value.trim()) return
  const i = resaltado.value < 0 ? 0 : resaltado.value
  if (i < filtrados.value.length) elegirExistente(filtrados.value[i])
  else if (!hayCoincidenciaExacta.value) empezarNuevo()
}

function onEscape() {
  abierto.value = false
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
  nuevoTipoConversion.value = 'ninguna'
  nuevoAncho.value = ''
  nuevoLargo.value = ''
  // "BARRA HELICOIDAL D32MM L=3.60": la guía ya dice el largo de la pieza.
  const largoGuia = /\bL\s*=\s*(\d+(?:[.,]\d+)?)/i.exec(query.value)
  if (largoGuia) {
    nuevoTipoConversion.value = 'longitud'
    nuevoLargo.value = largoGuia[1].replace(',', '.')
  }
  nuevoStockMinimoPct.value = 0.2
  // Si lo escrito coincide casi exacto con una guía, ya viene elegido.
  const mejor = sugerirNombresEdp(query.value, 1)[0]
  nuevoNombreEdpId.value = mejor && mejor.puntaje >= 6 ? mejor.nombreEdpId : ''
  nuevoNombreEdpTexto.value = ''
  confirmado.value = false
}

function cancelarNuevo() {
  creandoNuevo.value = false
  query.value = ''
}

const claveEdp = (s) => String(s).toUpperCase().replace(/[^A-Z0-9/.]+/g, '')
const nombreEdpListo = computed(
  () => !!nuevoNombreEdpId.value && (nuevoNombreEdpId.value !== NUEVO_EDP || !!nuevoNombreEdpTexto.value.trim())
)

const medidasListas = computed(() => {
  if (nuevoTipoConversion.value === 'longitud') return Number(nuevoLargo.value) > 0
  if (nuevoTipoConversion.value === 'area') return Number(nuevoLargo.value) > 0 && Number(nuevoAncho.value) > 0
  return true
})

function confirmarNuevo() {
  if (!query.value.trim() || !nuevoUnidad.value.trim() || !nombreEdpListo.value || !medidasListas.value) return
  // Si el nombre EDP "nuevo" ya existe con esa escritura, se usa el existente.
  let edpId = nuevoNombreEdpId.value
  let edpNuevo = null
  if (edpId === NUEVO_EDP) {
    const texto = nuevoNombreEdpTexto.value.trim()
    const ya = nombresEdp.value.find((n) => claveEdp(n.nombre) === claveEdp(texto))
    edpId = ya ? ya.id : null
    edpNuevo = ya ? null : texto
  }
  confirmado.value = true
  emit('confirmar-nuevo', {
    descripcion: query.value.trim(),
    unidad: nuevoUnidad.value.trim(),
    tipo_conversion: nuevoTipoConversion.value,
    ancho: nuevoTipoConversion.value === 'area' ? nuevoAncho.value : '',
    largo: nuevoTipoConversion.value === 'ninguna' ? '' : nuevoLargo.value,
    stock_minimo_pct: Number(nuevoStockMinimoPct.value) || 0.2,
    descripcion_edp_id: edpId,
    nombre_edp_nuevo: edpNuevo,
    // Lo que se escribió es lo que dice la guía: pasa a ser una opción de ese nombre EDP.
    guia: query.value.trim(),
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
      @focus="onFocus"
      @keydown.down.prevent="moverResaltado(1)"
      @keydown.up.prevent="moverResaltado(-1)"
      @keydown.enter.prevent="elegirResaltado"
      @keydown.tab="elegirResaltado"
      @keydown.esc="onEscape"
    />

    <ul v-if="abierto && query.trim()" class="opciones">
      <li
        v-for="(m, i) in filtrados"
        :key="m.id"
        :ref="(el) => (opcionEls[i] = el)"
        :class="{ resaltado: i === resaltado }"
        @mousedown.prevent="elegirExistente(m)"
        @mouseenter="resaltado = i"
      >
        {{ m.descripcion }}
        <span class="unidad">{{ m.unidad }}</span>
      </li>
      <li
        v-if="!hayCoincidenciaExacta"
        class="crear-nuevo"
        :ref="(el) => (opcionEls[filtrados.length] = el)"
        :class="{ resaltado: filtrados.length === resaltado }"
        @mousedown.prevent="empezarNuevo"
        @mouseenter="resaltado = filtrados.length"
      >
        + Crear material nuevo: "{{ query.trim() }}"
      </li>
      <li v-if="!filtrados.length && hayCoincidenciaExacta" class="vacio">Sin más resultados</li>
    </ul>

    <div v-if="materialElegido" class="material-info">
      {{ materialElegido.descripcion }}
      <span class="unidad">{{ materialElegido.unidad }}</span>
    </div>

    <div v-if="creandoNuevo" class="panel-nuevo">
      <p class="titulo-nuevo">
        <span class="etiqueta-nuevo">Material nuevo</span>
        {{ query.trim() }}
      </p>

      <div class="fila-2">
        <label>
          Unidad
          <input v-model="nuevoUnidad" type="text" placeholder="UND, KG, RLL…" :disabled="confirmado" />
        </label>

        <label>
          ¿Se mide distinto a como se cuenta?
          <select v-model="nuevoTipoConversion" :disabled="confirmado">
            <option value="ninguna">No, se cuenta tal cual (UND, KG…)</option>
            <option value="area">Por área: rollos de malla (ancho × largo)</option>
            <option value="longitud">Por longitud: barras o cables (largo)</option>
          </select>
        </label>
      </div>

      <div v-if="nuevoTipoConversion === 'longitud'" class="fila-2">
        <label>
          Longitud de cada pieza (m)
          <input v-model="nuevoLargo" type="number" step="0.01" min="0.01" placeholder="Ej. 3.60" :disabled="confirmado" />
        </label>
      </div>
      <div v-else-if="nuevoTipoConversion === 'area'" class="fila-2">
        <label>
          Ancho del rollo (m)
          <input v-model="nuevoAncho" type="number" step="0.01" min="0.01" :disabled="confirmado" />
        </label>
        <label>
          Largo del rollo (m)
          <input v-model="nuevoLargo" type="number" step="0.01" min="0.01" :disabled="confirmado" />
        </label>
      </div>

      <label>
        ¿A qué nombre EDP se agrupa?
        <select v-model="nuevoNombreEdpId" :disabled="confirmado">
          <option value="">Elige el nombre EDP…</option>
          <option :value="NUEVO_EDP">+ Crear un nombre EDP nuevo</option>
          <option v-for="n in nombresEdp" :key="n.id" :value="n.id">{{ n.nombre }}</option>
        </select>
        <input
          v-if="nuevoNombreEdpId === NUEVO_EDP"
          v-model="nuevoNombreEdpTexto"
          type="text"
          placeholder="Nombre EDP nuevo (ej. MALLA MINAX 80/5)"
          :disabled="confirmado"
        />
        <SugerenciasEdp v-if="!confirmado" :texto="query" :elegido="nuevoNombreEdpId" @elegir="(id) => (nuevoNombreEdpId = id)" />
      </label>

      <details v-if="!confirmado" class="mas-opciones">
        <summary>Más opciones</summary>
        <label>
          Aviso de stock bajo (fracción del lote)
          <input v-model="nuevoStockMinimoPct" type="number" step="0.01" min="0" max="1" placeholder="0.2" />
          <span class="ayuda-codigo">0.2 = se avisa cuando quede el 20% de este lote.</span>
        </label>
      </details>

      <div v-if="!confirmado" class="acciones-nuevo">
        <button type="button" class="secundario" @click="cancelarNuevo">Cancelar</button>
        <button type="button" :disabled="!nuevoUnidad.trim() || !nombreEdpListo || !medidasListas" @click="confirmarNuevo">
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
.opciones li:hover,
.opciones li.resaltado {
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
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}
.titulo-nuevo {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}
.etiqueta-nuevo {
  display: inline-block;
  margin-right: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}
.fila-2 {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 0.85rem;
}
.panel-nuevo label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}
.panel-nuevo select {
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
  font-weight: 400;
}
.mas-opciones summary {
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
.mas-opciones label {
  margin-top: 0.6rem;
  max-width: 280px;
}
.ayuda-codigo {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--color-text-muted);
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

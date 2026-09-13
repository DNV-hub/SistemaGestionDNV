<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CatalogoTabs from '../../components/CatalogoTabs.vue'
import TablaCatalogo from '../components/TablaCatalogo.vue'
import { CATALOGOS_RDC, OPCIONES_FIJAS } from '../definicionesCatalogos'
import {
  listarCatalogo,
  crearFilaCatalogo,
  actualizarFilaCatalogo,
  eliminarFilaCatalogo,
  listarUsuariosVinculables,
} from '../services/catalogosRdcService'

const route = useRoute()
const router = useRouter()

const cargando = ref(true)
// Un error por catálogo, no uno solo global: antes, si UNA de las nueve
// tablas fallaba (pasó con la biblioteca de pernos, que no tiene columna
// `orden` y se pedía ordenada por esa columna igual que las demás), el
// `Promise.all` entero rechazaba y ninguno de los otros ocho catálogos
// llegaba a mostrarse — parecía que todo estaba roto cuando solo uno lo
// estaba. Con `allSettled` cada catálogo vive o muere por su cuenta.
const erroresPorCatalogo = reactive({})
const errorUsuarios = ref('')
// clave del catálogo -> sus filas. Se cargan los nueve de una sola vez al
// entrar (son catálogos chicos de referencia, no algo que crezca sin límite)
// para que cambiar de pestaña sea instantáneo, sin ida y vuelta a la red.
const datos = reactive({})
const usuarios = ref([])

async function cargarTodo() {
  cargando.value = true
  const [resultadosCatalogos, resultadoUsuarios] = await Promise.all([
    Promise.allSettled(CATALOGOS_RDC.map((def) => listarCatalogo(def.tabla, { orderBy: def.ordenarPor ?? 'orden' }))),
    Promise.allSettled([listarUsuariosVinculables()]),
  ])
  CATALOGOS_RDC.forEach((def, i) => {
    const r = resultadosCatalogos[i]
    if (r.status === 'fulfilled') {
      datos[def.clave] = r.value
      erroresPorCatalogo[def.clave] = ''
    } else {
      datos[def.clave] = []
      erroresPorCatalogo[def.clave] = r.reason?.message ?? 'No se pudo cargar este catálogo.'
    }
  })
  const [usuariosResultado] = resultadoUsuarios
  if (usuariosResultado.status === 'fulfilled') usuarios.value = usuariosResultado.value
  else errorUsuarios.value = usuariosResultado.reason?.message ?? 'No se pudieron cargar las cuentas para vincular.'
  cargando.value = false
}
onMounted(cargarTodo)

// Las opciones de un <select> incluyen SIEMPRE lo inactivo (marcado con una
// etiqueta), nunca lo esconden: si una fila ya apuntaba a un sector o una
// cuenta que después se desactivó, filtrarlo haría que esa fila se vea como
// si su vínculo se hubiera borrado solo, cuando en realidad sigue ahí.
const fuentesOpciones = computed(() => ({
  sectores: (datos.sectores ?? []).map((s) => ({ value: s.id, label: s.activo ? s.nombre : `${s.nombre} (inactivo)` })),
  usuarios: usuarios.value.map((u) => ({
    value: u.id,
    label: [u.estado !== 'activo' ? `${u.nombre} (inactivo)` : u.nombre, u.rol_nombre].filter(Boolean).join(' — '),
  })),
  ...OPCIONES_FIJAS,
}))

const claveActiva = ref(typeof route.query.tab === 'string' ? route.query.tab : CATALOGOS_RDC[0].clave)
function irA(clave) {
  claveActiva.value = clave
  router.replace({ query: { ...route.query, tab: clave } })
}
const definicionActiva = computed(() => CATALOGOS_RDC.find((d) => d.clave === claveActiva.value) ?? CATALOGOS_RDC[0])
const errorActivo = computed(() => erroresPorCatalogo[claveActiva.value] || '')

// Prefijos, Partidas EDT y Pernos son catálogos "por frente" (así los pidió
// el modelo original): antes de ver o tocar sus filas hay que elegir uno.
const frenteSeleccionadoId = ref(null)
// `frentes` no tiene columna `orden` (a diferencia de los demás catálogos
// del RDC): se ordena alfabéticamente.
const frentesOrdenados = computed(() => [...(datos.frentes ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre)))

const filasVisibles = computed(() => {
  const todas = datos[definicionActiva.value.clave] ?? []
  if (!definicionActiva.value.porFrente) return todas
  if (!frenteSeleccionadoId.value) return []
  return todas.filter((f) => f.frente_id === frenteSeleccionadoId.value)
})

const nuevaFilaBase = computed(() => (definicionActiva.value.porFrente ? { frente_id: frenteSeleccionadoId.value } : {}))

async function alCrear(datosFila) {
  const def = definicionActiva.value
  const fila = await crearFilaCatalogo(def.tabla, datosFila)
  datos[def.clave] = [...(datos[def.clave] ?? []), fila]
}
async function alActualizar(id, cambios) {
  await actualizarFilaCatalogo(definicionActiva.value.tabla, id, cambios)
}
async function alEliminar(id) {
  const def = definicionActiva.value
  await eliminarFilaCatalogo(def.tabla, id)
  datos[def.clave] = (datos[def.clave] ?? []).filter((f) => f.id !== id)
}
</script>

<template>
  <div class="pagina">
    <CatalogoTabs />
    <header class="cabecera">
      <h1>Catálogos RDC</h1>
    </header>

    <nav class="subtabs">
      <button
        v-for="def in CATALOGOS_RDC"
        :key="def.clave"
        type="button"
        class="subtab"
        :class="{ activo: def.clave === claveActiva }"
        @click="irA(def.clave)"
      >
        {{ def.etiqueta }}
      </button>
    </nav>

    <p v-if="errorUsuarios" class="error">{{ errorUsuarios }}</p>
    <p v-if="errorActivo" class="error">{{ errorActivo }}</p>
    <p v-if="cargando">Cargando…</p>

    <template v-else>
      <div v-if="definicionActiva.porFrente" class="selector-frente">
        <label>
          Frente:
          <select v-model="frenteSeleccionadoId">
            <option :value="null">— Elige un frente —</option>
            <option v-for="f in frentesOrdenados" :key="f.id" :value="f.id">{{ f.estado === 'activo' ? f.nombre : `${f.nombre} (${f.estado})` }}</option>
          </select>
        </label>
      </div>

      <p v-if="definicionActiva.porFrente && !frenteSeleccionadoId" class="ayuda">
        Elige un frente para ver y editar sus {{ definicionActiva.etiqueta.toLowerCase() }}.
      </p>

      <TablaCatalogo
        v-else
        :key="definicionActiva.clave + (frenteSeleccionadoId ?? '')"
        :columnas="definicionActiva.columnas"
        :filas="filasVisibles"
        :campo-activo="definicionActiva.campoActivo"
        :opciones="fuentesOpciones"
        :nueva-fila-base="nuevaFilaBase"
        :solo-lectura="!!definicionActiva.soloLectura"
        :al-crear="alCrear"
        :al-actualizar="alActualizar"
        :al-eliminar="alEliminar"
      />
    </template>
  </div>
</template>

<style scoped>
.pagina {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.subtabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
}
.subtab {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.subtab:hover {
  color: var(--color-text);
}
.subtab.activo {
  background: var(--color-primary);
  color: var(--color-primary-ink);
  border-color: var(--color-primary);
}
.selector-frente {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.selector-frente select {
  margin-left: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
}
.ayuda {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

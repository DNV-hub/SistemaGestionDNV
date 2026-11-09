<script setup>
import { computed, onMounted, ref } from 'vue'
import TablaCatalogo from '../components/TablaCatalogo.vue'
import ListaSimpleCatalogo from '../components/ListaSimpleCatalogo.vue'
import { CATALOGOS_RDC, OPCIONES_FIJAS } from '../definicionesCatalogos'
import {
  listarCatalogo,
  crearFilaCatalogo,
  actualizarFilaCatalogo,
  eliminarFilaCatalogo,
  listarUsuariosVinculables,
} from '../services/catalogosRdcService'
import { usarCabeceraPlaneamiento } from '../../../planeamiento/composables/useCabeceraPlaneamiento'

// Panel genérico de un catálogo (Capataces, Supervisores, Sectores,
// Maquinaria, Partidas, Prefijos, Redline, Pernos…) para la pantalla de
// Catálogo. Carga solo el catálogo elegido (y lo que necesite para sus
// selects) — antes CatalogosRdcView cargaba los nueve de una vez.
const props = defineProps({
  clave: { type: String, required: true },
})

// Capataces tiene su propia pantalla desde siempre (no está en
// CATALOGOS_RDC): se define igual que la tenía CapatacesView.
const DEF_CAPATACES = {
  clave: 'capataces',
  etiqueta: 'Capataces',
  tabla: 'rdc_capataces',
  campoActivo: 'activo',
  columnas: [
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
    { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
  ],
}
const DEFS = [DEF_CAPATACES, ...CATALOGOS_RDC]
const def = computed(() => DEFS.find((d) => d.clave === props.clave) ?? DEF_CAPATACES)

const LISTAS_SIMPLES = ['capataces', 'sectores', 'supervisores', 'maquinarias']
const esLista = computed(() => LISTAS_SIMPLES.includes(def.value.clave))

const ETIQUETA_NUEVO = {
  capataces: ['Nuevo capataz', 'capataz'],
  supervisores: ['Nuevo supervisor', 'supervisor'],
  sectores: ['Nuevo sector', 'sector'],
  maquinarias: ['Nueva maquinaria', 'tipo de maquinaria'],
  partidasEstandar: ['Nueva partida', 'partida'],
  partidasEdt: ['Nueva partida EDT', 'partida EDT'],
  prefijos: ['Nuevo prefijo', 'prefijo'],
  redline: ['Nuevo supervisor redline', 'supervisor redline'],
  pernos: ['Nuevo perno', 'perno'],
}

const cargando = ref(true)
const error = ref('')
const filas = ref([])
const sectores = ref([])
const usuarios = ref([])
const frentes = ref([])
const frenteSeleccionadoId = ref('')
const busqueda = ref('')

onMounted(async () => {
  const d = def.value
  try {
    const tareas = [listarCatalogo(d.tabla, { orderBy: d.ordenarPor ?? 'orden' })]
    // Selects de apoyo: solo los que este catálogo necesita.
    if (d.clave === 'frentes') tareas.push(listarCatalogo('sectores'))
    if (d.clave === 'supervisores') tareas.push(listarUsuariosVinculables())
    if (d.porFrente) tareas.push(listarCatalogo('frentes', { orderBy: 'nombre' }))
    const [principal, extra] = await Promise.all(tareas)
    filas.value = principal
    if (d.clave === 'frentes') sectores.value = extra
    if (d.clave === 'supervisores') usuarios.value = extra
    if (d.porFrente) frentes.value = extra
  } catch (e) {
    console.error(e)
    error.value = e?.message ?? 'No se pudo cargar este catálogo.'
  } finally {
    cargando.value = false
  }
})

// Las opciones de un <select> incluyen SIEMPRE lo inactivo (marcado con una
// etiqueta), nunca lo esconden: una fila que ya apuntaba a algo desactivado
// no debe verse como si su vínculo se hubiera borrado solo.
const opciones = computed(() => ({
  sectores: sectores.value.map((s) => ({ value: s.id, label: s.activo ? s.nombre : `${s.nombre} (inactivo)` })),
  usuarios: usuarios.value.map((u) => ({
    value: u.id,
    label: [u.estado !== 'activo' ? `${u.nombre} (inactivo)` : u.nombre, u.rol_nombre].filter(Boolean).join(' — '),
  })),
  ...OPCIONES_FIJAS,
}))

const filasVisibles = computed(() => {
  let lista = filas.value
  if (def.value.porFrente) {
    if (!frenteSeleccionadoId.value) return []
    lista = lista.filter((f) => f.frente_id === frenteSeleccionadoId.value)
  }
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return lista
  return lista.filter((f) =>
    def.value.columnas.some((c) => c.tipo === 'texto' && (f[c.clave] ?? '').toString().toLowerCase().includes(q))
  )
})
const nuevaFilaBase = computed(() => (def.value.porFrente ? { frente_id: frenteSeleccionadoId.value } : {}))

async function alCrear(datos) {
  const fila = await crearFilaCatalogo(def.value.tabla, datos)
  filas.value = [...filas.value, fila]
}
async function alActualizar(id, cambios) {
  await actualizarFilaCatalogo(def.value.tabla, id, cambios)
}
async function alEliminar(id) {
  await eliminarFilaCatalogo(def.value.tabla, id)
  filas.value = filas.value.filter((f) => f.id !== id)
}

const frentesOrdenados = computed(() => frentes.value)

function enfocarAlta() {
  document.querySelector('.pl-lrow.alta input, .fila-nueva input')?.focus()
}
usarCabeceraPlaneamiento(
  () => {
    const e = ETIQUETA_NUEVO[def.value.clave]
    return {
      texto: e ? e[0] : 'Nuevo elemento',
      visible: !def.value.soloLectura,
      deshabilitado: !!def.value.porFrente && !frenteSeleccionadoId.value,
      ejecutar: enfocarAlta,
    }
  }
)
</script>

<template>
  <div class="pl-col">
    <div class="titulo-fila">
      <h2 class="titulo">{{ def.etiqueta }}</h2>
    </div>

    <div class="pl-filters">
      <label class="pl-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input v-model="busqueda" type="search" placeholder="Buscar" aria-label="Buscar" />
      </label>
      <select v-if="def.porFrente" v-model="frenteSeleccionadoId" class="pl-sel frente-sel" aria-label="Frente">
        <option value="">— Elige un frente —</option>
        <option v-for="f in frentesOrdenados" :key="f.id" :value="f.id">{{ f.estado === 'activo' ? f.nombre : `${f.nombre} (${f.estado})` }}</option>
      </select>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando" class="pl-empty">Cargando…</p>

    <template v-else>
      <p v-if="def.porFrente && !frenteSeleccionadoId" class="pl-empty">
        Elige un frente para ver y editar sus {{ def.etiqueta.toLowerCase() }}.
      </p>

      <ListaSimpleCatalogo
        v-else-if="esLista"
        :key="def.clave"
        :columnas="def.columnas"
        :filas="filasVisibles"
        :campo-activo="def.campoActivo"
        :opciones="opciones"
        :nueva-fila-base="nuevaFilaBase"
        :etiqueta-nueva="(ETIQUETA_NUEVO[def.clave] ?? [])[1] ?? 'elemento'"
        :al-crear="alCrear"
        :al-actualizar="alActualizar"
        :al-eliminar="alEliminar"
      />

      <TablaCatalogo
        v-else
        :key="def.clave + frenteSeleccionadoId"
        :columnas="def.columnas"
        :filas="filasVisibles"
        :campo-activo="def.campoActivo"
        :opciones="opciones"
        :nueva-fila-base="nuevaFilaBase"
        :solo-lectura="!!def.soloLectura"
        :al-crear="alCrear"
        :al-actualizar="alActualizar"
        :al-eliminar="alEliminar"
      />
    </template>
  </div>
</template>

<style scoped>
.titulo-fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.titulo {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--p-text);
}
.frente-sel {
  min-width: 260px;
}
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
</style>

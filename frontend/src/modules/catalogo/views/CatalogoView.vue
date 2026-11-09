<script setup>
import { computed, onMounted, ref } from 'vue'
import { useCatalogoStore } from '../store/catalogo'
import { useAuthStore } from '../../../store/auth'
import MaterialFormModal from '../components/MaterialFormModal.vue'
import CategoriasModal from '../components/CategoriasModal.vue'
import NombresEdpModal from '../components/NombresEdpModal.vue'
import ImportarExcelModal from '../components/ImportarExcelModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'
import { descargarExcel } from '../../../utils/exportarExcel'
import { usarCabeceraPlaneamiento } from '../../planeamiento/composables/useCabeceraPlaneamiento'

// Panel "Materiales" de la pantalla de Catálogo (lista maestra a la
// izquierda, ver CatalogoPlaneamientoView.vue). Misma lógica de siempre:
// solo cambia cómo se presenta.
const catalogo = useCatalogoStore()
const auth = useAuthStore()

const busqueda = ref('')
const mostrarModal = ref(false)
const mostrarModalCategorias = ref(false)
const mostrarModalNombresEdp = ref(false)
const mostrarModalImportar = ref(false)
const materialEnEdicion = ref(null)
const aviso = ref('')

const puedeCrear = computed(() => auth.tienePermiso('catalogo.crear'))
const puedeEditar = computed(
  () => auth.tienePermiso('catalogo.editar') || auth.tienePermiso('catalogo.desactivar')
)
const puedeGestionarCategorias = computed(
  () => auth.tienePermiso('catalogo.crear') || auth.tienePermiso('catalogo.editar')
)
const puedeImportar = computed(() => auth.tienePermiso('catalogo.importar_exportar'))
const puedeEliminar = computed(() => auth.tienePermiso('catalogo.desactivar'))
const mostrarColumnaAcciones = computed(() => puedeEditar.value || puedeEliminar.value)

const filtroCategoriaId = ref('')
const filtroEstado = ref('')
// Catálogo incompleto: "Sin categoría" / "Sin nombre EDP" filtran a esos
// materiales puntuales (antes eran tarjetas clicables).
const filtroIncompleto = ref('')

const sinCategoriaCount = computed(() => catalogo.materiales.filter((m) => !m.categoria_id).length)
const sinNombreEdpCount = computed(() => catalogo.materiales.filter((m) => !m.descripcion_edp_id).length)

const materialesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return catalogo.materiales
    .filter((m) => {
      if (filtroCategoriaId.value && m.categoria_id !== filtroCategoriaId.value) return false
      if (filtroEstado.value && m.estado !== filtroEstado.value) return false
      if (filtroIncompleto.value === 'sin_categoria' && m.categoria_id) return false
      if (filtroIncompleto.value === 'sin_nombre_edp' && m.descripcion_edp_id) return false
      if (!q) return true
      return (
        m.descripcion.toLowerCase().includes(q) ||
        (m.nombres_edp?.nombre ?? '').toLowerCase().includes(q) ||
        (m.categorias?.nombre ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion))
})

onMounted(() => catalogo.cargar())

function abrirCrear() {
  materialEnEdicion.value = null
  mostrarModal.value = true
}

function abrirEditar(material) {
  materialEnEdicion.value = material
  mostrarModal.value = true
}

function cerrarModal() {
  mostrarModal.value = false
  materialEnEdicion.value = null
}

async function guardar(payload) {
  aviso.value = ''
  if (materialEnEdicion.value) {
    await catalogo.actualizar(materialEnEdicion.value.id, payload)
    aviso.value = 'Material actualizado.'
  } else {
    await catalogo.crear(payload)
    aviso.value = 'Material creado.'
  }
  cerrarModal()
}

async function crearCategoria(payload) {
  await catalogo.crearCategoria(payload)
}

async function crearNombreEdp(payload) {
  await catalogo.crearNombreEdp(payload)
}

async function importarMateriales(payload) {
  const creados = await catalogo.importarMateriales(payload)
  aviso.value = [aviso.value, `Se crearon ${creados.length} materiales.`].filter(Boolean).join(' ')
}

async function actualizarConversion(aActualizar) {
  const { ok, fallidos } = await catalogo.importarActualizacionesConversion(aActualizar)
  const mensaje = fallidos.length
    ? `Se actualizó la conversión de ${ok} materiales (${fallidos.length} fallaron).`
    : `Se actualizó la conversión de ${ok} materiales.`
  aviso.value = [aviso.value, mensaje].filter(Boolean).join(' ')
}

function exportarCatalogo() {
  descargarExcel(`catalogo_${new Date().toISOString().slice(0, 10)}.xlsx`, [
    {
      nombre: 'Catálogo',
      filas: catalogo.materiales.map((m) => ({
        'DESCRIPCION ALMACEN': m.descripcion,
        'UNIDAD ALMACEN': m.unidad,
        'DESCRIPCION EDP': m.nombres_edp?.nombre ?? '',
        'UNIDAD EDP': m.unidad_edp ?? '',
        CATEGORIA: m.categorias?.nombre ?? '',
        'STOCK MINIMO': m.stock_minimo_pct ?? '',
        CONVERSION: m.tipo_conversion ?? 'ninguna',
        ESTADO: m.estado,
      })),
    },
  ])
}

async function eliminar(material) {
  if (!confirm(`¿Eliminar "${material.descripcion}"?`)) return
  aviso.value = ''
  const resultado = await catalogo.eliminar(material.id)
  aviso.value = resultado.eliminado
    ? 'Material eliminado.'
    : 'Este material ya tiene movimientos registrados (stock, vales, etc.), así que no se puede eliminar: se desactivó en su lugar.'
}

// Interruptor "Activo": mismo cambio de estado que ya hacía el formulario.
const cambiandoEstado = ref(null)
async function alternarActivo(m, ev) {
  const activo = ev.target.checked
  cambiandoEstado.value = m.id
  aviso.value = ''
  try {
    await catalogo.actualizar(m.id, { estado: activo ? 'activo' : 'inactivo' })
  } catch (e) {
    ev.target.checked = !activo
    console.error(e)
    aviso.value = 'No se pudo cambiar el estado.'
  } finally {
    cambiandoEstado.value = null
  }
}

usarCabeceraPlaneamiento(
  () => ({ texto: 'Nuevo material', visible: puedeCrear.value, ejecutar: abrirCrear }),
  () =>
    puedeGestionarCategorias.value
      ? [
          { texto: 'Categorías', ejecutar: () => (mostrarModalCategorias.value = true) },
          { texto: 'Nombres EDP', ejecutar: () => (mostrarModalNombresEdp.value = true) },
        ]
      : []
)
</script>

<template>
  <div class="pl-col">
    <div class="titulo-fila">
      <h2 class="titulo">Materiales</h2>
      <div class="pl-acts">
        <button v-if="puedeImportar" type="button" class="pl-ghost" @click="exportarCatalogo">Exportar Excel</button>
        <button v-if="puedeImportar" type="button" class="pl-ghost" @click="aviso = ''; mostrarModalImportar = true">
          Importar Excel
        </button>
      </div>
    </div>

    <div class="pl-filters">
      <label class="pl-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input v-model="busqueda" type="search" placeholder="Buscar por descripción o categoría…" aria-label="Buscar material" />
      </label>
      <select v-model="filtroCategoriaId" class="pl-sel" aria-label="Categoría">
        <option value="">Categoría: Todas</option>
        <option v-for="c in catalogo.categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>
      <select v-model="filtroEstado" class="pl-sel" aria-label="Estado">
        <option value="">Estado: Todos</option>
        <option value="activo">Activo</option>
        <option value="inactivo">Inactivo</option>
      </select>
      <select v-model="filtroIncompleto" class="pl-sel" aria-label="Completitud">
        <option value="">Completitud: Todos</option>
        <option value="sin_categoria">Sin categoría ({{ sinCategoriaCount }})</option>
        <option value="sin_nombre_edp">Sin nombre EDP ({{ sinNombreEdpCount }})</option>
      </select>
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="catalogo.error" class="error">{{ catalogo.error }}</p>
    <p v-if="catalogo.cargando" class="pl-empty">Cargando materiales…</p>

    <div v-else class="pl-table">
      <div class="in">
        <div class="pl-th cols" :class="{ 'con-acciones': mostrarColumnaAcciones }">
          <span>MATERIAL</span><span>CATEGORÍA</span><span>U.M.</span><span class="pl-c">ACTIVO</span>
          <span v-if="mostrarColumnaAcciones"></span>
        </div>
        <div v-for="m in materialesFiltrados" :key="m.id" class="pl-tr cols" :class="{ 'con-acciones': mostrarColumnaAcciones }">
          <span class="wrap">
            <b class="nombre">{{ m.descripcion }}</b>
            <span v-if="m.nombres_edp?.nombre" class="edp">Nombre EDP: {{ m.nombres_edp.nombre }}</span>
          </span>
          <span>{{ m.categorias?.nombre ?? '—' }}</span>
          <span>{{ m.unidad }}</span>
          <span class="pl-c">
            <input
              type="checkbox"
              class="pl-sw"
              role="switch"
              aria-label="Activo"
              :checked="m.estado === 'activo'"
              :disabled="!puedeEditar || cambiandoEstado === m.id"
              @change="alternarActivo(m, $event)"
            />
          </span>
          <span v-if="mostrarColumnaAcciones" class="acciones">
            <BotonIcono v-if="puedeEditar" variante="editar" titulo="Editar" @click="abrirEditar(m)" />
            <BotonIcono v-if="puedeEliminar" variante="eliminar" titulo="Eliminar" @click="eliminar(m)" />
          </span>
        </div>
        <div v-if="!materialesFiltrados.length" class="pl-vacio">
          {{ catalogo.materiales.length ? 'Ningún material coincide con la búsqueda o el filtro.' : 'No hay materiales para mostrar.' }}
        </div>
      </div>
    </div>

    <MaterialFormModal
      v-if="mostrarModal"
      :material="materialEnEdicion"
      :categorias="catalogo.categorias"
      :nombres-edp="catalogo.nombresEdp"
      :puede-editar-estado="auth.tienePermiso('catalogo.desactivar') || auth.tienePermiso('catalogo.editar')"
      @guardar="guardar"
      @cerrar="cerrarModal"
    />

    <CategoriasModal
      v-if="mostrarModalCategorias"
      :categorias="catalogo.categorias"
      @crear="crearCategoria"
      @cerrar="mostrarModalCategorias = false"
    />

    <NombresEdpModal
      v-if="mostrarModalNombresEdp"
      :nombres-edp="catalogo.nombresEdp"
      @crear="crearNombreEdp"
      @cerrar="mostrarModalNombresEdp = false"
    />

    <ImportarExcelModal
      v-if="mostrarModalImportar"
      :materiales-existentes="catalogo.materiales.map((m) => ({ id: m.id, descripcion: m.descripcion }))"
      :nombres-edp-existentes="catalogo.nombresEdp"
      :categorias-existentes="catalogo.categorias"
      @importar="importarMateriales"
      @actualizar-conversion="actualizarConversion"
      @cerrar="mostrarModalImportar = false"
    />
  </div>
</template>

<style scoped>
.titulo-fila {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
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
.cols {
  grid-template-columns: minmax(260px, 1fr) 200px 80px 90px;
}
.cols.con-acciones {
  grid-template-columns: minmax(260px, 1fr) 200px 80px 90px 90px;
}
.nombre {
  display: block;
  font-weight: 700;
  text-transform: uppercase;
}
.edp {
  display: block;
  font-size: 12px;
  color: var(--p-faint);
  font-weight: 500;
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}
.aviso {
  color: var(--p-ok-fg);
  font-size: 14px;
  margin: 0;
}
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
</style>

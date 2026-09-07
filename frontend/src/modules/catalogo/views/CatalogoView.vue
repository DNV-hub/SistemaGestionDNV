<script setup>
import { computed, onMounted, ref } from 'vue'
import { useCatalogoStore } from '../store/catalogo'
import { useAuthStore } from '../../../store/auth'
import MaterialFormModal from '../components/MaterialFormModal.vue'
import CategoriasModal from '../components/CategoriasModal.vue'
import NombresEdpModal from '../components/NombresEdpModal.vue'
import ImportarExcelModal from '../components/ImportarExcelModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'

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

const materialesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return catalogo.materiales
  return catalogo.materiales.filter(
    (m) =>
      m.codigo.toLowerCase().includes(q) ||
      m.descripcion.toLowerCase().includes(q) ||
      (m.nombres_edp?.nombre ?? '').toLowerCase().includes(q) ||
      (m.categorias?.nombre ?? '').toLowerCase().includes(q)
  )
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
  aviso.value = ''
  const creados = await catalogo.importarMateriales(payload)
  aviso.value = `Se importaron ${creados.length} materiales.`
}

async function eliminar(material) {
  if (!confirm(`¿Eliminar "${material.codigo} — ${material.descripcion}"?`)) return
  aviso.value = ''
  const resultado = await catalogo.eliminar(material.id)
  aviso.value = resultado.eliminado
    ? 'Material eliminado.'
    : 'Este material ya tiene movimientos registrados (stock, vales, etc.), así que no se puede eliminar: se desactivó en su lugar.'
}
</script>

<template>
  <div class="catalogo">
    <header class="cabecera">
      <h1>Catálogo de materiales</h1>
      <div class="acciones-cabecera">
        <button v-if="puedeGestionarCategorias" class="secundario" @click="mostrarModalCategorias = true">
          Categorías
        </button>
        <button v-if="puedeGestionarCategorias" class="secundario" @click="mostrarModalNombresEdp = true">
          Nombres EDP
        </button>
        <button v-if="puedeImportar" class="secundario" @click="mostrarModalImportar = true">
          Importar Excel
        </button>
        <button v-if="puedeCrear" @click="abrirCrear">+ Nuevo material</button>
      </div>
    </header>

    <div class="filtros">
      <input v-model="busqueda" type="search" placeholder="Buscar por código, descripción o categoría…" />
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="catalogo.error" class="error">{{ catalogo.error }}</p>

    <p v-if="catalogo.cargando">Cargando materiales…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>N°</th>
          <th>Código</th>
          <th>Descripción Almacén</th>
          <th>Descripción EDP</th>
          <th>Unidad Almacén</th>
          <th>Unidad EDP</th>
          <th>Categoría</th>
          <th>Stock mínimo</th>
          <th>Estado</th>
          <th v-if="mostrarColumnaAcciones"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, i) in materialesFiltrados" :key="m.id">
          <td>{{ i + 1 }}</td>
          <td>{{ m.codigo }}</td>
          <td>{{ m.descripcion }}</td>
          <td>{{ m.nombres_edp?.nombre ?? '—' }}</td>
          <td>{{ m.unidad }}</td>
          <td>{{ m.unidad_edp ?? '—' }}</td>
          <td>{{ m.categorias?.nombre ?? '—' }}</td>
          <td>{{ m.stock_minimo_default ?? '—' }}</td>
          <td>
            <span class="badge" :class="m.estado">{{ m.estado }}</span>
          </td>
          <td v-if="mostrarColumnaAcciones" class="acciones-fila">
            <BotonIcono v-if="puedeEditar" variante="editar" titulo="Editar" @click="abrirEditar(m)" />
            <BotonIcono v-if="puedeEliminar" variante="eliminar" titulo="Eliminar" @click="eliminar(m)" />
          </td>
        </tr>
        <tr v-if="!materialesFiltrados.length">
          <td colspan="10" class="vacio">No hay materiales para mostrar.</td>
        </tr>
      </tbody>
    </table>

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
      :codigos-existentes="catalogo.materiales.map((m) => m.codigo)"
      :nombres-edp-existentes="catalogo.nombresEdp"
      @importar="importarMateriales"
      @cerrar="mostrarModalImportar = false"
    />
  </div>
</template>

<style scoped>
.catalogo {
  padding: 1.5rem 2rem;
}
.cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.acciones-cabecera {
  display: flex;
  gap: 0.5rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: #111827;
}
.filtros {
  margin-bottom: 1rem;
}
.filtros input {
  width: 320px;
  max-width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.secundario {
  background: none;
  border: 1px solid #d1d5db;
  color: #374151;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.9rem;
}
.tabla th {
  background: #f3f4f6;
  color: #374151;
  font-weight: 600;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.activo {
  background: #dcfce7;
  color: #166534;
}
.badge.inactivo {
  background: #f3f4f6;
  color: #6b7280;
}
.acciones-fila {
  display: flex;
  gap: 0.25rem;
}
.vacio {
  text-align: center;
  color: #6b7280;
}
.aviso {
  color: #166534;
  font-size: 0.9rem;
}
.error {
  color: #b91c1c;
  font-size: 0.9rem;
}
</style>

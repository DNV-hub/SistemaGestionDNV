<script setup>
import { onMounted, ref } from 'vue'
import CatalogoTabs from '../../components/CatalogoTabs.vue'
import TablaCatalogo from '../components/TablaCatalogo.vue'
import { listarCatalogo, crearFilaCatalogo, actualizarFilaCatalogo, eliminarFilaCatalogo } from '../services/catalogosRdcService'

const TABLA = 'rdc_capataces'
const COLUMNAS = [
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
  { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
]

const filas = ref([])
const cargando = ref(true)
const error = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    filas.value = await listarCatalogo(TABLA)
  } catch (e) {
    error.value = e?.message ?? 'No se pudo cargar el catálogo de capataces.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

async function alCrear(datos) {
  const fila = await crearFilaCatalogo(TABLA, datos)
  filas.value.push(fila)
}
async function alActualizar(id, cambios) {
  await actualizarFilaCatalogo(TABLA, id, cambios)
}
async function alEliminar(id) {
  await eliminarFilaCatalogo(TABLA, id)
  filas.value = filas.value.filter((f) => f.id !== id)
}
</script>

<template>
  <div class="pagina">
    <CatalogoTabs />
    <header class="cabecera">
      <h1>Capataces</h1>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando">Cargando…</p>
    <TablaCatalogo
      v-else
      :columnas="COLUMNAS"
      :filas="filas"
      campo-activo="activo"
      :al-crear="alCrear"
      :al-actualizar="alActualizar"
      :al-eliminar="alEliminar"
    />
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
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

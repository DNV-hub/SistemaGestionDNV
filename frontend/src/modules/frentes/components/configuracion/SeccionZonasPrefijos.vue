<script setup>
import { computed, onMounted, ref } from 'vue'
import TablaCatalogo from '../../../catalogo/rdc/components/TablaCatalogo.vue'
import { CATALOGOS_RDC } from '../../../catalogo/rdc/definicionesCatalogos'
import { listarCatalogo, crearFilaCatalogo, actualizarFilaCatalogo, eliminarFilaCatalogo } from '../../../catalogo/rdc/services/catalogosRdcService'

const props = defineProps({
  frenteId: { type: String, required: true },
})

// Misma definición (columnas, tabla) que ya usa /catalogo para "Prefijos" —
// se reusa tal cual para no mantener dos formas distintas de lo mismo.
const DEF = CATALOGOS_RDC.find((d) => d.clave === 'prefijos')

const todas = ref([])
const cargando = ref(true)
const error = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    todas.value = await listarCatalogo(DEF.tabla, { orderBy: DEF.ordenarPor ?? 'orden' })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo cargar las zonas y prefijos.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

const filas = computed(() => todas.value.filter((f) => f.frente_id === props.frenteId))
const nuevaFilaBase = computed(() => ({ frente_id: props.frenteId }))

async function alCrear(datos) {
  const fila = await crearFilaCatalogo(DEF.tabla, datos)
  todas.value = [...todas.value, fila]
}
async function alActualizar(id, cambios) {
  await actualizarFilaCatalogo(DEF.tabla, id, cambios)
}
async function alEliminar(id) {
  await eliminarFilaCatalogo(DEF.tabla, id)
  todas.value = todas.value.filter((f) => f.id !== id)
}
</script>

<template>
  <section class="seccion">
    <h2>Zonas y prefijos</h2>
    <p class="ayuda">Lo que el supervisor elige al reportar. Sin zonas, el RDC cae en modo manual.</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando">Cargando…</p>
    <TablaCatalogo
      v-else
      :columnas="DEF.columnas"
      :filas="filas"
      :campo-activo="DEF.campoActivo"
      :nueva-fila-base="nuevaFilaBase"
      :al-crear="alCrear"
      :al-actualizar="alActualizar"
      :al-eliminar="alEliminar"
    />
  </section>
</template>

<style scoped>
.seccion {
  background: var(--p-card);
  box-shadow: 0 0 0 1px var(--p-line);
  border-radius: 20px;
  padding: 24px;
}
h2 {
  margin: 0;
  font-size: 16px;
  color: var(--p-text);
}
.ayuda {
  margin: 4px 0 12px;
  font-size: 13px;
  color: var(--p-muted);
}
.error {
  color: var(--p-danger);
  font-size: 0.85rem;
}
</style>

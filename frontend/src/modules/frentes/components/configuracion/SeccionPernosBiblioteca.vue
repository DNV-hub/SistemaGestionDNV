<script setup>
import { computed, onMounted, ref } from 'vue'
import TablaCatalogo from '../../../catalogo/rdc/components/TablaCatalogo.vue'
import { CATALOGOS_RDC } from '../../../catalogo/rdc/definicionesCatalogos'
import {
  listarCatalogo,
  crearFilaCatalogo,
  actualizarFilaCatalogo,
  eliminarFilaCatalogo,
  crearFilasCatalogoEnLote,
  guardarFilasCatalogoEnLote,
  eliminarFilasCatalogoPorIds,
} from '../../../catalogo/rdc/services/catalogosRdcService'
import ImportarPernosModal from './ImportarPernosModal.vue'

const props = defineProps({
  frenteId: { type: String, required: true },
})

// Misma definición (columnas, tabla) que ya usa /catalogo para "Biblioteca
// de pernos" — se reusa tal cual para no mantener dos formas de lo mismo.
const DEF = CATALOGOS_RDC.find((d) => d.clave === 'pernos')

const todas = ref([])
const cargando = ref(true)
const error = ref('')
const mostrarImportar = ref(false)
const aviso = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    todas.value = await listarCatalogo(DEF.tabla, { orderBy: DEF.ordenarPor ?? 'orden' })
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo cargar la biblioteca de pernos.'
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

async function importar(filasAImportar, { reemplazar = false } = {}) {
  aviso.value = ''
  // Al AGREGAR, un código que ya existe se escribe con el mismo texto que ya
  // tiene (p. ej. "g1" vs "G1") para actualizarlo en vez de duplicarlo.
  const canonico = new Map(filas.value.map((f) => [f.codigo.trim().toUpperCase(), f.codigo]))
  const payloads = filasAImportar.map((f) => ({
    frente_id: props.frenteId,
    codigo: reemplazar ? f.codigo.trim() : (canonico.get(f.codigo.trim().toUpperCase()) ?? f.codigo.trim()),
    zona: f.zona,
    sistema: f.sistema,
    ubicacion: f.ubicacion,
    diametro: f.diametro,
    longitud: f.longitud,
    angulo: f.angulo,
    plano: f.plano,
  }))
  if (reemplazar) {
    // La base no deja dos filas con el mismo (frente, código), así que lo
    // anterior se borra ANTES de cargar lo nuevo. Si la carga falla, se
    // devuelve lo que había: la biblioteca nunca se queda vacía.
    const respaldo = filas.value.map((f) => ({ ...f }))
    const idsAnteriores = respaldo.map((f) => f.id)
    if (idsAnteriores.length) await eliminarFilasCatalogoPorIds(DEF.tabla, idsAnteriores)
    try {
      const creadas = await crearFilasCatalogoEnLote(DEF.tabla, payloads)
      const borrados = new Set(idsAnteriores)
      todas.value = [...todas.value.filter((f) => !borrados.has(f.id)), ...creadas]
      aviso.value = `Biblioteca reemplazada: ${creadas.length} pernos nuevos (se quitaron ${idsAnteriores.length} anteriores).`
    } catch (e) {
      if (respaldo.length) await crearFilasCatalogoEnLote(DEF.tabla, respaldo).catch((e2) => console.error('No se pudo restaurar la biblioteca', e2))
      throw e
    }
  } else {
    const guardadas = await guardarFilasCatalogoEnLote(DEF.tabla, payloads, 'frente_id,codigo')
    const idsGuardados = new Set(guardadas.map((f) => f.id))
    const nuevas = guardadas.filter((f) => !filas.value.some((x) => x.id === f.id)).length
    todas.value = [...todas.value.filter((f) => !idsGuardados.has(f.id)), ...guardadas]
    aviso.value = `Se agregaron ${nuevas} pernos nuevos y se actualizaron ${guardadas.length - nuevas} que ya existían.`
  }
}
</script>

<template>
  <section class="seccion">
    <div class="cabecera">
      <div>
        <h2>Catálogo de pernos del plano</h2>
        <p class="ayuda">{{ filas.length }} cargados · los pernos de campo se marcan como ad-hoc hasta conciliar.</p>
      </div>
      <button type="button" class="secundario" @click="mostrarImportar = true">Importar tabla del plano</button>
    </div>
    <p v-if="aviso" class="aviso">{{ aviso }}</p>
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

    <ImportarPernosModal v-if="mostrarImportar" :existentes="filas" @importar="importar" @cerrar="mostrarImportar = false" />
  </section>
</template>

<style scoped>
.seccion {
  background: var(--p-card);
  box-shadow: 0 0 0 1px var(--p-line);
  border-radius: 20px;
  padding: 24px;
}
.cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
h2 {
  margin: 0;
  font-size: 16px;
  color: var(--p-text);
}
.ayuda {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--p-muted);
}
.secundario {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--p-line);
  border-radius: 10px;
  background: var(--p-hover);
  color: var(--p-text);
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
}
.error {
  color: var(--p-danger);
  font-size: 0.85rem;
}
.aviso {
  color: var(--p-ok-fg);
  font-size: 0.85rem;
}
</style>

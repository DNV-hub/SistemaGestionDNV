<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProcuraStore } from '../store/procura'

const procura = useProcuraStore()
const router = useRouter()

const busqueda = ref('')

onMounted(() => procura.cargar())

const bloquesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return procura.bloques
  return procura.bloques.filter(
    (f) => f.codigo.toLowerCase().includes(q) || f.nombre.toLowerCase().includes(q)
  )
})

function abrir(frente) {
  router.push(`/procura/${frente.id}`)
}
</script>

<template>
  <div class="procura">
    <header class="cabecera">
      <h1>Metrados Procura</h1>
    </header>

    <div class="filtros">
      <input v-model="busqueda" type="search" placeholder="Buscar frente por código o nombre…" />
    </div>

    <p v-if="procura.error" class="error">{{ procura.error }}</p>
    <p v-if="procura.cargando">Cargando…</p>

    <div v-else class="grid-bloques">
      <button v-for="f in bloquesFiltrados" :key="f.id" type="button" class="bloque" @click="abrir(f)">
        <div class="bloque-cabecera">
          <span class="codigo">{{ f.codigo }}</span>
          <span class="badge" :class="f.estado">{{ f.estado }}</span>
        </div>
        <div class="nombre">{{ f.nombre }}</div>
        <div class="area">{{ f.area ?? 'Sin área asignada' }}</div>
        <div class="metricas">
          <div class="metrica">
            <span class="valor">{{ f.totalMateriales }}</span>
            <span class="etiqueta">Materiales</span>
          </div>
          <div class="metrica">
            <span class="valor">{{ f.unidadesDistintas }}</span>
            <span class="etiqueta">Unidades</span>
          </div>
        </div>
      </button>

      <p v-if="!bloquesFiltrados.length" class="vacio">No hay frentes para mostrar.</p>
    </div>
  </div>
</template>

<style scoped>
.procura {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
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
.grid-bloques {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 1rem;
}
.bloque {
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem 1.1rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font: inherit;
  color: inherit;
}
.bloque:hover {
  border-color: #9ca3af;
}
.bloque:focus-visible {
  outline: 2px solid #1f2937;
  outline-offset: 2px;
}
.bloque-cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.codigo {
  font-weight: 700;
  color: #111827;
  font-size: 0.95rem;
}
.nombre {
  font-weight: 600;
  color: #111827;
}
.area {
  color: #6b7280;
  font-size: 0.85rem;
  margin-top: -0.3rem;
}
.metricas {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid #e5e7eb;
  text-align: center;
}
.metrica {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.metrica .valor {
  font-weight: 700;
  color: #111827;
  font-size: 1.05rem;
}
.metrica .etiqueta {
  font-size: 0.7rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
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
.badge.cerrado {
  background: #f3f4f6;
  color: #6b7280;
}
.vacio {
  text-align: center;
  color: #6b7280;
  grid-column: 1 / -1;
}
.error {
  color: #b91c1c;
  font-size: 0.9rem;
}
</style>

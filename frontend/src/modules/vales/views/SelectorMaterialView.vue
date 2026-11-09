<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useValeNuevoStore } from '../store/valeNuevo'
import { obtenerRecientes, registrarReciente } from '../services/materialesRecientes'

const vales = useValesStore()
const borrador = useValeNuevoStore()
const router = useRouter()

const busqueda = ref('')
const inputRef = ref(null)
const cargando = ref(false)

// Ya no se elige del catálogo completo: solo se puede pedir lo que
// realmente hay en el almacén ahora mismo, así que esta pantalla ES el
// stock (docs/mockups/05-selector-material.html, pero con la cantidad
// disponible como tope real de lo que se puede pedir).
onMounted(async () => {
  cargando.value = true
  try {
    await vales.cargarStockDisponible()
  } finally {
    cargando.value = false
  }
  inputRef.value?.focus()
})

const yaAgregados = computed(() => new Set(borrador.lineas.map((l) => l.material_id)))

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  const disponibles = vales.stockPorMaterial.filter((m) => !yaAgregados.value.has(m.id))
  if (!q) return disponibles
  return disponibles.filter((m) => m.descripcion.toLowerCase().includes(q))
})

// Sin búsqueda activa: "usados recientemente" (localStorage) primero, y
// el resto del stock debajo, como pide el mockup. Con algo buscado, no
// tiene sentido separar en dos grupos — es una sola lista de resultados.
const recientes = computed(() => {
  if (busqueda.value.trim()) return []
  const porId = new Map(vales.stockPorMaterial.map((m) => [m.id, m]))
  return obtenerRecientes()
    .map((id) => porId.get(id))
    .filter((m) => m && !yaAgregados.value.has(m.id))
})
const restoDelStock = computed(() => {
  if (busqueda.value.trim()) return filtrados.value
  const idsRecientes = new Set(recientes.value.map((m) => m.id))
  return filtrados.value.filter((m) => !idsRecientes.has(m.id))
})

function elegir(material) {
  borrador.agregarMaterial(material)
  registrarReciente(material.id)
  router.back()
}
</script>

<template>
  <div class="selector-material">
    <header class="appbar">
      <button type="button" class="icon-btn" aria-label="Volver" @click="router.back()">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4.5L7 11l6.5 6.5"/></svg>
      </button>
      <div class="search">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="7.5" cy="7.5" r="5.2"/><path d="M11.4 11.4l4 4"/></svg>
        <input ref="inputRef" v-model="busqueda" type="search" placeholder="Buscar material" />
      </div>
    </header>

    <div class="list">
      <p v-if="cargando" class="vacio">Cargando…</p>
      <template v-else>
        <template v-if="recientes.length">
          <div class="grp">
            <span class="grp-label">USADOS RECIENTEMENTE</span>
            <span class="grp-rule"></span>
          </div>
          <div v-for="m in recientes" :key="m.id" class="row" @click="elegir(m)">
            <div class="row-main">
              <div class="row-name">{{ m.descripcion }}</div>
            </div>
            <div class="row-stock">
              <span class="row-numero">{{ m.disponible }}</span>
              <span class="row-unit">{{ m.unidad }}</span>
            </div>
          </div>
        </template>

        <div class="grp">
          <span class="grp-label">{{ busqueda.trim() ? 'RESULTADOS' : 'CON STOCK DISPONIBLE' }}</span>
          <span class="grp-rule"></span>
        </div>
        <div v-for="m in restoDelStock" :key="m.id" class="row" @click="elegir(m)">
          <div class="row-main">
            <div class="row-name">{{ m.descripcion }}</div>
          </div>
          <div class="row-stock">
            <span class="row-numero">{{ m.disponible }}</span>
            <span class="row-unit">{{ m.unidad }}</span>
          </div>
        </div>
        <p v-if="!restoDelStock.length && !recientes.length" class="vacio">
          No hay materiales con stock disponible{{ busqueda.trim() ? ' para esta búsqueda' : '' }}.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.selector-material {
  --bg: #f4f5f7;
  --card: #ffffff;
  --border-lista: #e4e7ec;
  --text: #1e293b;
  --text-2: #667085;
  --text-3: #98a2b3;
  --amber: #f5a800;
  --gray-bg: #f2f4f7;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  background: var(--card);
  height: 100vh;
  height: calc(100dvh - env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
  color: var(--text);
}
/* Modo oscuro: mismo criterio que el resto del módulo (ver el comentario
   largo en ValesView.vue/rdc-tema.css) — redefine estas mismas variables
   con los tokens del Sistema. */
:root[data-theme='dark'] .selector-material {
  --bg: var(--color-bg);
  --card: var(--color-surface);
  --border-lista: var(--color-border);
  --text: var(--color-text);
  --text-2: var(--color-text-muted);
  --text-3: #6b7280;
  --amber: var(--color-primary);
  --gray-bg: var(--color-surface-2);
}
.appbar {
  height: 60px;
  flex-shrink: 0;
  background: var(--card);
  display: flex;
  align-items: center;
  padding: 0 12px 0 2px;
  gap: 2px;
  border-bottom: 1px solid var(--border-lista);
}
.icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
}
.search {
  flex: 1;
  height: 44px;
  background: var(--gray-bg);
  border-radius: 11px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
  color: var(--text-3);
}
.search input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 16px;
  font-family: inherit;
  color: var(--text);
}
.search input::placeholder {
  color: var(--text-3);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}
.grp {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 16px 16px 8px;
}
.grp-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: var(--text-3);
  white-space: nowrap;
}
.grp-rule {
  flex: 1;
  height: 1px;
  background: var(--border-lista);
}
.row {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-lista);
  cursor: pointer;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.28;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-code {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-3);
  letter-spacing: 0.04em;
  line-height: 1.3;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-stock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.row-numero {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.row-unit {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 600;
}
.vacio {
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  padding: 24px 0;
}
</style>

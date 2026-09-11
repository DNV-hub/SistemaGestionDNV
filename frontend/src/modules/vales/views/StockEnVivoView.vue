<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import { supabase } from '../../../services/supabaseClient'

const vales = useValesStore()
const auth = useAuthStore()
const router = useRouter()

const busqueda = ref('')
const cargando = ref(false)

// Diagnóstico temporal: la lista viene vacía en producción sin ningún error
// de Supabase, algo que solo pasa si RLS está descartando filas en
// silencio. Esto muestra si `stock.ver` realmente se está resolviendo en
// true para esta sesión — se saca en cuanto se confirme la causa.
const permisoStock = ref(null)
onMounted(async () => {
  try {
    const { data } = await supabase.rpc('has_permission', { p_codigo: 'stock.ver' })
    permisoStock.value = data
  } catch {
    permisoStock.value = 'error'
  }
})

onMounted(async () => {
  cargando.value = true
  try {
    await vales.cargarStockDisponible()
  } finally {
    cargando.value = false
  }
})

const filtrado = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return vales.stockDisponible
  return vales.stockDisponible.filter(
    (s) => s.materiales?.codigo?.toLowerCase().includes(q) || s.materiales?.descripcion?.toLowerCase().includes(q)
  )
})
</script>

<template>
  <div class="stock-vivo">
    <header class="appbar">
      <button type="button" class="icon-btn" aria-label="Volver" @click="router.back()">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4.5L7 11l6.5 6.5"/></svg>
      </button>
      <div class="appbar-title">Stock en vivo</div>
      <div class="icon-btn"></div>
    </header>

    <div class="search-wrap">
      <div class="search">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="7.5" cy="7.5" r="5.2"/><path d="M11.4 11.4l4 4"/></svg>
        <input v-model="busqueda" type="search" placeholder="Buscar material" />
      </div>
    </div>

    <div class="list">
      <p v-if="cargando" class="vacio">Cargando…</p>
      <p v-else-if="vales.error" class="vacio error">{{ vales.error }}</p>
      <template v-else>
        <div v-for="(s, i) in filtrado" :key="i" class="row">
          <div class="row-main">
            <div class="row-name">{{ s.materiales?.descripcion }}</div>
            <div class="row-code">{{ s.materiales?.codigo }} · {{ s.almacenes?.nombre }}</div>
          </div>
          <div class="row-cant">
            <span class="row-numero">{{ s.cantidad_disponible }}</span>
            <span class="row-unidad">{{ s.materiales?.unidad }}</span>
          </div>
        </div>
        <p v-if="!filtrado.length" class="vacio">{{ vales.stockDisponible.length ? 'Sin resultados.' : 'No hay stock registrado todavía.' }}</p>
        <p v-if="!vales.stockDisponible.length" class="vacio diagnostico">
          Diagnóstico — rol: {{ auth.nombreRol ?? '—' }} · permiso stock.ver: {{ permisoStock === null ? 'consultando…' : permisoStock }}
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.stock-vivo {
  --bg: #f4f5f7;
  --card: #ffffff;
  --border-lista: #e4e7ec;
  --text: #1e293b;
  --text-2: #667085;
  --text-3: #98a2b3;
  --gray-bg: #f2f4f7;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  color: var(--text);
  background: var(--card);
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
@media (min-width: 1025px) {
  .stock-vivo {
    max-width: 640px;
    margin: 0 auto;
    box-shadow: 0 0 0 1px var(--border-lista);
  }
}
.appbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border-lista);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
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
.appbar-title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.search-wrap {
  flex-shrink: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-lista);
}
.search {
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
.row {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #f0f2f5;
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
}
.row-code {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-3);
  letter-spacing: 0.02em;
  line-height: 1.3;
  margin-top: 2px;
}
.row-cant {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.row-numero {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.row-unidad {
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
.vacio.error {
  color: #dc2626;
}
.vacio.diagnostico {
  font-size: 11px;
  color: var(--text-3);
  padding-top: 4px;
}
</style>

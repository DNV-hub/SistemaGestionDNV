<script setup>
import { computed, onMounted } from 'vue'
import { useAuthStore } from './store/auth'

const auth = useAuthStore()
onMounted(() => auth.init())

const navItems = [
  { to: '/', label: 'Dashboard', permiso: 'dashboard.ver' },
  { to: '/catalogo', label: 'Catálogo', permiso: 'catalogo.ver' },
  { to: '/frentes', label: 'Frentes', permiso: 'frentes.ver' },
  { to: '/almacen', label: 'Almacén', permiso: 'stock.ver' },
  { to: '/vales', label: 'Vales', permiso: 'vales.ver_propios' },
  { to: '/reservas', label: 'Reservas', permiso: 'reservas.ver' },
  { to: '/kardex', label: 'Kardex', permiso: 'kardex.ver' },
  { to: '/procura', label: 'Procura', permiso: 'procura.ver' },
  { to: '/alertas', label: 'Alertas', permiso: 'alertas.ver' },
  { to: '/usuarios', label: 'Usuarios', permiso: 'usuarios.ver' },
]

const navVisible = computed(() => navItems.filter((item) => auth.tienePermiso(item.permiso)))
</script>

<template>
  <div v-if="auth.cargando" class="cargando">Cargando…</div>

  <div v-else-if="!auth.estaAutenticado" class="sin-sesion">
    <router-view />
  </div>

  <div v-else class="shell">
    <aside class="nav">
      <div class="marca">Materiales</div>
      <router-link v-for="item in navVisible" :key="item.to" :to="item.to">
        {{ item.label }}
      </router-link>
      <button class="salir" @click="auth.signOut()">Cerrar sesión</button>
    </aside>
    <main class="contenido">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.cargando {
  display: grid;
  place-items: center;
  min-height: 100vh;
  color: #6b7280;
}
.shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1.25rem 1rem;
  background: #111827;
}
.nav a {
  color: #d1d5db;
  text-decoration: none;
  padding: 0.5rem 0.6rem;
  border-radius: 4px;
  font-size: 0.9rem;
}
.nav a.router-link-active {
  background: #1f2937;
  color: #fff;
}
.marca {
  color: #fff;
  font-weight: 700;
  margin-bottom: 1rem;
}
.salir {
  margin-top: auto;
  background: none;
  border: 1px solid #374151;
  color: #d1d5db;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}
.contenido {
  background: #f9fafb;
}
</style>

<script setup>
import { useAuthStore } from '../../../store/auth'

const auth = useAuthStore()
</script>

<template>
  <nav class="tabs">
    <router-link to="/catalogo" class="tab" exact-active-class="activo">Materiales</router-link>
    <router-link v-if="auth.tienePermiso('rdc.catalogos_gestionar')" to="/catalogo/capataces" class="tab" exact-active-class="activo">
      Capataces
    </router-link>
    <router-link v-if="auth.tienePermiso('rdc.catalogos_gestionar')" to="/catalogo/rdc" class="tab" exact-active-class="activo">
      Catálogos RDC
    </router-link>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}
.tab {
  padding: 0.55rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab:hover {
  color: var(--color-text);
}
.tab.activo {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
</style>

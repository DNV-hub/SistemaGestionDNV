<script setup>
import { useAuthStore } from '../../../store/auth'

// Solo aparece en escritorio: en celular estas mismas tres pantallas ya se
// cambian con la barra de pestañas de abajo (Reporte/Fotos/Sketch's/Vales,
// ver App.vue) — repetir la navegación acá arriba sería redundante y le
// resta espacio a una pantalla que ya es chica.
const auth = useAuthStore()
</script>

<template>
  <nav class="tabs">
    <router-link v-if="auth.tienePermiso('rdc.ver_propios')" to="/rdc" class="tab" active-class="activo">
      Reporte diario
    </router-link>
    <router-link v-if="auth.tienePermiso('rdc.crear')" to="/fotos" class="tab" exact-active-class="activo">
      Fotografías
    </router-link>
    <router-link v-if="auth.tienePermiso('rdc.ver_propios')" to="/sketches" class="tab" exact-active-class="activo">
      Sketch's
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
@media (max-width: 1024px) {
  .tabs {
    display: none;
  }
}
</style>

<script setup>
defineProps({
  nombre: { type: String, required: true },
})
</script>

<template>
  <svg
    class="icono-nav"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="nombre === 'dashboard'">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </template>

    <template v-else-if="nombre === 'catalogo'">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </template>

    <template v-else-if="nombre === 'frentes'">
      <path d="M6 20V4" />
      <path d="M6 4h11l-2.3 3.5L17 11H6" />
    </template>

    <template v-else-if="nombre === 'almacen'">
      <path d="M3.5 9 12 4l8.5 5" />
      <rect x="4.5" y="9" width="15" height="10.5" rx="1" />
      <line x1="9.5" y1="19.5" x2="9.5" y2="13.5" />
      <line x1="14.5" y1="19.5" x2="14.5" y2="13.5" />
    </template>

    <template v-else-if="nombre === 'vales'">
      <path d="M6.5 3.5h8L19 8v12a1 1 0 0 1-1 1h-11.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h5" />
      <line x1="8.5" y1="12.5" x2="15" y2="12.5" />
      <line x1="8.5" y1="16" x2="13" y2="16" />
    </template>

    <template v-else-if="nombre === 'reservas'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </template>

    <template v-else-if="nombre === 'kardex'">
      <rect x="4" y="4.5" width="16" height="6" rx="1.2" />
      <rect x="4" y="13.5" width="16" height="6" rx="1.2" />
      <line x1="7" y1="7.5" x2="12" y2="7.5" />
      <line x1="7" y1="16.5" x2="12" y2="16.5" />
    </template>

    <template v-else-if="nombre === 'procura'">
      <circle cx="11" cy="11" r="6.5" />
      <line x1="15.8" y1="15.8" x2="20" y2="20" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </template>

    <template v-else-if="nombre === 'alertas'">
      <path d="M12 3.5 21 19.5H3Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="16.8" r="0.15" fill="currentColor" stroke-width="1.4" />
    </template>

    <template v-else-if="nombre === 'rdc'">
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 3.5V6M15 3.5V6" />
      <line x1="8.5" y1="10.5" x2="15.5" y2="10.5" />
      <line x1="8.5" y1="14" x2="13" y2="14" />
    </template>

    <template v-else-if="nombre === 'camara'">
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.2-1.8A1 1 0 0 1 9.5 4.7h5a1 1 0 0 1 .83.5L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="13" r="3.3" />
    </template>

    <template v-else-if="nombre === 'sketch'">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M6.5 15.5 10 10.5l2.3 2.7L15 9.5l2.5 6" />
      <circle cx="9" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
    </template>

    <template v-else-if="nombre === 'usuarios'">
      <circle cx="12" cy="8.3" r="3.3" />
      <path d="M5 20c0-3.6 3.1-6.3 7-6.3s7 2.7 7 6.3" />
    </template>

    <template v-else-if="nombre === 'sol'">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21.5" />
      <line x1="4.2" y1="4.2" x2="6" y2="6" />
      <line x1="18" y1="18" x2="19.8" y2="19.8" />
      <line x1="2.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
      <line x1="4.2" y1="19.8" x2="6" y2="18" />
      <line x1="18" y1="6" x2="19.8" y2="4.2" />
    </template>

    <template v-else-if="nombre === 'luna'">
      <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2Z" />
    </template>

    <template v-else-if="nombre === 'engranaje'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3"
      />
    </template>

    <template v-else-if="nombre === 'reportes'">
      <path d="M6.5 3.5h8L19 8v12a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h5" />
      <line x1="8.5" y1="13" x2="15" y2="13" />
      <line x1="8.5" y1="16.5" x2="12.5" y2="16.5" />
    </template>

    <template v-else-if="nombre === 'mas'">
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </template>

    <template v-else-if="nombre === 'salir'">
      <path d="M9.5 20H5.5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5.5 4h4" />
      <line x1="16.5" y1="12" x2="9" y2="12" />
      <path d="M13.5 8.5 17 12l-3.5 3.5" />
    </template>
  </svg>
</template>

<style scoped>
.icono-nav {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
</style>

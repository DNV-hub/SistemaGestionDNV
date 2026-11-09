<script setup>
// Íconos animados de la barra inferior del Supervisor. Mismas formas que los
// componentes animados originales (lucide: FilePenLine, Instagram, Home), pero
// con CSS puro en vez de `motion/react`: la app es Vue. Se animan al activarse
// la pestaña (clase `.on` en el botón) y con hover en escritorio.
defineProps({
  nombre: { type: String, required: true },
  size: { type: Number, default: 26 },
})
</script>

<template>
  <svg
    class="icono-barra"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="nombre === 'reporte'">
      <path d="m18 5-2.414-2.414A2 2 0 0 0 14.172 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
      <path class="a-pen" d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
      <path class="a-ln" d="M8 18h5" />
    </template>
    <template v-else-if="nombre === 'fotos'">
      <rect class="a-draw" pathLength="1" width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path class="a-draw" pathLength="1" d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line class="a-draw" pathLength="1" x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </template>
    <template v-else-if="nombre === 'dashboard'">
      <path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" />
    </template>
    <template v-else-if="nombre === 'planeamiento'">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h4" />
    </template>
    <template v-else-if="nombre === 'almacen'">
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path class="a-draw" pathLength="1" d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
    </template>
    <template v-else-if="nombre === 'calidad'">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path class="a-draw" pathLength="1" d="M8.5 12l2.5 2.5 4.5-5" />
    </template>
  </svg>
</template>

<!-- Sin scoped: el disparador (.nv.on / .nv:hover) vive en el botón que
     envuelve este ícono, que renderiza otro componente. -->
<style>
.icono-barra path,
.icono-barra rect,
.icono-barra line {
  transform-box: fill-box;
}
.icono-barra .a-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
}
.icono-barra .a-pen {
  transform-origin: center;
}
.icono-barra .a-ln {
  transform-origin: left center;
}
@keyframes ib-dibujar {
  from { stroke-dashoffset: 1; opacity: 0; }
  to { stroke-dashoffset: 0; opacity: 1; }
}
@keyframes ib-lapiz {
  0% { transform: translate(0, 0) rotate(0); }
  25% { transform: translate(-0.5px, 1px) rotate(-0.3deg); }
  50% { transform: translate(1px, -0.5px) rotate(0.2deg); }
  75% { transform: translate(0, 0.4px) rotate(-0.4deg); }
  100% { transform: translate(0, 0) rotate(0); }
}
@keyframes ib-linea {
  from { transform: scaleX(0.2); }
  to { transform: scaleX(1); }
}
.nv.on .icono-barra .a-draw,
.nv:hover .icono-barra .a-draw {
  animation: ib-dibujar 0.6s linear;
}
.nv.on .icono-barra .a-pen,
.nv:hover .icono-barra .a-pen {
  animation: ib-lapiz 0.5s ease-in-out 2;
}
.nv.on .icono-barra .a-ln,
.nv:hover .icono-barra .a-ln {
  animation: ib-linea 0.5s ease-in-out;
}
@media (prefers-reduced-motion: reduce) {
  .icono-barra .a-draw,
  .icono-barra .a-pen,
  .icono-barra .a-ln {
    animation: none !important;
  }
}
</style>

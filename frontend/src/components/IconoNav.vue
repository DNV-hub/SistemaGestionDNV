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
      <rect class="cuad-dash cuad-dash-1" x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect class="cuad-dash cuad-dash-2" x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect class="cuad-dash cuad-dash-4" x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect class="cuad-dash cuad-dash-3" x="13" y="13" width="7.5" height="7.5" rx="1.5" />
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

    <template v-else-if="nombre === 'confirmacion'">
      <path d="M20 6 9 17l-5-5" />
    </template>

    <template v-else-if="nombre === 'almacen'">
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path class="puerta-alm" d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" pathLength="1" />
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

    <template v-else-if="nombre === 'avance'">
      <path d="M4 18 9.5 12.5 13.5 16.5 20 9" />
      <path d="M14.5 9h5.5v5.5" />
    </template>

    <template v-else-if="nombre === 'developer'">
      <path d="M8.5 8 4 12.5 8.5 17" />
      <path d="M15.5 8 20 12.5 15.5 17" />
      <line x1="13.2" y1="5.5" x2="10.8" y2="19.5" />
    </template>

    <template v-else-if="nombre === 'mas'">
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </template>

    <template v-else-if="nombre === 'soporte'">
      <path d="M4.5 13v-1.5a7.5 7.5 0 0 1 15 0V13" />
      <rect x="3" y="12.5" width="3.6" height="6" rx="1.4" />
      <rect x="17.4" y="12.5" width="3.6" height="6" rx="1.4" />
      <path d="M19.2 18.5c0 1.6-1.5 2.5-3.7 2.5H13" />
    </template>

    <template v-else-if="nombre === 'salir'">
      <path d="M9.5 20H5.5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5.5 4h4" />
      <line x1="16.5" y1="12" x2="9" y2="12" />
      <path d="M13.5 8.5 17 12l-3.5 3.5" />
    </template>

    <template v-else-if="nombre === 'planeamiento'">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path class="check-plan" d="m9 16 2 2 4-4" pathLength="1" />
    </template>

    <template v-else-if="nombre === 'calidad'">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path class="check-cal" d="m9 12 2 2 4-4" pathLength="1" />
    </template>

    <template v-else-if="nombre === 'equipos'">
      <line class="viento-eq viento-eq-1" x1="0" y1="8" x2="5" y2="8" />
      <line class="viento-eq viento-eq-2" x1="-1" y1="11" x2="6" y2="11" />
      <line class="viento-eq viento-eq-3" x1="0" y1="14" x2="4" y2="14" />
      <g class="camion">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <g class="rueda rueda-1">
          <circle cx="7" cy="18" r="2" />
          <line x1="7" y1="16.5" x2="7" y2="19.5" stroke-width="1.5" />
          <line x1="5.5" y1="18" x2="8.5" y2="18" stroke-width="1.5" />
        </g>
        <g class="rueda rueda-2">
          <circle cx="17" cy="18" r="2" />
          <line x1="17" y1="16.5" x2="17" y2="19.5" stroke-width="1.5" />
          <line x1="15.5" y1="18" x2="18.5" y2="18" stroke-width="1.5" />
        </g>
      </g>
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

<!-- Sin scoped a propósito: el disparador del hover vive en el enlace que
     envuelve este ícono (.item, .tab, .mod-item…), que lo renderiza OTRO
     componente — con scoped, ese selector nunca llegaría hasta acá. Cada
     cuadrado se desliza hacia el lugar del siguiente (como un pequeño
     remolino) e igual de suave vuelve a su sitio al sacar el mouse. -->
<style>
.cuad-dash {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.item:hover .cuad-dash-1,
.tab:hover .cuad-dash-1,
.mod-item:hover .cuad-dash-1,
.menu-item:hover .cuad-dash-1 {
  transform: translate(11px, 0);
}
.item:hover .cuad-dash-2,
.tab:hover .cuad-dash-2,
.mod-item:hover .cuad-dash-2,
.menu-item:hover .cuad-dash-2 {
  transform: translate(0, 11px);
}
.item:hover .cuad-dash-3,
.tab:hover .cuad-dash-3,
.mod-item:hover .cuad-dash-3,
.menu-item:hover .cuad-dash-3 {
  transform: translate(-11px, 0);
}
.item:hover .cuad-dash-4,
.tab:hover .cuad-dash-4,
.mod-item:hover .cuad-dash-4,
.menu-item:hover .cuad-dash-4,
.rail-item:hover .cuad-dash-4 {
  transform: translate(0, -11px);
}
.rail-item:hover .cuad-dash-1 { transform: translate(11px, 0); }
.rail-item:hover .cuad-dash-2 { transform: translate(0, 11px); }
.rail-item:hover .cuad-dash-3 { transform: translate(-11px, 0); }
</style>

<!-- El check del calendario se dibuja de nuevo al pasar el mouse (mismo
     disparador que el ícono de Dashboard). -->
<style>
.check-plan {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
}
.item:hover .check-plan,
.tab:hover .check-plan,
.mod-item:hover .check-plan,
.menu-item:hover .check-plan,
.rail-item:hover .check-plan {
  animation: dibujar-check 0.4s ease-in-out;
}
@keyframes dibujar-check {
  from {
    stroke-dashoffset: 1;
    opacity: 0;
  }
  to {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
</style>

<!-- Camión de Equipos: al pasar el mouse vibra, giran las ruedas y salen
     rayas de velocidad hacia atrás (mismo disparador que Dashboard). -->
<style>
.icono-nav {
  overflow: visible;
}
.viento-eq {
  opacity: 0;
  transform-origin: 0 0;
}
.rueda-1 {
  transform-origin: 7px 18px;
}
.rueda-2 {
  transform-origin: 17px 18px;
}
.item:hover .camion,
.tab:hover .camion,
.mod-item:hover .camion,
.menu-item:hover .camion,
.rail-item:hover .camion {
  animation: camion-vibra 0.4s ease-in-out infinite;
}
.item:hover .rueda,
.tab:hover .rueda,
.mod-item:hover .rueda,
.menu-item:hover .rueda,
.rail-item:hover .rueda {
  animation: rueda-gira 0.5s linear infinite;
}
.item:hover .viento-eq,
.tab:hover .viento-eq,
.mod-item:hover .viento-eq,
.menu-item:hover .viento-eq,
.rail-item:hover .viento-eq {
  animation: viento-sale 0.5s ease-out infinite;
}
.viento-eq-2 {
  animation-delay: 0.08s !important;
}
.viento-eq-3 {
  animation-delay: 0.16s !important;
}
@keyframes camion-vibra {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(-1px); }
  75% { transform: translateY(-0.5px); }
}
@keyframes rueda-gira {
  to { transform: rotate(360deg); }
}
@keyframes viento-sale {
  0% { opacity: 0; transform: translateX(0) scaleX(0.2); }
  20% { opacity: 0.7; transform: translateX(-4px) scaleX(1); }
  60% { opacity: 0.5; transform: translateX(-10px) scaleX(0.8); }
  100% { opacity: 0; transform: translateX(-16px) scaleX(0.3); }
}
</style>

<!-- Calidad: el check del escudo se dibuja y crece al pasar el mouse
     (mismo disparador que Dashboard). -->
<style>
.check-cal {
  stroke-dasharray: 1 1;
  stroke-dashoffset: 0;
  transform-origin: 12px 12px;
}
.item:hover .check-cal,
.tab:hover .check-cal,
.mod-item:hover .check-cal,
.menu-item:hover .check-cal,
.rail-item:hover .check-cal {
  animation: check-cal-dibuja 0.4s ease-out;
}
@keyframes check-cal-dibuja {
  from { stroke-dashoffset: 1; opacity: 0; transform: scale(0.5); }
  25% { opacity: 1; }
  to { stroke-dashoffset: 0; opacity: 1; transform: scale(1); }
}
</style>

<!-- Almacén: la puerta se dibuja de nuevo al pasar el mouse (mismo
     disparador que Dashboard). -->
<style>
.puerta-alm {
  stroke-dasharray: 1 1;
  stroke-dashoffset: 0;
}
.item:hover .puerta-alm,
.tab:hover .puerta-alm,
.mod-item:hover .puerta-alm,
.menu-item:hover .puerta-alm,
.rail-item:hover .puerta-alm {
  animation: puerta-dibuja 0.6s ease-in-out;
}
@keyframes puerta-dibuja {
  from { stroke-dashoffset: 1; opacity: 0; }
  20% { opacity: 1; }
  to { stroke-dashoffset: 0; opacity: 1; }
}
</style>

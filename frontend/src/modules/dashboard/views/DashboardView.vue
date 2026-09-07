<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '../store/dashboard'
import { useAuthStore } from '../../../store/auth'

const dashboard = useDashboardStore()
const auth = useAuthStore()
const router = useRouter()

const permisos = computed(() => ({
  alertas: auth.tienePermiso('alertas.ver'),
  vales: auth.tienePermiso('vales.ver_propios'),
  reservas: auth.tienePermiso('reservas.ver'),
  frentes: auth.tienePermiso('frentes.ver'),
  stock: auth.tienePermiso('stock.ver'),
}))

onMounted(() => dashboard.cargar(permisos.value))

function ir(ruta) {
  router.push(ruta)
}
</script>

<template>
  <div class="dashboard">
    <header class="cabecera">
      <h1>Dashboard</h1>
      <p class="subtitulo">Hola, {{ auth.perfil?.nombre }} — {{ auth.nombreRol }}</p>
    </header>

    <p v-if="dashboard.cargando">Cargando…</p>

    <template v-else>
      <div class="tiles">
        <button
          v-if="permisos.alertas"
          type="button"
          class="tile"
          :class="{ critica: dashboard.alertas?.criticas }"
          @click="ir('/alertas')"
        >
          <span class="valor">{{ dashboard.alertas?.total ?? 0 }}</span>
          <span class="etiqueta">Alertas activas</span>
          <span v-if="dashboard.alertas?.criticas" class="detalle">{{ dashboard.alertas.criticas }} críticas</span>
        </button>

        <button v-if="permisos.vales" type="button" class="tile" @click="ir('/vales')">
          <span class="valor">{{ dashboard.valesPendientes ?? 0 }}</span>
          <span class="etiqueta">Vales pendientes</span>
        </button>

        <button v-if="permisos.reservas" type="button" class="tile" @click="ir('/reservas')">
          <span class="valor">{{ dashboard.reservasActivas ?? 0 }}</span>
          <span class="etiqueta">Reservas activas</span>
        </button>

        <button v-if="permisos.stock" type="button" class="tile" @click="ir('/almacen')">
          <span class="valor">{{ dashboard.stockBajo ?? 0 }}</span>
          <span class="etiqueta">Materiales con stock bajo</span>
        </button>

        <button v-if="permisos.frentes" type="button" class="tile" @click="ir('/frentes')">
          <span class="valor">{{ dashboard.frentesActivos ?? 0 }}</span>
          <span class="etiqueta">Frentes activos</span>
        </button>
      </div>

      <div class="paneles">
        <section v-if="permisos.alertas" class="panel">
          <h2>Alertas activas recientes</h2>
          <ul class="lista">
            <li v-for="a in dashboard.alertasRecientes" :key="a.id">
              <span class="badge-nivel" :class="a.nivel">{{ a.nivel }}</span>
              <span class="texto">{{ a.mensaje }}</span>
            </li>
            <li v-if="!dashboard.alertasRecientes.length" class="vacio">No hay alertas activas.</li>
          </ul>
        </section>

        <section v-if="permisos.vales" class="panel">
          <h2>Vales pendientes de revisión</h2>
          <ul class="lista">
            <li v-for="v in dashboard.valesRecientes" :key="v.id" class="clicable" @click="ir(`/vales/${v.id}`)">
              <span class="numero">{{ v.numero }}</span>
              <span class="texto">{{ v.frentes?.codigo }} — {{ v.usuarios?.nombre }}</span>
              <span class="badge-estado">{{ v.estado }}</span>
            </li>
            <li v-if="!dashboard.valesRecientes.length" class="vacio">No hay vales pendientes.</li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1.25rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: #111827;
}
.subtitulo {
  margin: 0.25rem 0 0;
  color: #6b7280;
  font-size: 0.9rem;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.75rem;
}
.tile {
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.1rem 1.25rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font: inherit;
  color: inherit;
}
.tile:hover {
  border-color: #9ca3af;
}
.tile.critica {
  border-color: #fca5a5;
  background: #fef2f2;
}
.tile .valor {
  font-size: 1.9rem;
  font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
}
.tile .etiqueta {
  font-size: 0.8rem;
  color: #6b7280;
}
.tile .detalle {
  font-size: 0.72rem;
  color: #991b1b;
  font-weight: 600;
}
.paneles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.25rem;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem 1.1rem;
}
h2 {
  font-size: 0.95rem;
  margin: 0 0 0.75rem;
  color: #111827;
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.lista li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #f3f4f6;
}
.lista li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.lista .clicable {
  cursor: pointer;
}
.lista .clicable:hover {
  color: #1f2937;
}
.lista .texto {
  flex: 1;
  color: #374151;
}
.lista .numero {
  font-weight: 600;
  color: #111827;
}
.badge-nivel,
.badge-estado {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: capitalize;
  white-space: nowrap;
}
.badge-nivel.info {
  background: #dbeafe;
  color: #1e40af;
}
.badge-nivel.advertencia {
  background: #fef3c7;
  color: #92400e;
}
.badge-nivel.critica {
  background: #fee2e2;
  color: #991b1b;
}
.badge-estado {
  background: #f3f4f6;
  color: #374151;
}
.vacio {
  color: #6b7280;
  font-size: 0.85rem;
}
</style>

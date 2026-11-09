<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useReservasStore } from '../store/reservas'
import { useAuthStore } from '../../../store/auth'

const reservas = useReservasStore()
const auth = useAuthStore()

const filtros = reactive({ soloActivas: true, almacenId: '', frenteId: '' })
const aviso = ref('')

// Solo de consulta: lo que se hace con una reserva (entregar, no entregar) se
// decide en la ficha del vale. Quien opera Almacén la abre ahí; el resto, en
// el detalle de siempre.
const enlaceVale = (r) => {
  const id = r.vale_detalle?.vale_id
  if (!id) return null
  return auth.tienePermiso('stock.ver') && auth.nombreRol !== 'Supervisor'
    ? { path: '/almacen', query: { tab: 'vales', vale: id } }
    : `/vales/${id}`
}

function buscar() {
  reservas.buscar({
    estados: filtros.soloActivas ? ['Activa', 'Parcial'] : null,
    almacenId: filtros.almacenId || null,
    frenteId: filtros.frenteId || null,
  })
}

function diasDeAntiguedad(fecha) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

function esProlongada(r) {
  return ['Activa', 'Parcial'].includes(r.estado) && diasDeAntiguedad(r.created_at) >= reservas.diasReservaProlongada
}

onMounted(async () => {
  await reservas.cargarFiltros()
  buscar()
})
</script>

<template>
  <div class="reservas">
    <header class="cabecera">
      <h1>Reservas</h1>
    </header>

    <div class="filtros">
      <label class="check">
        <input v-model="filtros.soloActivas" type="checkbox" @change="buscar" />
        Solo activas/parciales
      </label>

      <select v-model="filtros.almacenId" @change="buscar">
        <option value="">Todos los almacenes</option>
        <option v-for="a in reservas.almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
      </select>

      <select v-model="filtros.frenteId" @change="buscar">
        <option value="">Todos los frentes</option>
        <option v-for="f in reservas.frentes" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
      </select>
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="reservas.error" class="error">{{ reservas.error }}</p>
    <p class="ayuda">
      Se resalta una reserva cuando lleva {{ reservas.diasReservaProlongada }} días o más sin completarse.
    </p>

    <p v-if="reservas.cargando">Cargando…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>Vale</th>
          <th>Frente</th>
          <th>Almacén</th>
          <th>Material</th>
          <th>Reservado</th>
          <th>Entregado</th>
          <th>Pendiente</th>
          <th>Antigüedad</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in reservas.reservas" :key="r.id" :class="{ prolongada: esProlongada(r) }">
          <td>{{ r.vale_detalle?.vales?.numero ?? '—' }}</td>
          <td>{{ r.frentes?.codigo ? r.frentes.codigo + ' — ' : '' }}{{ r.frentes?.nombre }}</td>
          <td>{{ r.almacenes?.nombre ?? '—' }}</td>
          <td>{{ r.materiales?.descripcion }}</td>
          <td>{{ r.cantidad }} {{ r.materiales?.unidad }}</td>
          <td>{{ r.cantidad_entregada }}</td>
          <td>{{ r.cantidad - r.cantidad_entregada }}</td>
          <td>{{ diasDeAntiguedad(r.created_at) }} días</td>
          <td>
            <span class="badge" :class="r.estado.toLowerCase()">{{ r.estado }}</span>
          </td>
          <td>
            <router-link v-if="enlaceVale(r)" :to="enlaceVale(r)" class="mini">Abrir vale</router-link>
          </td>
        </tr>
        <tr v-if="!reservas.reservas.length">
          <td colspan="10" class="vacio">No hay reservas para mostrar.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.reservas {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
select {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.ayuda {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin: 0 0 1rem;
}
button.mini,
a.mini {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
}
.tabla th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tabla tr.prolongada td {
  background: var(--color-warning-soft);
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.activa {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.parcial {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.convertida {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.liberada,
.badge.cancelada {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
}
.aviso {
  color: var(--color-success);
  font-size: 0.9rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

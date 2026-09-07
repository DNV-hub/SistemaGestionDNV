<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useReservasStore } from '../store/reservas'
import { useAuthStore } from '../../../store/auth'
import LiberarReservaModal from '../components/LiberarReservaModal.vue'

const reservas = useReservasStore()
const auth = useAuthStore()

const filtros = reactive({ soloActivas: true, almacenId: '', frenteId: '' })
const reservaEnLiberacion = ref(null)
const aviso = ref('')

const puedeLiberar = computed(() => auth.tienePermiso('reservas.liberar_manual'))

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

async function liberar(motivo) {
  aviso.value = ''
  await reservas.liberar({ reserva_id: reservaEnLiberacion.value.id, motivo, usuario_id: auth.session.user.id })
  reservaEnLiberacion.value = null
  aviso.value = 'Reserva liberada.'
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
        <option v-for="f in reservas.frentes" :key="f.id" :value="f.id">{{ f.codigo }} — {{ f.nombre }}</option>
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
          <th v-if="puedeLiberar"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in reservas.reservas" :key="r.id" :class="{ prolongada: esProlongada(r) }">
          <td>{{ r.vale_detalle?.vales?.numero ?? '—' }}</td>
          <td>{{ r.frentes?.codigo }} — {{ r.frentes?.nombre }}</td>
          <td>{{ r.almacenes?.nombre ?? '—' }}</td>
          <td>{{ r.materiales?.codigo }} — {{ r.materiales?.descripcion }}</td>
          <td>{{ r.cantidad }} {{ r.materiales?.unidad }}</td>
          <td>{{ r.cantidad_entregada }}</td>
          <td>{{ r.cantidad - r.cantidad_entregada }}</td>
          <td>{{ diasDeAntiguedad(r.created_at) }} días</td>
          <td>
            <span class="badge" :class="r.estado.toLowerCase()">{{ r.estado }}</span>
          </td>
          <td v-if="puedeLiberar">
            <button
              v-if="['Activa', 'Parcial'].includes(r.estado)"
              class="mini"
              @click="reservaEnLiberacion = r"
            >
              Liberar
            </button>
          </td>
        </tr>
        <tr v-if="!reservas.reservas.length">
          <td colspan="10" class="vacio">No hay reservas para mostrar.</td>
        </tr>
      </tbody>
    </table>

    <LiberarReservaModal
      v-if="reservaEnLiberacion"
      :reserva="reservaEnLiberacion"
      @confirmar="liberar"
      @cerrar="reservaEnLiberacion = null"
    />
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
  color: #111827;
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
  color: #374151;
}
select {
  padding: 0.5rem 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}
.ayuda {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0 0 1rem;
}
button.mini {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.85rem;
}
.tabla th {
  background: #f3f4f6;
  color: #374151;
  font-weight: 600;
}
.tabla tr.prolongada td {
  background: #fffbeb;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.activa {
  background: #dbeafe;
  color: #1e40af;
}
.badge.parcial {
  background: #fef3c7;
  color: #92400e;
}
.badge.convertida {
  background: #dcfce7;
  color: #166534;
}
.badge.liberada,
.badge.cancelada {
  background: #f3f4f6;
  color: #6b7280;
}
.vacio {
  text-align: center;
  color: #6b7280;
}
.aviso {
  color: #166534;
  font-size: 0.9rem;
}
.error {
  color: #b91c1c;
  font-size: 0.9rem;
}
</style>

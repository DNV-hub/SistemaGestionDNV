<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'
import AprobarLineaModal from '../components/AprobarLineaModal.vue'
import CancelarValeModal from '../components/CancelarValeModal.vue'
import EntregaFormModal from '../components/EntregaFormModal.vue'

const route = useRoute()
const router = useRouter()
const vales = useValesStore()
const auth = useAuthStore()

const aviso = ref('')
const mostrarModalCancelar = ref(false)
const lineaEnAprobacion = ref(null)
const entregaEnProgreso = ref(null) // { linea, reserva }
const nuevaLinea = ref({ material_id: '', cantidad_solicitada: '' })

const vale = computed(() => vales.valeActual)
const esDueno = computed(() => vale.value?.supervisor_id === auth.session?.user?.id)
const ESTADOS_FINALES = ['Cancelado', 'Atendido', 'Cerrado', 'Rechazado']

const puedeEnviar = computed(
  () => esDueno.value && vale.value?.estado === 'Borrador' && auth.tienePermiso('vales.enviar')
)
const puedeEditarLineas = computed(
  () => esDueno.value && vale.value?.estado === 'Borrador' && auth.tienePermiso('vales.editar_propio')
)
const puedeCancelar = computed(
  () => auth.tienePermiso('vales.cancelar') && vale.value && !ESTADOS_FINALES.includes(vale.value.estado)
)
const puedeAprobarRechazar = computed(() => auth.tienePermiso('vales.aprobar_rechazar'))
const puedeRegistrarEntrega = computed(() => auth.tienePermiso('salidas.registrar_entrega'))
const LINEAS_CON_SALDO = ['Reservado', 'Parcialmente entregado']

function cargar() {
  vales.cargarDetalle(route.params.id)
}

onMounted(cargar)
watch(() => route.params.id, cargar)

async function enviar() {
  aviso.value = ''
  await vales.enviar(vale.value.id)
  aviso.value = 'Vale enviado para revisión.'
}

async function agregarLinea() {
  aviso.value = ''
  if (!nuevaLinea.value.material_id || Number(nuevaLinea.value.cantidad_solicitada) <= 0) {
    aviso.value = 'Selecciona un material y una cantidad válida.'
    return
  }
  await vales.agregarLinea(vale.value.id, {
    material_id: nuevaLinea.value.material_id,
    cantidad_solicitada: Number(nuevaLinea.value.cantidad_solicitada),
  })
  nuevaLinea.value = { material_id: '', cantidad_solicitada: '' }
}

async function quitarLinea(linea) {
  if (!confirm(`¿Quitar "${linea.materiales?.codigo}" del vale?`)) return
  await vales.eliminarLinea(vale.value.id, linea.id)
}

async function rechazar(linea) {
  if (!confirm(`¿Rechazar la línea "${linea.materiales?.codigo}"?`)) return
  aviso.value = ''
  await vales.rechazarLinea(linea.id)
  aviso.value = 'Línea rechazada.'
}

async function aprobar(payload) {
  await vales.aprobarLinea({ ...payload, usuario_id: auth.session.user.id })
  lineaEnAprobacion.value = null
  aviso.value = 'Línea aprobada y reservada.'
}

async function cancelarVale(motivo) {
  await vales.cancelar(auth.session.user.id, motivo)
  mostrarModalCancelar.value = false
  aviso.value = 'Vale cancelado.'
}

async function abrirEntrega(linea) {
  aviso.value = ''
  const reserva = await vales.obtenerReservaDeLinea(linea.id)
  if (!reserva) {
    aviso.value = 'Esta línea no tiene una reserva activa (puede que ya esté completamente entregada o liberada).'
    return
  }
  entregaEnProgreso.value = { linea, reserva }
}

async function registrarEntrega(payload) {
  const { linea, reserva } = entregaEnProgreso.value
  await vales.registrarEntrega({ linea, reserva, ...payload, usuario_id: auth.session.user.id })
  entregaEnProgreso.value = null
  aviso.value = 'Entrega registrada.'
}
</script>

<template>
  <div class="detalle">
    <button class="volver" @click="router.push('/vales')">&larr; Volver a Vales</button>

    <p v-if="vales.cargando">Cargando…</p>
    <p v-else-if="vales.error" class="error">{{ vales.error }}</p>

    <template v-else-if="vale">
      <header class="cabecera">
        <div>
          <h1>{{ vale.numero }}</h1>
          <p class="subtitulo">
            {{ vale.frentes?.codigo }} — {{ vale.frentes?.nombre }} · Supervisor: {{ vale.usuarios?.nombre }} · {{ vale.fecha }}
          </p>
        </div>
        <span class="badge" :class="vale.estado.toLowerCase().replace(/\s+/g, '-')">{{ vale.estado }}</span>
      </header>

      <p v-if="vale.observaciones" class="observaciones">{{ vale.observaciones }}</p>
      <p v-if="aviso" class="aviso">{{ aviso }}</p>

      <div class="acciones-vale">
        <button v-if="puedeEnviar" @click="enviar">Enviar para revisión</button>
        <button v-if="puedeCancelar" class="peligro" @click="mostrarModalCancelar = true">Cancelar vale</button>
      </div>

      <table class="tabla">
        <thead>
          <tr>
            <th>Material</th>
            <th>Unidad</th>
            <th>Solicitado</th>
            <th>Aprobado</th>
            <th>Entregado</th>
            <th>Estado</th>
            <th v-if="puedeAprobarRechazar || puedeEditarLineas || puedeRegistrarEntrega"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in vale.lineas" :key="l.id">
            <td>{{ l.materiales?.codigo }} — {{ l.materiales?.descripcion }}</td>
            <td>{{ l.materiales?.unidad }}</td>
            <td>{{ l.cantidad_solicitada }}</td>
            <td>{{ l.cantidad_aprobada ?? '—' }}</td>
            <td>{{ l.cantidad_entregada }}</td>
            <td>
              <span class="badge-linea" :class="l.estado.toLowerCase().replace(/\s+/g, '-')">{{ l.estado }}</span>
            </td>
            <td class="acciones-fila">
              <template v-if="puedeAprobarRechazar && l.estado === 'Pendiente'">
                <button class="mini" @click="lineaEnAprobacion = l">Aprobar</button>
                <button class="mini peligro" @click="rechazar(l)">Rechazar</button>
              </template>
              <button v-else-if="puedeEditarLineas && l.estado === 'Pendiente'" class="mini peligro" @click="quitarLinea(l)">
                Quitar
              </button>
              <button v-if="puedeRegistrarEntrega && LINEAS_CON_SALDO.includes(l.estado)" class="mini" @click="abrirEntrega(l)">
                Registrar entrega
              </button>
            </td>
          </tr>
          <tr v-if="!vale.lineas.length">
            <td colspan="7" class="vacio">Este vale todavía no tiene materiales.</td>
          </tr>
        </tbody>
      </table>

      <div v-if="puedeEditarLineas" class="agregar-linea">
        <BuscadorMaterial v-model="nuevaLinea.material_id" :materiales="vales.materialesActivos" class="buscador" />
        <input v-model="nuevaLinea.cantidad_solicitada" type="number" step="0.001" min="0.001" placeholder="Cantidad" />
        <button type="button" @click="agregarLinea">+ Agregar material</button>
      </div>
    </template>

    <AprobarLineaModal
      v-if="lineaEnAprobacion"
      :linea="lineaEnAprobacion"
      :almacenes-activos="vales.almacenesActivos"
      @aprobar="aprobar"
      @cerrar="lineaEnAprobacion = null"
    />

    <CancelarValeModal
      v-if="mostrarModalCancelar"
      @confirmar="cancelarVale"
      @cerrar="mostrarModalCancelar = false"
    />

    <EntregaFormModal
      v-if="entregaEnProgreso"
      :linea="entregaEnProgreso.linea"
      :reserva="entregaEnProgreso.reserva"
      @guardar="registrarEntrega"
      @cerrar="entregaEnProgreso = null"
    />
  </div>
</template>

<style scoped>
.detalle {
  padding: 1.5rem 2rem;
}
.volver {
  background: none;
  border: none;
  color: #2563eb;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
  margin-bottom: 1rem;
}
.cabecera {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: #111827;
}
.subtitulo {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: #6b7280;
}
.observaciones {
  font-size: 0.85rem;
  color: #374151;
  background: #f9fafb;
  padding: 0.5rem 0.7rem;
  border-radius: 4px;
  margin: 0.5rem 0;
}
.acciones-vale {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
button.peligro {
  background: #b91c1c;
}
button.mini {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
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
  font-size: 0.9rem;
}
.tabla th {
  background: #f3f4f6;
  color: #374151;
  font-weight: 600;
}
.acciones-fila {
  display: flex;
  gap: 0.4rem;
}
.badge,
.badge-linea {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.borrador,
.badge-linea.pendiente {
  background: #f3f4f6;
  color: #6b7280;
}
.badge.enviado,
.badge.en-revision {
  background: #dbeafe;
  color: #1e40af;
}
.badge.aprobado,
.badge.reservado,
.badge-linea.reservado {
  background: #e0e7ff;
  color: #3730a3;
}
.badge.parcialmente-atendido,
.badge-linea.parcialmente-entregado {
  background: #fef3c7;
  color: #92400e;
}
.badge.atendido,
.badge-linea.entregado {
  background: #dcfce7;
  color: #166534;
}
.badge.rechazado,
.badge.cancelado,
.badge-linea.rechazado,
.badge-linea.cancelado {
  background: #fee2e2;
  color: #991b1b;
}
.badge.cerrado {
  background: #f3f4f6;
  color: #6b7280;
}
.agregar-linea {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1rem;
}
.agregar-linea .buscador {
  flex: 1;
}
.agregar-linea input {
  width: 120px;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
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

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAlmacenStore } from '../store/almacen'
import { useAuthStore } from '../../../store/auth'
import AlmacenesModal from '../components/AlmacenesModal.vue'
import IngresoFormModal from '../components/IngresoFormModal.vue'
import AjusteFormModal from '../components/AjusteFormModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'

const almacen = useAlmacenStore()
const auth = useAuthStore()

const tab = ref('stock')
const mostrarModalAlmacenes = ref(false)
const mostrarModalIngreso = ref(false)
const mostrarModalAjuste = ref(false)
const ajustePrellenado = ref(null)
const aviso = ref('')

const puedeGestionarAlmacenes = computed(() => auth.tienePermiso('almacenes.gestionar'))
const puedeRegistrarIngreso = computed(() => auth.tienePermiso('stock.registrar_ingreso'))
const puedeRegistrarAjuste = computed(() => auth.tienePermiso('stock.registrar_ajuste'))
const puedeVerSalidas = computed(() => auth.tienePermiso('kardex.ver'))

function stockMinimoEfectivo(fila) {
  return fila.stock_minimo ?? fila.materiales?.stock_minimo_default ?? null
}

function bajoMinimo(fila) {
  const minimo = stockMinimoEfectivo(fila)
  return minimo !== null && fila.cantidad_disponible < minimo
}

onMounted(() => almacen.cargar())

async function crearAlmacen(payload) {
  await almacen.crearAlmacen(payload)
}

async function editarAlmacen({ id, payload }) {
  await almacen.actualizarAlmacen(id, payload)
}

async function eliminarAlmacen(a) {
  const resultado = await almacen.eliminarAlmacen(a.id)
  aviso.value = resultado.eliminado
    ? 'Almacén eliminado.'
    : 'Este almacén ya tiene stock o movimientos registrados, así que no se puede eliminar: se desactivó en su lugar.'
}

async function registrarIngreso(payload) {
  aviso.value = ''
  await almacen.registrarIngreso({ ...payload, usuario_id: auth.session.user.id })
  aviso.value = 'Ingreso registrado.'
  mostrarModalIngreso.value = false
}

async function registrarAjuste(payload) {
  aviso.value = ''
  await almacen.registrarAjuste({ ...payload, usuario_id: auth.session.user.id })
  aviso.value = 'Ajuste registrado.'
  cerrarModalAjuste()
}

function abrirAjuste() {
  ajustePrellenado.value = null
  mostrarModalAjuste.value = true
}

function cerrarModalAjuste() {
  mostrarModalAjuste.value = false
  ajustePrellenado.value = null
}

function abrirCorregirIngreso(i) {
  ajustePrellenado.value = {
    almacen_id: i.almacen_id,
    material_id: i.material_id,
    tipo: 'negativo',
    cantidad: i.cantidad,
    motivo: `Corrección del ingreso del ${i.fecha}${i.documento_referencia ? ' (doc. ' + i.documento_referencia + ')' : ''}.`,
    nota: `Corrigiendo ingreso de ${i.cantidad} ${i.materiales?.unidad ?? ''} de "${i.materiales?.codigo ?? ''}" en ${i.almacenes?.nombre ?? ''}. Ajusta el tipo/cantidad si la corrección es distinta.`,
  }
  mostrarModalAjuste.value = true
}

function abrirCorregirAjuste(a) {
  ajustePrellenado.value = {
    almacen_id: a.almacen_id,
    material_id: a.material_id,
    tipo: a.tipo === 'positivo' ? 'negativo' : 'positivo',
    cantidad: a.cantidad,
    motivo: `Corrección del ajuste ${a.tipo} del ${a.fecha}.`,
    nota: `Corrigiendo ajuste ${a.tipo} de ${a.cantidad} ${a.materiales?.unidad ?? ''} de "${a.materiales?.codigo ?? ''}" en ${a.almacenes?.nombre ?? ''}. Ajusta el tipo/cantidad si la corrección es distinta.`,
  }
  mostrarModalAjuste.value = true
}
</script>

<template>
  <div class="almacen">
    <header class="cabecera">
      <h1>Almacén</h1>
      <div class="acciones-cabecera">
        <button v-if="puedeGestionarAlmacenes" class="secundario" @click="mostrarModalAlmacenes = true">
          Almacenes
        </button>
        <button
          v-if="puedeRegistrarAjuste"
          class="secundario"
          :disabled="!almacen.almacenes.length"
          :title="!almacen.almacenes.length ? 'Crea un almacén primero' : ''"
          @click="abrirAjuste"
        >
          Registrar ajuste
        </button>
        <button
          v-if="puedeRegistrarIngreso"
          :disabled="!almacen.almacenes.length"
          :title="!almacen.almacenes.length ? 'Crea un almacén primero' : ''"
          @click="mostrarModalIngreso = true"
        >
          + Registrar ingreso
        </button>
      </div>
    </header>

    <nav class="tabs">
      <button :class="{ activo: tab === 'stock' }" @click="tab = 'stock'">Stock</button>
      <button :class="{ activo: tab === 'ingresos' }" @click="tab = 'ingresos'">Ingresos</button>
      <button :class="{ activo: tab === 'ajustes' }" @click="tab = 'ajustes'">Ajustes</button>
      <button v-if="puedeVerSalidas" :class="{ activo: tab === 'salidas' }" @click="tab = 'salidas'">Salidas</button>
    </nav>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="almacen.error" class="error">{{ almacen.error }}</p>
    <p v-if="!almacen.almacenes.length && !almacen.cargando" class="aviso-vacio">
      Todavía no hay almacenes creados. Usa el botón "Almacenes" para crear el primero.
    </p>

    <p v-if="almacen.cargando">Cargando…</p>

    <template v-else>
      <table v-if="tab === 'stock'" class="tabla">
        <thead>
          <tr>
            <th>Almacén</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Unidad</th>
            <th>Física</th>
            <th>Reservada</th>
            <th>Disponible</th>
            <th>Stock mínimo</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="fila in almacen.stock"
            :key="`${fila.almacen_id}-${fila.material_id}`"
            :class="{ 'bajo-minimo': bajoMinimo(fila) }"
          >
            <td>{{ fila.almacenes?.nombre ?? '—' }}</td>
            <td>{{ fila.materiales?.codigo ?? '—' }}</td>
            <td>{{ fila.materiales?.descripcion ?? '—' }}</td>
            <td>{{ fila.materiales?.unidad ?? '—' }}</td>
            <td>{{ fila.cantidad_fisica }}</td>
            <td>{{ fila.cantidad_reservada }}</td>
            <td>{{ fila.cantidad_disponible }}</td>
            <td>{{ stockMinimoEfectivo(fila) ?? '—' }}</td>
          </tr>
          <tr v-if="!almacen.stock.length">
            <td colspan="8" class="vacio">Sin movimientos de stock todavía.</td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'ingresos'" class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Almacén</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>Documento</th>
            <th>Proveedor</th>
            <th v-if="puedeRegistrarAjuste"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in almacen.ingresos" :key="i.id">
            <td>{{ i.fecha }}</td>
            <td>{{ i.almacenes?.nombre ?? '—' }}</td>
            <td>{{ i.materiales?.codigo ?? '—' }}</td>
            <td>{{ i.materiales?.descripcion ?? '—' }}</td>
            <td>{{ i.cantidad }}</td>
            <td>{{ i.documento_referencia ?? '—' }}</td>
            <td>{{ i.proveedor ?? '—' }}</td>
            <td v-if="puedeRegistrarAjuste">
              <BotonIcono variante="corregir" titulo="Corregir con un ajuste" @click="abrirCorregirIngreso(i)" />
            </td>
          </tr>
          <tr v-if="!almacen.ingresos.length">
            <td colspan="8" class="vacio">No hay ingresos registrados.</td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'ajustes'" class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Almacén</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Motivo</th>
            <th v-if="puedeRegistrarAjuste"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in almacen.ajustes" :key="a.id">
            <td>{{ a.fecha }}</td>
            <td>{{ a.almacenes?.nombre ?? '—' }}</td>
            <td>{{ a.materiales?.codigo ?? '—' }}</td>
            <td>{{ a.materiales?.descripcion ?? '—' }}</td>
            <td>
              <span class="badge" :class="a.tipo">{{ a.tipo }}</span>
            </td>
            <td>{{ a.cantidad }}</td>
            <td>{{ a.motivo }}</td>
            <td v-if="puedeRegistrarAjuste">
              <BotonIcono variante="corregir" titulo="Corregir con otro ajuste" @click="abrirCorregirAjuste(a)" />
            </td>
          </tr>
          <tr v-if="!almacen.ajustes.length">
            <td colspan="8" class="vacio">No hay ajustes registrados.</td>
          </tr>
        </tbody>
      </table>

      <table v-else class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Almacén</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Frente</th>
            <th>Cantidad</th>
            <th>Documento</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in almacen.salidas" :key="s.id">
            <td>{{ s.fecha }}</td>
            <td>{{ s.almacenes?.nombre ?? '—' }}</td>
            <td>{{ s.materiales?.codigo ?? '—' }}</td>
            <td>{{ s.materiales?.descripcion ?? '—' }}</td>
            <td>{{ s.frentes?.codigo }} — {{ s.frentes?.nombre }}</td>
            <td>{{ s.cantidad }}</td>
            <td>{{ s.documento_referencia ?? '—' }}</td>
          </tr>
          <tr v-if="!almacen.salidas.length">
            <td colspan="7" class="vacio">No hay salidas registradas.</td>
          </tr>
        </tbody>
      </table>
    </template>

    <AlmacenesModal
      v-if="mostrarModalAlmacenes"
      :almacenes="almacen.almacenes"
      @crear="crearAlmacen"
      @editar="editarAlmacen"
      @eliminar="eliminarAlmacen"
      @cerrar="mostrarModalAlmacenes = false"
    />

    <IngresoFormModal
      v-if="mostrarModalIngreso"
      :almacenes="almacen.almacenes"
      :materiales="almacen.materialesActivos"
      @guardar="registrarIngreso"
      @cerrar="mostrarModalIngreso = false"
    />

    <AjusteFormModal
      v-if="mostrarModalAjuste"
      :almacenes="almacen.almacenes"
      :materiales="almacen.materialesActivos"
      :prellenado="ajustePrellenado"
      @guardar="registrarAjuste"
      @cerrar="cerrarModalAjuste"
    />
  </div>
</template>

<style scoped>
.almacen {
  padding: 1.5rem 2rem;
}
.cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.acciones-cabecera {
  display: flex;
  gap: 0.5rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: #111827;
}
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
}
.tabs button {
  background: none;
  border: none;
  padding: 0.5rem 0.9rem;
  font-size: 0.9rem;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tabs button.activo {
  color: #111827;
  font-weight: 600;
  border-bottom-color: #1f2937;
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
.secundario {
  background: none;
  border: 1px solid #d1d5db;
  color: #374151;
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
.tabla tr.bajo-minimo td {
  background: #fef2f2;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.positivo {
  background: #dcfce7;
  color: #166534;
}
.badge.negativo {
  background: #fee2e2;
  color: #991b1b;
}
.vacio {
  text-align: center;
  color: #6b7280;
}
.aviso {
  color: #166534;
  font-size: 0.9rem;
}
.aviso-vacio {
  color: #92400e;
  background: #fffbeb;
  padding: 0.6rem 0.85rem;
  border-radius: 6px;
  font-size: 0.85rem;
}
.error {
  color: #b91c1c;
  font-size: 0.9rem;
}
</style>

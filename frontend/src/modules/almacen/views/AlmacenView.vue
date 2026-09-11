<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAlmacenStore } from '../store/almacen'
import { useAuthStore } from '../../../store/auth'
import AlmacenesModal from '../components/AlmacenesModal.vue'
import IngresoFormModal from '../components/IngresoFormModal.vue'
import AjusteFormModal from '../components/AjusteFormModal.vue'
import ImportarIngresosModal from '../components/ImportarIngresosModal.vue'
import ImportarMedidasIngresoModal from '../components/ImportarMedidasIngresoModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'
import { useDevolucionesStore } from '../../devoluciones/store/devoluciones'
import RecibirDevolucionModal from '../../devoluciones/components/RecibirDevolucionModal.vue'
import { descargarExcel } from '../../../utils/exportarExcel'
import { formatearNumero } from '../../../utils/formatearNumero'

const almacen = useAlmacenStore()
const auth = useAuthStore()
const devoluciones = useDevolucionesStore()

const tab = ref('stock')
const mostrarModalAlmacenes = ref(false)
const mostrarModalIngreso = ref(false)
const mostrarModalAjuste = ref(false)
const mostrarModalImportar = ref(false)
const mostrarModalImportarMedidas = ref(false)
const ingresosSinMedidas = ref([])
const exportandoSinMedidas = ref(false)
const ajustePrellenado = ref(null)
const devolucionARecibir = ref(null)
const aviso = ref('')

const puedeGestionarAlmacenes = computed(() => auth.tienePermiso('almacenes.gestionar'))
const puedeRegistrarIngreso = computed(() => auth.tienePermiso('stock.registrar_ingreso'))
const puedeRegistrarAjuste = computed(() => auth.tienePermiso('stock.registrar_ajuste'))
const puedeVerSalidas = computed(() => auth.tienePermiso('kardex.ver'))
const puedeVerDevoluciones = computed(
  () => auth.tienePermiso('devoluciones.ver_todas') || auth.tienePermiso('devoluciones.recibir_rechazar')
)
const puedeRecibirDevoluciones = computed(() => auth.tienePermiso('devoluciones.recibir_rechazar'))

async function recibirDevolucion({ devolucion_id, almacen_id }) {
  await devoluciones.recibir({ devolucion_id, almacen_id, usuario_id: auth.session.user.id })
  devolucionARecibir.value = null
  aviso.value = 'Devolución recibida.'
}

async function rechazarDevolucion(d) {
  const motivo = prompt(`¿Por qué se rechaza la devolución de "${d.materiales?.codigo}"?`)
  if (motivo === null) return
  await devoluciones.rechazar({ devolucion_id: d.id, motivo, usuario_id: auth.session.user.id })
  aviso.value = 'Devolución rechazada.'
}

function stockMinimoEfectivo(fila) {
  return fila.stock_minimo ?? fila.materiales?.stock_minimo_default ?? null
}

function bajoMinimo(fila) {
  const minimo = stockMinimoEfectivo(fila)
  return minimo !== null && fila.cantidad_disponible < minimo
}

// Buscador dinámico de la pestaña Stock: por nombre o código, para
// verificar rápido cuánto hay de un material sin desplazarse por toda la
// tabla.
const busquedaStock = ref('')
const stockFiltrado = computed(() => {
  const q = busquedaStock.value.trim().toLowerCase()
  if (!q) return almacen.stock
  return almacen.stock.filter(
    (fila) => fila.materiales?.descripcion?.toLowerCase().includes(q) || fila.materiales?.codigo?.toLowerCase().includes(q)
  )
})

onMounted(() => {
  almacen.cargar()
  if (puedeVerDevoluciones.value) devoluciones.cargar()
})

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

async function importarIngresosMasivo({ almacen_id, filas }) {
  aviso.value = ''
  const payload = filas.map((f) => ({
    almacen_id,
    contrato_id: f.contrato_id,
    material_id: f.material_id,
    cantidad: f.cantidad,
    ancho: f.ancho,
    largo: f.largo,
    documento_referencia: f.documento_referencia,
    proveedor: f.proveedor,
    observacion: f.observacion,
    usuario_id: auth.session.user.id,
  }))
  await almacen.importarIngresosMasivo(payload)
  aviso.value = `Se registraron ${payload.length} ingresos.`
}

/** aActualizarDescripcion de procesarFilasIngreso: [{id, codigo, descripcion?, unidad?}].
 * Se aplica ANTES de registrar los ingresos, para que el catálogo quede al
 * día con los nombres completos que trae la planilla de stock. */
async function actualizarDescripcionMasivo(aActualizarDescripcion) {
  await almacen.actualizarDescripcionMaterialesEnLote(aActualizarDescripcion)
}

/** materialesACrear de procesarFilasIngreso: variantes de código que todavía
 * no existían en el catálogo. Devuelve los materiales creados (con su id
 * real) para que el modal pueda resolver material_id en las filas
 * pendientes antes de registrar los ingresos. */
async function crearMaterialesMasivo(materialesACrear) {
  return almacen.crearMaterialesFaltantes(materialesACrear)
}

/** Plantilla lista para llenar: un renglón por cada material activo, con
 * su código/descripción/conversión ya puestos — solo hay que cargar
 * cantidad (y ancho/largo donde corresponda) y borrar las filas que no
 * apliquen para este ingreso. */
function descargarPlantillaIngresos() {
  descargarExcel('plantilla_ingreso_masivo.xlsx', [
    {
      nombre: 'Ingresos',
      filas: almacen.materialesActivos.map((m) => ({
        CODIGO: m.codigo,
        'DESCRIPCION ALMACEN': m.descripcion,
        'UNIDAD ALMACEN': m.unidad,
        CONVERSION: m.tipo_conversion ?? 'ninguna',
        CANTIDAD: '',
        ANCHO: '',
        LARGO: '',
        CONTRATO: '',
        DOCUMENTO: '',
        PROVEEDOR: '',
        OBSERVACION: '',
      })),
    },
  ])
}

/**
 * Exporta los ingresos que necesitan conversión (ej. malla, anclajes) y
 * todavía no tienen ancho/largo cargados — típicamente el stock inicial,
 * subido por Excel antes de que existiera esta columna. La columna ID no
 * se toca: es lo que usa "Importar medidas" para encontrar cada fila real.
 */
async function exportarSinMedidas() {
  aviso.value = ''
  exportandoSinMedidas.value = true
  try {
    ingresosSinMedidas.value = await almacen.obtenerIngresosSinMedidas()
    if (!ingresosSinMedidas.value.length) {
      aviso.value = 'No hay ingresos pendientes de medidas.'
      return
    }
    // Las columnas que necesitás leer para completar ANCHO/LARGO van
    // primero y con los mismos nombres que usa el Catálogo (Código,
    // Descripción Almacén); el ID técnico —el que conecta cada fila con el
    // ingreso real al reimportar, no se edita ni se borra— va al final,
    // y hay un N° simple para no tener que mirar ese ID mientras completás.
    descargarExcel(`ingresos_sin_medidas_${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        nombre: 'Sin medidas',
        filas: ingresosSinMedidas.value.map((i, idx) => ({
          'N°': idx + 1,
          CODIGO: i.materiales?.codigo ?? '',
          'DESCRIPCION ALMACEN': i.materiales?.descripcion ?? '',
          'UNIDAD ALMACEN': i.materiales?.unidad ?? '',
          CONVERSION: i.materiales?.tipo_conversion ?? '',
          CANTIDAD: i.cantidad,
          ANCHO: '',
          LARGO: '',
          FECHA: i.fecha,
          ALMACEN: i.almacenes ? `${i.almacenes.codigo} — ${i.almacenes.nombre}` : '',
          DOCUMENTO: i.documento_referencia ?? '',
          ID: i.id,
        })),
      },
    ])
  } catch (e) {
    console.error(e)
    aviso.value = 'No se pudo exportar.'
  } finally {
    exportandoSinMedidas.value = false
  }
}

async function abrirImportarMedidas() {
  aviso.value = ''
  if (!ingresosSinMedidas.value.length) {
    ingresosSinMedidas.value = await almacen.obtenerIngresosSinMedidas()
  }
  mostrarModalImportarMedidas.value = true
}

async function importarMedidas(aAplicar) {
  const fallidos = await almacen.importarMedidasIngresos(aAplicar)
  ingresosSinMedidas.value = await almacen.obtenerIngresosSinMedidas()
  return fallidos
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
    contrato_id: i.contrato_id,
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
    contrato_id: a.contrato_id,
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
          class="secundario"
          :disabled="!almacen.almacenes.length"
          :title="!almacen.almacenes.length ? 'Crea un almacén primero' : ''"
          @click="mostrarModalImportar = true"
        >
          Importar ingreso masivo
        </button>
        <button v-if="puedeRegistrarIngreso" class="secundario" @click="descargarPlantillaIngresos">
          Descargar plantilla
        </button>
        <button v-if="puedeRegistrarIngreso" class="secundario" :disabled="exportandoSinMedidas" @click="exportarSinMedidas">
          {{ exportandoSinMedidas ? 'Exportando…' : 'Exportar sin medidas' }}
        </button>
        <button v-if="puedeRegistrarIngreso" class="secundario" @click="abrirImportarMedidas">
          Importar medidas
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
      <button v-if="puedeVerDevoluciones" :class="{ activo: tab === 'devoluciones' }" @click="tab = 'devoluciones'">
        Devoluciones
        <span v-if="devoluciones.devoluciones.filter((d) => d.estado === 'Solicitada').length" class="contador">
          {{ devoluciones.devoluciones.filter((d) => d.estado === 'Solicitada').length }}
        </span>
      </button>
    </nav>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="almacen.error" class="error">{{ almacen.error }}</p>
    <p v-if="!almacen.almacenes.length && !almacen.cargando" class="aviso-vacio">
      Todavía no hay almacenes creados. Usa el botón "Almacenes" para crear el primero.
    </p>

    <p v-if="almacen.cargando">Cargando…</p>

    <template v-else>
      <template v-if="tab === 'stock'">
        <div class="fila-buscador">
          <input
            v-model="busquedaStock"
            type="search"
            class="buscador-stock"
            placeholder="Buscar por nombre o código…"
          />
          <span class="contador-stock">
            {{ stockFiltrado.length }}{{ busquedaStock.trim() ? ` de ${almacen.stock.length}` : '' }}
            {{ stockFiltrado.length === 1 ? 'fila' : 'filas' }}
          </span>
        </div>
        <table class="tabla">
          <thead>
            <tr>
              <th>Almacén</th>
              <th>Contrato</th>
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
              v-for="fila in stockFiltrado"
              :key="`${fila.almacen_id}-${fila.material_id}-${fila.contrato_id}`"
              :class="{ 'bajo-minimo': bajoMinimo(fila) }"
            >
              <td>{{ fila.almacenes?.nombre ?? '—' }}</td>
              <td>{{ fila.contratos?.nombre ?? '—' }}</td>
              <td>{{ fila.materiales?.codigo ?? '—' }}</td>
              <td>{{ fila.materiales?.descripcion ?? '—' }}</td>
              <td>{{ fila.materiales?.unidad ?? '—' }}</td>
              <td class="num">{{ formatearNumero(fila.cantidad_fisica) }}</td>
              <td class="num">{{ formatearNumero(fila.cantidad_reservada) }}</td>
              <td class="num">{{ formatearNumero(fila.cantidad_disponible) }}</td>
              <td class="num">{{ formatearNumero(stockMinimoEfectivo(fila)) }}</td>
            </tr>
            <tr v-if="!stockFiltrado.length">
              <td colspan="9" class="vacio">
                {{ almacen.stock.length ? 'Ningún material coincide con la búsqueda.' : 'Sin movimientos de stock todavía.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <table v-else-if="tab === 'ingresos'" class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Almacén</th>
            <th>Contrato</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>Ancho</th>
            <th>Largo</th>
            <th>Restante</th>
            <th>Documento</th>
            <th>Proveedor</th>
            <th>Registrado por</th>
            <th v-if="puedeRegistrarAjuste"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in almacen.ingresos" :key="i.id">
            <td>{{ i.fecha }}</td>
            <td>{{ i.almacenes?.nombre ?? '—' }}</td>
            <td>{{ i.contratos?.nombre ?? '—' }}</td>
            <td>{{ i.materiales?.codigo ?? '—' }}</td>
            <td>{{ i.materiales?.descripcion ?? '—' }}</td>
            <td class="num">{{ formatearNumero(i.cantidad) }}</td>
            <td class="num">{{ i.ancho != null ? formatearNumero(i.ancho) : '—' }}</td>
            <td class="num">{{ i.largo != null ? formatearNumero(i.largo) : '—' }}</td>
            <td class="num">{{ i.cantidad_restante != null ? formatearNumero(i.cantidad_restante) : '—' }}</td>
            <td>{{ i.documento_referencia ?? '—' }}</td>
            <td>{{ i.proveedor ?? '—' }}</td>
            <td>{{ i.usuarios?.nombre ?? '—' }}</td>
            <td v-if="puedeRegistrarAjuste">
              <BotonIcono variante="corregir" titulo="Corregir con un ajuste" @click="abrirCorregirIngreso(i)" />
            </td>
          </tr>
          <tr v-if="!almacen.ingresos.length">
            <td colspan="13" class="vacio">No hay ingresos registrados.</td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'ajustes'" class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Almacén</th>
            <th>Contrato</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Motivo</th>
            <th>Registrado por</th>
            <th v-if="puedeRegistrarAjuste"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in almacen.ajustes" :key="a.id">
            <td>{{ a.fecha }}</td>
            <td>{{ a.almacenes?.nombre ?? '—' }}</td>
            <td>{{ a.contratos?.nombre ?? '—' }}</td>
            <td>{{ a.materiales?.codigo ?? '—' }}</td>
            <td>{{ a.materiales?.descripcion ?? '—' }}</td>
            <td>
              <span class="badge" :class="a.tipo">{{ a.tipo }}</span>
            </td>
            <td class="num">{{ formatearNumero(a.cantidad) }}</td>
            <td>{{ a.motivo }}</td>
            <td>{{ a.usuarios?.nombre ?? '—' }}</td>
            <td v-if="puedeRegistrarAjuste">
              <BotonIcono variante="corregir" titulo="Corregir con otro ajuste" @click="abrirCorregirAjuste(a)" />
            </td>
          </tr>
          <tr v-if="!almacen.ajustes.length">
            <td colspan="10" class="vacio">No hay ajustes registrados.</td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'salidas'" class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Almacén</th>
            <th>Contrato</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Frente</th>
            <th>Cantidad</th>
            <th>Documento</th>
            <th>Registrado por</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in almacen.salidas" :key="s.id">
            <td>{{ s.fecha }}</td>
            <td>{{ s.almacenes?.nombre ?? '—' }}</td>
            <td>{{ s.contratos?.nombre ?? '—' }}</td>
            <td>{{ s.materiales?.codigo ?? '—' }}</td>
            <td>{{ s.materiales?.descripcion ?? '—' }}</td>
            <td>{{ s.frentes?.codigo ? s.frentes.codigo + ' — ' : '' }}{{ s.frentes?.nombre }}</td>
            <td class="num">{{ formatearNumero(s.cantidad) }}</td>
            <td>{{ s.documento_referencia ?? '—' }}</td>
            <td>{{ s.usuarios?.nombre ?? '—' }}</td>
          </tr>
          <tr v-if="!almacen.salidas.length">
            <td colspan="9" class="vacio">No hay salidas registradas.</td>
          </tr>
        </tbody>
      </table>

      <table v-else class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Frente</th>
            <th>Código</th>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>Estado material</th>
            <th>Supervisor</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in devoluciones.devoluciones" :key="d.id">
            <td>{{ d.fecha }}</td>
            <td>{{ d.frentes?.codigo ? d.frentes.codigo + ' — ' : '' }}{{ d.frentes?.nombre }}</td>
            <td>{{ d.materiales?.codigo ?? '—' }}</td>
            <td>{{ d.materiales?.descripcion ?? '—' }}</td>
            <td class="num">{{ formatearNumero(d.cantidad) }} {{ d.materiales?.unidad }}</td>
            <td>
              <span class="badge" :class="d.estado_material">{{ d.estado_material === 'bueno' ? 'Bueno' : 'Dañado' }}</span>
            </td>
            <td>{{ d.supervisor?.nombre ?? '—' }}</td>
            <td>
              <span class="badge" :class="d.estado.toLowerCase()">{{ d.estado }}</span>
            </td>
            <td v-if="puedeRecibirDevoluciones" class="acciones-fila">
              <template v-if="d.estado === 'Solicitada'">
                <button type="button" class="mini" @click="devolucionARecibir = d">Recibir</button>
                <button type="button" class="mini peligro" @click="rechazarDevolucion(d)">Rechazar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!devoluciones.devoluciones.length">
            <td colspan="9" class="vacio">No hay devoluciones registradas.</td>
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
      :contratos="almacen.contratos"
      @guardar="registrarIngreso"
      @cerrar="mostrarModalIngreso = false"
    />

    <AjusteFormModal
      v-if="mostrarModalAjuste"
      :almacenes="almacen.almacenes"
      :materiales="almacen.materialesActivos"
      :contratos="almacen.contratos"
      :prellenado="ajustePrellenado"
      @guardar="registrarAjuste"
      @cerrar="cerrarModalAjuste"
    />

    <ImportarIngresosModal
      v-if="mostrarModalImportar"
      :almacenes="almacen.almacenes"
      :contratos="almacen.contratos"
      :materiales="almacen.materialesActivos"
      @importar="importarIngresosMasivo"
      @actualizar-descripcion="actualizarDescripcionMasivo"
      @crear-materiales="crearMaterialesMasivo"
      @cerrar="mostrarModalImportar = false"
    />

    <ImportarMedidasIngresoModal
      v-if="mostrarModalImportarMedidas"
      :ingresos-sin-medidas="ingresosSinMedidas"
      @aplicar="importarMedidas"
      @cerrar="mostrarModalImportarMedidas = false"
    />

    <RecibirDevolucionModal
      v-if="devolucionARecibir"
      :devolucion="devolucionARecibir"
      :almacenes="almacen.almacenes"
      @recibir="recibirDevolucion"
      @cerrar="devolucionARecibir = null"
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
  color: var(--color-text);
}
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}
.tabs button {
  background: none;
  border: none;
  padding: 0.5rem 0.9rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tabs button.activo {
  color: var(--color-text);
  font-weight: 600;
  border-bottom-color: var(--color-primary);
}
.tabs .contador {
  margin-left: 0.3rem;
  padding: 0.05rem 0.4rem;
  border-radius: var(--radius-pill);
  background: var(--color-danger);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}
.mini {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
}
.mini.peligro {
  background: var(--color-danger);
}
.acciones-fila {
  display: flex;
  gap: 0.35rem;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.fila-buscador {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.buscador-stock {
  width: 100%;
  max-width: 360px;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
.contador-stock {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  white-space: nowrap;
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
  font-size: 0.9rem;
}
.tabla th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tabla tr.bajo-minimo td {
  background: var(--color-danger-soft);
}
/* Formato "Contabilidad" de Excel: números agrupados de a miles,
   alineados a la derecha, con ancho de dígito fijo (que no "bailen" entre
   filas). */
.tabla td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.positivo {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.negativo {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge.bueno {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.danado {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge.solicitada {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.recibida {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.rechazada {
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
.aviso-vacio {
  color: var(--color-warning);
  background: var(--color-warning-soft);
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-control);
  font-size: 0.85rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

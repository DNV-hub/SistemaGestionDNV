<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useAuthStore } from '../../../store/auth'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'
import AprobarLineaModal from '../components/AprobarLineaModal.vue'
import CancelarValeModal from '../components/CancelarValeModal.vue'
import EntregaFormModal from '../components/EntregaFormModal.vue'
import { formatearNumero } from '../../../utils/formatearNumero'
import { marcarValeVisto } from '../services/valesService'
import { textoEntregaParaCompartir, textoRequerimientoParaCompartir } from '../services/valesMensajes'

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

async function cargar() {
  await vales.cargarDetalle(route.params.id)
  // El badge de "novedades" del sidebar se apaga acá: abrir el detalle de
  // un vale propio que ya tuvo una decisión (aprobado/rechazado/atendido)
  // es la señal de que el supervisor la vio. Mientras sigue en Borrador no
  // hay ninguna novedad que marcar — es su propio vale, sin decisión aún.
  if (esDueno.value && vale.value && vale.value.estado !== 'Borrador') {
    marcarValeVisto(vale.value.id).catch(() => {})
  }
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

const mensajeEntrega = ref('')
const copiado = ref(false)

async function registrarEntrega(payload) {
  const { linea, reserva } = entregaEnProgreso.value
  await vales.registrarEntrega({ linea, reserva, ...payload, usuario_id: auth.session.user.id })
  copiado.value = false
  mensajeEntrega.value = textoEntregaParaCompartir({
    vale: vale.value,
    material: linea.materiales?.descripcion ?? '—',
    unidad: linea.materiales?.unidad ?? '',
    cantidad: payload.cantidad,
    almacen: reserva.almacenes?.nombre,
    supervisorNombre: vale.value?.usuarios?.nombre,
    registradoPor: auth.perfil?.nombre,
  })
  entregaEnProgreso.value = null
  aviso.value = 'Entrega registrada.'
}

async function copiarMensajeEntrega() {
  try {
    await navigator.clipboard.writeText(mensajeEntrega.value)
    copiado.value = true
  } catch {
    // Portapapeles bloqueado (navegador viejo, permiso denegado): el
    // textarea sigue mostrando el texto para seleccionarlo y copiarlo a
    // mano, así que no hace falta más que avisar.
    aviso.value = 'No se pudo copiar automáticamente — selecciona el texto y cópialo a mano.'
  }
}

// Mensaje de "acabo de mandar este requerimiento" para el grupo de
// WhatsApp — a diferencia del de entrega (que se genera solo apenas
// Almacén registra la entrega), este es a pedido: el supervisor arma su
// vale con la app y, si quiere avisar igual por WhatsApp mientras el
// resto de la cuadrilla todavía no usa el sistema, lo genera cuando
// quiera desde acá, no solo una vez al crearlo.
const mensajeRequerimiento = ref('')
const copiadoRequerimiento = ref(false)

function generarMensajeRequerimiento() {
  mensajeRequerimiento.value = textoRequerimientoParaCompartir({
    vale: vale.value,
    supervisorNombre: vale.value?.usuarios?.nombre,
    actividad: vale.value?.actividad,
  })
  copiadoRequerimiento.value = false
}

async function copiarMensajeRequerimiento() {
  try {
    await navigator.clipboard.writeText(mensajeRequerimiento.value)
    copiadoRequerimiento.value = true
  } catch {
    aviso.value = 'No se pudo copiar automáticamente — selecciona el texto y cópialo a mano.'
  }
}

/**
 * Situación de una línea frente a stock y Procura, para alertar al que
 * aprueba/revisa sin que tenga que ir a mirar otras pantallas (Almacén,
 * Procura). Ver vales.store._cargarAlertas.
 */
function fechaHoraEnvio(v) {
  const iso = v.fecha_envio ?? v.created_at
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

function situacion(linea) {
  const disponible = vales.alertasStockPorMaterial.get(linea.material_id) ?? 0
  const procura = vales.alertasProcuraPorMaterial.get(linea.material_id) ?? null
  const umbral = vales.alertasUmbralSobreconsumo

  const stock = {
    texto: disponible > 0 ? `Stock: ${disponible}` : 'Sin stock',
    nivel: disponible <= 0 ? 'danger' : disponible < linea.cantidad_solicitada ? 'warning' : 'ok',
  }

  if (!procura) {
    return { stock, procura: { texto: 'No contemplado en Procura', nivel: 'warning' }, saldo: null }
  }

  const pct = procura.porcentaje_consumo
  const procuraChip = {
    texto: pct === null ? `Previsto: ${procura.cantidad_prevista}` : `Procura: ${pct}% consumido`,
    nivel: pct !== null && pct >= umbral ? 'danger' : pct !== null && pct >= umbral * 0.8 ? 'warning' : 'ok',
  }

  const saldo =
    procura.saldo < Number(linea.cantidad_solicitada)
      ? { texto: `Excede el saldo de Procura (saldo: ${procura.saldo})`, nivel: 'danger' }
      : null

  return { stock, procura: procuraChip, saldo }
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
            {{ vale.frentes?.codigo ? vale.frentes.codigo + ' — ' : '' }}{{ vale.frentes?.nombre }} · Supervisor: {{ vale.usuarios?.nombre }} · {{ fechaHoraEnvio(vale) }}
          </p>
          <p v-if="vale.creado_por" class="subtitulo cargado-por">
            Cargado manualmente{{ vale.creador?.nombre ? ' por ' + vale.creador.nombre : '' }}
          </p>
        </div>
        <span class="badge" :class="vale.estado.toLowerCase().replace(/\s+/g, '-')">{{ vale.estado }}</span>
      </header>

      <p v-if="vale.actividad" class="observaciones">Actividad: {{ vale.actividad }}</p>
      <p v-if="vale.observaciones" class="observaciones">{{ vale.observaciones }}</p>
      <p v-if="aviso" class="aviso">{{ aviso }}</p>

      <div v-if="mensajeEntrega" class="mensaje-wtpp">
        <div class="mensaje-wtpp-cabecera">
          <span>Mientras el supervisor no use la app, avísale por WhatsApp:</span>
          <button type="button" class="cerrar-mensaje" aria-label="Cerrar" @click="mensajeEntrega = ''">✕</button>
        </div>
        <textarea readonly :value="mensajeEntrega" rows="8"></textarea>
        <button type="button" class="copiar-mensaje" @click="copiarMensajeEntrega">
          {{ copiado ? '✓ Copiado' : 'Copiar mensaje' }}
        </button>
      </div>

      <div v-if="mensajeRequerimiento" class="mensaje-wtpp">
        <div class="mensaje-wtpp-cabecera">
          <span>Mientras el resto de la cuadrilla no usa la app, avisa por WhatsApp:</span>
          <button type="button" class="cerrar-mensaje" aria-label="Cerrar" @click="mensajeRequerimiento = ''">✕</button>
        </div>
        <textarea readonly :value="mensajeRequerimiento" rows="10"></textarea>
        <button type="button" class="copiar-mensaje" @click="copiarMensajeRequerimiento">
          {{ copiadoRequerimiento ? '✓ Copiado' : 'Copiar mensaje' }}
        </button>
      </div>

      <div class="acciones-vale">
        <button v-if="puedeEnviar" @click="enviar">Enviar para revisión</button>
        <button type="button" class="secundario" @click="generarMensajeRequerimiento">Generar mensaje para WhatsApp</button>
        <button v-if="puedeCancelar" class="peligro" @click="mostrarModalCancelar = true">Cancelar vale</button>
      </div>

      <div class="tabla-wrap">
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
          <template v-for="l in vale.lineas" :key="l.id">
            <tr>
              <td>{{ l.materiales?.codigo }} — {{ l.materiales?.descripcion }}</td>
              <td>{{ l.materiales?.unidad }}</td>
              <td class="num">{{ formatearNumero(l.cantidad_solicitada) }}</td>
              <td class="num">{{ formatearNumero(l.cantidad_aprobada) }}</td>
              <td class="num">{{ formatearNumero(l.cantidad_entregada) }}</td>
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
            <tr class="fila-situacion">
              <td colspan="7">
                <span class="chip" :class="situacion(l).stock.nivel">{{ situacion(l).stock.texto }}</span>
                <span class="chip" :class="situacion(l).procura.nivel">{{ situacion(l).procura.texto }}</span>
                <span v-if="situacion(l).saldo" class="chip" :class="situacion(l).saldo.nivel">{{ situacion(l).saldo.texto }}</span>
              </td>
            </tr>
          </template>
          <tr v-if="!vale.lineas.length">
            <td colspan="7" class="vacio">Este vale todavía no tiene materiales.</td>
          </tr>
        </tbody>
      </table>
      </div>

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
  color: var(--color-primary);
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
  color: var(--color-text);
}
.subtitulo {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.cargado-por {
  font-style: italic;
}
.observaciones {
  font-size: 0.85rem;
  color: var(--color-text);
  background: var(--color-surface-2);
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-control);
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
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
button.peligro {
  background: var(--color-danger);
}
button.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
button.mini {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
}
.tabla-wrap {
  /* La tabla puede necesitar más ancho del que entra en un celular: que
     haga scroll horizontal ella sola, nunca la página completa (eso es lo
     que hacía "temblar" la barra de pestañas fija en iOS). */
  overflow-x: auto;
  border-radius: var(--radius-card);
}
.tabla {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  background: var(--color-surface);
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
}
.tabla td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tabla th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.acciones-fila {
  display: flex;
  gap: 0.4rem;
}
.fila-situacion td {
  padding: 0 0.75rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-2);
}
.chip {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  font-weight: 600;
  margin-right: 0.4rem;
}
.chip.ok {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.chip.warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.chip.danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge,
.badge-linea {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.borrador,
.badge-linea.pendiente {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.badge.enviado,
.badge.en-revision {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.aprobado,
.badge.reservado,
.badge-linea.reservado {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.parcialmente-atendido,
.badge-linea.parcialmente-entregado {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.atendido,
.badge-linea.entregado {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.rechazado,
.badge.cancelado,
.badge-linea.rechazado,
.badge-linea.cancelado {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge.cerrado {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
}
.aviso {
  color: var(--color-success);
  font-size: 0.9rem;
}
.mensaje-wtpp {
  margin: 0.75rem 0;
  padding: 0.75rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.mensaje-wtpp-cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.cerrar-mensaje {
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.1rem 0.3rem;
}
.mensaje-wtpp textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  font-family: inherit;
  font-size: 0.85rem;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
}
.copiar-mensaje {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  .detalle {
    padding: 1rem;
  }
  .cabecera {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .acciones-vale {
    flex-direction: column;
  }
  .acciones-vale button {
    width: 100%;
  }
  .agregar-linea {
    flex-wrap: wrap;
  }
  .agregar-linea input {
    width: 100%;
  }
}
</style>

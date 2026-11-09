<script setup>
import { computed, nextTick, reactive, ref, useAttrs, watch } from 'vue'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'
import BuscadorSimple from '../../../components/BuscadorSimple.vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'
import { obtenerProcuraParaSimulacion } from '../services/valesService'
import { formatearNumero } from '../../../utils/formatearNumero'

const props = defineProps({
  frentesActivos: { type: Array, default: () => [] },
  materialesActivos: { type: Array, default: () => [] },
  // Solo quien puede crear vales a nombre de otro (Almacén cargando algo
  // que llegó por WhatsApp) ve este selector; un supervisor que crea su
  // propio vale no lo necesita, el dueño ya es él mismo.
  supervisoresActivos: { type: Array, default: null },
  // id de material -> cantidad disponible ahora, para mostrarla al lado de
  // cada línea a medida que se elige el material — igual que ya lo ve el
  // supervisor en su propio panel, para no pedir a ciegas algo que no hay.
  stockPorMaterial: { type: Map, default: () => new Map() },
  // Otros tipos de movimiento que se pueden iniciar desde "Nuevo vale"
  // (Devolver material, Transferir material): [{ clave, etiqueta }]. El
  // requerimiento es siempre el de por defecto; elegir otro cierra este
  // formulario y abre el de ese movimiento.
  tipos: { type: Array, default: () => [] },
})

const opcionesFrentes = computed(() =>
  props.frentesActivos.map((f) => ({ value: f.id, etiqueta: f.codigo ? `${f.codigo} — ${f.nombre}` : f.nombre }))
)
const opcionesSupervisores = computed(() => (props.supervisoresActivos ?? []).map((s) => ({ value: s.id, etiqueta: s.nombre })))

defineEmits(['cerrar', 'cambiar-tipo'])
const attrs = useAttrs()

const mostrarSelectorSupervisor = computed(() => props.supervisoresActivos !== null)

const form = reactive({
  // Vacío a propósito: precargar el primer frente de la lista hacía que el
  // campo se viera como un dato fijo ("PO — PLATAFORMA") en vez de un
  // buscador — el almacenero pensó que ese era el único frente que existía.
  // Así arranca en blanco, con el placeholder "Escribe para buscar…"
  // visible, y obliga a elegir uno a propósito (ya valida abajo si se
  // manda vacío).
  frente_id: '',
  supervisor_id: '',
  actividad: '',
  observaciones: '',
})
// Materiales ya agregados al vale. Arranca vacía: el material se arma en la
// fila de captura de arriba (material → Tab → cantidad → Enter) y recién al
// agregarlo pasa a esta lista.
const lineas = ref([])
const guardando = ref(false)
const error = ref('')

// ---------------------------------------------------------------------------
// Captura rápida, pensada para teclado: se escribe el material y Enter lo
// elige (o Tab), el cursor salta solo a la cantidad, Enter agrega la línea y
// el cursor vuelve al material para pedir el siguiente.
// ---------------------------------------------------------------------------
const entrada = reactive({ material_id: '', cantidad: '' })
const errorEntrada = ref('')
const buscadorRef = ref(null)
const cantidadRef = ref(null)

function enfocarMaterial() {
  nextTick(() => buscadorRef.value?.$el?.querySelector('input')?.focus())
}

// Al elegir un material (con Enter, Tab o mouse) el cursor pasa a la cantidad.
watch(
  () => entrada.material_id,
  (id) => {
    errorEntrada.value = ''
    if (id) {
      nextTick(() => {
        cantidadRef.value?.focus()
        cantidadRef.value?.select?.()
      })
    }
  }
)

const redondear = (n) => Math.round(n * 1000) / 1000

/** Pasa lo escrito en la fila de captura a la lista. true si se agregó. */
function agregar() {
  errorEntrada.value = ''
  if (!entrada.material_id) {
    errorEntrada.value = 'Elige primero un material de la lista.'
    return false
  }
  const cantidad = Number(entrada.cantidad)
  if (!(cantidad > 0)) {
    errorEntrada.value = 'Escribe la cantidad que necesitas.'
    cantidadRef.value?.focus()
    return false
  }
  const disponible = disponibleDe(entrada.material_id) ?? 0
  const existente = lineas.value.find((l) => l.material_id === entrada.material_id)
  const yaPedido = Number(existente?.cantidad_solicitada) || 0
  if (cantidad + yaPedido > disponible) {
    errorEntrada.value =
      yaPedido > 0
        ? `Solo hay ${disponible} ${unidadDe(entrada.material_id)} disponibles y ya pediste ${yaPedido}.`
        : `Solo hay ${disponible} ${unidadDe(entrada.material_id)} disponibles ahora.`
    cantidadRef.value?.focus()
    return false
  }
  if (existente) existente.cantidad_solicitada = redondear(yaPedido + cantidad)
  else lineas.value.push({ material_id: entrada.material_id, cantidad_solicitada: cantidad })
  entrada.material_id = ''
  entrada.cantidad = ''
  enfocarMaterial()
  return true
}

function quitarLinea(idx) {
  lineas.value.splice(idx, 1)
}

function unidadDe(materialId) {
  return props.materialesActivos.find((m) => m.id === materialId)?.unidad ?? ''
}

function disponibleDe(materialId) {
  if (!materialId) return null
  return props.stockPorMaterial.get(materialId) ?? 0
}

function descripcionDe(materialId) {
  return props.materialesActivos.find((m) => m.id === materialId)?.descripcion ?? 'ese material'
}

// Si se corrige la cantidad de una línea ya agregada, se topa con el stock al
// salir del campo (no en cada tecla, para no pelear con lo que se escribe) y
// de nuevo se valida al mandar.
function limitarCantidad(linea) {
  const max = disponibleDe(linea.material_id)
  const n = Number(linea.cantidad_solicitada)
  if (max !== null && Number.isFinite(n) && n > max) linea.cantidad_solicitada = max
}

// Aviso de Procura (no bloquea, solo informa): se recalcula cada vez que
// cambia el frente o los materiales elegidos — todavía no existe una
// reserva real que `procura_vs_consumo` pueda contar por su cuenta, así que
// se simula acá mismo cuánto pesaría esta cantidad en la unidad EDP del
// grupo antes de mandarla.
const procuraPorMaterial = ref(new Map())
async function refrescarProcura() {
  const ids = [...new Set(lineas.value.map((l) => l.material_id).filter(Boolean))]
  if (!form.frente_id || !ids.length) {
    procuraPorMaterial.value = new Map()
    return
  }
  try {
    procuraPorMaterial.value = await obtenerProcuraParaSimulacion({ frenteId: form.frente_id, materialIds: ids })
  } catch (e) {
    console.error(e)
    // Silencioso a propósito: es solo un aviso informativo, no debe impedir
    // armar el vale si esta consulta falla por algo (ej. permisos).
  }
}
watch(() => `${form.frente_id}|${lineas.value.map((l) => l.material_id).join(',')}`, refrescarProcura)

function alertaProcuraDe(linea) {
  const fila = procuraPorMaterial.value.get(linea.material_id)
  const cantidad = Number(linea.cantidad_solicitada)
  if (!fila || !cantidad || cantidad <= 0) return null
  const factor = fila.factor ?? 1
  const convertida = cantidad * factor
  const saldo = Number(fila.saldo)
  if (!Number.isFinite(saldo) || convertida <= saldo) return null
  const prevista = Number(fila.cantidad_prevista)
  const consumido = prevista - saldo
  const exceso = convertida - saldo
  // Solo tiene sentido mostrar el "equivalente en barras" cuando el
  // material de verdad se mide distinto que el EDP (factor != 1) — si ya
  // comparten unidad, repetir el mismo número en dos formatos confunde más
  // de lo que aclara. Se redondea para arriba: no se puede pedir "media
  // barra", así que la cuenta real siempre es ese entero o más.
  const unidadMaterial = unidadDe(linea.material_id)
  const enMaterial = (valorEdp) => (factor && factor !== 1 ? Math.ceil(valorEdp / factor) : null)
  return {
    nombreEdp: fila.nombre_edp,
    unidad: fila.unidad,
    unidadMaterial,
    prevista,
    previstaMaterial: enMaterial(prevista),
    consumido,
    consumidoMaterial: enMaterial(consumido),
    saldo,
    convertida,
    exceso,
    excesoMaterial: enMaterial(exceso),
  }
}

const lineasValidas = computed(() =>
  lineas.value.filter((l) => l.material_id && Number(l.cantidad_solicitada) > 0)
)

async function onSubmit() {
  error.value = ''
  if (!form.frente_id) {
    error.value = 'Selecciona un frente.'
    return
  }
  if (mostrarSelectorSupervisor.value && !form.supervisor_id) {
    error.value = 'Selecciona a nombre de qué supervisor es este vale.'
    return
  }
  // Lo que quedó escrito en la fila de captura sin pulsar Enter también cuenta.
  if (entrada.material_id) {
    if (!agregar()) {
      error.value = errorEntrada.value
      return
    }
  }
  if (!lineasValidas.value.length) {
    error.value = 'Agrega al menos un material con cantidad mayor a cero.'
    return
  }
  const lineaSinStock = lineasValidas.value.find((l) => Number(l.cantidad_solicitada) > (disponibleDe(l.material_id) ?? 0))
  if (lineaSinStock) {
    const disponible = disponibleDe(lineaSinStock.material_id)
    error.value = disponible > 0
      ? `"${descripcionDe(lineaSinStock.material_id)}" solo tiene ${disponible} ${unidadDe(lineaSinStock.material_id)} disponibles ahora — no se puede pedir más que eso.`
      : `"${descripcionDe(lineaSinStock.material_id)}" no tiene stock disponible ahora mismo.`
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      frente_id: form.frente_id,
      supervisor_id: mostrarSelectorSupervisor.value ? form.supervisor_id : undefined,
      actividad: form.actividad.trim() || null,
      observaciones: form.observaciones.trim() || null,
      lineas: lineasValidas.value.map((l) => ({
        material_id: l.material_id,
        cantidad_solicitada: Number(l.cantidad_solicitada),
      })),
    })
  } catch (e) {
    console.error(e)
    error.value = `No se pudo crear el vale${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    titulo="Nuevo vale"
    subtitulo="Pide el material que necesita el frente."
    ancho="960px"
    texto-guardar="Enviar vale"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <template v-if="tipos.length" #cabecera>
      <div class="tipos-vale" role="group" aria-label="Tipo de movimiento">
        <button type="button" class="tipo-chip on" aria-pressed="true">Requerimiento</button>
        <button v-for="t in tipos" :key="t.clave" type="button" class="tipo-chip" aria-pressed="false" @click="$emit('cambiar-tipo', t.clave)">
          {{ t.etiqueta }}
        </button>
      </div>
    </template>

    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Frente</span>
        <BuscadorSimple v-model="form.frente_id" :opciones="opcionesFrentes" placeholder="Escribe para buscar un frente…" />
      </div>

      <div v-if="mostrarSelectorSupervisor" class="mf-campo">
        <span class="mf-rotulo">A nombre de <em>(supervisor)</em></span>
        <BuscadorSimple v-model="form.supervisor_id" :opciones="opcionesSupervisores" placeholder="Escribe para buscar un supervisor…" />
      </div>
    </div>

    <section class="materiales">
      <h3>Materiales</h3>

      <div class="captura">
        <BuscadorMaterial
          ref="buscadorRef"
          v-model="entrada.material_id"
          :materiales="materialesActivos"
          :stock-por-material="stockPorMaterial"
          bloquear-agotados
          placeholder="Escribe el material y presiona Enter…"
          class="captura-material"
        />
        <div class="captura-cantidad">
          <input
            ref="cantidadRef"
            v-model="entrada.cantidad"
            type="number"
            step="0.001"
            min="0.001"
            placeholder="Cantidad"
            @keydown.enter.prevent="agregar"
          />
          <span class="mf-unidad">{{ unidadDe(entrada.material_id) || '—' }}</span>
        </div>
        <button type="button" class="agregar" @click="agregar">Agregar</button>
      </div>

      <p v-if="errorEntrada" class="captura-error">{{ errorEntrada }}</p>
      <p v-else-if="entrada.material_id" class="captura-info">
        Disponible ahora: <strong>{{ disponibleDe(entrada.material_id) }} {{ unidadDe(entrada.material_id) }}</strong>
      </p>
      <p v-else class="captura-info">Material, Tab, cantidad y Enter: se agrega y puedes seguir con el siguiente.</p>

      <ul v-if="lineas.length" class="lista">
        <li v-for="(linea, idx) in lineas" :key="linea.material_id" class="item">
          <div class="item-fila">
            <span class="item-num">{{ idx + 1 }}</span>
            <div class="item-nombre">
              <span>{{ descripcionDe(linea.material_id) }}</span>
              <small>Disponible: {{ disponibleDe(linea.material_id) }} {{ unidadDe(linea.material_id) }}</small>
            </div>
            <input
              v-model="linea.cantidad_solicitada"
              type="number"
              step="0.001"
              min="0.001"
              :max="disponibleDe(linea.material_id) ?? undefined"
              aria-label="Cantidad"
              @keydown.enter.prevent="enfocarMaterial"
              @change="limitarCantidad(linea)"
            />
            <span class="mf-unidad">{{ unidadDe(linea.material_id) }}</span>
            <button type="button" class="quitar" title="Quitar este material" aria-label="Quitar este material" @click="quitarLinea(idx)">×</button>
          </div>
          <div v-if="alertaProcuraDe(linea)" class="alerta-procura">
            <p class="alerta-procura-titulo">⚠ Procura de «{{ alertaProcuraDe(linea).nombreEdp }}»</p>
            <div class="alerta-procura-cifras">
              <div class="cifra">
                <span class="cifra-label">Previsto</span>
                <span class="cifra-valor">
                  {{ formatearNumero(alertaProcuraDe(linea).prevista) }} {{ alertaProcuraDe(linea).unidad }}
                  <small v-if="alertaProcuraDe(linea).previstaMaterial">
                    (≈{{ formatearNumero(alertaProcuraDe(linea).previstaMaterial) }} {{ alertaProcuraDe(linea).unidadMaterial }})
                  </small>
                </span>
              </div>
              <div class="cifra">
                <span class="cifra-label">Ya se sacó</span>
                <span class="cifra-valor">
                  {{ formatearNumero(alertaProcuraDe(linea).consumido) }} {{ alertaProcuraDe(linea).unidad }}
                  <small v-if="alertaProcuraDe(linea).consumidoMaterial">
                    (≈{{ formatearNumero(alertaProcuraDe(linea).consumidoMaterial) }} {{ alertaProcuraDe(linea).unidadMaterial }})
                  </small>
                </span>
              </div>
              <div class="cifra destacada">
                <span class="cifra-label">Con este vale, te pasarías por</span>
                <span class="cifra-valor">
                  {{ formatearNumero(alertaProcuraDe(linea).exceso) }} {{ alertaProcuraDe(linea).unidad }}
                  <small v-if="alertaProcuraDe(linea).excesoMaterial">
                    (≈{{ formatearNumero(alertaProcuraDe(linea).excesoMaterial) }} {{ alertaProcuraDe(linea).unidadMaterial }})
                  </small>
                </span>
              </div>
            </div>
          </div>
        </li>
      </ul>
      <p v-else class="vacio">Todavía no agregaste ningún material.</p>
    </section>

    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Actividad <em>(opcional)</em></span>
        <input v-model="form.actividad" type="text" placeholder="Ej. Pie del activo" @keydown.enter.prevent />
      </div>
      <div class="mf-campo">
        <span class="mf-rotulo">Observaciones <em>(opcional)</em></span>
        <input v-model="form.observaciones" type="text" @keydown.enter.prevent />
      </div>
    </div>

    <template #pie>{{ lineas.length }} {{ lineas.length === 1 ? 'material' : 'materiales' }} en este vale</template>
  </ModalFormulario>
</template>

<style scoped>
.tipos-vale {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tipo-chip {
  border: 0;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.tipo-chip.on {
  background: var(--color-text);
  color: var(--color-bg);
  cursor: default;
}
.materiales {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-card);
}
.materiales h3 {
  margin: 0;
  font-size: 0.95rem;
}
.captura {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px auto;
  gap: 0.6rem;
  align-items: start;
}
.captura-cantidad {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.captura input,
.item input {
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
  width: 100%;
  min-width: 0;
}
.captura-material :deep(input) {
  padding: 0.6rem 1.8rem 0.6rem 0.7rem;
}
.agregar {
  padding: 0.65rem 1.1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
.captura-info,
.captura-error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.captura-info strong {
  color: var(--color-text);
}
.captura-error {
  color: var(--color-danger);
  font-weight: 600;
}
.lista {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.2rem 0 0;
  padding: 0;
  list-style: none;
}
.item {
  padding: 0.6rem 0.8rem;
  background: var(--color-surface);
  border-radius: var(--radius-control);
}
.item-fila {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 130px auto 32px;
  gap: 0.6rem;
  align-items: center;
}
.item-num {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 700;
}
.item-nombre {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 0.88rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.item-nombre small {
  font-weight: 400;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
.quitar {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}
.quitar:hover {
  color: var(--color-danger);
}
.vacio {
  margin: 0.2rem 0 0;
  padding: 0.9rem;
  text-align: center;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-control);
}
.alerta-procura {
  margin-top: 0.5rem;
  padding: 0.5rem 0.65rem;
  background: var(--color-warning-soft, #fff7e5);
  border: 1px solid var(--color-warning, #b45309);
  border-radius: var(--radius-control);
  color: var(--color-warning, #b45309);
}
.alerta-procura-titulo {
  margin: 0 0 0.35rem;
  font-size: 0.76rem;
  font-weight: 600;
}
.alerta-procura-cifras {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}
.cifra {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.cifra-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.85;
}
.cifra-valor {
  font-size: 0.82rem;
  font-weight: 700;
}
.cifra-valor small {
  font-size: 0.72rem;
  font-weight: 500;
  opacity: 0.85;
}
.cifra.destacada {
  flex-basis: 100%;
  padding-top: 0.35rem;
  border-top: 1px dashed var(--color-warning, #b45309);
}

@media (max-width: 720px) {
  .captura {
    grid-template-columns: minmax(0, 1fr);
  }
  .item-fila {
    grid-template-columns: 24px minmax(0, 1fr) 100px auto 32px;
  }
}
</style>

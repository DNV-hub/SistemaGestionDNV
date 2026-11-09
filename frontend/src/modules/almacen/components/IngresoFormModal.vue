<script setup>
import { useCerrarConEscape } from '../../../composables/useCerrarConEscape'
import { reactive, ref, useAttrs } from 'vue'
import MaterialIngresoBuscador from './MaterialIngresoBuscador.vue'

const props = defineProps({
  almacenes: { type: Array, default: () => [] },
  materiales: { type: Array, default: () => [] },
  contratos: { type: Array, default: () => [] },
})

defineEmits(['cerrar', 'ingreso-masivo'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onGuardar directamente para que el
// try/catch capture fallos reales (ej. stock negativo, RLS, etc.).
const attrs = useAttrs()

// Almacén/contrato/documento/proveedor/observación son del INGRESO
// completo (la guía), no de cada material — una sola guía puede traer
// varios materiales juntos, y pedir esos datos una vez por línea era
// repetir lo mismo tantas veces como materiales trajera esa guía.
const form = reactive({
  almacen_id: props.almacenes[0]?.id ?? '',
  contrato_id: props.contratos[0]?.id ?? '',
  documento_referencia: '',
  proveedor: '',
  observacion: '',
})

let siguienteId = 1
function lineaVacia() {
  return {
    id: siguienteId++,
    materialId: '',
    materialNuevo: null, // { descripcion, unidad, tipo_conversion, stock_minimo_pct } | null
    cantidad: '',
    ancho: '',
    largo: '',
  }
}

const lineas = ref([lineaVacia()])
const guardando = ref(false)
const error = ref('')

function agregarLinea() {
  lineas.value.push(lineaVacia())
}
function quitarLinea(id) {
  if (lineas.value.length > 1) lineas.value = lineas.value.filter((l) => l.id !== id)
}

function alSeleccionarExistente(linea, m) {
  linea.materialNuevo = null
  linea.materialId = m.id
}
function alConfirmarNuevo(linea, payload) {
  linea.materialId = ''
  linea.materialNuevo = payload
  // Las medidas que se escribieron en el panel del material nuevo.
  linea.ancho = payload.ancho ?? ''
  linea.largo = payload.largo ?? ''
}

function materialSeleccionadoDe(linea) {
  return props.materiales.find((m) => m.id === linea.materialId)
}
// Antes solo miraba el material ya existente en el catálogo — uno recién
// creado en esta misma guía no tenía de dónde sacar su tipo_conversion, así
// que nunca pedía ancho/largo en su primer lote. Ahora también lo toma de
// materialNuevo, que ya lo trae desde el buscador.
function tipoConversionDe(linea) {
  return materialSeleccionadoDe(linea)?.tipo_conversion ?? linea.materialNuevo?.tipo_conversion ?? 'ninguna'
}
function unidadDe(linea) {
  return materialSeleccionadoDe(linea)?.unidad ?? linea.materialNuevo?.unidad ?? null
}

// Vista previa del factor, para que el almacenero vea el m2/ml antes de
// guardar y pueda notar si se equivocó de medida.
function factorPreviewDe(linea) {
  const tipo = tipoConversionDe(linea)
  if (tipo === 'area') {
    const a = Number(linea.ancho)
    const l = Number(linea.largo)
    return a > 0 && l > 0 ? a * l : null
  }
  if (tipo === 'longitud') {
    const l = Number(linea.largo)
    return l > 0 ? l : null
  }
  return null
}

async function onSubmit() {
  error.value = ''
  if (!form.almacen_id || !form.contrato_id) {
    error.value = 'Almacén y contrato son obligatorios.'
    return
  }
  for (const linea of lineas.value) {
    if (!linea.materialId && !linea.materialNuevo) {
      error.value = 'Falta elegir el material en alguna línea.'
      return
    }
    if (!linea.cantidad || Number(linea.cantidad) < 0) {
      error.value = 'Falta una cantidad válida en alguna línea.'
      return
    }
    const tipo = tipoConversionDe(linea)
    if (tipo === 'area' && (!Number(linea.ancho) || !Number(linea.largo))) {
      error.value = `"${linea.materialNuevo?.descripcion ?? materialSeleccionadoDe(linea)?.descripcion}" necesita ancho y largo del rollo.`
      return
    }
    if (tipo === 'longitud' && !Number(linea.largo)) {
      error.value = `"${linea.materialNuevo?.descripcion ?? materialSeleccionadoDe(linea)?.descripcion}" necesita la longitud de la pieza.`
      return
    }
  }

  guardando.value = true
  try {
    // Los materiales nuevos se crean primero, todos juntos, para tener su
    // id real antes de armar las filas — igual que ya hace el importador
    // masivo de Excel. Se identifican por descripción (mayúsculas), no por
    // posición: si dos líneas terminaran describiendo el mismo material
    // nuevo, comparten el mismo id creado en vez de duplicarlo.
    const nuevosPorNombre = new Map()
    for (const linea of lineas.value) {
      if (linea.materialNuevo) nuevosPorNombre.set(linea.materialNuevo.descripcion.toUpperCase(), linea.materialNuevo)
    }
    if (nuevosPorNombre.size) {
      const creados = await attrs.onCrearMaterial([...nuevosPorNombre.values()])
      const idPorNombre = new Map(creados.map((m) => [m.descripcion.toUpperCase(), m.id]))
      for (const linea of lineas.value) {
        if (linea.materialNuevo) linea.materialId = idPorNombre.get(linea.materialNuevo.descripcion.toUpperCase())
      }
    }

    const filas = lineas.value.map((linea) => {
      const tipo = tipoConversionDe(linea)
      return {
        almacen_id: form.almacen_id,
        contrato_id: form.contrato_id,
        material_id: linea.materialId,
        cantidad: Number(linea.cantidad),
        ancho: tipo === 'area' ? Number(linea.ancho) : null,
        largo: tipo !== 'ninguna' ? Number(linea.largo) : null,
        documento_referencia: form.documento_referencia.trim() || null,
        proveedor: form.proveedor.trim() || null,
        observacion: form.observacion.trim() || null,
      }
    })

    await attrs.onGuardar(filas)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo registrar el ingreso${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}

useCerrarConEscape()
</script>

<template>
  <div class="overlay">
    <form class="modal" role="dialog" aria-label="Registrar ingreso" @submit.prevent="onSubmit">
      <header class="cab">
        <div>
          <h2>Registrar ingreso</h2>
          <p class="sub">Anota los datos de la guía y los materiales que llegaron.</p>
        </div>
        <button type="button" class="enlace" @click="$emit('ingreso-masivo')">Ingreso masivo (Excel)</button>
      </header>

      <div class="cuerpo">
        <section class="bloque">
          <h3><span class="paso">1</span> Datos de la guía</h3>
          <div class="grilla-guia">
            <div class="campo">
              <span class="rotulo">Almacén</span>
              <select v-model="form.almacen_id" required>
                <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
              </select>
            </div>
            <div class="campo">
              <span class="rotulo">Contrato</span>
              <select v-model="form.contrato_id" required>
                <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
              </select>
            </div>
            <div class="campo">
              <span class="rotulo">N.º de guía o factura <em>(opcional)</em></span>
              <input v-model="form.documento_referencia" type="text" placeholder="Ej. T001-0003184" />
            </div>
            <div class="campo">
              <span class="rotulo">Proveedor <em>(opcional)</em></span>
              <input v-model="form.proveedor" type="text" />
            </div>
          </div>
        </section>

        <section class="bloque">
          <h3><span class="paso">2</span> Materiales que llegaron</h3>

          <div v-for="(linea, idx) in lineas" :key="linea.id" class="linea" :class="{ 'con-quitar': lineas.length > 1 }">
            <span class="num">{{ idx + 1 }}</span>

            <div class="linea-principal">
              <div class="campo campo-material">
                <span class="rotulo">Material</span>
                <MaterialIngresoBuscador
                  :materiales="materiales"
                  @seleccionar-existente="(m) => alSeleccionarExistente(linea, m)"
                  @confirmar-nuevo="(p) => alConfirmarNuevo(linea, p)"
                />
              </div>

              <div class="campo campo-cantidad">
                <span class="rotulo">Cantidad</span>
                <div class="cantidad-con-unidad">
                  <input v-model="linea.cantidad" type="number" step="0.001" min="0" required placeholder="0" />
                  <span v-if="unidadDe(linea)" class="unidad-badge">{{ unidadDe(linea) }}</span>
                </div>
              </div>

              <button
                v-if="lineas.length > 1"
                type="button"
                class="quitar"
                title="Quitar este material"
                aria-label="Quitar este material"
                @click="quitarLinea(linea.id)"
              >×</button>
            </div>

            <div v-if="tipoConversionDe(linea) === 'area'" class="medidas">
              <div class="campo">
                <span class="rotulo">Ancho del rollo (m)</span>
                <input v-model="linea.ancho" type="number" step="0.01" min="0.01" required />
              </div>
              <div class="campo">
                <span class="rotulo">Largo del rollo (m)</span>
                <input v-model="linea.largo" type="number" step="0.01" min="0.01" required />
              </div>
              <p v-if="factorPreviewDe(linea)" class="factor-preview">
                Cada {{ unidadDe(linea) ?? 'unidad' }} tiene {{ factorPreviewDe(linea).toFixed(2) }} m². En total:
                <b>{{ Number(linea.cantidad || 0) * factorPreviewDe(linea) }} m²</b>
              </p>
            </div>

            <div v-else-if="tipoConversionDe(linea) === 'longitud'" class="medidas">
              <div class="campo">
                <span class="rotulo">Longitud de cada pieza (m)</span>
                <input v-model="linea.largo" type="number" step="0.01" min="0.01" required />
              </div>
              <p v-if="factorPreviewDe(linea)" class="factor-preview">
                En total: <b>{{ Number(linea.cantidad || 0) * factorPreviewDe(linea) }} ml</b>
              </p>
            </div>
          </div>

          <button type="button" class="agregar" @click="agregarLinea">+ Agregar otro material</button>
        </section>

        <div class="campo">
          <span class="rotulo">Observación <em>(opcional, aplica a toda la guía)</em></span>
          <textarea v-model="form.observacion" rows="2"></textarea>
        </div>
      </div>

      <footer class="pie">
        <p v-if="error" class="error">{{ error }}</p>
        <span v-else class="resumen">{{ lineas.length }} {{ lineas.length === 1 ? 'material' : 'materiales' }}</span>
        <div class="acciones">
          <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
          <button type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando…' : lineas.length > 1 ? `Registrar ${lineas.length} ingresos` : 'Registrar ingreso' }}
          </button>
        </div>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 14, 0.6);
  display: grid;
  place-items: center;
  z-index: 40;
}
.modal {
  display: flex;
  flex-direction: column;
  width: min(1020px, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.cab {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
h2 {
  margin: 0;
  font-size: 1.25rem;
}
.sub {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.enlace {
  padding: 0.45rem 0.9rem;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 0.82rem;
  white-space: nowrap;
}
.enlace:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.cuerpo {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.25rem 1.75rem;
  overflow-y: auto;
}
h3 {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.85rem;
  font-size: 0.95rem;
}
.paso {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.75rem;
  font-weight: 700;
}
.grilla-guia {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}
.rotulo {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}
.rotulo em {
  font-style: normal;
  font-weight: 400;
  color: var(--color-text-muted);
}
input,
select,
textarea {
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
  width: 100%;
}
.linea {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem 1rem 1rem 3rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-2);
}
.num {
  position: absolute;
  left: 1rem;
  top: 1.95rem;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 700;
}
.linea-principal {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 0.9rem;
  align-items: start;
}
.con-quitar .linea-principal {
  grid-template-columns: minmax(0, 1fr) 190px 32px;
}
.cantidad-con-unidad {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.unidad-badge {
  padding: 0.4rem 0.7rem;
  background: var(--color-surface);
  border-radius: var(--radius-control);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}
.quitar {
  margin-top: 1.6rem;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  background: none;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  line-height: 1;
}
.quitar:hover {
  color: var(--color-danger);
}
.medidas {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 220px));
  gap: 0.9rem;
  align-items: end;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-control);
  background: var(--color-surface);
}
.factor-preview {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.factor-preview b {
  color: var(--color-text);
}
.agregar {
  width: 100%;
  padding: 0.75rem;
  background: none;
  border: 1px dashed var(--color-border);
  color: var(--color-primary);
}
.agregar:hover {
  border-color: var(--color-primary);
}
.pie {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.75rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
.resumen {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.acciones {
  display: flex;
  gap: 0.6rem;
  margin-left: auto;
}
button {
  padding: 0.65rem 1.3rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}

@media (max-width: 860px) {
  .grilla-guia {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .linea-principal,
  .con-quitar .linea-principal {
    grid-template-columns: minmax(0, 1fr);
  }
  .quitar {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    margin: 0;
  }
  .linea {
    padding-left: 1rem;
  }
  .num {
    display: none;
  }
}
</style>

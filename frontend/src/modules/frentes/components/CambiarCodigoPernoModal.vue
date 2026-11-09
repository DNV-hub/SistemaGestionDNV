<script setup>
import { useCerrarConEscape } from '../../../composables/useCerrarConEscape'
import { computed, nextTick, onMounted, ref } from 'vue'
import { renombrarPerno } from '../../avance/services/avanceService'
import { compararCodigoNatural } from '../../avance/utils/ordenNatural'

// Cambiar el código de un perno ya reportado (por ejemplo, cuando cambió el
// plano y la numeración). Todo en un solo cuadro: se elige el código nuevo de
// la biblioteca, se ve qué datos va a tomar, y si el código ya lo tiene otro
// perno se avisa y se ofrece intercambiarlos — sin diálogos del navegador.
const props = defineProps({
  frenteId: { type: String, required: true },
  perno: { type: Object, required: true }, // fila del control: codigo, codigo_norm, zona, ubicacion…
  catalogo: { type: Array, default: () => [] }, // biblioteca de pernos del frente
  reportados: { type: Array, default: () => [] }, // pernos con reportes (perforado/inyectado)
})
const emit = defineEmits(['cerrar', 'listo'])

const nuevo = ref('')
const guardando = ref(false)
const error = ref('')
const entrada = ref(null)
const listaAbierta = ref(true)

onMounted(() => nextTick(() => entrada.value?.focus()))

const norm = (s) => String(s ?? '').trim().toUpperCase()
const reportadosPorCodigo = computed(() => {
  const m = new Map()
  for (const r of props.reportados) if (r.estado !== 'sin_perforar') m.set(norm(r.codigo), r)
  return m
})
const catalogoOrdenado = computed(() => [...props.catalogo].sort((a, b) => compararCodigoNatural(a.codigo, b.codigo)))

const sugerencias = computed(() => {
  const q = norm(nuevo.value)
  const lista = catalogoOrdenado.value.filter((c) => norm(c.codigo) !== props.perno.codigo_norm && (!q || norm(c.codigo).includes(q)))
  return lista.slice(0, 8)
})
const elegido = computed(() => props.catalogo.find((c) => norm(c.codigo) === norm(nuevo.value)) ?? null)
const otroPerno = computed(() => (elegido.value ? reportadosPorCodigo.value.get(norm(elegido.value.codigo)) ?? null : null))
const esElMismo = computed(() => norm(nuevo.value) === props.perno.codigo_norm)

const fmtFecha = (f) => (f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-PE') : '—')
const diametro = (c) => (c?.diametro != null ? `${Number(c.diametro)} mm` : '—')

function elegir(c) {
  nuevo.value = c.codigo
  listaAbierta.value = false
  error.value = ''
}

const puedeAplicar = computed(() => !!elegido.value && !esElMismo.value && !guardando.value)

async function aplicar() {
  if (!puedeAplicar.value) return
  guardando.value = true
  error.value = ''
  const intercambiar = !!otroPerno.value
  try {
    const r = await renombrarPerno({
      frenteId: props.frenteId,
      codigoActual: props.perno.codigo,
      codigoNuevo: elegido.value.codigo,
      intercambiar,
    })
    emit(
      'listo',
      r?.intercambio
        ? `Se intercambiaron ${props.perno.codigo} y ${elegido.value.codigo} (${(r.filas ?? 0) + (r.filas_del_otro ?? 0)} filas).`
        : `${props.perno.codigo} pasó a ${elegido.value.codigo} (${r?.filas ?? 0} filas actualizadas).`
    )
  } catch (e) {
    error.value = String(e?.message ?? e).replace(/^CODIGO_EN_USO:\s*/, '')
  } finally {
    guardando.value = false
  }
}

useCerrarConEscape()
</script>

<template>
  <Teleport to="body">
    <div class="ccp-fondo" @click.self="emit('cerrar')" @keydown.esc="emit('cerrar')">
      <div class="ccp" role="dialog" aria-modal="true" aria-label="Cambiar código del perno">
        <header class="ccp-cab">
          <div>
            <div class="ccp-etq">CAMBIAR CÓDIGO</div>
            <h2>{{ perno.codigo }}</h2>
            <p class="ccp-sub">
              {{ perno.zona || '—' }} · {{ perno.ubicacion || 'sin ubicación' }} · perforado {{ fmtFecha(perno.perforacion_fecha) }}
            </p>
          </div>
          <button type="button" class="ccp-x" aria-label="Cerrar" @click="emit('cerrar')">✕</button>
        </header>

        <label class="ccp-campo">
          <span>Código nuevo (de la biblioteca)</span>
          <input
            ref="entrada"
            v-model="nuevo"
            type="text"
            autocomplete="off"
            placeholder="Escribe o elige un código…"
            @focus="listaAbierta = true"
            @input="listaAbierta = true; error = ''"
            @keydown.enter.prevent="aplicar"
          />
        </label>

        <ul v-if="listaAbierta && sugerencias.length && !elegido" class="ccp-lista" role="listbox">
          <li v-for="c in sugerencias" :key="c.id">
            <button type="button" role="option" @click="elegir(c)">
              <b>{{ c.codigo }}</b>
              <span>{{ c.zona || '—' }} · {{ c.ubicacion || 'sin ubicación' }}</span>
              <em v-if="reportadosPorCodigo.has(norm(c.codigo))" class="ccp-uso">en uso</em>
            </button>
          </li>
        </ul>

        <p v-if="nuevo.trim() && !elegido && !esElMismo" class="ccp-msg rojo">
          Ese código no está en la biblioteca de pernos de este frente. Súbelo primero a la biblioteca.
        </p>
        <p v-else-if="esElMismo" class="ccp-msg rojo">Es el mismo código que ya tiene.</p>

        <section v-if="elegido && !esElMismo" class="ccp-prev">
          <div class="ccp-prev-t">Al aplicar, {{ perno.codigo }} pasa a ser <b>{{ elegido.codigo }}</b> y toma:</div>
          <dl>
            <div><dt>Ubicación</dt><dd>{{ elegido.ubicacion || '—' }}</dd></div>
            <div><dt>Zona</dt><dd>{{ elegido.zona || '—' }}</dd></div>
            <div><dt>Sistema</dt><dd>{{ elegido.sistema || '—' }}</dd></div>
            <div><dt>Diámetro</dt><dd>{{ diametro(elegido) }}</dd></div>
            <div><dt>Plano</dt><dd>{{ elegido.plano || '—' }}</dd></div>
          </dl>
          <p class="ccp-nota">Cambia en todas sus filas: perforación, inyección y pull test.</p>
        </section>

        <section v-if="otroPerno && elegido && !esElMismo" class="ccp-aviso">
          <b>Ese código ya lo tiene otro perno</b>
          <span>
            {{ elegido.codigo }} está reportado ({{ otroPerno.estado === 'inyectado' ? 'inyectado' : 'perforado' }} el
            {{ fmtFecha(otroPerno.perforacion_fecha) }}). Si continúas, <b>se intercambian</b>: {{ perno.codigo }} pasa a
            {{ elegido.codigo }} y {{ elegido.codigo }} pasa a {{ perno.codigo }}.
          </span>
        </section>

        <p v-if="error" class="ccp-msg rojo">{{ error }}</p>

        <footer class="ccp-pie">
          <button type="button" class="ccp-sec" @click="emit('cerrar')">Cancelar</button>
          <button type="button" class="ccp-pri" :class="{ interc: otroPerno }" :disabled="!puedeAplicar" @click="aplicar">
            {{ guardando ? 'Aplicando…' : otroPerno ? 'Intercambiar los dos' : 'Aplicar cambio' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ccp-fondo {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}
.ccp {
  width: 480px;
  max-width: 100%;
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 20px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 0 0 1px var(--color-border), 0 24px 60px rgba(0, 0, 0, 0.5);
}
.ccp * {
  box-sizing: border-box;
}
.ccp-cab {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.ccp-etq {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}
.ccp h2 {
  margin: 2px 0 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.ccp-sub {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.ccp-x {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 16px;
  cursor: pointer;
}
.ccp-x:hover {
  background: var(--color-surface-2);
}
.ccp-campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}
.ccp-campo input {
  height: 46px;
  border: 0;
  border-radius: 12px;
  padding: 0 14px;
  background: var(--color-surface-2);
  color: var(--color-text);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--color-border);
}
.ccp-campo input:focus {
  outline: 2px solid #f6a800;
}
.ccp-lista {
  list-style: none;
  margin: -6px 0 0;
  padding: 4px;
  border-radius: 12px;
  background: var(--color-surface-2);
  box-shadow: inset 0 0 0 1px var(--color-border);
  max-height: 260px;
  overflow-y: auto;
}
.ccp-lista button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ccp-lista button:hover {
  background: var(--color-surface);
}
.ccp-lista b {
  font-size: 14px;
  min-width: 70px;
}
.ccp-lista span {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ccp-uso {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 99px;
  background: rgba(246, 168, 0, 0.18);
  color: #d98e00;
}
.ccp-msg {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}
.ccp-msg.rojo {
  color: #e5484d;
}
.ccp-prev {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.1);
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.35);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ccp-prev-t {
  font-size: 13.5px;
  font-weight: 600;
}
.ccp-prev dl {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
}
.ccp-prev dl div {
  min-width: 0;
}
.ccp-prev dt {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  text-transform: uppercase;
}
.ccp-prev dd {
  margin: 1px 0 0;
  font-size: 13.5px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.ccp-nota {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.ccp-aviso {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(246, 168, 0, 0.12);
  box-shadow: inset 0 0 0 1px rgba(246, 168, 0, 0.45);
  font-size: 13px;
  line-height: 1.45;
}
.ccp-aviso b:first-child {
  color: #d98e00;
}
.ccp-pie {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.ccp-pie button {
  height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}
.ccp-sec {
  background: var(--color-surface-2);
  color: var(--color-text);
}
.ccp-pri {
  background: #f6a800;
  color: #111;
}
.ccp-pri.interc {
  background: #e5484d;
  color: #fff;
}
.ccp-pri:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>

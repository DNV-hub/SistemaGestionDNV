<script setup>
// Reemplaza <input type="time"> en todo el RDC: ese input nativo se ve y se
// comporta distinto en cada teléfono — en Android, Chrome a veces obliga a
// tipear hasta los segundos campo por campo (nadie lo pidió, es así de
// tedioso en algunos Android) mientras que en iPhone ya es una rueda simple
// de deslizar. Este componente dibuja SU PROPIA rueda (igual en los dos
// teléfonos, sin depender de qué selector nativo le tocó a cada uno),
// calcada de la que ya usa iPhone: hora 1-12, minuto, a.m./p.m. — incluida
// la vuelta sin fin de hora/minuto (pasado el 12 sigue el 1, igual en
// minutos) y el "tic" de cada fila al pasar (vibración corta; en iPhone
// Safari no la deja usar, así que ahí no hace nada — nunca falla por eso).
import { nextTick, reactive, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const ALTO_FILA = 40
// Impar a propósito: así hay una copia exacta al medio de la lista
// (REPETICIONES=41 → la copia #20) para centrar ahí la primera vez.
const REPETICIONES = 41
const MEDIO = Math.floor(REPETICIONES / 2)

const HORAS_BASE = Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
const MINUTOS_BASE = Array.from({ length: 60 }, (_, i) => i) // 0..59
const AMPM = ['a. m.', 'p. m.'] // esta no da la vuelta — tampoco lo hace en iPhone

const repetir = (base) => Array.from({ length: REPETICIONES * base.length }, (_, i) => base[i % base.length])
const HORAS = repetir(HORAS_BASE)
const MINUTOS = repetir(MINUTOS_BASE)

function vibrarTic() {
  // Vibration API: Android la tiene, iPhone (Safari/WebKit) nunca la
  // implementó — por eso el try/catch, para que ahí simplemente no pase
  // nada en vez de romper algo.
  try {
    navigator.vibrate?.(4)
  } catch {
    // sin soporte: sin problema, es solo un extra táctil
  }
}

function partesDe(valor) {
  if (!valor) return hmsDesdeFecha(new Date())
  const [h, m] = valor.split(':').map(Number)
  const ampm = h >= 12 ? 1 : 0
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return { h12, m, ampm }
}
function hmsDesdeFecha(fecha) {
  const h = fecha.getHours()
  const m = fecha.getMinutes()
  const ampm = h >= 12 ? 1 : 0
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return { h12, m, ampm }
}
function valorDesdePartes({ h12, m, ampm }) {
  let h = h12 % 12
  if (ampm === 1) h += 12
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function etiqueta(valor) {
  if (!valor) return '--:--'
  const { h12, m, ampm } = partesDe(valor)
  return `${h12}:${String(m).padStart(2, '0')} ${AMPM[ampm]}`
}

const abierto = ref(false)
const refHora = ref(null)
const refMinuto = ref(null)
const refAmpm = ref(null)
const sel = ref({ h12: 12, m: 0, ampm: 0 })
// Fila exacta (con repeticiones) que está al centro de cada rueda ahora
// mismo — separado de `sel` porque `sel` es el valor LÓGICO (1-12, 0-59) y
// acá hay 41 copias de cada uno; esto es solo para resaltar la fila justa.
const centro = reactive({ hora: 0, minuto: 0, ampm: 0 })

function centrarRueda(el, indice, instantaneo) {
  if (!el) return
  el.scrollTo({ top: indice * ALTO_FILA, behavior: instantaneo ? 'instant' : 'smooth' })
}

async function abrir() {
  sel.value = partesDe(props.modelValue)
  abierto.value = true
  await nextTick()
  centro.hora = MEDIO * HORAS_BASE.length + (sel.value.h12 - 1)
  centro.minuto = MEDIO * MINUTOS_BASE.length + sel.value.m
  centro.ampm = sel.value.ampm
  centrarRueda(refHora.value, centro.hora, true)
  centrarRueda(refMinuto.value, centro.minuto, true)
  centrarRueda(refAmpm.value, centro.ampm, true)
}
function cancelar() {
  abierto.value = false
}
function confirmar() {
  emit('update:modelValue', valorDesdePartes(sel.value))
  abierto.value = false
}
function restablecer() {
  sel.value = hmsDesdeFecha(new Date())
  centro.hora = MEDIO * HORAS_BASE.length + (sel.value.h12 - 1)
  centro.minuto = MEDIO * MINUTOS_BASE.length + sel.value.m
  centro.ampm = sel.value.ampm
  centrarRueda(refHora.value, centro.hora)
  centrarRueda(refMinuto.value, centro.minuto)
  centrarRueda(refAmpm.value, centro.ampm)
}

// Rueda con vuelta sin fin (hora y minuto): la lista tiene la base repetida
// muchas veces; al desplazarse, cada "tic" (cambio de fila) vibra y
// actualiza el valor lógico (base.length le quita la vuelta al número de
// fila). Si ya se acerca a cualquiera de los dos extremos de la lista
// repetida, se reubica en silencio a la fila gemela del bloque del medio —
// cae en una fila idéntica (mismo número), así que no se nota el salto, y
// da la sensación de que la rueda nunca se acaba.
const reposicionPendiente = { hora: null, minuto: null }
function manejarScrollCircular(el, base, clave, aplicar) {
  if (!el) return
  const idx = Math.round(el.scrollTop / ALTO_FILA)
  if (idx !== centro[clave]) {
    centro[clave] = idx
    aplicar(((idx % base.length) + base.length) % base.length)
    vibrarTic()
  }
  clearTimeout(reposicionPendiente[clave])
  reposicionPendiente[clave] = setTimeout(() => {
    const margen = base.length * 5
    const total = base.length * REPETICIONES
    if (idx < margen || idx > total - margen) {
      const logico = ((idx % base.length) + base.length) % base.length
      const nuevoCentro = MEDIO * base.length + logico
      el.scrollTo({ top: nuevoCentro * ALTO_FILA, behavior: 'instant' })
      centro[clave] = nuevoCentro
    }
  }, 180)
}

// Am/pm no da la vuelta (dos filas nomás) — mismo "tic" pero sin reubicar.
function manejarScrollAmpm(el) {
  if (!el) return
  const idx = Math.max(0, Math.min(1, Math.round(el.scrollTop / ALTO_FILA)))
  if (idx !== centro.ampm) {
    centro.ampm = idx
    sel.value.ampm = idx
    vibrarTic()
  }
}
</script>

<template>
  <div class="selector-hora">
    <button type="button" class="hora-boton" :class="{ vacio: !modelValue }" @click="abrir">
      {{ etiqueta(modelValue) }}
    </button>

    <Teleport to="body">
      <div v-if="abierto" class="sh-backdrop" @click="cancelar"></div>
      <div v-if="abierto" class="sh-popover" @click.stop>
        <div class="sh-ruedas">
          <div class="sh-banda"></div>
          <div ref="refHora" class="sh-rueda" @scroll="manejarScrollCircular(refHora, HORAS_BASE, 'hora', (l) => (sel.h12 = l + 1))">
            <div class="sh-espaciador"></div>
            <div v-for="(h, i) in HORAS" :key="i" class="sh-item" :class="{ activo: i === centro.hora }">{{ h }}</div>
            <div class="sh-espaciador"></div>
          </div>
          <div ref="refMinuto" class="sh-rueda" @scroll="manejarScrollCircular(refMinuto, MINUTOS_BASE, 'minuto', (l) => (sel.m = l))">
            <div class="sh-espaciador"></div>
            <div v-for="(m, i) in MINUTOS" :key="i" class="sh-item" :class="{ activo: i === centro.minuto }">{{ String(m).padStart(2, '0') }}</div>
            <div class="sh-espaciador"></div>
          </div>
          <div ref="refAmpm" class="sh-rueda sh-rueda-ampm" @scroll="manejarScrollAmpm(refAmpm)">
            <div class="sh-espaciador"></div>
            <div v-for="(p, i) in AMPM" :key="p" class="sh-item" :class="{ activo: i === centro.ampm }">{{ p }}</div>
            <div class="sh-espaciador"></div>
          </div>
        </div>
        <div class="sh-acciones">
          <button type="button" class="sh-reset" @click="restablecer">Restablecer</button>
          <button type="button" class="sh-ok" aria-label="Confirmar hora" @click="confirmar">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.selector-hora {
  width: 100%;
}
.hora-boton {
  width: 100%;
  text-align: left;
  background: var(--surface2, var(--color-surface-2));
  border: 1.5px solid transparent;
  border-radius: var(--r-md, var(--radius-control));
  font-family: inherit;
  font-weight: 700;
  font-size: 16px;
  color: var(--text, var(--color-text));
  padding: 8px 10px;
  cursor: pointer;
}
.hora-boton.vacio {
  color: var(--text3, var(--color-text-muted));
  font-weight: 500;
}
</style>

<!-- Sin scoped: el popover vive teletransportado a <body>, fuera del árbol
     de este componente — un <style scoped> nunca lo alcanzaría. -->
<style>
.sh-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 200;
}
.sh-popover {
  position: fixed;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(320px, calc(100vw - 32px));
  background: #1c1c1e;
  border-radius: 14px;
  padding: 10px 14px 14px;
  z-index: 201;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}
.sh-ruedas {
  position: relative;
  display: flex;
  height: 200px;
  overflow: hidden;
}
.sh-banda {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 40px;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  pointer-events: none;
}
.sh-rueda {
  flex: 1;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
  text-align: center;
}
.sh-rueda::-webkit-scrollbar {
  display: none;
}
.sh-rueda-ampm {
  flex: 1.3;
}
.sh-espaciador {
  height: 80px;
  scroll-snap-align: none;
}
.sh-item {
  height: 40px;
  line-height: 40px;
  scroll-snap-align: center;
  font-size: 20px;
  color: rgba(255, 255, 255, 0.35);
  font-variant-numeric: tabular-nums;
}
.sh-item.activo {
  color: #fff;
  font-weight: 600;
}
.sh-acciones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}
.sh-reset {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  padding: 8px 16px;
  border-radius: 999px;
  cursor: pointer;
}
.sh-ok {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: none;
  background: #0a84ff;
  color: #fff;
  cursor: pointer;
}
</style>

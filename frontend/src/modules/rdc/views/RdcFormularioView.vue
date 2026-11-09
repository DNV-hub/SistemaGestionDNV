<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { ESTADO } from '../services/rdcDb'
import { hoyLocal } from '../services/rdcRepository'
import { fmtHm, nombreDe, partidasEjecutadas, textoWhatsapp, totalPersonal, totalStandbyMin } from '../services/rdcCalculos'
import PasoDatos from '../components/PasoDatos.vue'
import PasoJornada from '../components/PasoJornada.vue'
import PasoMetrados from '../components/PasoMetrados.vue'
import PasoObservaciones from '../components/PasoObservaciones.vue'
import PasoResumen from '../components/PasoResumen.vue'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'
import '../estilos/rdc-referencia.css'

const rdc = useRdcStore()
const route = useRoute()
const router = useRouter()

// Los mismos cinco pasos, en el mismo orden, ahora como pestañas numeradas.
const PASOS = [
  { clave: 'datos', titulo: 'Datos', componente: PasoDatos },
  { clave: 'jornada', titulo: 'Jornada', componente: PasoJornada },
  { clave: 'metrados', titulo: 'Metrados', componente: PasoMetrados },
  { clave: 'obs', titulo: 'Obs/Prog', componente: PasoObservaciones },
  { clave: 'resumen', titulo: 'Resumen', componente: PasoResumen },
]

const paso = ref(0)
const listo = ref(false)

// Función, no un onMounted suelto: Vue Router reutiliza este componente al
// navegar entre dos rutas 'rdc-editar' con distinto :id (mismo registro de
// ruta, solo cambia el parámetro) — ej. el aviso de "ya existe un reporte
// duplicado" (ver PasoDatos.vue → irADuplicado) hace exactamente eso al
// adoptar el otro reporte. Sin esto, la URL cambiaba de verdad pero la
// pantalla se quedaba congelada mostrando el reporte VIEJO (mismo paso,
// mismo aviso de duplicado pegado) — parecía que el botón no hacía nada.
async function cargarReporte() {
  listo.value = false
  if (!rdc.catalogos) await rdc.iniciar()
  const id = route.params.id
  if (id) await rdc.abrir(id)
  if (!rdc.actual || rdc.actual.id !== id) {
    // /rdc/nuevo crea un borrador sin preguntar nada — hasta acá, siempre
    // uno nuevo. El problema: si el navegador recupera la pestaña quedada
    // en esa URL (Android mata pestañas en segundo plano todo el tiempo) y
    // ESTE dispositivo ya tenía un reporte de hoy (borrador o ya
    // finalizado), se creaba un SEGUNDO reporte para la misma fecha — el
    // primero en sincronizar se queda con el cupo (supervisor+frente+fecha
    // es único) y el otro falla para siempre con "ya existe un reporte",
    // sin que reintentar lo arregle. Reabrir lo que ya existe de hoy, en
    // vez de crear algo nuevo a ciegas, cierra esa puerta.
    const deHoy = rdc.reportes.find((r) => r.fecha === hoyLocal())
    if (deHoy?.estado === ESTADO.FINALIZADO) {
      router.replace({ name: 'rdc-detalle', params: { id: deHoy.id } })
      return
    }
    if (deHoy) await rdc.abrir(deHoy.id)
    else await rdc.nuevo()
    router.replace({ name: 'rdc-editar', params: { id: rdc.actual.id } })
    return
  }
  paso.value = 0
  listo.value = true
}
onMounted(cargarReporte)
watch(() => route.params.id, cargarReporte)

const componenteActual = computed(() => PASOS[paso.value].componente)

function ir(indice) {
  if (indice < 0 || indice >= PASOS.length) return
  paso.value = indice
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cerrar() {
  router.push({ name: 'rdc' })
}

// La lista ya no tiene un botón de borrar en cada fila. Este es su lugar:
// solo tiene sentido borrar mientras el reporte sigue siendo un borrador
// (uno ya finalizado es registro histórico, no se borra).
async function borrar() {
  if (!rdc.actual) return
  if (!confirm('¿Borrar este borrador? No se puede deshacer.')) return
  try {
    await rdc.eliminarBorrador(rdc.actual.id)
    router.push({ name: 'rdc' })
  } catch (e) {
    console.error(e)
    alert(e?.message ?? 'No se pudo borrar el borrador.')
  }
}

// El deslizamiento lateral entre pasos es parte de cómo se usa hoy en el
// frente: se pasa de paso con el pulgar, sin apuntar a un botón chico.
let inicioX = 0
let inicioY = 0
const alTocar = (e) => {
  inicioX = e.touches[0].clientX
  inicioY = e.touches[0].clientY
}
function alSoltar(e) {
  const dx = e.changedTouches[0].clientX - inicioX
  const dy = e.changedTouches[0].clientY - inicioY
  if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.75) return
  if (dx < 0 && paso.value < PASOS.length - 1) ir(paso.value + 1)
  else if (dx > 0 && paso.value > 0) ir(paso.value - 1)
}

// ---- Columna fija de la derecha (en todos los pasos) ----
const reporte = computed(() => rdc.actual)
const nombre = (clave, id) => nombreDe(rdc.catalogos, clave, id) || '—'
const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')
const ejecutadas = computed(() => (reporte.value ? partidasEjecutadas(reporte.value) : []))
const personal = computed(() => (reporte.value ? totalPersonal(reporte.value) : 0))
const standby = computed(() => (reporte.value ? fmtHm(totalStandbyMin(reporte.value)) : '0h 00m'))
const textoWsp = computed(() => (reporte.value ? textoWhatsapp(reporte.value, rdc.catalogos) : ''))

const antesDeEnviar = computed(() => {
  const r = reporte.value
  if (!r) return []
  return [
    { etiqueta: 'Capataz', ok: !!r.capatazId },
    { etiqueta: 'Supervisor responsable', ok: !!r.supervisorId },
    { etiqueta: 'Personal presente', ok: personal.value > 0 },
    { etiqueta: 'Hitos de jornada', ok: (r.hitos ?? []).length > 0 },
    { etiqueta: 'Metrados ejecutados', ok: ejecutadas.value.length > 0 },
  ]
})
const pendientes = computed(() => antesDeEnviar.value.filter((c) => !c.ok).length)

const copiado = ref(false)
async function copiar() {
  await navigator.clipboard.writeText(textoWsp.value)
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2000)
}
async function compartir() {
  if (navigator.share) {
    try {
      await navigator.share({ text: textoWsp.value, title: 'Reporte Diario de Campo' })
      return
    } catch {
      /* el usuario canceló la hoja de compartir — no es un error */
    }
  }
  await copiar()
}
</script>

<template>
  <div class="rdc-app rdc-ref">
    <div class="rx-pagina sin-pad">
      <div class="rx-hd">
        <div class="rx-row" style="gap: 14px">
          <button type="button" class="rb" aria-label="Cerrar y volver a mis reportes" @click="cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            Cerrar
          </button>
          <div>
            <div class="rx-titulo">
              {{ reporte ? nombre('frentes', reporte.frenteId) : 'Reporte diario' }}
              <span v-if="reporte?.esCorreccion" class="marca-correccion">Corrección</span>
            </div>
            <div class="rmu rx-sub">
              <span class="rx-dot"></span>Guardado automático · {{ reporte ? fmtFecha(reporte.fecha) : '' }}
            </div>
          </div>
        </div>
        <button v-if="reporte?.estado === ESTADO.BORRADOR" type="button" class="rb" aria-label="Borrar este borrador" @click="borrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
          Borrar borrador
        </button>
      </div>

      <div class="rx-pasos" role="tablist" aria-label="Pasos del reporte">
        <button
          v-for="(p, i) in PASOS"
          :key="p.clave"
          type="button"
          role="tab"
          class="rst"
          :class="{ on: paso === i, done: i < paso }"
          :aria-selected="paso === i"
          @click="ir(i)"
        >
          <span class="rn">
            <svg v-if="i < paso" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <template v-else>{{ i + 1 }}</template>
          </span>
          {{ p.titulo }}
        </button>
      </div>

      <div class="rx-two">
        <div class="rx-main" @touchstart.passive="alTocar" @touchend.passive="alSoltar">
          <p v-if="!listo" class="empty-msg">Cargando…</p>
          <component :is="componenteActual" v-else-if="reporte" />

          <!-- Anterior sigue disponible hasta enviar, incluso en el último
               paso (Resumen) — ahí no hay "Siguiente" porque ese paso ya tiene
               su propio botón "Terminado y Enviar" adentro. -->
          <div v-if="listo" class="rx-row rx-nav">
            <button type="button" class="rb" :class="{ off: paso === 0 }" :disabled="paso === 0" @click="ir(paso - 1)">← Anterior</button>
            <button v-if="paso < PASOS.length - 1" type="button" class="rb pri" style="padding: 0 26px" @click="ir(paso + 1)">Siguiente →</button>
          </div>
        </div>

        <aside v-if="listo && reporte" class="rx-side" aria-label="Resumen del día">
          <div class="rp" style="gap: 16px">
            <div class="rsh">RESUMEN DEL DÍA</div>
            <div class="rmu rx-sub">{{ fmtFecha(reporte.fecha) }} · {{ nombre('frentes', reporte.frenteId) }} · {{ nombre('supervisores', reporte.supervisorId) }}</div>
            <div class="rx-mini3">
              <div><div class="rmu rx-mini-l">Personal</div><div class="rx-mini-v">{{ personal }}</div></div>
              <div><div class="rmu rx-mini-l">Stand By</div><div class="rx-mini-v">{{ standby }}</div></div>
              <div><div class="rmu rx-mini-l">Metrados</div><div class="rx-mini-v">{{ ejecutadas.length }}</div></div>
            </div>
            <div>
              <div class="rl">Antes de enviar · {{ pendientes }} pendientes</div>
              <div v-for="c in antesDeEnviar" :key="c.etiqueta" class="rx-check">
                <svg v-if="c.ok" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22A55B" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg>
                <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9AA0AA" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
                <span>{{ c.etiqueta }}</span>
              </div>
            </div>
          </div>

          <div class="rp" style="gap: 14px">
            <div class="rx-row" style="justify-content: space-between">
              <div class="rsh">REPORTE WHATSAPP</div>
              <div class="rx-row" style="gap: 8px">
                <button type="button" class="rb sm" @click="compartir">Compartir</button>
                <button type="button" class="rb sm" @click="copiar">{{ copiado ? 'Copiado ✓' : 'Copiar' }}</button>
              </div>
            </div>
            <pre class="rx-pre">{{ textoWsp }}</pre>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rx-titulo {
  font-size: 20px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rx-sub {
  font-size: 13px;
  font-weight: 600;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rx-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}
.marca-correccion {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #111;
  background: #f6a800;
  padding: 3px 9px;
  border-radius: 5px;
}
.rx-nav {
  justify-content: space-between;
}
.rx-mini3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--ln);
  border-radius: 14px;
  overflow: hidden;
}
.rx-mini3 > div {
  background: var(--sf);
  padding: 14px 12px;
}
.rx-mini-l {
  font-size: 11px;
  font-weight: 600;
}
.rx-mini-v {
  font-size: 20px;
  font-weight: 800;
  margin-top: 4px;
  white-space: nowrap;
}
.rx-check {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
@media (max-width: 1024px) {
  .rx-side {
    position: static;
    max-width: none;
    flex-basis: 100%;
  }
}
</style>

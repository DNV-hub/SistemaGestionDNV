<script setup>
import { computed, inject, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'
import { CAUSAS_STANDBY, CAUSA_TIEMPO_TOTAL, HITOS } from '../services/rdcConstantes'
import { causaEfectiva, entradasAutomaticas, fmtHm, minutosStandby } from '../services/rdcCalculos'
import { rdcUi } from '../services/rdcUi'
import SelectorHora from './SelectorHora.vue'

// Paso "Bitácora" (reemplaza a "Jornada" en el formulario móvil): arriba las
// restricciones y los hitos; en el centro la LÍNEA DEL DÍA, que se arma sola
// con lo reportado en Metrado (frases automáticas) más las actividades de apoyo
// y los Stand By; abajo el campo para agregar una actividad de apoyo.
//
// Las frases salen de entradasAutomaticas() (rdcCalculos): es la MISMA función
// que usan el Excel (hoja BITACORA) y el texto de WhatsApp, así que lo que se
// lee acá es exactamente lo que se envía.
const rdc = useRdcStore()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()
const irPaso = inject('irPaso', () => {})

const IND_METRADO = 2

const ahoraHM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const aMin = (h) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : null)

// --- Hitos (10: los 8 de rdc_reporte_hitos + salida/retorno de refrigerio) --
const REFRIG_S = 'Salida a refrigerio/almuerzo'
const REFRIG_R = 'Retorno de refrigerio/almuerzo'
const LISTA_HITOS = [...HITOS.slice(0, -1), REFRIG_S, REFRIG_R, HITOS[HITOS.length - 1]]

function horaHito(nombre) {
  if (nombre === REFRIG_S) return reporte.value.refrigerioSalida || ''
  if (nombre === REFRIG_R) return reporte.value.refrigerioRetorno || ''
  return reporte.value.hitos.find((h) => h.nombre === nombre)?.hora ?? ''
}
function fijarHito(nombre, valor) {
  if (nombre === REFRIG_S) reporte.value.refrigerioSalida = valor || null
  else if (nombre === REFRIG_R) reporte.value.refrigerioRetorno = valor || null
  else {
    const existente = reporte.value.hitos.find((h) => h.nombre === nombre)
    if (existente) {
      if (valor) existente.hora = valor
      else reporte.value.hitos = reporte.value.hitos.filter((h) => h.nombre !== nombre)
    } else if (valor) {
      reporte.value.hitos.push({ id: nuevoId(), orden: HITOS.indexOf(nombre) + 1, nombre, hora: valor })
    }
  }
  guardar()
}
const hitosLlenos = computed(() => LISTA_HITOS.filter((h) => horaHito(h)).length)
const siguienteHito = computed(() => LISTA_HITOS.find((h) => !horaHito(h)) ?? null)
function ahoraHito(nombre) {
  fijarHito(nombre, ahoraHM())
  avisar(`${nombre} · ${horaHito(nombre)}`)
}

// --- Restricción de acceso -------------------------------------------------
function fijarRestriccion(valor) {
  reporte.value.restriccionAcceso = valor
  guardar()
  if (valor && !reporte.value.restriccionDescripcion) hoja.value = 'restriccion'
}

// --- Toast -----------------------------------------------------------------
const toast = ref('')
let tToast = null
function avisar(texto) {
  toast.value = texto
  clearTimeout(tToast)
  tToast = setTimeout(() => (toast.value = ''), 3000)
}
onBeforeUnmount(() => clearTimeout(tToast))

// --- Ajustes de las frases automáticas -------------------------------------
function ajustes() {
  if (!reporte.value.bitacoraAjustes) reporte.value.bitacoraAjustes = { textos: {}, enCurso: {} }
  return reporte.value.bitacoraAjustes
}
function alternarCurso(e) {
  const a = ajustes()
  if (a.enCurso[e.clave]) delete a.enCurso[e.clave]
  else a.enCurso[e.clave] = true
  guardar()
}

function elementosDe(clave) {
  const els = reporte.value.elementos
  if (clave === 'g:perf') return els.filter((e) => e.elemento === 'Perno' && e.actividad === 'Perforación')
  if (clave === 'g:iny') return els.filter((e) => e.elemento === 'Perno' && e.actividad === 'Inyección')
  if (clave === 'g:pull') return els.filter((e) => e.elemento === 'Perno' && e.actividad === 'Pull Test')
  if (clave.startsWith('e:')) return els.filter((e) => e.id === clave.slice(2))
  return []
}
/** La hora de una frase automática vive donde nació el dato: en la partida
 * (Metrado) o en los elementos del grupo — así Metrado y Bitácora siempre
 * muestran la misma hora. */
function fijarHoraAuto(clave, campo, valor) {
  if (clave.startsWith('p:')) {
    const cod = clave.slice(2)
    const m = reporte.value.metrados.find((x) => (x.partidaCodigo || x.id) === cod)
    if (m) m[campo] = valor || null
  } else {
    elementosDe(clave).forEach((el) => (el[campo] = valor || null))
  }
  guardar()
}

// --- Línea del día ---------------------------------------------------------
const entradas = computed(() => entradasAutomaticas(reporte.value))
const linea = computed(() => {
  const items = []
  entradas.value.forEach((e) => items.push({ tipo: 'auto', id: `a:${e.clave}`, t: e.hi || '', e }))
  reporte.value.bitacora.forEach((r) => items.push({ tipo: 'man', id: `m:${r.id}`, t: r.horaInicio || '', r }))
  reporte.value.standby.forEach((r) => items.push({ tipo: 'sb', id: `s:${r.id}`, t: r.desde || '', r }))
  LISTA_HITOS.forEach((n) => {
    const h = horaHito(n)
    if (h) items.push({ tipo: 'hito', id: `h:${n}`, t: h, nombre: n })
  })
  const orden = (it) => (it.t ? aMin(it.t) : Infinity)
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const d = orden(a.it) - orden(b.it)
      if (d === 0 || (orden(a.it) === Infinity && orden(b.it) === Infinity)) return (a.it.tipo === 'hito' ? -1 : 0) - (b.it.tipo === 'hito' ? -1 : 0) || a.i - b.i
      return d
    })
    .map((x) => x.it)
})
const hayFrases = computed(() => entradas.value.length > 0)

function segmentos(e) {
  if (e.editado || !e.resaltar?.length) return [{ t: e.texto, b: false }]
  let resto = e.texto
  const out = []
  for (const v of e.resaltar) {
    const i = v ? resto.indexOf(v) : -1
    if (i < 0) continue
    if (i > 0) out.push({ t: resto.slice(0, i), b: false })
    out.push({ t: v, b: true })
    resto = resto.slice(i + v.length)
  }
  if (resto) out.push({ t: resto, b: false })
  return out
}

// Un solo renglón de hora abierto a la vez, y un solo texto en edición.
const horaAbierta = ref(null)
const editando = ref(null)
const borrador = ref('')
const alternarHora = (id) => (horaAbierta.value = horaAbierta.value === id ? null : id)

function abrirEdicion(it) {
  if (editando.value === it.id) return cerrarEdicion(it)
  editando.value = it.id
  borrador.value = it.tipo === 'auto' ? it.e.texto : it.tipo === 'man' ? it.r.actividad : ''
}
function cerrarEdicion(it) {
  if (it?.tipo === 'auto') {
    const t = borrador.value.trim()
    const a = ajustes()
    if (t && t !== it.e.original) a.textos[it.e.clave] = t
    else delete a.textos[it.e.clave]
    guardar()
  }
  editando.value = null
}
function restaurar(it) {
  delete ajustes().textos[it.e.clave]
  guardar()
  editando.value = null
}
function quitarApoyo(it) {
  reporte.value.bitacora = reporte.value.bitacora.filter((b) => b.id !== it.r.id)
  editando.value = null
  guardar()
}
function verEnMetrado(it) {
  rdcUi.seccionPedida = it.e.seccion
  irPaso(IND_METRADO)
}

// --- Compositor (actividad de apoyo) ---------------------------------------
const nuevaHora = ref(ahoraHM())
const nuevoTexto = ref('')
const contenedor = ref(null)
const resaltado = ref(null)
const ubicacion = ref('')
let tUbic = null
const RE_CANTIDAD = /\d+([.,]\d+)?\s?(ml|m2|m²|m3|und|m)\b/i
const parecenMetrado = (t) => RE_CANTIDAD.test(t || '')
const avisoMetrado = computed(() => parecenMetrado(nuevoTexto.value))

const rotulo = (it) => {
  if (!it) return ''
  if (it.tipo === 'auto') return it.e.parte
  if (it.tipo === 'hito') return it.nombre
  if (it.tipo === 'sb') return 'Stand By'
  const x = it.r.actividad || ''
  return x.length > 22 ? `${x.slice(0, 22)}…` : x
}

async function agregarApoyo() {
  const texto = nuevoTexto.value.trim()
  if (!texto) return avisar('Escribe la actividad')
  const id = nuevoId()
  reporte.value.bitacora.push({ id, horaInicio: nuevaHora.value || null, horaFin: null, actividad: texto, orden: reporte.value.bitacora.length + 1 })
  nuevoTexto.value = ''
  guardar()
  await nextTick()
  const clave = `m:${id}`
  const i = linea.value.findIndex((x) => x.id === clave)
  const ant = linea.value[i - 1]
  const sig = linea.value[i + 1]
  const hh = nuevaHora.value
  let msg = hh ? `Quedó a las ${hh}` : 'Quedó al final, sin hora'
  if (ant && sig) msg += ` · entre «${rotulo(ant)}» y «${rotulo(sig)}»`
  else if (ant) msg += ` · después de «${rotulo(ant)}»`
  else if (sig) msg += ` · antes de «${rotulo(sig)}»`
  ubicacion.value = msg
  clearTimeout(tUbic)
  tUbic = setTimeout(() => (ubicacion.value = ''), 4500)
  avisar(msg)
  resaltado.value = clave
  setTimeout(() => (resaltado.value = null), 2200)
  const el = contenedor.value?.querySelector(`[data-id="${clave}"]`)
  if (el) contenedor.value.scrollTo({ top: Math.max(0, el.offsetTop - contenedor.value.clientHeight / 2 + 30), behavior: 'smooth' })
}
onBeforeUnmount(() => clearTimeout(tUbic))

// --- Hojas inferiores (hitos / restricción / stand by) ---------------------
const hoja = ref(null)
const panel = ref(null)
watch(hoja, async (v) => {
  if (v) {
    await nextTick()
    panel.value?.focus()
  }
})
const cerrarHoja = () => (hoja.value = null)

// Stand By
const PARADA_VACIA = { id: null, causa: '', causaOtro: '', actividad: '', desde: '', hasta: '', responsable: '', comentario: '', totalHoras: '', totalMinutos: '' }
const parada = reactive({ ...PARADA_VACIA })
const esTiempoTotal = computed(() => parada.causa === CAUSA_TIEMPO_TOTAL)
const paradaValida = computed(
  () =>
    !!parada.causa &&
    (esTiempoTotal.value ? Number(parada.totalHoras) > 0 || Number(parada.totalMinutos) > 0 : !!parada.desde && !!parada.hasta),
)
function abrirParada(it) {
  Object.assign(parada, PARADA_VACIA)
  if (it) {
    const r = it.r
    Object.assign(parada, {
      id: r.id,
      causa: r.causa ?? '',
      causaOtro: r.causaOtro ?? '',
      actividad: r.actividad ?? '',
      desde: r.desde ?? '',
      hasta: r.hasta ?? '',
      responsable: r.responsable ?? '',
      comentario: r.comentario ?? '',
      totalHoras: r.totalHoras ?? '',
      totalMinutos: r.totalMinutos ?? '',
    })
  }
  hoja.value = 'standby'
}
function guardarParada() {
  if (!paradaValida.value) return
  const datos = {
    actividad: parada.actividad.trim() || null,
    desde: esTiempoTotal.value ? null : parada.desde || null,
    hasta: esTiempoTotal.value ? null : parada.hasta || null,
    causa: parada.causa,
    causaOtro: parada.causa === 'OTRO' ? parada.causaOtro.trim() || null : null,
    responsable: parada.responsable.trim() || null,
    comentario: parada.comentario.trim() || null,
    totalHoras: parada.totalHoras === '' ? null : Number(parada.totalHoras),
    totalMinutos: parada.totalMinutos === '' ? null : Number(parada.totalMinutos),
  }
  const existente = parada.id ? reporte.value.standby.find((s) => s.id === parada.id) : null
  if (existente) Object.assign(existente, datos)
  else reporte.value.standby.push({ id: nuevoId(), ...datos, orden: reporte.value.standby.length + 1 })
  guardar()
  cerrarHoja()
}
function borrarParada() {
  reporte.value.standby = reporte.value.standby.filter((s) => s.id !== parada.id)
  guardar()
  cerrarHoja()
}
const durParada = (r) => {
  const m = minutosStandby(r, reporte.value)
  return m > 0 ? fmtHm(m) : ''
}
</script>

<template>
  <div v-if="reporte" class="bt">
    <template v-if="reporte">
      <!-- Restricciones -->
      <div class="bt-card">
        <div class="bt-rrow">
          <span class="bt-rtx">¿Restricciones para llegar al frente?</span>
          <div class="bt-seg" role="group" aria-label="Restricciones para llegar al frente">
            <button type="button" :class="{ on: !reporte.restriccionAcceso }" :aria-pressed="!reporte.restriccionAcceso" @click="fijarRestriccion(false)">No</button>
            <button type="button" :class="{ on: reporte.restriccionAcceso }" :aria-pressed="!!reporte.restriccionAcceso" @click="fijarRestriccion(true)">Sí</button>
          </div>
        </div>
        <button v-if="reporte.restriccionAcceso" type="button" class="bt-rdet" @click="hoja = 'restriccion'">
          {{ reporte.restriccionDescripcion?.trim() || 'Falta describir la restricción' }}
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <!-- Hitos -->
      <div class="bt-card bt-hrow">
        <button type="button" class="bt-hmain" aria-haspopup="dialog" @click="hoja = 'hitos'">
          <span class="bt-h1">Hitos de jornada
            <span class="bt-pill" :class="hitosLlenos === LISTA_HITOS.length ? 'ok' : 'ac'">{{ hitosLlenos }} de {{ LISTA_HITOS.length }}</span>
          </span>
          <span class="bt-h2">{{ siguienteHito ? `Siguiente: ${siguienteHito}` : 'Todos registrados' }}</span>
        </button>
        <button v-if="siguienteHito" type="button" class="bt-ahora big" @click="ahoraHito(siguienteHito)">Ahora</button>
        <button type="button" class="bt-ib" aria-label="Ver todos los hitos" @click="hoja = 'hitos'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>

      <!-- Línea del día -->
      <div class="bt-card bt-tl">
        <div class="bt-tlh">
          <span>Línea del día</span>
          <span class="bt-tlc" :class="{ aviso: ubicacion }">{{ ubicacion }}</span>
          <button type="button" class="bt-sbbtn" @click="abrirParada(null)">+ Stand By</button>
        </div>

        <div ref="contenedor" class="bt-tls">
          <div v-if="!hayFrases" class="bt-hint">
            <span>Las partidas que reportes en <b>Metrado</b> aparecerán aquí como frases.</span>
            <button type="button" @click="irPaso(IND_METRADO)">Ir a Metrado</button>
          </div>
          <p v-if="!linea.length" class="bt-nada">Sin actividades todavía.</p>

          <div
            v-for="it in linea"
            :key="it.id"
            :data-id="it.id"
            class="bt-it"
            :class="{ h: it.tipo === 'hito', m: it.tipo === 'man', sb: it.tipo === 'sb', flash: resaltado === it.id }"
          >
            <div class="bt-rl">
              <span v-if="it.tipo === 'hito'" class="bt-hora fija">{{ it.t }}</span>
              <button v-else type="button" class="bt-hora" :class="{ falta: !it.t }" aria-label="Cambiar hora" @click="alternarHora(it.id)">{{ it.t || '+ hora' }}</button>
            </div>
            <div class="bt-ln"><i></i></div>

            <div class="bt-cc">
              <div class="bt-cuerpo">
                <!-- hito -->
                <div v-if="it.tipo === 'hito'" class="bt-tx hito">{{ it.nombre }}</div>

                <!-- automática -->
                <template v-else-if="it.tipo === 'auto'">
                  <textarea v-if="editando === it.id" v-model="borrador" class="bt-ta" aria-label="Editar texto" rows="3" />
                  <div v-else class="bt-tx"><template v-for="(s, i) in segmentos(it.e)" :key="i"><b v-if="s.b">{{ s.t }}</b><template v-else>{{ s.t }}</template></template></div>
                </template>

                <!-- apoyo -->
                <template v-else-if="it.tipo === 'man'">
                  <textarea v-if="editando === it.id" v-model="it.r.actividad" class="bt-ta" aria-label="Actividad" rows="3" @change="guardar" />
                  <div v-else class="bt-tx">{{ it.r.actividad || 'Sin texto' }}</div>
                  <p v-if="editando === it.id && parecenMetrado(it.r.actividad)" class="bt-warn">
                    Parece un metrado. Si es avance de una partida, regístralo en Metrado para que cuente.
                    <button type="button" @click="irPaso(IND_METRADO)">Ir a Metrado</button>
                  </p>
                </template>

                <!-- stand by -->
                <template v-else>
                  <div class="bt-tx"><b class="sbtag">STAND BY</b> {{ causaEfectiva(it.r) || 'Sin causa' }}<template v-if="it.r.actividad"> · {{ it.r.actividad }}</template></div>
                  <div class="bt-sub">{{ it.r.desde || '--:--' }}<template v-if="it.r.hasta"> – {{ it.r.hasta }}</template><template v-if="durParada(it.r)"> · {{ durParada(it.r) }}</template></div>
                </template>

                <!-- hora de inicio / fin -->
                <div v-if="horaAbierta === it.id && it.tipo !== 'hito'" class="bt-hp">
                  <template v-if="it.tipo === 'auto'">
                    <SelectorHora :model-value="it.e.hi" @update:model-value="(v) => fijarHoraAuto(it.e.clave, 'horaInicio', v)" />
                    <span>–</span>
                    <SelectorHora :model-value="it.e.hf" @update:model-value="(v) => fijarHoraAuto(it.e.clave, 'horaFin', v)" />
                  </template>
                  <template v-else-if="it.tipo === 'man'">
                    <SelectorHora v-model="it.r.horaInicio" @update:model-value="guardar" />
                    <span>–</span>
                    <SelectorHora v-model="it.r.horaFin" @update:model-value="guardar" />
                  </template>
                  <template v-else>
                    <SelectorHora v-model="it.r.desde" @update:model-value="guardar" />
                    <span>–</span>
                    <SelectorHora v-model="it.r.hasta" @update:model-value="guardar" />
                  </template>
                </div>

                <!-- píldoras / acciones -->
                <div v-if="it.tipo !== 'hito'" class="bt-mini">
                  <span v-if="it.tipo === 'auto' && it.e.editado" class="bt-pill ac">Editado</span>
                  <button
                    v-if="it.tipo === 'auto' && it.e.conmutaCurso && !it.e.editado"
                    type="button"
                    class="bt-tg"
                    :class="{ on: it.e.enCurso }"
                    :aria-pressed="it.e.enCurso"
                    @click="alternarCurso(it.e)"
                  >{{ it.e.enCurso ? 'En curso' : 'Concluido' }}</button>
                  <template v-if="editando === it.id">
                    <button type="button" class="bt-tg on" @click="cerrarEdicion(it)">Listo</button>
                    <button v-if="it.tipo === 'auto' && it.e.editado" type="button" class="bt-tg" @click="restaurar(it)">Restaurar</button>
                    <button v-if="it.tipo === 'auto'" type="button" class="bt-lk" @click="verEnMetrado(it)">Ver en Metrado</button>
                    <button v-if="it.tipo === 'man'" type="button" class="bt-tg" @click="quitarApoyo(it)">Quitar</button>
                  </template>
                </div>
              </div>

              <button
                v-if="it.tipo !== 'hito'"
                type="button"
                class="bt-ib"
                :class="{ on: editando === it.id }"
                :aria-label="it.tipo === 'sb' ? 'Editar Stand By' : 'Editar texto'"
                @click="it.tipo === 'sb' ? abrirParada(it) : abrirEdicion(it)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <p v-if="avisoMetrado" class="bt-warn fuera">
        Parece un metrado. Regístralo en Metrado para que cuente.
        <button type="button" @click="irPaso(IND_METRADO)">Ir a Metrado</button>
      </p>

      <!-- Compositor -->
      <div class="bt-comp">
        <div class="bt-comp-hora"><SelectorHora v-model="nuevaHora" /></div>
        <input
          v-model="nuevoTexto"
          class="bt-comp-tx"
          type="text"
          maxlength="160"
          placeholder="Agregar actividad de apoyo…"
          aria-label="Actividad de apoyo"
          @keydown.enter.prevent="agregarApoyo"
        />
        <button type="button" class="bt-comp-add" aria-label="Agregar actividad" @click="agregarApoyo">+</button>
      </div>
    </template>

    <p v-if="toast" class="bt-toast" role="status">{{ toast }}</p>

    <!-- Hoja inferior -->
    <div v-if="hoja" class="bt-sheet" @keydown.esc="cerrarHoja">
      <div class="bt-sbk" @click="cerrarHoja"></div>
      <div ref="panel" class="bt-spn" role="dialog" aria-modal="true" tabindex="-1" :aria-label="hoja === 'hitos' ? 'Hitos de jornada' : hoja === 'standby' ? 'Stand By' : 'Restricción de acceso'">
        <!-- Hitos -->
        <template v-if="hoja === 'hitos'">
          <div class="bt-sh">
            <div>
              <b>Hitos de jornada</b>
              <div class="bt-d">{{ hitosLlenos }} de {{ LISTA_HITOS.length }} registrados. Toca Ahora cuando ocurra.</div>
            </div>
            <button type="button" class="bt-ib x" aria-label="Cerrar" @click="cerrarHoja">×</button>
          </div>
          <div class="bt-sl">
            <div v-for="h in LISTA_HITOS" :key="h" class="bt-hit" :class="{ nxt: h === siguienteHito }">
              <span class="bt-nm">{{ h }}</span>
              <div class="bt-hf"><SelectorHora :model-value="horaHito(h)" @update:model-value="(v) => fijarHito(h, v)" /></div>
              <button type="button" class="bt-ahora" @click="ahoraHito(h)">Ahora</button>
            </div>
          </div>
          <div class="bt-sf"><button type="button" class="bt-btn full" @click="cerrarHoja">Listo</button></div>
        </template>

        <!-- Restricción -->
        <template v-else-if="hoja === 'restriccion'">
          <div class="bt-sh">
            <div><b>Restricción de acceso</b><div class="bt-d">Completa los datos de la restricción.</div></div>
            <button type="button" class="bt-ib x" aria-label="Cerrar" @click="cerrarHoja">×</button>
          </div>
          <div class="bt-sl pad">
            <label class="bt-fl">¿Cuál fue la restricción?
              <textarea v-model="reporte.restriccionDescripcion" rows="3" placeholder="Describe la restricción…" @change="guardar" />
            </label>
            <div class="bt-2">
              <label class="bt-fl">Hora inicio <SelectorHora v-model="reporte.restriccionInicio" @update:model-value="guardar" /></label>
              <label class="bt-fl">Hora fin <SelectorHora v-model="reporte.restriccionFin" @update:model-value="guardar" /></label>
            </div>
          </div>
          <div class="bt-sf"><button type="button" class="bt-btn full" @click="cerrarHoja">Listo</button></div>
        </template>

        <!-- Stand By -->
        <template v-else>
          <div class="bt-sh">
            <div><b>{{ parada.id ? 'Editar Stand By' : 'Nuevo Stand By' }}</b><div class="bt-d">Parada de la jornada por causas ajenas.</div></div>
            <button type="button" class="bt-ib x" aria-label="Cerrar" @click="cerrarHoja">×</button>
          </div>
          <div class="bt-sl pad">
            <label class="bt-fl">Causa
              <select v-model="parada.causa">
                <option value="">— Seleccionar causa —</option>
                <option v-for="c in CAUSAS_STANDBY" :key="c" :value="c">{{ c }}</option>
                <option value="OTRO">OTRO (especificar)</option>
              </select>
            </label>
            <label v-if="parada.causa === 'OTRO'" class="bt-fl">Especificar otra causa
              <input v-model="parada.causaOtro" type="text" placeholder="Describe la causa…" />
            </label>
            <div v-if="esTiempoTotal" class="bt-2">
              <label class="bt-fl">Horas<input v-model="parada.totalHoras" type="number" min="0" inputmode="numeric" placeholder="0" /></label>
              <label class="bt-fl">Minutos<input v-model="parada.totalMinutos" type="number" min="0" max="59" inputmode="numeric" placeholder="0" /></label>
            </div>
            <div v-else-if="parada.causa" class="bt-2">
              <label class="bt-fl">Desde <SelectorHora v-model="parada.desde" /></label>
              <label class="bt-fl">Hasta <SelectorHora v-model="parada.hasta" /></label>
            </div>
            <label class="bt-fl">Actividad afectada
              <input v-model="parada.actividad" type="text" placeholder="Ej: Perforación de pernos, instalación de malla…" />
            </label>
            <label class="bt-fl">Responsable de la liberación
              <input v-model="parada.responsable" type="text" placeholder="Nombre (puede ser externo)" />
            </label>
            <label class="bt-fl">Comentarios (opcional)
              <textarea v-model="parada.comentario" rows="2" placeholder="Detalles adicionales del Stand By…" />
            </label>
          </div>
          <div class="bt-sf dos">
            <button v-if="parada.id" type="button" class="bt-btn sec" @click="borrarParada">Eliminar</button>
            <button type="button" class="bt-btn full" :disabled="!paradaValida" @click="guardarParada">Guardar</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* El paso cabe en la pantalla: solo hace scroll la tarjeta de la línea del día. */
.bt {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}
.bt-card {
  background: var(--card, var(--surface));
  border: 1px solid var(--border-lista, var(--border));
  border-radius: 16px;
  flex: none;
}
.bt-vacio {
  padding: 28px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  color: var(--text2);
  font-size: 13.5px;
}
.bt-vacio b {
  color: var(--text);
  font-size: 15px;
}
.bt-btn {
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 12px;
  background: #f5a800;
  color: #1a1206;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  margin-top: 8px;
}
.bt-btn.full {
  width: 100%;
  margin: 0;
}
.bt-btn.sec {
  background: var(--surface2);
  color: var(--text);
  width: auto;
  margin: 0;
}
.bt-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* restricciones */
.bt-rrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  min-height: 48px;
}
.bt-rtx {
  flex: 1;
  font-weight: 700;
  font-size: 13.5px;
  color: var(--text);
}
.bt-seg {
  display: inline-flex;
  background: var(--surface2);
  border-radius: 10px;
  padding: 3px;
}
.bt-seg button {
  min-width: 44px;
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text2);
  font: inherit;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
}
.bt-seg button.on {
  background: var(--card, var(--surface));
  color: var(--text);
  box-shadow: 0 0 0 1px var(--border-lista, var(--border));
}
.bt-rdet {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px 12px;
  border: 0;
  border-top: 1px solid var(--border-lista, var(--border));
  background: none;
  color: var(--amber-text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

/* hitos */
.bt-hrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 14px;
  min-height: 58px;
}
.bt-hmain {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  text-align: left;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.bt-h1 {
  font-weight: 800;
  font-size: 14px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.bt-h2 {
  font-size: 12px;
  color: var(--text2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bt-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.bt-pill.ok {
  background: var(--green-bg);
  color: var(--green-text);
}
.bt-pill.ac {
  background: var(--amber-bg);
  color: var(--amber-text);
}
.bt-pill.bl {
  background: var(--blue-bg);
  color: var(--blue-text);
}
.bt-ahora {
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--blue-bg);
  color: var(--blue-text);
  font: inherit;
  font-weight: 800;
  font-size: 12.5px;
  cursor: pointer;
  flex: none;
}
.bt-ahora.big {
  min-height: 40px;
  padding: 0 14px;
}
.bt-ib {
  width: 32px;
  height: 32px;
  flex: none;
  border: 0;
  border-radius: 9px;
  background: none;
  color: var(--text2);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.bt-ib.on,
.bt-ib:hover {
  background: var(--surface2);
  color: var(--text);
}
.bt-ib.x {
  font-size: 22px;
  width: 40px;
  height: 40px;
}

/* línea del día */
.bt-tl {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.bt-tlh {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-lista, var(--border));
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text2);
}
.bt-tlh > span:first-child {
  white-space: nowrap;
}
.bt-tlc {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 11px;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 700;
}
.bt-tlc.aviso {
  color: var(--amber-text);
}
.bt-sbbtn {
  flex: none;
  min-height: 32px;
  padding: 0 18px;
  border: 1px solid #f3c79a;
  border-radius: 9px;
  background: #fde6cf;
  color: #8a4a12;
  font: inherit;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}
.bt-tls {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  position: relative;
}
.bt-hint {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin: 10px 12px 4px;
  padding: 9px 12px;
  background: var(--amber-bg);
  color: var(--amber-text);
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 600;
}
.bt-hint button {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 800;
  text-decoration: underline;
  min-height: 32px;
  white-space: nowrap;
  cursor: pointer;
}
.bt-nada {
  text-align: center;
  color: var(--text2);
  padding: 22px 12px;
  margin: 0;
}
.bt-it {
  display: flex;
  gap: 8px;
  padding: 0 10px 0 8px;
}
.bt-rl {
  width: 52px;
  flex: none;
  text-align: right;
  padding-top: 9px;
}
.bt-hora {
  min-height: 28px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--text2);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.bt-hora.fija {
  display: inline-block;
  padding-top: 3px;
  cursor: default;
}
.bt-hora.falta {
  background: var(--amber-bg);
  color: var(--amber-text);
  border-radius: 6px;
  padding: 0 5px;
}
.bt-ln {
  width: 12px;
  flex: none;
  position: relative;
}
.bt-ln::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--border-lista, var(--border));
}
.bt-ln i {
  position: absolute;
  left: 1px;
  top: 14px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f5a800;
}
.bt-it.h .bt-ln i {
  width: 8px;
  height: 8px;
  left: 2px;
  background: var(--border-md);
}
.bt-it.m .bt-ln i {
  background: #4c8df6;
}
.bt-it.sb .bt-ln i {
  background: var(--red);
}
.bt-cc {
  flex: 1;
  min-width: 0;
  padding: 8px 0 9px;
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.bt-cuerpo {
  flex: 1;
  min-width: 0;
}
.bt-tx {
  font-size: 13.5px;
  line-height: 1.42;
  color: var(--text);
  overflow-wrap: anywhere;
}
.bt-tx.hito {
  font-size: 12.5px;
  color: var(--text2);
  font-weight: 600;
  padding-top: 1px;
}
.bt-tx b {
  background: var(--amber-bg);
  color: var(--amber-text);
  border-radius: 4px;
  padding: 0 3px;
  font-weight: 800;
}
.bt-tx b.sbtag {
  background: var(--red-bg);
  color: var(--red-text);
  font-size: 10.5px;
}
.bt-sub {
  font-size: 12px;
  color: var(--text2);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.bt-ta {
  width: 100%;
  min-height: 64px;
  border-radius: 10px;
  border: 1px solid var(--border-md);
  background: var(--surface2);
  color: var(--text);
  padding: 8px;
  font: inherit;
  font-size: 16px;
  resize: vertical;
}
.bt-hp {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
}
.bt-hp > div {
  flex: 1;
  min-width: 0;
}
.bt-hp span {
  color: var(--text2);
}
.bt-mini {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
  align-items: center;
}
.bt-mini:empty {
  display: none;
}
.bt-tg {
  min-height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: var(--surface2);
  color: var(--text2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.bt-tg.on {
  background: var(--text);
  color: var(--card, var(--surface));
}
.bt-lk {
  min-height: 26px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--blue-text);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.bt-it.flash {
  animation: bt-fl 2.2s ease-out;
}
@keyframes bt-fl {
  0%,
  35% {
    background: var(--amber-bg);
  }
  100% {
    background: transparent;
  }
}
.bt-warn {
  margin: 6px 0 0;
  background: var(--red-bg);
  color: var(--red-text);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.bt-warn.fuera {
  margin: 0;
  flex: none;
}
.bt-warn button {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 800;
  text-decoration: underline;
  cursor: pointer;
  min-height: 24px;
}

/* compositor */
.bt-comp {
  flex: none;
  display: flex;
  gap: 6px;
  align-items: center;
  background: var(--card, var(--surface));
  border: 1px solid var(--border-lista, var(--border));
  border-radius: 16px;
  padding: 6px;
}
.bt-comp-hora {
  width: 112px;
  flex: none;
}
.bt-comp-tx {
  flex: 1;
  min-width: 0;
  height: 42px;
  border-radius: 10px;
  border: 1px solid var(--border-md);
  background: var(--surface2);
  color: var(--text);
  padding: 0 10px;
  font: inherit;
  font-size: 16px;
}
.bt-comp-add {
  width: 44px;
  height: 42px;
  flex: none;
  border: 0;
  border-radius: 10px;
  background: #f5a800;
  color: #1a1206;
  font-size: 22px;
  font-weight: 800;
  cursor: pointer;
}
.bt-toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  max-width: 90vw;
  margin: 0;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--text);
  color: var(--card, var(--surface));
  font-weight: 700;
  font-size: 13px;
  z-index: 120;
}

/* hoja inferior */
.bt-sheet {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.bt-sbk {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
.bt-spn {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
  background: var(--card, var(--surface));
  border-radius: 22px 22px 0 0;
  outline: none;
}
@media (prefers-reduced-motion: no-preference) {
  .bt-spn {
    animation: bt-up 0.22s ease-out;
  }
  @keyframes bt-up {
    from {
      transform: translateY(40px);
      opacity: 0.4;
    }
  }
}
.bt-sh {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 12px 8px 16px;
}
.bt-sh b {
  font-size: 17px;
  color: var(--text);
}
.bt-d {
  font-size: 12.5px;
  color: var(--text2);
}
.bt-sl {
  overflow-y: auto;
  border-top: 1px solid var(--border-lista, var(--border));
}
.bt-sl.pad {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bt-hit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  min-height: 52px;
  border-top: 1px solid var(--border-lista, var(--border));
}
.bt-hit:first-child {
  border-top: 0;
}
.bt-hit.nxt {
  background: var(--amber-bg);
}
.bt-nm {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--text);
}
.bt-hf {
  width: 112px;
  flex: none;
}
.bt-sf {
  padding: 10px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border-lista, var(--border));
}
.bt-sf.dos {
  display: flex;
  gap: 10px;
}
.bt-sf.dos .bt-btn.full {
  flex: 1;
}
.bt-fl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text2);
  min-width: 0;
}
.bt-fl input,
.bt-fl select,
.bt-fl textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border-md);
  background: var(--surface2);
  color: var(--text);
  padding: 9px 10px;
  font: inherit;
  font-size: 16px;
}
.rdc-app.formulario .bt-fl select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236F6B63' stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.bt-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
:focus-visible {
  outline: 2px solid #f5a800;
  outline-offset: 2px;
}
</style>

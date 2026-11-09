<script setup>
import { computed, ref, watch } from 'vue'
import { cargarSemana, fechasLimiteReportes } from '../../services/semanalService'
import {
  armarDias,
  armarPartidas,
  hora,
  hoyIso,
  lunesDe,
  numero,
  numeroSemana,
  rangoSemana,
  sumarDias,
  textoResumenSemana,
} from '../../utils/semanal'

// Reemplaza a la matriz mensual de "Metrados": por cada semana (lunes a
// domingo), los 7 días con el resumen de su bitácora y sus metrados, o los
// totales por partida. Solo lectura (frente-semanal-referencia.html).
const props = defineProps({
  frente: { type: Object, required: true },
})

const hoy = hoyIso()
const lunesActual = lunesDe(hoy)
const lunesSemana1 = ref(null)
const lunes = ref(null)
const vista = ref('dia')
const abiertos = ref(new Set())
const cargando = ref(true)
const error = ref('')
// Semana ya cargada → no se vuelve a pedir al ir y volver con ‹ ›.
const cache = new Map()
const datos = ref(null)

async function iniciar() {
  cargando.value = true
  error.value = ''
  cache.clear()
  try {
    const { primera, ultima } = await fechasLimiteReportes(props.frente.id, sumarDias(lunesActual, 6))
    // Semana 1: la que contiene el inicio del frente o, si no lo tiene, su primer reporte.
    lunesSemana1.value = lunesDe(props.frente.fecha_inicio ?? primera ?? hoy)
    if (lunesSemana1.value > lunesActual) lunesSemana1.value = lunesActual
    // Al entrar: la semana actual; si todavía no tiene reportes, la última que sí.
    const conReportesHoy = ultima && ultima >= lunesActual
    lunes.value = conReportesHoy || !ultima ? lunesActual : lunesDe(ultima)
    if (lunes.value < lunesSemana1.value) lunesSemana1.value = lunes.value
    await cargar()
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cargar la semana${e?.message ? ': ' + e.message : '.'}`
    cargando.value = false
  }
}

async function cargar() {
  const clave = lunes.value
  abiertos.value = new Set()
  if (cache.has(clave)) {
    datos.value = cache.get(clave)
    cargando.value = false
    return
  }
  cargando.value = true
  error.value = ''
  try {
    const r = await cargarSemana(props.frente.id, clave, sumarDias(clave, 6))
    cache.set(clave, r)
    if (lunes.value === clave) datos.value = r
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cargar la semana${e?.message ? ': ' + e.message : '.'}`
  } finally {
    if (lunes.value === clave) cargando.value = false
  }
}
watch(() => props.frente.id, iniciar, { immediate: true })

const nSemana = computed(() => (lunes.value && lunesSemana1.value ? numeroSemana(lunes.value, lunesSemana1.value) : 1))
const puedeAtras = computed(() => lunes.value > lunesSemana1.value)
const puedeAdelante = computed(() => lunes.value < lunesActual)
function moverSemana(delta) {
  lunes.value = sumarDias(lunes.value, 7 * delta)
  cargar()
}

const dias = computed(() => (datos.value && lunes.value ? armarDias(lunes.value, datos.value.reportes, datos.value.bitacora, datos.value.metrados) : []))
const partidas = computed(() => armarPartidas(dias.value))
const sinReportes = computed(() => !!datos.value && !datos.value.reportes.length)

const kpis = computed(() => {
  const transcurridos = dias.value.filter((d) => !d.futuro).length
  return {
    reportados: dias.value.filter((d) => d.conReporte).length,
    transcurridos,
    actividades: dias.value.reduce((s, d) => s + d.bitacora.length, 0),
    partidas: partidas.value.length,
    sinMetrado: dias.value.filter((d) => d.conReporte && !d.metrados.length).length,
  }
})

function alternar(d) {
  if (!d.conReporte) return
  const s = new Set(abiertos.value)
  if (s.has(d.n)) s.delete(d.n)
  else s.add(d.n)
  abiertos.value = s
}
const rangoHoras = (l) => (l.hora_fin ? `${hora(l.hora_inicio)}–${hora(l.hora_fin)}` : hora(l.hora_inicio))
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const fechaLarga = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`
const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// ---- Copiar resumen ----
const aviso = ref('')
let tAviso = null
function avisar(t) {
  aviso.value = t
  clearTimeout(tAviso)
  tAviso = setTimeout(() => (aviso.value = ''), 2400)
}
async function copiarResumen() {
  try {
    await navigator.clipboard.writeText(textoResumenSemana(props.frente.nombre, nSemana.value, lunes.value, dias.value))
    avisar('Resumen copiado')
  } catch {
    avisar('No se pudo copiar el resumen')
  }
}
</script>

<template>
  <div class="sm">
    <div class="sm-bar">
      <div class="sm-wk">
        <button type="button" class="sm-nav" aria-label="Semana anterior" :disabled="!puedeAtras || !lunes" @click="moverSemana(-1)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div class="sm-wkl">
          <b>Semana {{ nSemana }}</b>
          <span v-if="lunes">{{ rangoSemana(lunes) }}</span>
        </div>
        <button type="button" class="sm-nav" aria-label="Semana siguiente" :disabled="!puedeAdelante || !lunes" @click="moverSemana(1)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div class="sm-acts">
        <div class="sm-seg" role="group" aria-label="Agrupar">
          <button type="button" :aria-pressed="vista === 'dia'" @click="vista = 'dia'">Por día</button>
          <button type="button" :aria-pressed="vista === 'partida'" @click="vista = 'partida'">Por partida</button>
        </div>
        <button type="button" class="sm-btn" :disabled="cargando || !dias.length || sinReportes" @click="copiarResumen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
          Copiar resumen
        </button>
      </div>
    </div>

    <div v-if="error" class="sm-error">
      <span>{{ error }}</span>
      <button type="button" class="sm-btn" @click="lunesSemana1 ? cargar() : iniciar()">Reintentar</button>
    </div>

    <template v-else-if="cargando">
      <div class="sm-kpis"><div v-for="i in 4" :key="i" class="sm-kpi"><div class="sk sk-l"></div><div class="sk sk-v"></div></div></div>
      <div class="sm-days"><div v-for="i in 7" :key="i" class="sm-day sk-day"><div class="sk sk-dn"></div><div class="sk-txt"><div class="sk"></div><div class="sk corto"></div></div></div></div>
    </template>

    <template v-else-if="datos">
      <div class="sm-kpis">
        <div class="sm-kpi"><div class="l">Días reportados</div><div class="v">{{ kpis.reportados }}<small> / {{ kpis.transcurridos }}</small></div></div>
        <div class="sm-kpi"><div class="l">Actividades</div><div class="v">{{ kpis.actividades }}</div></div>
        <div class="sm-kpi"><div class="l">Partidas con avance</div><div class="v">{{ kpis.partidas }}</div></div>
        <div class="sm-kpi"><div class="l">Días sin metrado</div><div class="v" :class="{ rojo: kpis.sinMetrado > 0 }">{{ kpis.sinMetrado }}</div></div>
      </div>

      <div v-if="sinReportes" class="pl-vacio sm-vacio">No hay reportes en esta semana</div>

      <!-- Por día -->
      <div v-else-if="vista === 'dia'" class="sm-days">
        <div v-for="d in dias" :key="d.n" class="sm-day" :class="{ open: abiertos.has(d.n), hoy: d.hoy, vacio: !d.conReporte }">
          <button
            type="button"
            class="sm-dh"
            :disabled="!d.conReporte"
            :aria-expanded="d.conReporte ? abiertos.has(d.n) : undefined"
            @click="alternar(d)"
          >
            <div class="sm-dn"><small>Día {{ d.n }}</small><b>{{ d.dia }}</b><span>{{ d.dow }}</span></div>
            <div class="sm-dm">
              <div class="sm-dt">{{ d.resumen }}</div>
              <div v-if="d.conReporte" class="sm-chips">
                <span class="sm-pill neu">{{ d.bitacora.length }} {{ d.bitacora.length === 1 ? 'actividad' : 'actividades' }}</span>
                <span v-if="d.metrados.length" class="sm-pill info">{{ d.metrados.length }} {{ d.metrados.length === 1 ? 'metrado' : 'metrados' }}</span>
                <span v-else class="sm-pill warn">Sin metrado</span>
              </div>
            </div>
            <div class="sm-dr">
              <span class="sm-pill" :class="!d.conReporte ? 'neu' : d.estado === 'Enviado' ? 'ok' : 'warn'">{{ d.estado ?? 'Sin reporte' }}</span>
              <svg v-if="d.conReporte" class="sm-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </div>
          </button>

          <div v-if="abiertos.has(d.n)" class="sm-dd">
            <div class="sm-colx">
              <h4><span>Bitácora</span><span>{{ d.bitacora.length }}</span></h4>
              <div v-for="(l, i) in d.bitacora" :key="i" class="sm-bi">
                <time>{{ rangoHoras(l) }}</time>
                <p>{{ l.actividad }}</p>
              </div>
              <p v-if="!d.bitacora.length" class="sm-mut">Sin bitácora registrada.</p>
            </div>
            <div class="sm-colx">
              <h4><span>Metrados del día</span><span>{{ d.metrados.length }}</span></h4>
              <template v-if="d.metrados.length">
                <div v-for="(m, i) in d.metrados" :key="i" class="sm-mi">
                  <span>{{ m.partida_nombre }}<em v-if="m.partida_codigo">{{ m.partida_codigo }}</em></span>
                  <b>{{ numero(m.cantidad) }}<small>{{ m.unidad }}</small></b>
                </div>
              </template>
              <div v-else class="sm-none">No se registraron metrados este día. Revisa el reporte.</div>
              <router-link v-for="r in d.reportes" :key="r.id" class="sm-link" :to="{ name: 'rdc-detalle', params: { id: r.id } }">
                Abrir reporte del {{ fechaLarga(d.fecha) }}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6" /></svg>
              </router-link>
            </div>
          </div>
        </div>
      </div>

      <!-- Por partida -->
      <div v-else class="sm-tbl">
        <div class="sm-tr h">
          <span>PARTIDA</span><span class="sm-um">U.M.</span><span class="sm-q">SEMANA</span><span class="sm-um">DÍAS CON AVANCE</span>
        </div>
        <div v-for="p in partidas" :key="`${p.codigo}|${p.nombre}|${p.unidad}`" class="sm-tr">
          <div class="sm-nm">{{ p.nombre }}<em v-if="p.codigo">{{ p.codigo }}</em></div>
          <span class="sm-um sm-mut2">{{ p.unidad }}</span>
          <span class="sm-q">{{ numero(p.total) }}<small class="sm-um-movil"> {{ p.unidad }}</small></span>
          <div class="sm-dots">
            <span
              v-for="(l, i) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']"
              :key="i"
              class="sm-dot"
              :class="{ on: p.dias.has(i + 1) }"
              :title="`Día ${i + 1}`"
              :aria-label="`${DIAS_LARGOS[i]}: ${p.dias.has(i + 1) ? 'avance' : 'sin avance'}`"
              role="img"
            >{{ l }}</span>
          </div>
        </div>
        <div v-if="!partidas.length" class="pl-vacio">No hay metrados en esta semana.</div>
      </div>
    </template>

    <div v-if="aviso" class="sm-toast" role="status">{{ aviso }}</div>
  </div>
</template>

<style scoped>
.sm {
  --sm-inv: var(--p-seg-on-bg);
  --sm-invt: var(--p-seg-on-fg);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sm-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.sm-wk { display: flex; align-items: center; gap: 6px; }
.sm-nav {
  width: 40px; height: 40px; border-radius: 12px; border: 0; background: var(--p-card); color: var(--p-text);
  box-shadow: 0 0 0 1px var(--p-line-ctl); display: grid; place-items: center; padding: 0;
}
.sm-nav:disabled { opacity: 0.4; cursor: not-allowed; }
.sm-wkl { min-width: 210px; text-align: center; line-height: 1.2; }
.sm-wkl b { display: block; font-size: 16px; font-weight: 800; }
.sm-wkl span { font-size: 12.5px; color: var(--p-muted); font-weight: 600; }
.sm-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.sm-seg { display: inline-flex; background: var(--p-chip); border-radius: 12px; padding: 3px; gap: 2px; }
.sm-seg button {
  border: 0; background: transparent; padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 13px;
  color: var(--p-muted); min-height: 36px;
}
.sm-seg button[aria-pressed='true'] { background: var(--p-card); color: var(--p-text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.sm-btn {
  height: 40px; padding: 0 16px; border-radius: 12px; font-weight: 800; font-size: 13.5px; display: inline-flex;
  align-items: center; gap: 8px; background: var(--p-card); color: var(--p-text); border: 0; box-shadow: 0 0 0 1px var(--p-line-ctl);
}
.sm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sm-kpis {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--p-line);
  border-radius: 18px; overflow: hidden; box-shadow: 0 0 0 1px var(--p-line);
}
.sm-kpi { background: var(--p-card); padding: 14px 18px; }
.sm-kpi .l { font-size: 12px; font-weight: 600; color: var(--p-muted); }
.sm-kpi .v { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin-top: 2px; font-variant-numeric: tabular-nums; }
.sm-kpi .v small { font-size: 13px; font-weight: 700; color: var(--p-muted); letter-spacing: 0; }
.sm-kpi .v.rojo { color: var(--p-low-fg); }

.sm-days { display: flex; flex-direction: column; gap: 10px; }
.sm-day { background: var(--p-card); border-radius: 16px; box-shadow: 0 0 0 1px var(--p-line); overflow: hidden; }
.sm-dh {
  width: 100%; display: flex; gap: 14px; align-items: flex-start; padding: 14px; text-align: left;
  border: 0; background: transparent; color: inherit; font: inherit;
}
.sm-dh:not(:disabled):hover { background: var(--p-hover); }
.sm-dh:disabled { cursor: default; }
.sm-dn { flex: none; width: 62px; border-radius: 14px; background: var(--p-chip); text-align: center; padding: 7px 0; }
.sm-dn small { display: block; font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; color: var(--p-muted); text-transform: uppercase; }
.sm-dn b { display: block; font-size: 22px; line-height: 1.1; font-weight: 800; }
.sm-dn span { display: block; font-size: 11px; color: var(--p-muted); font-weight: 700; text-transform: uppercase; }
.sm-day.hoy .sm-dn { background: var(--sm-inv); color: var(--sm-invt); }
.sm-day.hoy .sm-dn small, .sm-day.hoy .sm-dn span { color: inherit; opacity: 0.8; }
.sm-dm { flex: 1; min-width: 0; }
.sm-dt {
  font-weight: 700; font-size: 14px; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.sm-day.vacio .sm-dt { color: var(--p-muted); font-weight: 600; }
.sm-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sm-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 8px; font-size: 11.5px; font-weight: 800; white-space: nowrap; }
.sm-pill.neu { background: var(--p-chip); color: var(--p-muted); }
.sm-pill.info { background: var(--p-info-bg); color: var(--p-info-fg); }
.sm-pill.ok { background: var(--p-ok-bg); color: var(--p-ok-fg); }
.sm-pill.warn { background: var(--p-warn-bg); color: var(--p-warn-fg); }
.sm-dr { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.sm-chev { color: var(--p-faint); transition: transform 0.15s; }
.sm-day.open .sm-chev { transform: rotate(180deg); }

.sm-dd { display: grid; grid-template-columns: 1.35fr 1fr; border-top: 1px solid var(--p-line); }
.sm-colx { padding: 14px; min-width: 0; }
.sm-colx + .sm-colx { border-left: 1px solid var(--p-line); }
.sm-colx h4 {
  margin: 0 0 8px; font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--p-muted);
  font-weight: 800; display: flex; justify-content: space-between;
}
.sm-bi { display: grid; grid-template-columns: 96px 1fr; gap: 10px; padding: 8px 0; border-top: 1px solid var(--p-line); }
.sm-bi:first-of-type { border-top: 0; }
.sm-bi time { font-size: 12px; font-weight: 800; color: var(--p-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sm-bi p { margin: 0; font-size: 13.5px; }
.sm-mi {
  display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 8px 0;
  border-top: 1px solid var(--p-line); min-height: 44px;
}
.sm-mi:first-of-type { border-top: 0; }
.sm-mi span { font-size: 13.5px; font-weight: 600; min-width: 0; }
.sm-mi em, .sm-nm em { display: block; font-style: normal; font-size: 11.5px; color: var(--p-faint); font-weight: 700; }
.sm-mi b { flex: none; font-weight: 800; font-size: 14.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sm-mi b small { font-size: 11px; color: var(--p-faint); margin-left: 3px; }
.sm-none { padding: 12px; border-radius: 12px; background: var(--p-warn-bg); color: var(--p-warn-fg); font-size: 13px; font-weight: 700; }
.sm-link {
  margin-top: 10px; font-weight: 700; font-size: 13px; color: var(--p-info-fg); display: flex; gap: 6px;
  align-items: center; min-height: 36px; text-decoration: none; width: fit-content;
}
.sm-mut { margin: 0; font-size: 13px; color: var(--p-muted); }

.sm-tbl { background: var(--p-card); border-radius: 18px; box-shadow: 0 0 0 1px var(--p-line); overflow: hidden; }
.sm-tr {
  display: grid; grid-template-columns: minmax(0, 1fr) 64px 92px 210px; gap: 12px; align-items: center;
  padding: 10px 16px; border-top: 1px solid var(--p-line); min-height: 54px;
}
.sm-tr.h {
  border-top: 0; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; color: var(--p-faint);
  min-height: 40px; background: var(--p-chip);
}
.sm-nm { font-weight: 700; font-size: 14px; min-width: 0; }
.sm-q { font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sm-mut2 { color: var(--p-muted); font-weight: 700; }
.sm-um-movil { display: none; }
.sm-dots { display: flex; gap: 6px; }
.sm-dot {
  width: 26px; height: 26px; border-radius: 8px; background: var(--p-chip); display: grid; place-items: center;
  font-size: 11px; font-weight: 800; color: var(--p-faint);
}
.sm-dot.on { background: #f6a800; color: #111; }

.sm-vacio { background: var(--p-card); border-radius: 16px; box-shadow: 0 0 0 1px var(--p-line); }
.sm-error {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 14px 16px;
  border-radius: 16px; background: var(--p-low-bg); color: var(--p-low-fg); font-weight: 700; font-size: 14px;
}
.sm-toast {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 60; padding: 10px 18px;
  border-radius: 12px; background: var(--sm-inv); color: var(--sm-invt); font-weight: 800; font-size: 13.5px;
  box-shadow: var(--p-shadow-pop);
}

/* Esqueleto de carga */
.sk { height: 14px; border-radius: 8px; background: var(--p-chip); animation: sk 1.2s ease-in-out infinite alternate; }
.sk-l { width: 60%; height: 12px; }
.sk-v { width: 40%; height: 26px; margin-top: 6px; }
.sk-day { display: flex; gap: 14px; padding: 14px; }
.sk-dn { width: 62px; height: 66px; border-radius: 14px; flex: none; }
.sk-txt { flex: 1; display: flex; flex-direction: column; gap: 8px; padding-top: 6px; }
.sk.corto { width: 45%; }
@keyframes sk { from { opacity: 0.5; } to { opacity: 1; } }

@media (max-width: 760px) {
  .sm-wk { flex: 1 1 100%; }
  .sm-wkl { min-width: 0; flex: 1; }
  .sm-acts { flex: 1 1 100%; }
  .sm-acts .sm-btn { flex: 1; justify-content: center; }
  .sm-kpis { grid-template-columns: repeat(2, 1fr); border-radius: 16px; }
  .sm-kpi { padding: 10px 14px; }
  .sm-kpi .v { font-size: 21px; }
  .sm-dt { display: block; overflow: visible; }
  .sm-dd { display: block; }
  .sm-colx + .sm-colx { border-left: 0; border-top: 1px solid var(--p-line); }
  .sm-bi { grid-template-columns: 78px 1fr; }
  .sm-tr { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .sm-um { display: none; }
  .sm-um-movil { display: inline; margin-left: 3px; font-size: 11px; color: var(--p-faint); }
  .sm-dots { grid-column: 1 / -1; }
}
</style>

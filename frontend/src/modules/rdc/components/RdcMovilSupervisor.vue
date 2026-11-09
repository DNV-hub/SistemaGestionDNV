<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { ENVIO, ESTADO } from '../services/rdcDb'
import { hoyLocal } from '../services/rdcRepository'
import { nombreDe } from '../services/rdcCalculos'
import { formatearNumero } from '../../../utils/formatearNumero'

// Reporte diario del Supervisor en celular (movil-referencia.html): una
// pantalla informativa — el frente, "reporte de ayer", el avance y un panel
// "Estado de mis reportes". Los datos y las acciones son los mismos de
// siempre (store del RDC); solo cambia cómo se presentan.
const rdc = useRdcStore()
const auth = useAuthStore()
const router = useRouter()

onMounted(async () => {
  await rdc.iniciar()
  await rdc.cargarHistorico()
  // Deja guardado el frente que se está mostrando, para que "Nuevo" y el
  // resto del sistema usen el mismo.
  if (!rdc.frenteActualId && frenteId.value) rdc.elegirFrenteActual(frenteId.value)
})

const hoy = hoyLocal()
function restarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Los supervisores envían al día siguiente: "ayer" enviado = al día.
const ayer = restarDias(hoy, 1)
const fmtCorta = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '—')

// ---- Mis reportes: locales + remotos, solo los míos ------------------------
const propioSupervisorId = computed(() => rdc.supervisorPropio?.id ?? null)
function claveEstadoLocal(r) {
  if (r.estado === ESTADO.BORRADOR) return 'borrador'
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return 'error'
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return 'enviado'
  return 'pendiente'
}
function claveEstadoRemoto(r) {
  if (r.estado === ESTADO.BORRADOR) return 'borrador'
  if (r.estado_sharepoint === 'error') return 'error'
  if (r.estado_sharepoint === 'enviado') return 'enviado'
  return 'pendiente'
}
const todos = computed(() => {
  const locales = rdc.reportes.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    frenteId: r.frenteId,
    frente: nombreDe(rdc.catalogos, 'frentes', r.frenteId) || '—',
    clave: claveEstadoLocal(r),
    esLocal: true,
    raw: r,
  }))
  // Un supervisor solo ve lo suyo, aunque el servidor devuelva más (RLS ya lo
  // limita en la base; esto es un segundo seguro en la interfaz).
  const remotos = rdc.historicoRemoto
    .filter((r) => r.creado_por === auth.perfil?.id || (propioSupervisorId.value && r.supervisor_id === propioSupervisorId.value))
    .map((r) => ({
      id: r.id,
      fecha: r.fecha,
      frenteId: r.frente_id,
      frente: r.frentes?.nombre ?? '—',
      clave: claveEstadoRemoto(r),
      esLocal: false,
      raw: r,
    }))
  // Un mismo reporte puede estar en los dos lados: gana la copia local.
  const ids = new Set(locales.map((l) => l.id))
  return [...locales, ...remotos.filter((r) => !ids.has(r.id))].sort((a, b) => b.fecha.localeCompare(a.fecha))
})
const esFinalizado = (i) => i.clave !== 'borrador'

// ---- Frentes del supervisor -------------------------------------------------
const frentes = computed(() => {
  const mapa = new Map()
  for (const i of todos.value) if (i.frenteId && i.frente !== '—') mapa.set(i.frenteId, i.frente)
  if (rdc.frenteActual) mapa.set(rdc.frenteActual.id, rdc.frenteActual.nombre)
  return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
})
// Si el dispositivo todavía no tiene un frente guardado (supervisor nuevo, o
// sus reportes viven solo en el servidor), se toma el primero de la lista —
// el MISMO que se muestra en la tarjeta. Antes el nombre salía del primero
// pero el cálculo seguía con "ningún frente" y marcaba "Sin reporte".
const frenteId = computed(() => rdc.frenteActualId ?? frentes.value[0]?.id ?? null)
const frenteObj = computed(() => (rdc.catalogos?.frentes ?? []).find((f) => f.id === frenteId.value) ?? null)
const frenteNombre = computed(() => frenteObj.value?.nombre ?? frentes.value.find((f) => f.id === frenteId.value)?.nombre ?? '—')
function estadoAyerDe(id) {
  const ok = todos.value.some((i) => i.frenteId === id && esFinalizado(i) && i.fecha >= ayer)
  return ok ? 'Enviado' : 'Sin reporte'
}
const ayerOk = computed(() => estadoAyerDe(frenteId.value) === 'Enviado')
// Un borrador de un día anterior sin terminar de enviar: antes el celular solo
// decía "Sin reporte" y "Crear" abría el de HOY, sin dejar ver ni continuar el
// borrador (el escritorio sí lo avisaba).
const borradorViejo = computed(
  () =>
    todos.value
      .filter((i) => i.clave === 'borrador' && i.fecha < hoy && i.frenteId === frenteId.value)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null
)
const hojaFrente = ref(false)
function elegirFrente(id) {
  rdc.elegirFrenteActual(id)
  hojaFrente.value = false
}

// ---- Avance acumulado (mismos catálogos que ya descarga el RDC) -------------
const controlActivo = computed(() => !!frenteObj.value?.rdc_control_pernos)
const pernosBiblioteca = computed(() => (rdc.catalogos?.pernos ?? []).filter((p) => p.frente_id === frenteId.value))
const pernosEstadoFrente = computed(() => (rdc.catalogos?.pernosEstado ?? []).filter((p) => p.frente_id === frenteId.value))
const totalCatalogo = computed(() => pernosBiblioteca.value.length)
const perforados = computed(() => pernosEstadoFrente.value.length)
const inyectados = computed(() => pernosEstadoFrente.value.filter((p) => p.estado === 'inyectado').length)
function porTipo(filas, campo) {
  const mapa = new Map()
  for (const f of filas) {
    const tipo = f.tipo || 'Sin tipo'
    mapa.set(tipo, (mapa.get(tipo) ?? 0) + (Number(f[campo]) || 0))
  }
  return [...mapa.entries()].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => a.tipo.localeCompare(b.tipo))
}
const mallaPorTipo = computed(() => porTipo((rdc.catalogos?.mallaEstado ?? []).filter((f) => f.frente_id === frenteId.value), 'area_m2'))
const cablePorTipo = computed(() => porTipo((rdc.catalogos?.cableEstado ?? []).filter((f) => f.frente_id === frenteId.value), 'longitud_ml'))

// Una tarjeta por tipo de malla y por tipo de cable; perforaciones e
// inyecciones llevan "/ total" y lo que falta. Para malla y cable el sistema
// no tiene un total previsto por tipo, así que solo muestran lo instalado.
const tarjetas = computed(() => {
  const t = []
  if (controlActivo.value) {
    const pendPerf = Math.max(totalCatalogo.value - perforados.value, 0)
    t.push({ clave: 'perf', etiqueta: 'PERFORACIONES', nombre: '', valor: perforados.value, total: totalCatalogo.value || null, pend: totalCatalogo.value ? pendPerf : null, ir: 'perforacion' })
    const pendIny = Math.max(perforados.value - inyectados.value, 0)
    t.push({ clave: 'iny', etiqueta: 'INYECCIONES', nombre: '', valor: inyectados.value, total: perforados.value, pend: pendIny, ir: 'inyeccion' })
  }
  for (const m of mallaPorTipo.value) t.push({ clave: `m-${m.tipo}`, etiqueta: 'MALLA · M²', nombre: m.tipo, valor: formatearNumero(m.total), total: null, pend: null, ir: 'malla' })
  for (const c of cablePorTipo.value) t.push({ clave: `c-${c.tipo}`, etiqueta: 'CABLE · ML', nombre: c.tipo, valor: formatearNumero(c.total), total: null, pend: null, ir: 'cable' })
  return t
})
function irAControl(tipo) {
  router.push({ name: 'rdc-control-detalle', params: { tipo } })
}

// ---- Estado de mis reportes -------------------------------------------------
const panel = ref(false)
const verMas = ref(false)
const finalizados = computed(() => todos.value.filter(esFinalizado))
const ultimo = computed(() => finalizados.value[0] ?? null)
const ultimoAlDia = computed(() => !!ultimo.value && ultimo.value.fecha >= ayer)
const borradores = computed(() => todos.value.filter((i) => i.clave === 'borrador').length)
const fallidos = computed(() => todos.value.filter((i) => i.clave === 'error').length)
const historial = computed(() => (verMas.value ? finalizados.value : finalizados.value.slice(0, 5)))
const estadoTexto = { enviado: 'Enviado', pendiente: 'Pendiente', error: 'Con problemas' }

// ---- Abrir / crear (misma lógica del panel de escritorio) ------------------
const adoptando = ref(false)
async function abrirItem(item) {
  if (item.esLocal) {
    if (item.raw.estado === ESTADO.BORRADOR) router.push({ name: 'rdc-editar', params: { id: item.id } })
    else router.push({ name: 'rdc-detalle', params: { id: item.id } })
    return
  }
  if (item.raw.estado === ESTADO.BORRADOR) {
    if (adoptando.value) return
    adoptando.value = true
    try {
      const reporte = await rdc.adoptarRemoto(item.id)
      if (reporte) router.push({ name: 'rdc-editar', params: { id: reporte.id } })
    } catch (e) {
      console.error(e)
      alert('No se pudo traer ese borrador. Revisa tu conexión e intenta de nuevo.')
    } finally {
      adoptando.value = false
    }
    return
  }
  router.push({ name: 'rdc-detalle', params: { id: item.id } })
}
// `fecha` es el día que se reporta: hoy con "Nuevo", ayer con "Crear" en la
// tarjeta de ayer. Si ya hay uno de esa fecha (borrador o enviado) se abre ese
// en vez de crear otro.
async function nuevoReporte(fecha = hoyLocal()) {
  if (typeof fecha !== 'string') fecha = hoyLocal() // viene del @click como evento
  const deHoy = rdc.reportes.find((r) => r.fecha === fecha)
  if (deHoy?.estado === ESTADO.FINALIZADO) {
    router.push({ name: 'rdc-detalle', params: { id: deHoy.id } })
    return
  }
  const reporte = deHoy ? await rdc.abrir(deHoy.id).then(() => rdc.actual) : await rdc.nuevo({ fecha })
  await rdc.ajustarPersonalIndirecto()
  router.push({ name: 'rdc-editar', params: { id: reporte.id } })
}
const puedeCrear = computed(() => auth.tienePermiso('rdc.crear'))
</script>

<template>
  <div class="rm">
    <!-- ================= PANEL: ESTADO DE MIS REPORTES ================= -->
    <template v-if="panel">
      <header class="top">
        <button type="button" class="atras" aria-label="Volver" @click="panel = false">‹</button>
        <h1 class="chico">Estado de mis reportes</h1>
      </header>
      <div class="grid2">
        <div class="card k">
          <div class="lab">ÚLTIMO REPORTE</div>
          <div class="kv">{{ ultimo ? fmtCorta(ultimo.fecha) : '—' }}</div>
          <div class="ks">{{ ultimo ? (ultimoAlDia ? 'al día' : 'atrasado') : 'sin reportes' }}</div>
        </div>
        <div class="card k">
          <div class="lab">ENVIADOS</div>
          <div class="kv">{{ finalizados.length }}</div>
          <div class="ks">en total</div>
        </div>
        <div class="card k">
          <div class="lab">BORRADORES</div>
          <div class="kv">{{ borradores }}</div>
          <div class="ks">sin enviar</div>
        </div>
        <div class="card k" :class="{ ambar: fallidos }">
          <div class="lab" :class="{ txt_amb: fallidos }">ENVÍO FALLIDO</div>
          <div class="kv" :class="{ txt_amb: fallidos }">{{ fallidos }}</div>
          <button v-if="fallidos" type="button" class="gh mini txt_amb" @click="rdc.sincronizarAhora?.()">Revisar</button>
          <div v-else class="ks">a SharePoint</div>
        </div>
      </div>
      <div class="lab sec">HISTORIAL · SOLO MIS REPORTES</div>
      <div class="card lista">
        <button v-for="i in historial" :key="i.id" type="button" class="fila" @click="abrirItem(i)">
          <span class="pto" :class="i.clave === 'error' ? 'rojo' : i.clave === 'pendiente' ? 'amb' : ''"></span>
          <span class="fila-t">
            <b>{{ fmtCorta(i.fecha) }}</b>
            <span class="fila-s">{{ i.frente }}</span>
          </span>
          <span class="fila-e">{{ estadoTexto[i.clave] ?? 'Enviado' }}</span>
          <span class="chev" aria-hidden="true">›</span>
        </button>
        <p v-if="!historial.length" class="vacio">Todavía no hay reportes enviados.</p>
        <button v-if="finalizados.length > 5" type="button" class="mas" @click="verMas = !verMas">{{ verMas ? 'Ver menos' : 'Ver más' }}</button>
      </div>
    </template>

    <!-- ===================== PANTALLA PRINCIPAL ===================== -->
    <template v-else>
      <header class="top">
        <h1>Reporte diario</h1>
        <button v-if="puedeCrear" type="button" class="cta" @click="nuevoReporte">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo
        </button>
      </header>

      <div v-if="rdc.sinCatalogos" class="franja amb"><b>Todavía no se descargaron los catálogos. Conéctate una vez a internet.</b></div>

      <!-- Tarjeta del frente -->
      <section class="card frente">
        <div class="fila-sp">
          <div class="lab naranja">FRENTE</div>
          <button v-if="frentes.length > 1" type="button" class="gh mini" @click="hojaFrente = true">Cambiar ▾</button>
        </div>
        <div class="fnom">{{ frenteNombre }}</div>
        <div class="ayer" :class="ayerOk ? 'ok' : 'amb'">
          <span class="ayer-c">{{ ayerOk ? '✓' : '!' }}</span>
          <div class="ayer-t">
            <div class="lab">REPORTE DE AYER · {{ fmtCorta(ayer) }}</div>
            <div class="ayer-v">
              {{ ayerOk ? 'Enviado' : borradorViejo ? `Sin terminar · ${fmtCorta(borradorViejo.fecha)}` : 'Sin reporte' }}
            </div>
          </div>
          <button v-if="!ayerOk && borradorViejo" type="button" class="cta chico" :disabled="adoptando" @click="abrirItem(borradorViejo)">
            {{ adoptando ? 'Abriendo…' : 'Continuar' }}
          </button>
          <button v-else-if="!ayerOk && puedeCrear" type="button" class="cta chico" @click="nuevoReporte(ayer)">Crear</button>
        </div>
      </section>

      <!-- Envío fallido -->
      <div v-if="fallidos" class="franja amb">
        <b>{{ fallidos }} envío{{ fallidos === 1 ? '' : 's' }} fallido{{ fallidos === 1 ? '' : 's' }} a SharePoint</b>
        <button type="button" class="gh mini txt_amb" @click="panel = true">Revisar</button>
      </div>

      <!-- Avance acumulado -->
      <template v-if="tarjetas.length">
        <div class="lab sec">AVANCE ACUMULADO</div>
        <div class="grid2">
          <button v-for="t in tarjetas" :key="t.clave" type="button" class="card tile" @click="irAControl(t.ir)">
            <div class="lab">{{ t.etiqueta }}</div>
            <div v-if="t.nombre" class="tnom">{{ t.nombre }}</div>
            <div class="tfila">
              <span class="tv">{{ t.valor }}</span>
              <span v-if="t.total !== null" class="tt">/ {{ t.total }}</span>
              <span v-if="t.pend !== null" class="tp" :class="{ listo: !t.pend }">{{ t.pend ? `${t.pend} pend.` : 'completo' }}</span>
            </div>
          </button>
        </div>
      </template>

      <!-- Estado de mis reportes -->
      <button type="button" class="card estado" :class="{ ambar: fallidos }" @click="panel = true">
        <div class="estado-t">
          <div class="estado-n">Estado de mis reportes</div>
          <div class="estado-s">Último {{ ultimo ? fmtCorta(ultimo.fecha) : '—' }} · {{ finalizados.length }} enviados · historial</div>
        </div>
        <span v-if="fallidos" class="pill amb">{{ fallidos }} fallido{{ fallidos === 1 ? '' : 's' }}</span>
        <span class="chev" aria-hidden="true">›</span>
      </button>
    </template>

    <!-- Hoja: cambiar de frente -->
    <template v-if="hojaFrente">
      <div class="scrim" @click="hojaFrente = false"></div>
      <div class="hoja" role="dialog" aria-label="Cambiar de frente">
        <div class="manija"></div>
        <div class="lab" style="margin: 0 2px 6px">CAMBIAR DE FRENTE</div>
        <button v-for="f in frentes" :key="f.id" type="button" class="it" @click="elegirFrente(f.id)">
          <span class="it-t">
            <b>{{ f.nombre }}</b>
            <span class="it-s">Ayer: <span :class="estadoAyerDe(f.id) === 'Enviado' ? 'v' : 'a'">{{ estadoAyerDe(f.id) }}</span></span>
          </span>
          <span v-if="f.id === frenteId" class="chk">✓</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rm {
  --sf: var(--color-surface);
  --so: var(--color-surface-2);
  --ln: var(--color-border);
  --tx: var(--color-text);
  --mu: var(--color-text-muted);
  min-height: 100%;
  padding: 0 16px calc(104px + env(safe-area-inset-bottom, 0px));
  color: var(--tx);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.rm * {
  box-sizing: border-box;
}
.rm button {
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.top {
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 -16px;
  padding: 12px 16px 10px;
  min-height: 56px;
}
.top h1 {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.top h1.chico {
  font-size: 18px;
}
.atras {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 11px;
  background: var(--sf);
  box-shadow: 0 0 0 1px var(--ln);
  font-size: 20px;
  padding: 0;
}
.cta {
  border: 0;
  background: #f6a800;
  color: #111 !important;
  font-weight: 800;
  font-size: 14px;
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cta.chico {
  height: 36px;
  font-size: 13px;
}
.gh {
  border: 0;
  background: var(--sf);
  box-shadow: 0 0 0 1px var(--ln);
  height: 36px;
  padding: 0 12px;
  border-radius: 11px;
  font-weight: 700;
  font-size: 12.5px;
  color: var(--mu) !important;
  white-space: nowrap;
}
.gh.mini {
  height: 30px;
  font-size: 12px;
}
.txt_amb {
  color: #d98e00 !important;
}
.card {
  background: var(--sf);
  border-radius: 18px;
  box-shadow: 0 0 0 1px var(--ln);
  padding: 14px;
  border: 0;
  text-align: left;
  width: 100%;
}
.card.ambar {
  background: rgba(246, 168, 0, 0.12);
  box-shadow: 0 0 0 1.5px #d98e00;
}
.lab {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.07em;
  color: var(--mu);
}
.lab.naranja {
  color: #f6a800;
}
.sec {
  margin: 16px 2px 8px;
}
.fila-sp {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* Frente */
.frente {
  background: linear-gradient(160deg, var(--sf), var(--so));
}
.fnom {
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.12;
  margin: 2px 0 10px;
  overflow-wrap: anywhere;
}
.ayer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 14px;
}
.ayer.ok {
  background: rgba(34, 197, 94, 0.12);
}
.ayer.amb {
  background: rgba(246, 168, 0, 0.14);
}
.ayer-c {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #111;
  flex: 0 0 auto;
}
.ayer.ok .ayer-c {
  background: #22a05b;
}
.ayer.amb .ayer-c {
  background: #f6a800;
}
.ayer-t {
  flex: 1;
  min-width: 0;
}
.ayer-v {
  font-size: 16px;
  font-weight: 800;
}

/* Franja */
.franja {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 11px 14px;
  border-radius: 16px;
}
.franja.amb {
  background: rgba(246, 168, 0, 0.14);
  color: #d98e00;
}
.franja b {
  flex: 1;
  font-size: 13.5px;
}

/* Avance */
.tile {
  padding: 11px 12px;
  min-width: 0;
  color: inherit;
}
.tnom {
  font-size: 12px;
  font-weight: 700;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tfila {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 3px;
  min-width: 0;
}
.tv {
  font-size: 23px;
  font-weight: 800;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.tt {
  font-size: 13px;
  font-weight: 700;
  color: var(--mu);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.tp {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  color: #f6a800;
  white-space: nowrap;
}
.tp.listo {
  color: #22a05b;
}

/* Estado de mis reportes */
.estado {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
}
.estado-t {
  flex: 1;
  min-width: 0;
}
.estado-n {
  font-size: 15px;
  font-weight: 800;
}
.estado-s {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
  margin-top: 2px;
}
.pill {
  font-size: 11.5px;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 9px;
  white-space: nowrap;
}
.pill.amb {
  background: rgba(246, 168, 0, 0.18);
  color: #d98e00;
}
.chev {
  color: var(--mu);
  font-size: 22px;
  line-height: 1;
}

/* Panel */
.k {
  padding: 11px 12px;
}
.kv {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  margin-top: 2px;
}
.ks {
  font-size: 11.5px;
  color: var(--mu);
  font-weight: 600;
}
.lista {
  padding: 2px 14px;
}
.fila {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 0;
  border: 0;
  border-bottom: 1px solid var(--ln);
  background: transparent;
  text-align: left;
  font-size: 13.5px;
  min-height: 48px;
}
.pto {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22a05b;
  flex: 0 0 auto;
}
.pto.rojo {
  background: #e5484d;
}
.pto.amb {
  background: #f6a800;
}
.fila-t {
  flex: 1;
  min-width: 0;
}
.fila-s {
  display: block;
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fila-e {
  color: var(--mu);
  font-weight: 600;
  font-size: 12.5px;
}
.mas {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 12px 0;
  font-size: 12.5px;
  font-weight: 700;
  color: #f6a800 !important;
}
.vacio {
  margin: 0;
  padding: 14px 0;
  font-size: 13px;
  color: var(--mu);
}

/* Hoja inferior */
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 29;
}
.hoja {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background: var(--sf);
  border-radius: 26px 26px 0 0;
  padding: 12px 18px calc(env(safe-area-inset-bottom, 0px) + 18px);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.35);
  max-height: 75dvh;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}
.manija {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--ln);
  margin: 0 auto 12px;
}
.it {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--ln);
  background: transparent;
  padding: 12px 4px;
  text-align: left;
  min-height: 56px;
}
.it-t {
  flex: 1;
  min-width: 0;
}
.it-t b {
  font-size: 15px;
}
.it-s {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--mu);
  margin-top: 2px;
}
.it-s .v {
  color: #22a05b;
}
.it-s .a {
  color: #d98e00;
}
.chk {
  color: #f6a800;
  font-weight: 800;
}
</style>

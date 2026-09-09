<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { ENVIO, ESTADO } from '../services/rdcDb'
import { hoyLocal } from '../services/rdcRepository'
import { descargarWorkbook } from '../services/rdcExcel'
import {
  fmtHm,
  nombreDe,
  partidasEjecutadas,
  standbyRegistrados,
  textoWhatsapp,
  tiempoEfectivoMin,
  totalPersonal,
  totalStandbyMin,
} from '../services/rdcCalculos'

const rdc = useRdcStore()
const router = useRouter()
const reporte = computed(() => rdc.actual)
const enviando = ref(false)
const copiado = ref(false)

// ---------------------------------------------------------------------------
// Métricas y metrados — misma agrupación que usa el texto de WhatsApp, para
// que ambos coincidan siempre. "PARTIDAS NUEVAS" es el nombre interno del
// grupo de partidas libres; en esta tabla se muestra como "Partidas libres",
// que es como lo rotulaba el resumen del RDC original.
// ---------------------------------------------------------------------------
const ejecutadas = computed(() => partidasEjecutadas(reporte.value))
const texto = computed(() => textoWhatsapp(reporte.value, rdc.catalogos))

const colorSub = (sub) =>
  sub === '1. Preliminares' ? 'var(--blue-text)' : sub === '2. Críticas' ? 'var(--amber)' : sub === '3. Complementarias' ? 'var(--green)' : 'var(--text2)'
const etiquetaSub = (sub) => (sub === 'PARTIDAS NUEVAS' ? 'Partidas libres' : sub)

const filasMetrados = computed(() => {
  const filas = []
  let subActual = null
  ejecutadas.value.forEach((p) => {
    if (p.sub !== subActual) {
      subActual = p.sub
      filas.push({ esCabecera: true, sub: p.sub })
    }
    filas.push({ esCabecera: false, ...p })
  })
  return filas
})

// ---------------------------------------------------------------------------
// Control de sostenimiento — agrupado en el mismo orden y colores fijos del
// original, no por lo que haya cargado el supervisor (una sección sin
// elementos simplemente no aparece).
// ---------------------------------------------------------------------------
const SECCIONES_CONTROL = [
  { clave: 'perf', titulo: 'Perforaciones', color: 'var(--amber)' },
  { clave: 'iny', titulo: 'Inyecciones', color: 'var(--blue-text)' },
  { clave: 'malla', titulo: 'Mallas', color: 'var(--green)' },
  { clave: 'cable', titulo: 'Cables', color: 'var(--red)' },
  { clave: 'pull', titulo: 'Pull Test', color: 'var(--text2)' },
]

function elementosDe(clave) {
  return reporte.value.elementos.filter((e) => {
    if (clave === 'perf') return e.elemento === 'Perno' && e.actividad === 'Perforación'
    if (clave === 'iny') return e.elemento === 'Perno' && e.actividad === 'Inyección'
    if (clave === 'malla') return e.elemento === 'Malla'
    if (clave === 'cable') return e.elemento === 'Cable'
    return e.elemento === 'Perno' && e.actividad === 'Pull Test'
  })
}

const gruposControl = computed(() => SECCIONES_CONTROL.map((s) => ({ ...s, items: elementosDe(s.clave) })).filter((g) => g.items.length))

const tipoDiamControl = (clave, e) => {
  if (clave === 'perf' || clave === 'iny') return [e.tipo, e.diametro].filter(Boolean).join(' / ') || '—'
  if (clave === 'malla' || clave === 'cable') return e.tipo || '—'
  return '—'
}
const ubicControl = (clave, e) => ((clave === 'perf' || clave === 'iny') && e.ubicacion) || '—'
const medidaControl = (clave, e) => (clave === 'malla' ? `${e.cantidad} M²` : clave === 'pull' ? '1 UND' : `${e.cantidad} ML`)

const totalElementos = computed(() => reporte.value.elementos.length)

// ---------------------------------------------------------------------------
// Equipos y maquinaria — dos grupos: perforación y soporte (los equipos
// "no listados" que el supervisor agregó a mano se cuentan como soporte,
// igual que en el original).
// ---------------------------------------------------------------------------
const equiposPerforacion = computed(() => reporte.value.maquinaria.filter((m) => m.categoria === 'perforacion'))
const equiposSoporte = computed(() => reporte.value.maquinaria.filter((m) => m.categoria !== 'perforacion'))
const textoEquipos = (lista) => lista.map((e) => `${e.tipo} (${e.cantidad})`).join(', ')

// ---------------------------------------------------------------------------
// Stand by
// ---------------------------------------------------------------------------
const paradas = computed(() => standbyRegistrados(reporte.value))
const totalParadas = computed(() => totalStandbyMin(reporte.value))

// ---------------------------------------------------------------------------
// Métricas de cabecera
// ---------------------------------------------------------------------------
const personalTotal = computed(() => totalPersonal(reporte.value))
const standByTexto = computed(() => fmtHm(totalStandbyMin(reporte.value)))
const tiempoEfectivoTexto = computed(() => fmtHm(tiempoEfectivoMin(reporte.value)))

const faltantes = computed(() => {
  const f = []
  if (!reporte.value.fecha) f.push('la fecha')
  if (!reporte.value.frenteId) f.push('el frente')
  if (!reporte.value.supervisorId) f.push('el supervisor responsable')
  return f
})

const cerrado = computed(() => reporte.value.estado === ESTADO.FINALIZADO)
const estadoEnvio = computed(() => {
  const r = reporte.value
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return 'enviado'
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return 'error'
  return 'pendiente'
})

function descargar() {
  descargarWorkbook(reporte.value, rdc.catalogos)
}

async function copiar() {
  await navigator.clipboard.writeText(texto.value)
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2000)
}

/** El original ofrecía "Compartir" además de "Copiar" — usa la hoja de
 * compartir nativa del teléfono cuando existe, y si no, cae a copiar (que es
 * lo único disponible en un navegador de escritorio). */
async function compartir() {
  if (navigator.share) {
    try {
      await navigator.share({ text: texto.value, title: 'Reporte Diario de Campo' })
      return
    } catch {
      /* el usuario canceló la hoja de compartir — no es un error */
    }
  }
  await copiar()
}

/** Si la fecha no es la de hoy se pide confirmación explícita — frena el
 * error de dejar la fecha de ayer sin darse cuenta, sin impedir el caso
 * legítimo del reporte atrasado. */
function fechaConfirmada() {
  const hoy = hoyLocal()
  if (reporte.value.fecha === hoy) return true
  const anterior = reporte.value.fecha < hoy
  return confirm(
    anterior
      ? `La fecha de este reporte es ${reporte.value.fecha}, anterior a hoy (${hoy}).\n\n¿Es correcto? (por ejemplo, un reporte atrasado)`
      : `La fecha de este reporte es ${reporte.value.fecha}, posterior a hoy (${hoy}).\n\nNormalmente esto es un error de tipeo. ¿Confirmas la fecha?`,
  )
}

async function terminar() {
  if (faltantes.value.length) return
  if (!fechaConfirmada()) return
  enviando.value = true
  try {
    await rdc.finalizar()
  } finally {
    enviando.value = false
  }
}

function volverALista() {
  router.push({ name: 'rdc' })
}
</script>

<template>
  <div v-if="reporte">
    <div class="titulo-resumen">— RESUMEN DEL DÍA —</div>

    <div class="metric-grid">
      <div class="resumen-meta">
        <span class="item">{{ reporte.fecha || '—' }}</span>
        <span class="sep">•</span>
        <span class="item frente">{{ nombreDe(rdc.catalogos, 'frentes', reporte.frenteId) || '—' }}</span>
        <span class="sep">•</span>
        <span class="item">{{ nombreDe(rdc.catalogos, 'supervisores', reporte.supervisorId) || '—' }}</span>
      </div>
      <div class="metric"><div class="val">{{ personalTotal }}</div><div class="lbl">Personal</div></div>
      <div class="metric"><div class="val" style="color: var(--red-text); font-size: 22px">{{ standByTexto }}</div><div class="lbl">Stand By total</div></div>
      <div class="metric"><div class="val" style="color: var(--green-text); font-size: 22px">{{ tiempoEfectivoTexto }}</div><div class="lbl">Tiempo efectivo</div></div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-ruler" />Metrados ejecutados</div>
      <table class="summary-table">
        <thead><tr><th>Partida</th><th>Metrado</th><th>U.M.</th></tr></thead>
        <tbody>
          <template v-for="(f, i) in filasMetrados" :key="i">
            <tr v-if="f.esCabecera">
              <td colspan="3" class="subtitulo-metrado" :style="{ color: colorSub(f.sub) }">{{ etiquetaSub(f.sub) }}</td>
            </tr>
            <tr v-else>
              <td class="nombre-metrado">{{ f.nombre }}<em v-if="f.manual"> (nueva)</em></td>
              <td class="valor-metrado">{{ f.met }}</td>
              <td class="unidad-metrado">{{ f.um }}</td>
            </tr>
          </template>
          <tr v-if="!filasMetrados.length">
            <td colspan="3" class="vacio-metrado">Sin metrados ingresados aún — ve a la pestaña Metrados</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalElementos" class="card">
      <div class="card-title"><i class="ti ti-tool" />Control de Sostenimiento</div>
      <div style="overflow-x: auto">
        <table style="width: 100%; border-collapse: collapse">
          <tr style="background: var(--surface2)">
            <th class="th-control">Código</th>
            <th class="th-control">Tipo/Ø</th>
            <th class="th-control">Ubic.</th>
            <th class="th-control" style="text-align: right">Long/Área</th>
          </tr>
          <template v-for="g in gruposControl" :key="g.clave">
            <tr><td colspan="4" class="subtitulo-control" :style="{ color: g.color }">{{ g.titulo }}</td></tr>
            <tr v-for="e in g.items" :key="e.id" class="fila-control">
              <td class="td-control mono">{{ e.codigo || '—' }}</td>
              <td class="td-control muted">{{ tipoDiamControl(g.clave, e) }}</td>
              <td class="td-control muted">{{ ubicControl(g.clave, e) }}</td>
              <td class="td-control" style="text-align: right; font-weight: 600; white-space: nowrap">{{ medidaControl(g.clave, e) }}</td>
            </tr>
          </template>
        </table>
      </div>
      <div class="total-elementos">{{ totalElementos }} elemento(s) total</div>
    </div>

    <div v-if="equiposPerforacion.length || equiposSoporte.length" class="card">
      <div class="card-title"><i class="ti ti-truck" />Equipos y maquinaria</div>
      <div style="font-size: 13px; line-height: 1.7">
        <div v-if="equiposPerforacion.length" style="margin-bottom: 8px"><strong>Perforación:</strong> {{ textoEquipos(equiposPerforacion) }}</div>
        <div v-if="equiposSoporte.length"><strong>Soporte operativo:</strong> {{ textoEquipos(equiposSoporte) }}</div>
      </div>
    </div>

    <div v-if="paradas.length" class="card">
      <div class="card-title"><i class="ti ti-clock-pause" />Stand By de la jornada</div>
      <table class="summary-table">
        <thead><tr><th>Item</th><th>Actividad afectada</th><th>Desde</th><th>Hasta</th><th>Total</th><th>Causa</th></tr></thead>
        <tbody>
          <tr v-for="r in paradas" :key="r.item">
            <td style="font-weight: 700">{{ r.item }}</td>
            <td>{{ r.actividad || '—' }}</td>
            <td>{{ r.desde || '—' }}</td>
            <td>{{ r.hasta || '—' }}</td>
            <td style="font-weight: 700; color: var(--red-text)">{{ fmtHm(r.minutos) }}</td>
            <td style="font-size: 12px">
              {{ r.causa || '—' }}
              <div v-if="r.comentario" class="comentario-parada">💬 {{ r.comentario }}</div>
            </td>
          </tr>
          <tr>
            <td colspan="4" style="font-weight: 700">TOTAL STAND BY</td>
            <td style="font-weight: 800; color: var(--red-text)">{{ fmtHm(totalParadas) }}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="reporte.observaciones || reporte.requerimientos || reporte.restricciones" class="card">
      <div class="card-title"><i class="ti ti-notes" />Comentarios y restricciones</div>
      <div style="font-size: 13px; line-height: 1.7">
        <p v-if="reporte.observaciones" style="margin-bottom: 8px"><strong>Observaciones:</strong> {{ reporte.observaciones }}</p>
        <p v-if="reporte.requerimientos" style="margin-bottom: 8px"><strong>Requerimientos:</strong> {{ reporte.requerimientos }}</p>
        <p v-if="reporte.restricciones"><strong>Restricciones:</strong> {{ reporte.restricciones }}</p>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-brand-whatsapp" />Reporte WhatsApp</div>
      <div class="field"><textarea :value="texto" readonly class="wsp-textarea" /></div>
      <div class="bottom-actions" style="margin-top: 10px">
        <button type="button" class="btn-primary" @click="copiar"><i class="ti ti-copy" />{{ copiado ? 'Copiado ✓' : 'Copiar' }}</button>
        <button type="button" class="secondary-btn" @click="compartir"><i class="ti ti-share" />Compartir</button>
      </div>
    </div>

    <div class="card" style="margin-top: 12px">
      <div class="card-title"><i class="ti ti-send" />Enviar reporte a la oficina</div>

      <p v-if="faltantes.length" class="alert alert-red"><i class="ti ti-alert-triangle" /><span>Antes de cerrar falta completar: {{ faltantes.join(', ') }}.</span></p>

      <template v-else-if="!cerrado">
        <p class="note" style="margin-bottom: 10px">
          Al presionar <strong>Terminado y Enviar</strong> el reporte se guarda en este dispositivo y se manda solo en
          cuanto haya señal — no hace falta que te quedes esperando ni que declares manualmente que estás sin cobertura.
        </p>
        <button type="button" class="nav-btn primary" :disabled="enviando" @click="terminar">
          <i class="ti ti-send" />{{ enviando ? 'Guardando…' : 'Terminado y Enviar' }}
        </button>
        <button type="button" class="export-btn" style="width: 100%; justify-content: center; margin-top: 8px" @click="descargar">
          <i class="ti ti-download" />Descargar mi copia (Excel)
        </button>
      </template>

      <template v-else>
        <div class="alert" :class="estadoEnvio === 'enviado' ? 'alert-green' : estadoEnvio === 'error' ? 'alert-red' : 'alert-amber'">
          <i class="ti" :class="estadoEnvio === 'enviado' ? 'ti-circle-check' : estadoEnvio === 'error' ? 'ti-alert-triangle' : 'ti-cloud-off'" />
          <span v-if="estadoEnvio === 'enviado'">Reporte enviado — llegó al Sistema y a SharePoint.</span>
          <span v-else-if="estadoEnvio === 'error'">Hubo un problema al enviarlo. Está guardado y se reintentará solo; tu información no se perdió.</span>
          <span v-else>Guardado y en cola. Se enviará en cuanto haya señal.</span>
        </div>
        <button type="button" class="export-btn" style="width: 100%; justify-content: center; margin-top: 8px" @click="descargar">
          <i class="ti ti-download" />Descargar mi copia (Excel)
        </button>
        <button type="button" class="secondary-btn" style="width: 100%; justify-content: center; margin-top: 8px" @click="volverALista">
          <i class="ti ti-list-check" />Volver a la lista
        </button>
      </template>

      <div class="alert alert-blue" style="margin-top: 10px">
        <i class="ti ti-info-circle" />
        <span>Para empezar el <strong>siguiente reporte</strong>, toca «Nuevo reporte» en la lista.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.titulo-resumen {
  text-align: center;
  padding: 8px 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text3);
}
.resumen-meta {
  grid-column: 1 / -1;
  background: var(--blue-bg);
  border-radius: var(--r-md);
  padding: 10px 14px;
  margin-bottom: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  align-items: baseline;
  justify-content: center;
  text-align: center;
}
.resumen-meta .item {
  font-size: 13px;
  font-weight: 600;
  color: var(--blue-text);
}
.resumen-meta .item.frente {
  font-size: 13.65px;
  font-weight: 800;
}
.resumen-meta .sep {
  font-size: 12px;
  color: var(--blue-text);
  opacity: 0.6;
}
.subtitulo-metrado {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface2);
  padding: 5px 10px;
}
.nombre-metrado {
  font-size: 13px;
}
.valor-metrado {
  font-size: 14px;
  font-weight: 600;
}
.unidad-metrado {
  font-size: 13px;
  color: var(--text3);
}
.vacio-metrado {
  color: var(--text3);
  text-align: center;
  padding: 16px;
}
.th-control {
  padding: 5px 6px;
  font-size: 11px;
  text-align: left;
  color: var(--text3);
}
.subtitulo-control {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface2);
  padding: 5px 8px;
}
.fila-control {
  border-bottom: 1px solid var(--border);
}
.td-control {
  padding: 5px 6px;
  font-size: 12px;
}
.td-control.mono {
  font-family: ui-monospace, monospace;
}
.td-control.muted {
  color: var(--text3);
}
.total-elementos {
  font-size: 11px;
  color: var(--text3);
  margin-top: 6px;
  text-align: right;
}
.comentario-parada {
  font-size: 11px;
  color: var(--text3);
  margin-top: 2px;
}
/* El tamaño real vive en complementos.css: una regla global del tema
   (".field textarea{min-height:72px}") tiene más especificidad que una clase
   sola definida acá, y se lo comía en silencio. */
</style>

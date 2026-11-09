<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { obtenerReporteCompleto } from '../services/rdcService'
import { descargarWorkbook } from '../services/rdcExcel'
import { ENVIO } from '../services/rdcDb'
import { bitacoraCompleta, fmtHm, nombreDe, partidasEjecutadas, standbyRegistrados, textoWhatsapp, tiempoEfectivoMin, totalPersonal, totalStandbyMin } from '../services/rdcCalculos'
import '../estilos/rdc-tema.css'
import '../estilos/tabler-rdc.css'
import '../estilos/complementos.css'
import '../estilos/rdc-referencia.css'

const rdc = useRdcStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const reporte = ref(null)
const cargando = ref(true)
const error = ref('')

// Función, no un onMounted suelto: Vue Router reutiliza el componente al
// navegar entre dos rutas 'rdc-detalle' con distinto :id (mismo registro de
// ruta, solo cambia el parámetro) — sin esto, pasar de un reporte a otro
// (ej. desde el aviso de "ya existe un reporte duplicado" del propio RDC)
// dejaba la pantalla congelada mostrando el reporte VIEJO, aunque la URL ya
// apuntara al nuevo.
async function cargarReporte() {
  cargando.value = true
  error.value = ''
  reporte.value = null
  if (!rdc.catalogos) await rdc.iniciar()

  // Primero el dispositivo: si el reporte se llenó acá, esa copia trae el
  // estado de envío más fresco. Si no está, se busca en el servidor — es el
  // caso de Planeamiento o Consulta, que ven reportes ajenos.
  reporte.value = await rdc.abrir(route.params.id)
  if (!reporte.value) {
    try {
      reporte.value = await obtenerReporteCompleto(route.params.id)
      if (!reporte.value) error.value = 'No se encontró el reporte.'
    } catch {
      error.value = 'El reporte no está en este dispositivo y no hay conexión para buscarlo.'
    }
  }
  cargando.value = false
}
onMounted(cargarReporte)
watch(() => route.params.id, cargarReporte)

const nombre = (clave, id) => nombreDe(rdc.catalogos, clave, id) || '—'
const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')

const ejecutadas = computed(() => (reporte.value ? partidasEjecutadas(reporte.value) : []))
const metricas = computed(() =>
  reporte.value
    ? [
        { etiqueta: 'Personal', valor: totalPersonal(reporte.value) },
        { etiqueta: 'Partidas', valor: ejecutadas.value.length },
        { etiqueta: 'Elementos', valor: reporte.value.elementos.length },
        { etiqueta: 'T. efectivo', valor: fmtHm(tiempoEfectivoMin(reporte.value)) },
        { etiqueta: 'Stand by', valor: fmtHm(totalStandbyMin(reporte.value)) },
      ]
    : [],
)

const estadoEnvio = computed(() => {
  const r = reporte.value
  if (!r) return 'pendiente'
  if (r.estadoSupabase === ENVIO.ENVIADO && r.estadoSharepoint === ENVIO.ENVIADO) return 'enviado'
  if (r.estadoSupabase === ENVIO.ERROR || r.estadoSharepoint === ENVIO.ERROR) return 'error'
  return 'pendiente'
})

// Quien tiene rdc.editar_todos (Planeamiento, Administrador) puede
// corregir CUALQUIER reporte, esté o no en este dispositivo — es el caso
// de "corregir un reporte mal hecho" que ya mandó un supervisor de
// verdad. Sin ese permiso, sigue la regla de siempre: solo un reporte
// propio que ya está acá.
const puedeCorregir = computed(
  () =>
    !!reporte.value &&
    (auth.tienePermiso('rdc.editar_todos') ||
      (rdc.reportes.some((r) => r.id === reporte.value.id) && auth.tienePermiso('rdc.editar_propio'))),
)

async function corregir() {
  const confirmado = confirm(
    'Vas a reabrir este reporte para corregirlo.\n\nNo se borra nada de lo que escribiste. El nuevo envío se guarda como archivo NUEVO, con "(C)" al final del nombre, así queda el original y la versión corregida.\n\n¿Continuar?',
  )
  if (!confirmado) return
  // rdc.corregir() lee de la base LOCAL (IndexedDB) — un reporte ajeno
  // (de otro supervisor) todavía no está acá, hay que traerlo entero
  // primero. Mismo mecanismo que ya usa la lista para adoptar un borrador
  // de otro dispositivo; acá simplemente puede ser un reporte YA
  // finalizado, no le importa el estado.
  if (!rdc.reportes.some((r) => r.id === reporte.value.id)) {
    await rdc.adoptarRemoto(reporte.value.id)
  }
  await rdc.corregir(reporte.value.id)
  router.push({ name: 'rdc-editar', params: { id: reporte.value.id } })
}

const bitacora = computed(() => (reporte.value ? bitacoraCompleta(reporte.value) : []))
const paradas = computed(() => (reporte.value ? standbyRegistrados(reporte.value) : []))
const totalStandby = computed(() => (reporte.value ? fmtHm(totalStandbyMin(reporte.value)) : '0h 00m'))
const programadas = computed(() => (reporte.value?.programacion ?? []).filter((p) => p.tipo === 'programada'))
const textoWsp = computed(() => (reporte.value ? textoWhatsapp(reporte.value, rdc.catalogos) : ''))

const copiado = ref(false)
async function copiar() {
  await navigator.clipboard.writeText(textoWsp.value)
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2000)
}
</script>

<template>
  <div class="rdc-app rdc-ref">
    <div class="rx-pagina sin-pad">
      <p v-if="cargando" class="empty-msg">Cargando…</p>
      <div v-else-if="error" class="alert alert-red"><i class="ti ti-alert-triangle" /><span>{{ error }}</span></div>

      <template v-else-if="reporte">
        <div class="rx-hd">
          <div class="rx-row" style="gap: 14px">
            <button type="button" class="rb" style="padding: 0 14px" @click="router.push({ name: 'rdc' })">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              Reportes
            </button>
            <div>
              <div class="rx-titulo">
                {{ nombre('frentes', reporte.frenteId) }}
                <span class="rpl" :class="estadoEnvio === 'enviado' ? 'ok' : estadoEnvio === 'error' ? 'er' : 'dr'">
                  {{ estadoEnvio === 'enviado' ? 'Enviado' : estadoEnvio === 'error' ? 'Con problemas' : 'Pendiente' }}
                </span>
              </div>
              <div class="rmu rx-sub">
                {{ fmtFecha(reporte.fecha) }} · {{ nombre('sectores', reporte.sectorId) }} · {{ nombre('supervisores', reporte.supervisorId) }}
              </div>
            </div>
          </div>
          <div class="rx-row" style="gap: 10px">
            <button type="button" class="rb" @click="descargarWorkbook(reporte, rdc.catalogos)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
              Descargar Excel
            </button>
            <button v-if="puedeCorregir" type="button" class="rb pri" @click="corregir">Corregir y reenviar</button>
          </div>
        </div>

        <p v-if="reporte.sharepointError" class="alert alert-red" style="margin: 0"><span>SharePoint: {{ reporte.sharepointError }}</span></p>

        <div class="rgrid-k" style="grid-template-columns: repeat(auto-fit, minmax(110px, 1fr))">
          <div v-for="m in metricas" :key="m.etiqueta" class="rkpi">
            <div class="rmu rx-kl">{{ m.etiqueta }}</div>
            <div class="rx-kv" :style="m.etiqueta === 'Stand by' && totalStandby !== '0h 00m' ? 'color: var(--am-fg)' : ''">{{ m.valor }}</div>
          </div>
        </div>

        <div class="rx-two">
          <div class="rx-main">
            <div class="rp">
              <div class="rsh">METRADOS EJECUTADOS</div>
              <div v-if="ejecutadas.length">
                <div
                  v-for="(p, i) in ejecutadas"
                  :key="i"
                  class="rrow"
                  :style="`grid-template-columns: 1fr 110px 60px; border-radius: 0; ${i < ejecutadas.length - 1 ? 'border-bottom: 1px solid var(--ln);' : ''}`"
                >
                  <span class="wrap" style="font-weight: 600">{{ p.nombre }}</span>
                  <span style="text-align: right; font-weight: 800">{{ p.met }}</span>
                  <span class="rmu" style="padding-left: 10px; font-weight: 600">{{ p.um }}</span>
                </div>
              </div>
              <div v-else class="rem">Sin metrados registrados.</div>
            </div>

            <div class="rp">
              <div class="rsh">BITÁCORA DE ACTIVIDADES</div>
              <div v-if="!bitacora.length && !paradas.length" class="rem">Sin registros de bitácora.</div>
              <div v-for="(b, i) in bitacora" :key="`b${i}`" class="rx-bit">
                <span class="rmu" style="font-weight: 700">{{ b.hi || '—' }}<template v-if="b.hf"> – {{ b.hf }}</template></span>
                <span style="font-weight: 600">{{ b.texto }}</span>
              </div>
              <div v-for="s in paradas" :key="`s${s.item}`" class="rin rx-standby">
                <div class="rx-sb-t">STAND BY · {{ fmtHm(s.minutos) }}</div>
                <div class="rx-sb-d">
                  <template v-if="s.desde">{{ s.desde }}<template v-if="s.hasta"> a {{ s.hasta }}</template> · </template>{{ s.actividad || 'Sin actividad registrada' }}
                </div>
                <div class="rmu" style="font-size: 13px">Causa: {{ s.causa || '—' }}<template v-if="s.responsable"> · Liberó: {{ s.responsable }}</template></div>
                <div v-if="s.comentario" class="rmu" style="font-size: 13px">{{ s.comentario }}</div>
              </div>
            </div>

            <div class="rp">
              <div class="rsh">PROGRAMACIÓN · OBSERVACIONES · REQUERIMIENTOS</div>
              <div class="rx-g2">
                <div>
                  <div class="rl">Programación mañana</div>
                  <div v-if="programadas.length" class="rx-txt">
                    <div v-for="(p, i) in programadas" :key="i">{{ p.etiqueta }}<template v-if="p.descripcion"> — {{ p.descripcion }}</template></div>
                  </div>
                  <div v-else class="rmu rx-txt">—</div>
                </div>
                <div>
                  <div class="rl">Observaciones</div>
                  <div class="rx-txt" :class="{ rmu: !reporte.observaciones }">{{ reporte.observaciones || '—' }}</div>
                </div>
                <div>
                  <div class="rl">Requerimientos</div>
                  <div class="rx-txt" :class="{ rmu: !reporte.requerimientos }">{{ reporte.requerimientos || '—' }}</div>
                </div>
                <div v-if="reporte.restricciones">
                  <div class="rl">Restricciones</div>
                  <div class="rx-txt">{{ reporte.restricciones }}</div>
                </div>
              </div>
            </div>
          </div>

          <aside class="rx-side" aria-label="Reporte para WhatsApp">
            <div class="rp" style="gap: 14px">
              <div class="rx-row" style="justify-content: space-between">
                <div class="rsh">REPORTE PARA WHATSAPP</div>
                <button type="button" class="rb sm" @click="copiar">{{ copiado ? 'Copiado ✓' : 'Copiar' }}</button>
              </div>
              <pre class="rx-pre" style="max-height: 560px">{{ textoWsp }}</pre>
            </div>
          </aside>
        </div>
      </template>
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
  flex-wrap: wrap;
}
.rx-sub {
  font-size: 13px;
  font-weight: 600;
  margin-top: 3px;
}
.rx-kl {
  font-size: 12px;
  font-weight: 600;
}
.rx-kv {
  font-size: 28px;
  font-weight: 800;
  margin-top: 4px;
  white-space: nowrap;
}
.rx-bit {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--ln);
  font-size: 14px;
}
.rx-standby {
  padding: 14px 16px;
  border-left: 4px solid #f6a800;
  border-radius: 6px 14px 14px 6px;
}
.rx-sb-t {
  font-size: 13px;
  font-weight: 800;
}
.rx-sb-d {
  font-size: 14px;
  font-weight: 600;
  margin: 4px 0;
}
.rx-txt {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>

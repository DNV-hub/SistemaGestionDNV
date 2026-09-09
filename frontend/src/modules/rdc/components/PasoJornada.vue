<script setup>
import { computed, ref, watch } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'
import { CAUSAS_STANDBY, CAUSA_TIEMPO_TOTAL, HITOS } from '../services/rdcConstantes'
import { causaEfectiva, fmtHm, minutosEntre, minutosStandby, nombreDe, totalStandbyMin } from '../services/rdcCalculos'

const rdc = useRdcStore()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()

// --- Hitos ---------------------------------------------------------------
// El reporte solo guarda los hitos que tienen hora; la lista completa sale de
// la constante, así que acá se crea la fila la primera vez que se escribe una.
const horaHito = (nombre) => reporte.value.hitos.find((h) => h.nombre === nombre)?.hora ?? ''

function fijarHito(nombre, valor) {
  const existente = reporte.value.hitos.find((h) => h.nombre === nombre)
  if (existente) {
    if (valor) existente.hora = valor
    else reporte.value.hitos = reporte.value.hitos.filter((h) => h.nombre !== nombre)
  } else if (valor) {
    reporte.value.hitos.push({ id: nuevoId(), orden: HITOS.indexOf(nombre) + 1, nombre, hora: valor })
  }
  guardar()
}

// El acordeón arranca abierto: los hitos son lo primero que se llena al llegar
// al frente, y obligar a desplegarlos cada vez sería un toque de más.
const hitosAbierto = ref(true)
const hitosLlenos = computed(() => HITOS.filter((h) => horaHito(h)).length)

// --- Agregar registro ----------------------------------------------------
const tipoNuevo = ref('actividad')
const nuevaActividad = ref({ horaInicio: '', horaFin: '', actividad: '' })
const PARADA_VACIA = { actividad: '', desde: '', hasta: '', causa: '', causaOtro: '', responsable: '', comentario: '', totalHoras: '', totalMinutos: '' }
const nuevaParada = ref({ ...PARADA_VACIA })
const paradaEsTiempoTotal = computed(() => nuevaParada.value.causa === CAUSA_TIEMPO_TOTAL)

const puedeAgregar = computed(() =>
  tipoNuevo.value === 'actividad'
    ? !!nuevaActividad.value.horaInicio && !!nuevaActividad.value.actividad.trim()
    : !!nuevaParada.value.causa &&
      (paradaEsTiempoTotal.value
        ? Number(nuevaParada.value.totalHoras) > 0 || Number(nuevaParada.value.totalMinutos) > 0
        : !!nuevaParada.value.desde && !!nuevaParada.value.hasta),
)

const campoActividad = ref(null)

/** Tras agregar un registro, la hora de inicio del siguiente se precarga con
 * la hora de fin del que acaba de entrar.
 *
 * La jornada se registra en cadena —una actividad termina donde empieza la
 * siguiente— así que arrastrar esa hora ahorra la mitad de los toques y evita
 * el hueco que queda cuando alguien se olvida de ponerla. Sigue siendo un
 * valor editable: si el siguiente registro no empieza ahí, se cambia. */
function agregarRegistro() {
  if (!puedeAgregar.value) return

  if (tipoNuevo.value === 'actividad') {
    const a = nuevaActividad.value
    reporte.value.bitacora.push({
      id: nuevoId(),
      horaInicio: a.horaInicio || null,
      horaFin: a.horaFin || null,
      actividad: a.actividad.trim(),
      orden: reporte.value.bitacora.length + 1,
    })
    encadenar(a.horaFin || a.horaInicio)
    nuevaActividad.value.actividad = ''
    campoActividad.value?.focus()
  } else {
    const p = nuevaParada.value
    reporte.value.standby.push({
      id: nuevoId(),
      actividad: p.actividad.trim() || null,
      desde: p.desde || null,
      hasta: p.hasta || null,
      causa: p.causa,
      causaOtro: p.causaOtro.trim() || null,
      responsable: p.responsable.trim() || null,
      comentario: p.comentario.trim() || null,
      totalHoras: p.totalHoras === '' ? null : Number(p.totalHoras),
      totalMinutos: p.totalMinutos === '' ? null : Number(p.totalMinutos),
      orden: reporte.value.standby.length + 1,
    })
    nuevaParada.value = { ...PARADA_VACIA }
    // Misma cadena que en las actividades. Una parada declarada por tiempo
    // total no tiene hora de fin, así que ahí no hay nada que arrastrar.
    encadenar(p.hasta)
  }

  guardar()
}

/** Deja la hora en los DOS formularios, no solo en el que se acaba de usar:
 * después de una actividad suele venir una parada y al revés, y el supervisor
 * no tendría por qué volver a escribir la misma hora al cambiar de pestaña. */
function encadenar(hora) {
  nuevaActividad.value.horaInicio = hora || ''
  nuevaActividad.value.horaFin = ''
  nuevaParada.value.desde = hora || ''
  nuevaParada.value.hasta = ''
}

// Al cambiar de causa se limpia el texto de "otra causa": quedaría colgado de
// una causa que ya no es OTRO.
watch(
  () => nuevaParada.value.causa,
  (causa) => {
    if (causa !== 'OTRO') nuevaParada.value.causaOtro = ''
  },
)

// --- Línea de tiempo -----------------------------------------------------
// Actividades y paradas se combinan en UNA sola lista ordenada por hora de
// inicio (lo que no tiene hora va al final). Así se ve en qué momento exacto
// una parada interrumpió el trabajo, en vez de que las paradas queden siempre
// al final como si hubieran pasado al cierre del turno.
const lineaDeTiempo = computed(() =>
  [
    ...reporte.value.bitacora.map((r) => ({ tipo: 'actividad', r, clave: r.horaInicio || 'zz' })),
    ...reporte.value.standby.map((r) => ({ tipo: 'standby', r, clave: r.desde || 'zz' })),
  ].sort((a, b) => a.clave.localeCompare(b.clave)),
)

// Un solo registro abierto para editar a la vez, como el resto de acordeones.
const abierto = ref(null)
const estaAbierto = (tipo, id) => abierto.value?.tipo === tipo && abierto.value?.id === id
function alternar(tipo, id) {
  abierto.value = estaAbierto(tipo, id) ? null : { tipo, id }
}

const minutosActividad = (r) => (r.horaInicio && r.horaFin ? minutosEntre(r.horaInicio, r.horaFin, reporte.value) : null)

function borrarActividad(id) {
  reporte.value.bitacora = reporte.value.bitacora.filter((b) => b.id !== id)
  abierto.value = null
  guardar()
}
function borrarParada(id) {
  reporte.value.standby = reporte.value.standby.filter((s) => s.id !== id)
  abierto.value = null
  guardar()
}

const totalParadas = computed(() => totalStandbyMin(reporte.value))
const cuantasParadas = computed(() => reporte.value.standby.filter((s) => minutosStandby(s, reporte.value) > 0).length)
const frenteActual = computed(() => nombreDe(rdc.catalogos, 'frentes', reporte.value?.frenteId) || 'selecciona un frente en «Datos»')
</script>

<template>
  <div v-if="reporte">
    <div class="card">
      <label class="toggle-row">
        <input v-model="reporte.restriccionAcceso" type="checkbox" @change="guardar" />
        <span>¿Tuviste restricciones para llegar a tu frente de trabajo?</span>
      </label>

      <div v-if="reporte.restriccionAcceso" style="margin-top: 12px">
        <div class="alert alert-amber"><i class="ti ti-alert-triangle" /><span>Completa los datos de la restricción.</span></div>
        <div class="field" style="margin-bottom: 10px">
          <label for="restr-desc">¿Cuál fue la restricción?</label>
          <textarea id="restr-desc" v-model="reporte.restriccionDescripcion" placeholder="Describe la restricción…" @change="guardar" />
        </div>
        <div class="grid2">
          <div class="field">
            <label for="restr-ini">Hora inicio</label>
            <input id="restr-ini" v-model="reporte.restriccionInicio" type="time" @change="guardar" />
          </div>
          <div class="field">
            <label for="restr-fin">Hora fin</label>
            <input id="restr-fin" v-model="reporte.restriccionFin" type="time" @change="guardar" />
          </div>
        </div>
      </div>
    </div>

    <div class="card plegable">
      <div class="acordeon-head" @click="hitosAbierto = !hitosAbierto">
        <span class="acordeon-titulo"><i class="ti ti-flag-3" />Hitos de inicio de jornada</span>
        <span class="badge-hitos">{{ hitosLlenos ? `${hitosLlenos}/${HITOS.length}` : '' }}</span>
        <i class="ti" :class="hitosAbierto ? 'ti-chevron-up' : 'ti-chevron-down'" />
      </div>

      <div v-if="hitosAbierto" style="margin-top: 12px">
        <div v-for="h in HITOS" :key="h" class="hito-row">
          <span class="hito-label">{{ h }}</span>
          <input :value="horaHito(h)" type="time" @change="fijarHito(h, $event.target.value)" />
        </div>
        <div class="hito-row">
          <span class="hito-label">Salida a refrigerio/almuerzo</span>
          <input v-model="reporte.refrigerioSalida" type="time" @change="guardar" />
        </div>
        <div class="hito-row">
          <span class="hito-label">Retorno de refrigerio/almuerzo</span>
          <input v-model="reporte.refrigerioRetorno" type="time" @change="guardar" />
        </div>
        <p class="note">Registra estos hitos una vez al inicio del turno.</p>
      </div>
    </div>

    <div class="section-title" style="margin: 4px 4px 10px"><i class="ti ti-notebook" />Bitácora de Campo</div>

    <div class="card">
      <div class="card-title"><i class="ti ti-bolt" />Agregar Registro</div>

      <div class="tipo-toggle">
        <button type="button" class="tipo-btn" :class="{ active: tipoNuevo === 'actividad' }" @click="tipoNuevo = 'actividad'">Actividad</button>
        <button type="button" class="tipo-btn" :class="{ active: tipoNuevo === 'standby' }" @click="tipoNuevo = 'standby'">Stand By</button>
      </div>

      <div style="margin-top: 12px">
        <template v-if="tipoNuevo === 'actividad'">
          <div class="grid2" style="margin-bottom: 10px">
            <div class="field"><label>Hora Inicio</label><input v-model="nuevaActividad.horaInicio" type="time" /></div>
            <div class="field"><label>Hora Fin</label><input v-model="nuevaActividad.horaFin" type="time" /></div>
          </div>
          <div class="field">
            <label>Descripción de Actividad</label>
            <textarea ref="campoActividad" v-model="nuevaActividad.actividad" placeholder="Escribir actividad…" />
          </div>
        </template>

        <template v-else>
          <div class="field" style="margin-bottom: 10px">
            <label>Causa</label>
            <select v-model="nuevaParada.causa">
              <option value="">— Seleccionar causa —</option>
              <option v-for="c in CAUSAS_STANDBY" :key="c" :value="c">{{ c }}</option>
              <option value="OTRO">OTRO (especificar)</option>
            </select>
          </div>
          <div v-if="nuevaParada.causa === 'OTRO'" class="field" style="margin-bottom: 10px">
            <label>Especificar otra causa</label>
            <input v-model="nuevaParada.causaOtro" type="text" placeholder="Describe la causa…" />
          </div>

          <!-- El horario aparece recién al elegir la causa: es ella la que
               decide si se declara por rango o por tiempo total del día. -->
          <div v-if="paradaEsTiempoTotal" style="margin-bottom: 10px">
            <p class="note" style="margin-bottom: 8px">
              Este tipo de Stand By se registra como <strong>tiempo total del día</strong>.
            </p>
            <div class="grid2">
              <div class="field"><label>Horas</label><input v-model="nuevaParada.totalHoras" type="number" min="0" inputmode="numeric" placeholder="0" /></div>
              <div class="field"><label>Minutos</label><input v-model="nuevaParada.totalMinutos" type="number" min="0" max="59" inputmode="numeric" placeholder="0" /></div>
            </div>
          </div>
          <div v-else-if="nuevaParada.causa" class="grid2" style="margin-bottom: 10px">
            <div class="field"><label>Desde</label><input v-model="nuevaParada.desde" type="time" /></div>
            <div class="field"><label>Hasta</label><input v-model="nuevaParada.hasta" type="time" /></div>
          </div>

          <div class="field" style="margin-bottom: 10px">
            <label>Actividad afectada</label>
            <input v-model="nuevaParada.actividad" type="text" placeholder="Ej: Perforación de pernos, instalación de malla…" />
          </div>
          <div class="field" style="margin-bottom: 10px">
            <label>Responsable de la liberación</label>
            <input v-model="nuevaParada.responsable" type="text" placeholder="Nombre (puede ser externo)" />
          </div>
          <div class="field">
            <label>Comentarios <span style="font-weight: 400; color: var(--text3)">(opcional)</span></label>
            <textarea v-model="nuevaParada.comentario" placeholder="Detalles adicionales del Stand By…" style="min-height: 52px" />
          </div>
        </template>
      </div>

      <button type="button" class="nav-btn primary" style="margin-top: 12px" :disabled="!puedeAgregar" @click="agregarRegistro">
        <i class="ti ti-plus" /> Agregar a Bitácora
      </button>
    </div>

    <div class="card">
      <div class="card-title">
        <i class="ti ti-list-check" />Línea de Tiempo — <span class="frente-actual">{{ frenteActual }}</span>
      </div>

      <div v-if="totalParadas > 0" class="alert alert-red">
        <i class="ti ti-clock-pause" />
        <span>
          <strong>TOTAL STAND BY DE LA JORNADA: {{ fmtHm(totalParadas) }}</strong>
          ({{ cuantasParadas }} evento{{ cuantasParadas === 1 ? '' : 's' }})
        </span>
      </div>

      <p v-if="!lineaDeTiempo.length" class="empty-msg">Sin registros. Agrega una actividad o un Stand By arriba.</p>

      <template v-for="x in lineaDeTiempo" :key="x.r.id">
        <!-- Actividad -->
        <div v-if="x.tipo === 'actividad'" class="timeline-card">
          <template v-if="estaAbierto('actividad', x.r.id)">
            <div class="grid2" style="margin-bottom: 8px">
              <div class="field"><label>Hora Inicio</label><input v-model="x.r.horaInicio" type="time" @change="guardar" /></div>
              <div class="field"><label>Hora Fin</label><input v-model="x.r.horaFin" type="time" @change="guardar" /></div>
            </div>
            <div class="field">
              <label>Descripción de Actividad</label>
              <textarea v-model="x.r.actividad" @change="guardar" />
            </div>
            <div class="timeline-foot">
              <button class="del-btn" aria-label="Eliminar" @click="borrarActividad(x.r.id)"><i class="ti ti-x" /></button>
              <button class="timeline-edit-btn" aria-label="Listo" @click="alternar('actividad', x.r.id)"><i class="ti ti-check" /></button>
            </div>
          </template>

          <template v-else>
            <div class="timeline-head">
              <span class="timeline-time">
                <i class="ti ti-clock" />{{ x.r.horaInicio || '--:--' }}
                <span v-if="x.r.horaFin" class="fin">{{ x.r.horaFin }}</span>
              </span>
              <span v-if="minutosActividad(x.r) > 0" class="timeline-dur">{{ fmtHm(minutosActividad(x.r)) }}</span>
            </div>
            <div class="timeline-desc">{{ x.r.actividad || 'Sin descripción' }}</div>
            <div class="timeline-foot">
              <button class="timeline-edit-btn" aria-label="Editar" @click="alternar('actividad', x.r.id)"><i class="ti ti-pencil" /></button>
            </div>
          </template>
        </div>

        <!-- Stand By -->
        <div v-else class="timeline-card standby">
          <template v-if="estaAbierto('standby', x.r.id)">
            <div class="field" style="margin-bottom: 8px">
              <label>Causa</label>
              <select v-model="x.r.causa" @change="guardar">
                <option value="">— Seleccionar causa —</option>
                <option v-for="c in CAUSAS_STANDBY" :key="c" :value="c">{{ c }}</option>
                <option value="OTRO">OTRO (especificar)</option>
              </select>
            </div>
            <div v-if="x.r.causa === 'OTRO'" class="field" style="margin-bottom: 8px">
              <label>Especificar otra causa</label>
              <input v-model="x.r.causaOtro" type="text" placeholder="Describe la causa…" @change="guardar" />
            </div>

            <div v-if="x.r.causa === CAUSA_TIEMPO_TOTAL" class="grid2" style="margin-bottom: 8px">
              <div class="field"><label>Horas</label><input v-model="x.r.totalHoras" type="number" min="0" inputmode="numeric" @change="guardar" /></div>
              <div class="field"><label>Minutos</label><input v-model="x.r.totalMinutos" type="number" min="0" max="59" inputmode="numeric" @change="guardar" /></div>
            </div>
            <div v-else class="grid2" style="margin-bottom: 8px">
              <div class="field"><label>Desde</label><input v-model="x.r.desde" type="time" @change="guardar" /></div>
              <div class="field"><label>Hasta</label><input v-model="x.r.hasta" type="time" @change="guardar" /></div>
            </div>

            <div class="field" style="margin-bottom: 8px">
              <label>Actividad afectada</label>
              <input v-model="x.r.actividad" type="text" @change="guardar" />
            </div>
            <div class="field" style="margin-bottom: 8px">
              <label>Responsable de la liberación</label>
              <input v-model="x.r.responsable" type="text" @change="guardar" />
            </div>
            <div class="field">
              <label>Comentarios <span style="font-weight: 400; color: var(--text3)">(opcional)</span></label>
              <textarea v-model="x.r.comentario" style="min-height: 52px" @change="guardar" />
            </div>
            <div class="timeline-foot">
              <button class="del-btn" aria-label="Eliminar" @click="borrarParada(x.r.id)"><i class="ti ti-x" /></button>
              <button class="timeline-edit-btn" aria-label="Listo" @click="alternar('standby', x.r.id)"><i class="ti ti-check" /></button>
            </div>
          </template>

          <template v-else>
            <div class="timeline-head">
              <span class="timeline-time">
                <i class="ti ti-clock" />{{ x.r.desde || '--:--' }}
                <span v-if="x.r.hasta" class="fin">{{ x.r.hasta }}</span>
              </span>
              <span v-if="minutosStandby(x.r, reporte) > 0" class="timeline-dur">{{ fmtHm(minutosStandby(x.r, reporte)) }}</span>
            </div>
            <span class="timeline-badge-standby">STAND BY</span>
            <div class="timeline-title">{{ causaEfectiva(x.r) || 'Sin causa registrada' }}</div>
            <div class="timeline-box">
              <div class="timeline-box-row"><label>Actividad afectada</label><div class="val">{{ x.r.actividad || '—' }}</div></div>
              <div class="timeline-box-row"><label>Responsable de la liberación</label><div class="val">{{ x.r.responsable || '—' }}</div></div>
            </div>
            <div class="timeline-foot">
              <button class="timeline-edit-btn" aria-label="Editar" @click="alternar('standby', x.r.id)"><i class="ti ti-pencil" /></button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.frente-actual {
  text-transform: none;
  font-weight: 400;
  color: var(--blue-text);
}
</style>

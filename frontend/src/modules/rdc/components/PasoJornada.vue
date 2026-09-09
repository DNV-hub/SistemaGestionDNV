<script setup>
import { computed, ref } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'
import { CAUSAS_STANDBY, CAUSA_TIEMPO_TOTAL, HITOS } from '../services/rdcConstantes'
import { bitacoraCompleta, fmtHm, minutosStandby, totalStandbyMin } from '../services/rdcCalculos'

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

// --- Bitácora ------------------------------------------------------------
const nuevaActividad = ref({ horaInicio: '', horaFin: '', actividad: '' })

function agregarActividad() {
  if (!nuevaActividad.value.actividad.trim()) return
  reporte.value.bitacora.push({
    id: nuevoId(),
    horaInicio: nuevaActividad.value.horaInicio || null,
    horaFin: nuevaActividad.value.horaFin || null,
    actividad: nuevaActividad.value.actividad.trim(),
    orden: reporte.value.bitacora.length + 1,
  })
  nuevaActividad.value = { horaInicio: '', horaFin: '', actividad: '' }
  guardar()
}

function quitarActividad(id) {
  reporte.value.bitacora = reporte.value.bitacora.filter((b) => b.id !== id)
  guardar()
}

// --- Stand by ------------------------------------------------------------
const nuevaParada = ref({ actividad: '', desde: '', hasta: '', causa: '', causaOtro: '', responsable: '', comentario: '', totalHoras: '', totalMinutos: '' })
const paradaEsTiempoTotal = computed(() => nuevaParada.value.causa === CAUSA_TIEMPO_TOTAL)

function agregarParada() {
  const p = nuevaParada.value
  if (!p.causa) return
  if (!paradaEsTiempoTotal.value && (!p.desde || !p.hasta)) return
  if (paradaEsTiempoTotal.value && !Number(p.totalHoras) && !Number(p.totalMinutos)) return

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
  nuevaParada.value = { actividad: '', desde: '', hasta: '', causa: '', causaOtro: '', responsable: '', comentario: '', totalHoras: '', totalMinutos: '' }
  guardar()
}

function quitarParada(id) {
  reporte.value.standby = reporte.value.standby.filter((s) => s.id !== id)
  guardar()
}

// El acordeón arranca abierto: los hitos son lo primero que se llena al llegar
// al frente, y obligar a desplegarlos cada vez sería un toque de más.
const hitosAbierto = ref(true)
const hitosLlenos = computed(() => HITOS.filter((h) => horaHito(h)).length)

const totalParadas = computed(() => totalStandbyMin(reporte.value))
// La línea de tiempo mezcla lo escrito a mano con lo que se deduce de los
// metrados, igual que en el reporte que se comparte por WhatsApp.
const lineaDeTiempo = computed(() => bitacoraCompleta(reporte.value))
</script>

<template>
  <div v-if="reporte">
    <div class="card">
      <div class="card-title">Acceso al frente</div>
      <label class="toggle-row">
        <input v-model="reporte.restriccionAcceso" type="checkbox" @change="guardar" />
        <span>¿Tuviste restricciones para llegar a tu frente de trabajo?</span>
      </label>

      <div v-if="reporte.restriccionAcceso" class="grid2" style="margin-top: 0.75rem">
        <div class="field ancho">
          <label for="restr-desc">¿Cuál fue la restricción?</label>
          <textarea id="restr-desc" v-model="reporte.restriccionDescripcion" @change="guardar" />
        </div>
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

    <div class="card">
      <div class="card-title">Actividades</div>
      <div class="grid2">
        <div class="field">
          <label for="act-ini">Desde</label>
          <input id="act-ini" v-model="nuevaActividad.horaInicio" type="time" />
        </div>
        <div class="field">
          <label for="act-fin">Hasta</label>
          <input id="act-fin" v-model="nuevaActividad.horaFin" type="time" />
        </div>
        <div class="field ancho">
          <label for="act-desc">Actividad</label>
          <input id="act-desc" v-model="nuevaActividad.actividad" type="text" placeholder="Qué se hizo" @keydown.enter="agregarActividad" />
        </div>
      </div>
      <button type="button" class="secondary-btn" style="margin-top: 0.5rem" :disabled="!nuevaActividad.actividad.trim()" @click="agregarActividad">
        Agregar actividad
      </button>

      <ul v-if="reporte.bitacora.length" class="lista-filas">
        <li v-for="b in reporte.bitacora" :key="b.id">
          <span>{{ b.horaInicio || '—' }}{{ b.horaFin ? ` a ${b.horaFin}` : '' }} · {{ b.actividad }}</span>
          <button type="button" class="del-btn" aria-label="Quitar" @click="quitarActividad(b.id)">×</button>
        </li>
      </ul>
    </div>

    <div class="card">
      <div class="card-title">Stand by</div>
      <div class="grid2">
        <div class="field ancho">
          <label for="sb-causa">Causa</label>
          <select id="sb-causa" v-model="nuevaParada.causa">
            <option value="">— Seleccionar —</option>
            <option v-for="c in CAUSAS_STANDBY" :key="c" :value="c">{{ c }}</option>
            <option value="OTRO">OTRO</option>
          </select>
        </div>
        <div v-if="nuevaParada.causa === 'OTRO'" class="field ancho">
          <label for="sb-otro">¿Cuál?</label>
          <input id="sb-otro" v-model="nuevaParada.causaOtro" type="text" />
        </div>

        <template v-if="paradaEsTiempoTotal">
          <div class="field">
            <label for="sb-h">Horas</label>
            <input id="sb-h" v-model="nuevaParada.totalHoras" type="number" min="0" inputmode="numeric" />
          </div>
          <div class="field">
            <label for="sb-m">Minutos</label>
            <input id="sb-m" v-model="nuevaParada.totalMinutos" type="number" min="0" inputmode="numeric" />
          </div>
        </template>
        <template v-else>
          <div class="field">
            <label for="sb-desde">Desde</label>
            <input id="sb-desde" v-model="nuevaParada.desde" type="time" />
          </div>
          <div class="field">
            <label for="sb-hasta">Hasta</label>
            <input id="sb-hasta" v-model="nuevaParada.hasta" type="time" />
          </div>
        </template>

        <div class="field ancho">
          <label for="sb-act">Actividad afectada</label>
          <input id="sb-act" v-model="nuevaParada.actividad" type="text" />
        </div>
        <div class="field ancho">
          <label for="sb-com">Comentario</label>
          <input id="sb-com" v-model="nuevaParada.comentario" type="text" />
        </div>
      </div>
      <button type="button" class="secondary-btn" style="margin-top: 0.5rem" :disabled="!nuevaParada.causa" @click="agregarParada">
        Agregar parada
      </button>

      <ul v-if="reporte.standby.length" class="lista-filas">
        <li v-for="s in reporte.standby" :key="s.id">
          <span>{{ s.actividad || 'Sin actividad' }} · {{ fmtHm(minutosStandby(s, reporte)) }} · {{ s.causa }}</span>
          <button type="button" class="del-btn" aria-label="Quitar" @click="quitarParada(s.id)">×</button>
        </li>
      </ul>
      <p v-if="totalParadas > 0" class="total-paradas">Total stand by: {{ fmtHm(totalParadas) }}</p>
    </div>

    <div v-if="lineaDeTiempo.length" class="card">
      <div class="card-title">Línea de tiempo</div>
      <p class="note">Lo que escribiste a mano, más lo que se deduce solo de los metrados que cargues.</p>
      <ul class="lista-filas">
        <li v-for="(e, i) in lineaDeTiempo" :key="i">
          <span>{{ e.hi || '—' }}{{ e.hf ? ` a ${e.hf}` : '' }} · {{ e.texto }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>


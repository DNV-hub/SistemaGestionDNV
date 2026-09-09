<script setup>
import { computed, ref } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'
import { partidasEjecutadas } from '../services/rdcCalculos'

const rdc = useRdcStore()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()

/** Lo que se puede programar para mañana sale de dos lados: las partidas del
 * presupuesto del frente (EDT) y lo que ya se ejecutó hoy, que suele ser lo
 * que se continúa. */
const opcionesPartida = computed(() => {
  const edt = (rdc.catalogos?.partidasEdt ?? []).filter((p) => p.frente_id === reporte.value?.frenteId).map((p) => p.nombre)
  const hoy = partidasEjecutadas(reporte.value).map((p) => p.nombre)
  return [...new Set([...hoy, ...edt])]
})

const programadas = computed(() => reporte.value.programacion.filter((p) => p.tipo === 'programada'))
const noProgramadas = computed(() => reporte.value.programacion.filter((p) => p.tipo === 'no_programada'))

function agregar(tipo) {
  reporte.value.programacion.push({
    id: nuevoId(),
    tipo,
    etiqueta: '',
    descripcion: '',
    orden: reporte.value.programacion.length + 1,
  })
  guardar()
}

function quitar(id) {
  reporte.value.programacion = reporte.value.programacion.filter((p) => p.id !== id)
  guardar()
}
</script>

<template>
  <div v-if="reporte">
    <div class="card">
      <div class="card-title">Programación de mañana</div>
      <div v-for="p in programadas" :key="p.id" class="fila-prog">
        <select v-model="p.etiqueta" @change="guardar">
          <option value="">— Partida —</option>
          <option v-for="o in opcionesPartida" :key="o" :value="o">{{ o }}</option>
        </select>
        <input v-model="p.descripcion" type="text" placeholder="Detalle (opcional)" @change="guardar" />
        <button type="button" class="del-btn" aria-label="Quitar" @click="quitar(p.id)">×</button>
      </div>
      <p v-if="!programadas.length" class="empty-msg">Todavía no programaste nada.</p>
      <button type="button" class="secondary-btn" style="margin-top: 0.5rem" @click="agregar('programada')">Agregar partida</button>
    </div>

    <div class="card">
      <div class="card-title">Actividades no programadas</div>
      <div v-for="p in noProgramadas" :key="p.id" class="fila-prog">
        <input v-model="p.descripcion" type="text" placeholder="Actividad" @change="guardar" />
        <input v-model="p.etiqueta" type="text" placeholder="Nota (opcional)" @change="guardar" />
        <button type="button" class="del-btn" aria-label="Quitar" @click="quitar(p.id)">×</button>
      </div>
      <p v-if="!noProgramadas.length" class="empty-msg">Nada por ahora.</p>
      <button type="button" class="secondary-btn" style="margin-top: 0.5rem" @click="agregar('no_programada')">Agregar actividad</button>
    </div>

    <div class="card">
      <div class="card-title">Observaciones</div>
      <div class="field">
        <textarea v-model="reporte.observaciones" placeholder="Observaciones de campo, calidad, condiciones del frente…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title">Requerimientos</div>
      <div class="field">
        <textarea v-model="reporte.requerimientos" placeholder="Materiales, equipos, herramientas, personal o servicios que se necesitan…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title">Restricciones</div>
      <div class="field">
        <textarea v-model="reporte.restricciones" placeholder="Restricciones operativas, de acceso, clima, permisos…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title">Modificaciones / Redline</div>
      <label class="toggle-row">
        <input v-model="reporte.redline" type="checkbox" @change="guardar" />
        <span>¿Hubo modificaciones respecto al plano original?</span>
      </label>

      <div v-if="reporte.redline" class="grid2" style="margin-top: 0.75rem">
        <div class="field ancho">
          <label for="redline-sup">Supervisor que realizó el redline</label>
          <select id="redline-sup" v-model="reporte.redlineSupervisorId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="s in rdc.catalogos?.redlineSupervisores ?? []" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
        </div>
        <div class="field ancho">
          <label for="redline-desc">Descripción</label>
          <textarea id="redline-desc" v-model="reporte.redlineDescripcion" placeholder="Ubicación, dimensiones, materiales…" @change="guardar" />
        </div>
      </div>
    </div>
  </div>
</template>


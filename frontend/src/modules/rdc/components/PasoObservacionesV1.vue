<script setup>
import { computed } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'

const rdc = useRdcStore()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()

/** Programación y actividades no programadas son texto libre, como
 * Observaciones: una línea de texto = una fila de `programacion`, así el
 * WhatsApp y el Excel siguen listándolas una por una. Lo ya escrito con el
 * formato anterior (partida + detalle) se muestra unido con « — ». */
function textoLibre(tipo) {
  return computed({
    get: () =>
      reporte.value.programacion
        .filter((p) => p.tipo === tipo)
        .map((p) => (tipo === 'programada' ? [p.etiqueta, p.descripcion] : [p.descripcion, p.etiqueta]).filter((x) => x?.trim()).join(' — '))
        .join('\n'),
    set: (valor) => {
      const previas = reporte.value.programacion.filter((p) => p.tipo === tipo)
      const otras = reporte.value.programacion.filter((p) => p.tipo !== tipo)
      const lineas = valor.split('\n').map((l) => l.trim()).filter(Boolean)
      const nuevas = lineas.map((linea, i) => ({
        id: previas[i]?.id ?? nuevoId(),
        tipo,
        etiqueta: tipo === 'programada' ? linea : '',
        descripcion: tipo === 'programada' ? '' : linea,
        orden: 0,
      }))
      reporte.value.programacion = [...otras, ...nuevas].map((p, i) => ({ ...p, orden: i + 1 }))
    },
  })
}
const textoProgramadas = textoLibre('programada')
const textoNoProgramadas = textoLibre('no_programada')
</script>

<template>
  <div v-if="reporte">
    <div class="card">
      <div class="card-title"><i class="ti ti-calendar-plus" />Programación — día siguiente</div>
      <div class="field">
        <textarea v-model="textoProgramadas" placeholder="Qué se va a trabajar mañana (una actividad por línea)…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-circle-plus" />Actividades no programadas</div>
      <div class="field">
        <textarea v-model="textoNoProgramadas" placeholder="Actividades que se hicieron y no estaban programadas (una por línea)…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-message-circle" />Observaciones</div>
      <div class="field">
        <textarea v-model="reporte.observaciones" placeholder="Observaciones de campo, calidad, condiciones del frente…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-tools" />Requerimientos</div>
      <div class="field">
        <textarea v-model="reporte.requerimientos" placeholder="Materiales, equipos, herramientas, personal o servicios que se necesitan…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-shield-exclamation" />Restricciones</div>
      <div class="field">
        <textarea v-model="reporte.restricciones" placeholder="Restricciones operativas, de acceso, clima, permisos…" @change="guardar" />
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-pencil-exclamation" />Modificaciones / Redline</div>
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


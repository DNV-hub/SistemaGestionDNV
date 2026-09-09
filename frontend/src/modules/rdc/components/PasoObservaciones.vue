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
    <section class="tarjeta">
      <h2>Programación de mañana</h2>
      <div v-for="p in programadas" :key="p.id" class="fila-prog">
        <select v-model="p.etiqueta" @change="guardar">
          <option value="">— Partida —</option>
          <option v-for="o in opcionesPartida" :key="o" :value="o">{{ o }}</option>
        </select>
        <input v-model="p.descripcion" type="text" placeholder="Detalle (opcional)" @change="guardar" />
        <button type="button" class="quitar" aria-label="Quitar" @click="quitar(p.id)">×</button>
      </div>
      <p v-if="!programadas.length" class="vacio">Todavía no programaste nada.</p>
      <button type="button" class="boton-secundario" style="margin-top: 0.5rem" @click="agregar('programada')">Agregar partida</button>
    </section>

    <section class="tarjeta">
      <h2>Actividades no programadas</h2>
      <div v-for="p in noProgramadas" :key="p.id" class="fila-prog">
        <input v-model="p.descripcion" type="text" placeholder="Actividad" @change="guardar" />
        <input v-model="p.etiqueta" type="text" placeholder="Nota (opcional)" @change="guardar" />
        <button type="button" class="quitar" aria-label="Quitar" @click="quitar(p.id)">×</button>
      </div>
      <p v-if="!noProgramadas.length" class="vacio">Nada por ahora.</p>
      <button type="button" class="boton-secundario" style="margin-top: 0.5rem" @click="agregar('no_programada')">Agregar actividad</button>
    </section>

    <section class="tarjeta">
      <h2>Observaciones</h2>
      <div class="campo">
        <textarea v-model="reporte.observaciones" placeholder="Observaciones de campo, calidad, condiciones del frente…" @change="guardar" />
      </div>
    </section>

    <section class="tarjeta">
      <h2>Requerimientos</h2>
      <div class="campo">
        <textarea v-model="reporte.requerimientos" placeholder="Materiales, equipos, herramientas, personal o servicios que se necesitan…" @change="guardar" />
      </div>
    </section>

    <section class="tarjeta">
      <h2>Restricciones</h2>
      <div class="campo">
        <textarea v-model="reporte.restricciones" placeholder="Restricciones operativas, de acceso, clima, permisos…" @change="guardar" />
      </div>
    </section>

    <section class="tarjeta">
      <h2>Modificaciones / Redline</h2>
      <label class="interruptor">
        <input v-model="reporte.redline" type="checkbox" @change="guardar" />
        <span>¿Hubo modificaciones respecto al plano original?</span>
      </label>

      <div v-if="reporte.redline" class="rejilla" style="margin-top: 0.75rem">
        <div class="campo ancho">
          <label for="redline-sup">Supervisor que realizó el redline</label>
          <select id="redline-sup" v-model="reporte.redlineSupervisorId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="s in rdc.catalogos?.redlineSupervisores ?? []" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
        </div>
        <div class="campo ancho">
          <label for="redline-desc">Descripción</label>
          <textarea id="redline-desc" v-model="reporte.redlineDescripcion" placeholder="Ubicación, dimensiones, materiales…" @change="guardar" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@import './formulario.css';

.fila-prog {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.4rem;
}
.fila-prog input,
.fila-prog select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.85rem;
  width: 100%;
}
.interruptor {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.9rem;
  color: var(--color-text);
  cursor: pointer;
}
.interruptor input {
  width: 20px;
  height: 20px;
}

@media (max-width: 640px) {
  .fila-prog {
    grid-template-columns: 1fr auto;
  }
}
</style>

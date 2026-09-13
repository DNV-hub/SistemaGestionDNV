<script setup>
import { computed, ref } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'

const rdc = useRdcStore()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()

async function alCambiarSector() {
  // El frente elegido puede no pertenecer al sector nuevo, así que se limpia
  // en vez de quedar en un estado imposible.
  const validos = rdc.frentesDelSector.map((f) => f.id)
  if (!validos.includes(reporte.value.frenteId)) reporte.value.frenteId = null
  await rdc.ajustarPersonalIndirecto()
}

function sumar(fila, delta) {
  fila.cantidad = Math.max(0, (Number(fila.cantidad) || 0) + delta)
  guardar()
}

const personalDirecto = computed(() => reporte.value.personal.filter((p) => p.tipo === 'directa'))
const personalIndirecto = computed(() => reporte.value.personal.filter((p) => p.tipo === 'indirecta'))

/** Los tipos de maquinaria del catálogo. Se agrupa por tipo porque es lo que
 * el supervisor cuenta: "hay dos compresoras", no cuál compresora. */
const tiposMaquinaria = computed(() => {
  const tipos = new Map()
  for (const m of rdc.catalogos?.maquinarias ?? []) {
    if (!tipos.has(m.tipo)) tipos.set(m.tipo, { tipo: m.tipo, categoria: m.categoria })
  }
  return [...tipos.values()]
})

const cantidadDe = (tipo) => reporte.value.maquinaria.find((m) => m.tipo === tipo)?.cantidad ?? 0

function ajustarMaquinaria(tipo, categoria, delta) {
  const fila = reporte.value.maquinaria.find((m) => m.tipo === tipo)
  const nueva = Math.max(0, (Number(fila?.cantidad) || 0) + delta)
  if (nueva === 0) reporte.value.maquinaria = reporte.value.maquinaria.filter((m) => m.tipo !== tipo)
  else if (fila) fila.cantidad = nueva
  else reporte.value.maquinaria.push({ id: nuevoId(), maquinariaId: null, tipo, categoria, cantidad: nueva, orden: reporte.value.maquinaria.length + 1 })
  guardar()
}

const fijos = computed(() => new Set(tiposMaquinaria.value.map((t) => t.tipo)))
const maquinariaLibre = computed(() => reporte.value.maquinaria.filter((m) => !fijos.value.has(m.tipo)))

const otroNombre = ref('')
const equiposAbierto = ref(false)
const totalEquipos = computed(() => reporte.value.maquinaria.reduce((s, m) => s + (Number(m.cantidad) || 0), 0))

function agregarOtro() {
  const nombre = otroNombre.value.trim()
  if (!nombre) return
  ajustarMaquinaria(nombre, 'otro', 1)
  otroNombre.value = ''
}
</script>

<template>
  <div v-if="reporte">
    <div class="card">
      <div class="card-title"><i class="ti ti-file-description" />Identificación</div>
      <div class="grid2" style="margin-bottom: 10px">
        <div class="field">
          <label for="f-fecha">Fecha</label>
          <input id="f-fecha" v-model="reporte.fecha" type="date" @change="guardar" />
        </div>
        <div class="field">
          <label for="f-sector">Sector</label>
          <select id="f-sector" v-model="reporte.sectorId" @change="alCambiarSector">
            <option :value="null">— Seleccionar —</option>
            <option v-for="s in rdc.catalogos?.sectores ?? []" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
        </div>
      </div>
      <div class="grid2" style="margin-bottom: 10px">
        <div class="field">
          <label for="f-frente">Frente</label>
          <select id="f-frente" v-model="reporte.frenteId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="f in rdc.frentesDelSector" :key="f.id" :value="f.id">{{ f.nombre }}</option>
          </select>
        </div>
        <div class="field">
          <label for="f-capataz">Capataz</label>
          <select id="f-capataz" v-model="reporte.capatazId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="c in rdc.catalogos?.capataces ?? []" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>
      </div>

      <!-- Un supervisor de campo nunca ve esto: el reporte ya es suyo desde
           que se crea (rdc.supervisorPropio). Quien lo llena sin ser
           supervisor (Planeamiento cubriendo a alguien, por ejemplo) tiene
           que decir de quién es — si no, el reporte no se puede guardar en
           el Sistema, ahí supervisor_id es obligatorio. -->
      <div v-if="!rdc.supervisorPropio" class="grid2" style="margin-bottom: 10px">
        <div class="field">
          <label for="f-supervisor">Supervisor</label>
          <select id="f-supervisor" v-model="reporte.supervisorId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="s in rdc.catalogos?.supervisores ?? []" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-users" />Personal presente</div>
      <div v-for="p in personalDirecto" :key="p.id" class="person-row">
        <span class="person-row-label">{{ p.categoria }}</span>
        <div class="stepper">
          <button type="button" class="stepper-btn" :aria-label="`Restar ${p.categoria}`" @click="sumar(p, -1)">−</button>
          <input v-model.number="p.cantidad" type="number" min="0" inputmode="numeric" class="stepper-input" @change="guardar" />
          <button type="button" class="stepper-btn" :aria-label="`Sumar ${p.categoria}`" @click="sumar(p, 1)">+</button>
        </div>
      </div>
    </div>

    <div v-if="personalIndirecto.length" class="card">
      <div class="card-title"><i class="ti ti-building" />Personal Sala Eléctrica</div>
      <p class="note" style="margin-bottom: 10px">Personal específico del sector Sala Eléctrica.</p>
      <div v-for="p in personalIndirecto" :key="p.id" class="person-row">
        <span class="person-row-label">{{ p.categoria }}</span>
        <div class="stepper">
          <button type="button" class="stepper-btn" :aria-label="`Restar ${p.categoria}`" @click="sumar(p, -1)">−</button>
          <input v-model.number="p.cantidad" type="number" min="0" inputmode="numeric" class="stepper-input" @change="guardar" />
          <button type="button" class="stepper-btn" :aria-label="`Sumar ${p.categoria}`" @click="sumar(p, 1)">+</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="acordeon" @click="equiposAbierto = !equiposAbierto">
        <div class="card-title" style="margin: 0"><i class="ti ti-tool" />Equipos en frente</div>
        <span class="badge-equipos">{{ totalEquipos ? `${totalEquipos} en frente` : '' }}</span>
        <i class="ti" :class="equiposAbierto ? 'ti-chevron-up' : 'ti-chevron-down'" />
      </div>

      <div v-if="equiposAbierto" style="margin-top: 10px">
        <p class="note" style="margin-bottom: 8px">Toca <strong>+</strong> junto al equipo para sumarlo.</p>
        <div v-for="t in tiposMaquinaria" :key="t.tipo" class="person-row">
          <span class="person-row-label">{{ t.tipo }}</span>
          <div class="stepper">
            <button type="button" class="stepper-btn" :aria-label="`Restar ${t.tipo}`" @click="ajustarMaquinaria(t.tipo, t.categoria, -1)">−</button>
            <input :value="cantidadDe(t.tipo)" type="number" min="0" readonly class="stepper-input" />
            <button type="button" class="stepper-btn" :aria-label="`Sumar ${t.tipo}`" @click="ajustarMaquinaria(t.tipo, t.categoria, 1)">+</button>
          </div>
        </div>

        <div class="equipo-otro">
          <div class="field" style="flex: 1">
            <input v-model="otroNombre" type="text" placeholder="Equipo no listado…" @keydown.enter="agregarOtro" />
          </div>
          <button type="button" class="ctrl-add-btn" @click="agregarOtro">+</button>
        </div>

        <div v-for="m in maquinariaLibre" :key="m.id" class="person-row">
          <span class="person-row-label">{{ m.tipo }} ({{ m.cantidad }})</span>
          <button type="button" class="del-btn" aria-label="Quitar" @click="ajustarMaquinaria(m.tipo, 'otro', -m.cantidad)">
            <i class="ti ti-x" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acordeon {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.badge-equipos {
  flex: 1;
  font-size: 11px;
  color: var(--text3);
  font-weight: 400;
}
.equipo-otro {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
</style>

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
  const frentesValidos = rdc.frentesDelSector.map((f) => f.id)
  if (!frentesValidos.includes(reporte.value.frenteId)) reporte.value.frenteId = null
  await rdc.ajustarPersonalIndirecto()
}

function sumar(fila, delta) {
  fila.cantidad = Math.max(0, (Number(fila.cantidad) || 0) + delta)
  guardar()
}

const personalDirecto = computed(() => reporte.value.personal.filter((p) => p.tipo === 'directa'))
const personalIndirecto = computed(() => reporte.value.personal.filter((p) => p.tipo === 'indirecta'))

/** Los tipos de maquinaria que ofrece el catálogo, con la cantidad que lleva
 * hoy el reporte. Se agrupa por tipo porque es lo que el supervisor cuenta:
 * "hay dos compresoras", no "está la compresora con placa X". */
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
  if (nueva === 0) {
    reporte.value.maquinaria = reporte.value.maquinaria.filter((m) => m.tipo !== tipo)
  } else if (fila) {
    fila.cantidad = nueva
  } else {
    reporte.value.maquinaria.push({ id: nuevoId(), maquinariaId: null, tipo, categoria, cantidad: nueva, orden: reporte.value.maquinaria.length + 1 })
  }
  guardar()
}

const fijos = computed(() => new Set(tiposMaquinaria.value.map((t) => t.tipo)))
const maquinariaLibre = computed(() => reporte.value.maquinaria.filter((m) => !fijos.value.has(m.tipo)))

const otroNombre = ref('')
</script>

<template>
  <div v-if="reporte">
    <section class="tarjeta">
      <h2>Identificación</h2>
      <div class="rejilla">
        <div class="campo">
          <label for="fecha">Fecha</label>
          <input id="fecha" v-model="reporte.fecha" type="date" @change="guardar" />
        </div>
        <div class="campo">
          <label for="sector">Sector</label>
          <select id="sector" v-model="reporte.sectorId" @change="alCambiarSector">
            <option :value="null">— Seleccionar —</option>
            <option v-for="s in rdc.catalogos?.sectores ?? []" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="frente">Frente</label>
          <select id="frente" v-model="reporte.frenteId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="f in rdc.frentesDelSector" :key="f.id" :value="f.id">{{ f.nombre }}</option>
          </select>
        </div>
        <div class="campo">
          <label for="capataz">Capataz</label>
          <select id="capataz" v-model="reporte.capatazId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="c in rdc.catalogos?.capataces ?? []" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>
        <div class="campo ancho">
          <label for="supervisor">Supervisor responsable</label>
          <select id="supervisor" v-model="reporte.supervisorId" @change="guardar">
            <option :value="null">— Seleccionar —</option>
            <option v-for="s in rdc.catalogos?.supervisores ?? []" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
          <p class="ayuda">
            Quién es el responsable del frente ese día. Quién llenó el reporte se toma de tu sesión y no se puede cambiar.
          </p>
        </div>
      </div>
    </section>

    <section class="tarjeta">
      <h2>Personal presente</h2>
      <div v-for="p in personalDirecto" :key="p.id" class="contador">
        <span class="nombre">{{ p.categoria }}</span>
        <div class="controles">
          <button type="button" :aria-label="`Restar ${p.categoria}`" @click="sumar(p, -1)">−</button>
          <input v-model.number="p.cantidad" type="number" min="0" inputmode="numeric" @change="guardar" />
          <button type="button" :aria-label="`Sumar ${p.categoria}`" @click="sumar(p, 1)">+</button>
        </div>
      </div>
    </section>

    <section v-if="personalIndirecto.length" class="tarjeta">
      <h2>Personal Sala Eléctrica</h2>
      <div v-for="p in personalIndirecto" :key="p.id" class="contador">
        <span class="nombre">{{ p.categoria }}</span>
        <div class="controles">
          <button type="button" :aria-label="`Restar ${p.categoria}`" @click="sumar(p, -1)">−</button>
          <input v-model.number="p.cantidad" type="number" min="0" inputmode="numeric" @change="guardar" />
          <button type="button" :aria-label="`Sumar ${p.categoria}`" @click="sumar(p, 1)">+</button>
        </div>
      </div>
    </section>

    <section class="tarjeta">
      <h2>Equipos en frente</h2>
      <div v-for="t in tiposMaquinaria" :key="t.tipo" class="contador">
        <span class="nombre">{{ t.tipo }}</span>
        <div class="controles">
          <button type="button" :aria-label="`Restar ${t.tipo}`" @click="ajustarMaquinaria(t.tipo, t.categoria, -1)">−</button>
          <input :value="cantidadDe(t.tipo)" type="number" min="0" readonly />
          <button type="button" :aria-label="`Sumar ${t.tipo}`" @click="ajustarMaquinaria(t.tipo, t.categoria, 1)">+</button>
        </div>
      </div>

      <p class="ayuda">¿Llegó algo que no está en la lista? Agrégalo acá.</p>
      <div class="agregar-otro">
        <input v-model="otroNombre" type="text" placeholder="Describe el equipo" />
        <button
          type="button"
          class="boton-secundario"
          :disabled="!otroNombre.trim()"
          @click="ajustarMaquinaria(otroNombre.trim(), 'otro', 1); otroNombre = ''"
        >
          Agregar
        </button>
      </div>

      <ul v-if="maquinariaLibre.length" class="lista-filas">
        <li v-for="m in maquinariaLibre" :key="m.id">
          <span>{{ m.tipo }} — {{ m.cantidad }}</span>
          <button type="button" class="quitar" aria-label="Quitar" @click="ajustarMaquinaria(m.tipo, 'otro', -m.cantidad)">×</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
@import './formulario.css';

.agregar-otro {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.agregar-otro input {
  flex: 1;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.9rem;
}
</style>

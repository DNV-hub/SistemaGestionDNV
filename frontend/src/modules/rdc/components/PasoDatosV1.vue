<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { useAuthStore } from '../../../store/auth'
import { nuevoId, PERSONAL_DIRECTO } from '../services/rdcRepository'
import { buscarReporteDuplicado } from '../services/rdcService'
import { ESTADO } from '../services/rdcDb'

const rdc = useRdcStore()
const auth = useAuthStore()
const router = useRouter()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()

// Aviso temprano de duplicado: pasó de verdad (un supervisor llenó el mismo
// frente/fecha en el celular y, por separado, en la laptop) y el error de
// "duplicate key" recién salía al FINAL, al intentar enviar — perdiendo el
// trabajo de rellenar todo de nuevo. Se revisa contra el servidor apenas se
// tiene frente+fecha+supervisor, no solo al enviar.
const duplicado = ref(null)
async function revisarDuplicado() {
  const r = reporte.value
  if (!r) return
  try {
    duplicado.value = await buscarReporteDuplicado({
      supervisorId: r.supervisorId,
      frenteId: r.frenteId,
      fecha: r.fecha,
      excluirId: r.id,
    })
  } catch {
    // Sin señal, o lo que sea: no bloquea nada, solo no se puede avisar todavía.
  }
}
onMounted(revisarDuplicado)
// Además de onMounted: Vue Router reutiliza este mismo componente al
// navegar entre dos reportes (mismo "Paso 1", distinto :id en la URL) — sin
// esto, el aviso de "ya existe un reporte duplicado" quedaba pegado en
// pantalla para siempre después de la primera vez, aunque `reporte` ya
// fuera otro (ej. al tocar "Ver ese reporte" del propio aviso: el reporte
// cambiaba de verdad pero el aviso viejo nunca se volvía a revisar).
watch(
  () => reporte.value?.id,
  (id, idAnterior) => {
    if (id && id !== idAnterior) {
      duplicado.value = null
      revisarDuplicado()
    }
  }
)

const yendoAlDuplicado = ref(false)
async function irADuplicado() {
  if (!duplicado.value || yendoAlDuplicado.value) return
  yendoAlDuplicado.value = true
  try {
    if (duplicado.value.estado === ESTADO.BORRADOR) {
      const traido = await rdc.adoptarRemoto(duplicado.value.id)
      if (traido) router.push({ name: 'rdc-editar', params: { id: traido.id } })
    } else {
      router.push({ name: 'rdc-detalle', params: { id: duplicado.value.id } })
    }
  } catch (e) {
    console.error(e)
    alert('No se pudo traer ese reporte. Revisa tu conexión e intenta de nuevo.')
  } finally {
    yendoAlDuplicado.value = false
  }
}

// El selector de Supervisor NUNCA debe salirle a una cuenta con rol
// Supervisor, ni siquiera si por algún hueco de catálogo `supervisorPropio`
// no lo encuentra (pasó con Carlo Montero: le faltaba el enlace en
// rdc_supervisores) — mostrarle "elige qué supervisor eres" es una UX sin
// sentido y un riesgo real de que elija mal. En ese caso raro se le avisa
// del problema en vez de dejarlo elegir.
const esRolSupervisor = computed(() => auth.nombreRol === 'Supervisor')

// El frente ya se elige en el Dashboard del RDC (RdcDashboardView.vue) antes
// de tocar "Nuevo reporte" — volver a preguntarlo acá era redundante. Si de
// verdad ya viene elegido, se muestra solo como texto con un "Cambiar" que
// revela el <select> de nuevo (nunca se borra la posibilidad de corregirlo,
// por si se equivocó al elegir). Si por algún motivo no viene elegido
// (cuenta sin frente guardado todavía, o alguien que no es el supervisor de
// campo llenándolo por otro), el <select> se muestra directo, como antes.
const cambiandoFrenteAqui = ref(false)

// El Sector ya no se elige a mano: se deriva del Frente, que ya lo trae
// cargado desde el catálogo (Planeamiento lo asigna una sola vez ahí, no
// hace sentido que el supervisor lo repita cada reporte). Cambiar de sector
// puede activar o desactivar el personal indirecto de Sala Eléctrica, así
// que sigue recalculándose acá, solo que ahora a partir del frente.
async function alCambiarFrente() {
  reporte.value.sectorId = rdc.sectorIdDeFrente(reporte.value.frenteId)
  await rdc.ajustarPersonalIndirecto()
  revisarDuplicado()
  cambiandoFrenteAqui.value = false
}

function alCambiarFecha() {
  guardar()
  revisarDuplicado()
}

function sumar(fila, delta) {
  fila.cantidad = Math.max(0, (Number(fila.cantidad) || 0) + delta)
  guardar()
}

const personalDirecto = computed(() => reporte.value.personal.filter((p) => p.tipo === 'directa'))
const personalIndirecto = computed(() => reporte.value.personal.filter((p) => p.tipo === 'indirecta'))

// Reparación de un reporte que ya quedó con `personal` vacío (bug de
// arrastre: un reporte anterior sin ninguna fila "directa" se heredaba tal
// cual al de hoy, perpetuando el vacío — corregido en crearBorrador(), pero
// esto repara en vivo un reporte que ya se guardó así, sin pedirle al
// supervisor que borre el borrador y pierda lo demás que ya llenó). No hay
// forma en la UI de dejar esta lista vacía a propósito, así que si está
// vacía siempre es este bug.
function repararPersonalVacio() {
  if (!reporte.value || personalDirecto.value.length) return
  reporte.value.personal.push(
    ...PERSONAL_DIRECTO.map((categoria, i) => ({ id: nuevoId(), categoria, tipo: 'directa', cantidad: 0, orden: i + 1 }))
  )
  guardar()
}
onMounted(repararPersonalVacio)
watch(() => reporte.value?.id, repararPersonalVacio)

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
    <div v-if="duplicado" class="alert alert-red">
      <i class="ti ti-alert-triangle" />
      <span style="flex: 1">
        Ya existe {{ duplicado.estado === 'Borrador' ? 'un borrador' : 'un reporte enviado' }} tuyo para este frente en
        esta fecha, hecho desde otro dispositivo o sesión. Si es el mismo trabajo, no llenes dos — continúa ese en vez
        de este.
        <br />
        <button type="button" class="secondary-btn" style="margin-top: 6px; padding: 6px 10px; font-size: 12px" :disabled="yendoAlDuplicado" @click="irADuplicado">
          {{ yendoAlDuplicado ? 'Abriendo…' : 'Ver ese reporte' }}
        </button>
      </span>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-file-description" />Identificación</div>
      <div class="grid2" style="margin-bottom: 10px">
        <div class="field">
          <label for="f-fecha">Fecha</label>
          <input
            id="f-fecha"
            v-model="reporte.fecha"
            type="date"
            :disabled="reporte.esCorreccion"
            :title="reporte.esCorreccion ? 'Un reporte en corrección no puede cambiar de fecha — eso lo convertiría en el reporte de otro día.' : ''"
            @change="alCambiarFecha"
          />
          <p v-if="reporte.esCorreccion" class="note" style="margin-top: 4px">
            No se puede cambiar la fecha al corregir un reporte — ya pasó que eso borró por error el reporte real de otro día.
          </p>
        </div>
        <div class="field">
          <label for="f-frente">Frente</label>
          <select id="f-frente" v-model="reporte.frenteId" @change="alCambiarFrente">
            <option :value="null">— Seleccionar —</option>
            <option v-for="f in rdc.frentesOrdenados" :key="f.id" :value="f.id">
              {{ f.nombre }}
            </option>
          </select>
        </div>
      </div>
      <div class="field" style="margin-bottom: 10px">
        <label for="f-capataz">Capataz</label>
        <select id="f-capataz" v-model="reporte.capatazId" @change="guardar">
          <option :value="null">— Seleccionar —</option>
          <option v-for="c in rdc.catalogos?.capataces ?? []" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>

      <!-- Un supervisor de campo nunca ve el selector: el reporte ya es
           suyo desde que se crea (rdc.supervisorPropio). Si su cuenta no
           está bien enlazada en el catálogo (no debería pasar, pero pasó
           una vez), se le avisa en vez de dejarlo elegir "quién es". Quien
           lo llena sin ser supervisor (Planeamiento cubriendo a alguien,
           por ejemplo) sí tiene que decir de quién es — si no, el reporte
           no se puede guardar en el Sistema, ahí supervisor_id es
           obligatorio. -->
      <p v-if="esRolSupervisor && !rdc.supervisorPropio" class="alert alert-red" style="margin-bottom: 10px">
        Tu cuenta no está vinculada a un supervisor de campo en el catálogo del RDC — avisa a Planeamiento para que te
        agregue. Mientras tanto no vas a poder guardar el reporte.
      </p>
      <div v-else-if="!esRolSupervisor" class="grid2" style="margin-bottom: 10px">
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
      <div class="acordeon fijo">
        <div class="card-title" style="margin: 0"><i class="ti ti-tool" />Equipos en frente</div>
        <span class="badge-equipos">{{ totalEquipos ? `${totalEquipos} en frente` : '' }}</span>
      </div>

      <div style="margin-top: 10px">
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
.frente-fijo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 9px 11px;
  background: var(--surface2);
  border: 1.5px solid var(--border-md);
  border-radius: var(--r-md);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
/* El nombre del frente puede ser largo ("BARRERA DINÁMICA N°5 - KM07"): se
   parte en líneas en vez de desbordar la cápsula. */
.frente-fijo-txt {
  flex: 1;
  min-width: 0;
  line-height: 1.25;
  white-space: normal;
  overflow-wrap: anywhere;
}
.frente-fijo .ti {
  flex-shrink: 0;
  color: var(--text3);
}
.grid2 > .field {
  min-width: 0;
}
.acordeon.fijo {
  cursor: default;
}
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
/* Desplegables directos (un toque) con flechita, igual que en Metrado. */
.rdc-app.formulario select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236F6B63' stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
</style>

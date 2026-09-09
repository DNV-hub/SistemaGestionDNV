<script setup>
import { computed, ref, watch } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'
import { DIAMETROS_PERNO, MEDIAS_HORAS, TIPOS_CABLE, TIPOS_MALLA, TIPOS_PERNO, UBICACIONES_ELEMENTO, UNIDADES } from '../services/rdcConstantes'
import { gruposCriticos } from '../services/rdcCalculos'

const rdc = useRdcStore()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()

// Un solo bloque abierto a la vez. Son listas largas: con dos desplegados hay
// que desplazarse mucho para llegar al siguiente y en el celular se pierde de
// vista en cuál estabas. Las partidas libres van aparte porque son cortas y a
// veces se consultan mientras se llena otro bloque.
const bloqueAbierto = ref(null)
const libresAbierto = ref(false)
const alternarBloque = (n) => (bloqueAbierto.value = bloqueAbierto.value === n ? null : n)

// --- Bloques 1 y 3: partidas fijas del catálogo ---------------------------
// El reporte guarda solo las que tienen cantidad; la lista completa sale del
// catálogo y la fila se crea al escribir. Se referencian por CÓDIGO y nunca
// por posición: en el RDC original se guardaban por índice de array y bastaba
// insertar una partida en medio para desalinear los borradores existentes.
const partidasDe = (bloque) => (rdc.catalogos?.partidasEstandar ?? []).filter((p) => String(p.bloque) === bloque)
const metradoDe = (codigo) => reporte.value.metrados.find((m) => m.partidaCodigo === codigo)
const cantidadDe = (codigo) => metradoDe(codigo)?.cantidad ?? ''
const tieneValor = (codigo) => Number(metradoDe(codigo)?.cantidad) > 0

function fijarMetrado(partida, bloque, campo, valor) {
  let fila = metradoDe(partida.codigo)
  if (!fila) {
    fila = {
      id: nuevoId(),
      bloque,
      partidaCodigo: partida.codigo,
      partidaNombre: partida.nombre,
      unidad: partida.unidad,
      cantidad: 0,
      horaInicio: null,
      horaFin: null,
      orden: partida.orden ?? 0,
    }
    reporte.value.metrados.push(fila)
  }
  fila[campo] = campo === 'cantidad' ? Number(valor) || 0 : valor || null

  // Una partida sin cantidad ni horarios no aporta nada: se quita para que el
  // reporte no cargue filas vacías.
  if (!fila.cantidad && !fila.horaInicio && !fila.horaFin) {
    reporte.value.metrados = reporte.value.metrados.filter((m) => m.id !== fila.id)
  }
  guardar()
}

const escalonar = (partida, bloque, delta) => {
  const actual = Number(metradoDe(partida.codigo)?.cantidad) || 0
  fijarMetrado(partida, bloque, 'cantidad', Math.max(0, Math.round((actual + delta) * 100) / 100))
}

// --- Bloque 2: elementos de sostenimiento --------------------------------
const TIPOS_ELEMENTO = [
  { clave: 'perf', etiqueta: 'Perforación', elemento: 'Perno', actividad: 'Perforación', unidad: 'ML' },
  { clave: 'iny', etiqueta: 'Inyección', elemento: 'Perno', actividad: 'Inyección', unidad: 'ML' },
  { clave: 'malla', etiqueta: 'Malla', elemento: 'Malla', actividad: 'Instalación', unidad: 'M2' },
  { clave: 'cable', etiqueta: 'Cable', elemento: 'Cable', actividad: 'Instalación', unidad: 'ML' },
  { clave: 'pull', etiqueta: 'Pull Test', elemento: 'Perno', actividad: 'Pull Test', unidad: 'UND' },
]

const tipoActivo = ref('perf')
const definicion = computed(() => TIPOS_ELEMENTO.find((t) => t.clave === tipoActivo.value))

const nuevo = ref({ zona: '', sostenimiento: '', prefijo: '', letra: '', n1: '', n2: '', cantidad: '', ancho: '', largo: '', tipo: '', diametro: '', ubicacion: '', perforadora: '', horaInicio: '', horaFin: '' })

const prefijosDelFrente = computed(() => (rdc.catalogos?.prefijos ?? []).filter((p) => p.frente_id === reporte.value?.frenteId))
const zonas = computed(() => [...new Set(prefijosDelFrente.value.map((p) => p.zona))])
const sostenimientos = computed(() => prefijosDelFrente.value.filter((p) => p.zona === nuevo.value.zona).map((p) => p.sostenimiento))

const filaPrefijo = computed(() =>
  prefijosDelFrente.value.find((p) => p.zona === nuevo.value.zona && p.sostenimiento === nuevo.value.sostenimiento),
)
// Una misma combinación puede admitir varios prefijos, separados por comas.
const opcionesPrefijo = computed(() => (filaPrefijo.value?.prefijo ?? '').split(',').map((x) => x.trim()).filter(Boolean))
const esManual = computed(() => !filaPrefijo.value || filaPrefijo.value.sostenimiento === 'Manual' || !opcionesPrefijo.value.length)

watch(opcionesPrefijo, (opciones) => {
  if (opciones.length === 1) nuevo.value.prefijo = opciones[0]
})

const MAXIMO_RANGO = 200

function agregarElementos() {
  const d = definicion.value
  const n = nuevo.value
  const base = {
    elemento: d.elemento,
    actividad: d.actividad,
    unidad: d.unidad,
    zona: n.zona || null,
    sistema: n.sostenimiento || null,
    plano: filaPrefijo.value?.plano ?? null,
    horaInicio: n.horaInicio || null,
    horaFin: n.horaFin || null,
  }

  if (d.clave === 'malla') {
    const ancho = Number(n.ancho)
    const largo = Number(n.largo)
    if (!ancho || !largo) return
    reporte.value.elementos.push({
      ...base,
      id: nuevoId(),
      tipo: n.tipo || null,
      codigo: n.letra || (n.prefijo ? `${n.prefijo}${reporte.value.elementos.length + 1}` : null),
      ubicacion: null,
      cantidad: Math.round(ancho * largo * 1000) / 1000,
      ancho,
      largo,
      diametro: null,
      tipoPerforadora: null,
      orden: reporte.value.elementos.length + 1,
    })
  } else {
    const desde = parseInt(n.n1)
    if (!desde) return
    const hasta = parseInt(n.n2) >= desde ? parseInt(n.n2) : desde
    if (hasta - desde > MAXIMO_RANGO) return

    const cantidad = d.clave === 'pull' ? 1 : Number(n.cantidad)
    if (d.clave !== 'pull' && !cantidad) return

    for (let i = desde; i <= hasta; i++) {
      const codigo = n.prefijo ? `${n.prefijo}${n.letra ?? ''}${i}` : `${n.letra ?? ''}${i}`
      reporte.value.elementos.push({
        ...base,
        id: nuevoId(),
        tipo: d.clave === 'perf' || d.clave === 'cable' ? n.tipo || null : d.clave === 'pull' ? 'Ensayo' : null,
        codigo,
        ubicacion: n.ubicacion || null,
        cantidad,
        ancho: null,
        largo: null,
        diametro: d.clave === 'perf' ? n.diametro || null : null,
        tipoPerforadora: d.clave === 'perf' ? n.perforadora || null : null,
        orden: reporte.value.elementos.length + 1,
      })
    }
  }

  Object.assign(nuevo.value, { n1: '', n2: '', cantidad: '', ancho: '', largo: '' })
  guardar()
}

function quitarElemento(id) {
  reporte.value.elementos = reporte.value.elementos.filter((e) => e.id !== id)
  guardar()
}

const elementosDelTipo = computed(() =>
  reporte.value.elementos.filter((e) => e.elemento === definicion.value.elemento && e.actividad === definicion.value.actividad),
)
const totalDelTipo = computed(() => Math.round(elementosDelTipo.value.reduce((s, e) => s + (Number(e.cantidad) || 0), 0) * 100) / 100)
const resumenCriticas = computed(() => gruposCriticos(reporte.value))
const conUbicacion = computed(() => definicion.value.clave === 'perf' || definicion.value.clave === 'iny')

/** Cuántos elementos y cuánto suman, por cada una de las cinco pestañas — para
 * que se vea de un vistazo qué se ha registrado sin tener que abrir cada una. */
const estadisticasPorTipo = computed(() => {
  const mapa = {}
  TIPOS_ELEMENTO.forEach((t) => {
    const items = reporte.value.elementos.filter((e) => e.elemento === t.elemento && e.actividad === t.actividad)
    mapa[t.clave] = { count: items.length, total: Math.round(items.reduce((s, e) => s + (Number(e.cantidad) || 0), 0) * 100) / 100 }
  })
  return mapa
})

// --- Partidas libres -----------------------------------------------------
const nuevaLibre = ref({ nombre: '', unidad: '', cantidad: '' })
const libres = computed(() => reporte.value.metrados.filter((m) => m.bloque === 'libre'))

function agregarLibre() {
  const l = nuevaLibre.value
  if (!l.nombre.trim() || !Number(l.cantidad)) return
  reporte.value.metrados.push({
    id: nuevoId(),
    bloque: 'libre',
    partidaCodigo: null,
    partidaNombre: l.nombre.trim(),
    unidad: l.unidad || 'UND',
    cantidad: Number(l.cantidad),
    horaInicio: null,
    horaFin: null,
    orden: libres.value.length + 1,
  })
  nuevaLibre.value = { nombre: '', unidad: '', cantidad: '' }
  guardar()
}

function quitarLibre(id) {
  reporte.value.metrados = reporte.value.metrados.filter((m) => m.id !== id)
  guardar()
}
</script>

<template>
  <div v-if="reporte">
    <div class="card" style="padding: 10px 14px">
      <div class="alert alert-blue" style="margin: 0">
        <i class="ti ti-file-certificate" />
        <span>Los <strong>códigos que registres</strong> deben coincidir exactamente con los del <strong>plano de sostenimiento</strong>.</span>
      </div>
    </div>

    <div v-if="!reporte.frenteId" class="alert alert-amber">
      <i class="ti ti-alert-triangle" />
      <span>Elige primero un frente en el paso «Datos»: de él dependen los códigos de los elementos.</span>
    </div>

    <!-- ── BLOQUE 1 ── -->
    <div class="card blq-card" style="border-left-color: var(--blue-text)">
      <div class="blq-head" @click="alternarBloque(1)">
        <span class="blq-titulo" style="color: var(--blue-text)"><i class="ti ti-list-check" />1. Actividades preliminares</span>
        <i class="ti" :class="bloqueAbierto === 1 ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--blue-text)" />
      </div>

      <div v-if="bloqueAbierto === 1" style="margin-top: 10px">
        <div
          v-for="p in partidasDe('1')"
          :key="p.codigo"
          class="blq-row"
          :class="{ 'has-val': tieneValor(p.codigo) }"
          style="--row-accent: var(--blue-text)"
        >
          <div class="blq-row-top">
            <span class="blq-row-title">{{ p.nombre }}</span>
            <span class="unit-pill">{{ p.unidad }}</span>
          </div>
          <div class="blq-row-bottom">
            <span class="blq-row-label">Cantidad ejecutada</span>
            <div class="stepper">
              <button type="button" class="stepper-btn" aria-label="Restar" @click="escalonar(p, '1', -1)">−</button>
              <input
                :value="cantidadDe(p.codigo)"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                class="stepper-input"
                @change="fijarMetrado(p, '1', 'cantidad', $event.target.value)"
              />
              <button type="button" class="stepper-btn" aria-label="Sumar" @click="escalonar(p, '1', 1)">+</button>
            </div>
          </div>
          <div v-if="tieneValor(p.codigo)" class="blq-row-horarios">
            <div class="field">
              <label>Inicio</label>
              <select class="time-field" :value="metradoDe(p.codigo)?.horaInicio ?? ''" @change="fijarMetrado(p, '1', 'horaInicio', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
            <div class="field">
              <label>Fin</label>
              <select class="time-field" :value="metradoDe(p.codigo)?.horaFin ?? ''" @change="fijarMetrado(p, '1', 'horaFin', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── BLOQUE 2 ── -->
    <div class="card blq-card" style="border-left-color: var(--amber)">
      <div class="blq-head" @click="alternarBloque(2)">
        <span class="blq-titulo" style="color: var(--amber)"><i class="ti ti-bolt" />2. Actividades críticas</span>
        <i class="ti" :class="bloqueAbierto === 2 ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--amber)" />
      </div>

      <div v-if="bloqueAbierto === 2" style="margin-top: 10px">
        <div class="pestanas">
          <button
            v-for="t in TIPOS_ELEMENTO"
            :key="t.clave"
            type="button"
            class="pestana"
            :class="{ activa: tipoActivo === t.clave }"
            @click="tipoActivo = t.clave"
          >
            <span class="pestana-label">{{ t.etiqueta }}</span>
            <span v-if="estadisticasPorTipo[t.clave].count" class="pestana-conteo">
              {{ estadisticasPorTipo[t.clave].count }} reg · {{ estadisticasPorTipo[t.clave].total }} {{ t.unidad }}
            </span>
          </button>
        </div>

        <div class="ctrl-form">
          <div class="grid2">
            <div class="field">
              <label>Zona</label>
              <select v-model="nuevo.zona">
                <option value="">— Seleccionar —</option>
                <option v-for="z in zonas" :key="z" :value="z">{{ z }}</option>
              </select>
            </div>
            <div class="field">
              <label>Sostenimiento</label>
              <select v-model="nuevo.sostenimiento">
                <option value="">— Seleccionar —</option>
                <option v-for="s in sostenimientos" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>

            <div v-if="opcionesPrefijo.length > 1" class="field">
              <label>Prefijo</label>
              <select v-model="nuevo.prefijo">
                <option v-for="p in opcionesPrefijo" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div v-else-if="esManual" class="field">
              <label>Código a mano</label>
              <input v-model="nuevo.prefijo" type="text" placeholder="Sin prefijo configurado" />
            </div>

            <template v-if="definicion.clave === 'malla'">
              <div class="field">
                <label>Tipo de malla</label>
                <select v-model="nuevo.tipo">
                  <option value="">— Seleccionar —</option>
                  <option v-for="t in TIPOS_MALLA" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="field"><label>Ancho (m)</label><input v-model="nuevo.ancho" type="number" step="0.01" inputmode="decimal" /></div>
              <div class="field"><label>Largo (m)</label><input v-model="nuevo.largo" type="number" step="0.01" inputmode="decimal" /></div>
            </template>

            <template v-else>
              <div class="field"><label>N° inicio</label><input v-model="nuevo.n1" type="number" min="1" inputmode="numeric" /></div>
              <div class="field"><label>N° fin (opcional)</label><input v-model="nuevo.n2" type="number" min="1" inputmode="numeric" /></div>
              <div v-if="definicion.clave !== 'pull'" class="field">
                <label>Longitud ({{ definicion.unidad }})</label>
                <input v-model="nuevo.cantidad" type="number" step="0.01" inputmode="decimal" />
              </div>
              <div v-if="definicion.clave === 'perf'" class="field">
                <label>Tipo de perno</label>
                <select v-model="nuevo.tipo">
                  <option value="">— Seleccionar —</option>
                  <option v-for="t in TIPOS_PERNO" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div v-if="definicion.clave === 'perf'" class="field">
                <label>Diámetro</label>
                <select v-model="nuevo.diametro">
                  <option value="">— Seleccionar —</option>
                  <option v-for="d in DIAMETROS_PERNO" :key="d" :value="d">{{ d }}</option>
                </select>
              </div>
              <div v-if="definicion.clave === 'cable'" class="field">
                <label>Tipo de cable</label>
                <select v-model="nuevo.tipo">
                  <option value="">— Seleccionar —</option>
                  <option v-for="t in TIPOS_CABLE" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div v-if="conUbicacion" class="field">
                <label>Ubicación</label>
                <select v-model="nuevo.ubicacion">
                  <option value="">— Seleccionar —</option>
                  <option v-for="u in UBICACIONES_ELEMENTO" :key="u" :value="u">{{ u }}</option>
                </select>
              </div>
            </template>

            <div class="field">
              <label>Hora inicio</label>
              <select v-model="nuevo.horaInicio" class="time-field">
                <option value="">--</option>
                <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
            <div class="field">
              <label>Hora fin</label>
              <select v-model="nuevo.horaFin" class="time-field">
                <option value="">--</option>
                <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>

          <button type="button" class="ctrl-add-btn" style="width: 100%; margin-top: 10px" @click="agregarElementos">
            <i class="ti ti-plus" /> Agregar {{ definicion.etiqueta.toLowerCase() }}
          </button>
          <p class="note">Con N° inicio y N° fin se crea uno por cada número del rango (máximo {{ MAXIMO_RANGO }}).</p>
        </div>

        <table v-if="elementosDelTipo.length" class="ctrl-table">
          <thead>
            <tr>
              <th>Código</th>
              <th style="text-align: right">Cantidad</th>
              <th v-if="conUbicacion">Ubic.</th>
              <th style="width: 28px" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in elementosDelTipo" :key="e.id">
              <td style="font-family: ui-monospace, monospace">{{ e.codigo || '—' }}</td>
              <td style="text-align: right">{{ e.cantidad }} {{ e.unidad }}</td>
              <td v-if="conUbicacion">{{ e.ubicacion || '—' }}</td>
              <td style="text-align: center">
                <button type="button" class="del-btn" aria-label="Quitar" @click="quitarElemento(e.id)"><i class="ti ti-x" /></button>
              </td>
            </tr>
            <tr class="total-row">
              <td>{{ elementosDelTipo.length }} un.</td>
              <td style="text-align: right">{{ totalDelTipo }} {{ definicion.unidad }}</td>
              <td v-if="conUbicacion" />
              <td />
            </tr>
          </tbody>
        </table>

        <div v-if="resumenCriticas.length" class="resumen-criticas">
          <p v-for="g in resumenCriticas" :key="g.partida">
            <strong>{{ g.partida }}:</strong> {{ g.cantidad }} {{ g.unidad }} ({{ g.unidades }} un.)
          </p>
        </div>
      </div>
    </div>

    <!-- ── BLOQUE 3 ── -->
    <div class="card blq-card" style="border-left-color: var(--green)">
      <div class="blq-head" @click="alternarBloque(3)">
        <span class="blq-titulo" style="color: var(--green)"><i class="ti ti-tools" />3. Actividades complementarias</span>
        <i class="ti" :class="bloqueAbierto === 3 ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--green)" />
      </div>

      <div v-if="bloqueAbierto === 3" style="margin-top: 10px">
        <div
          v-for="p in partidasDe('3')"
          :key="p.codigo"
          class="blq-row"
          :class="{ 'has-val': tieneValor(p.codigo) }"
          style="--row-accent: var(--green)"
        >
          <div class="blq-row-top">
            <span class="blq-row-title">{{ p.nombre }}</span>
            <span class="unit-pill">{{ p.unidad }}</span>
          </div>
          <div class="blq-row-bottom">
            <span class="blq-row-label">Cantidad ejecutada</span>
            <div class="stepper">
              <button type="button" class="stepper-btn" aria-label="Restar" @click="escalonar(p, '3', -1)">−</button>
              <input
                :value="cantidadDe(p.codigo)"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                class="stepper-input"
                @change="fijarMetrado(p, '3', 'cantidad', $event.target.value)"
              />
              <button type="button" class="stepper-btn" aria-label="Sumar" @click="escalonar(p, '3', 1)">+</button>
            </div>
          </div>
          <div v-if="tieneValor(p.codigo)" class="blq-row-horarios">
            <div class="field">
              <label>Inicio</label>
              <select class="time-field" :value="metradoDe(p.codigo)?.horaInicio ?? ''" @change="fijarMetrado(p, '3', 'horaInicio', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
            <div class="field">
              <label>Fin</label>
              <select class="time-field" :value="metradoDe(p.codigo)?.horaFin ?? ''" @change="fijarMetrado(p, '3', 'horaFin', $event.target.value)">
                <option value="">--</option>
                <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── PARTIDAS LIBRES ── -->
    <div class="card blq-card">
      <div class="blq-head" @click="libresAbierto = !libresAbierto">
        <span class="blq-titulo"><i class="ti ti-circle-plus" />Partidas libres</span>
        <i class="ti" :class="libresAbierto ? 'ti-chevron-up' : 'ti-chevron-down'" style="color: var(--text3)" />
      </div>

      <div v-if="libresAbierto" style="margin-top: 10px">
        <p class="note" style="margin-bottom: 10px">Para actividades que no están en los bloques.</p>
        <div class="grid2">
          <div class="field ancho"><label>Nombre</label><input v-model="nuevaLibre.nombre" type="text" placeholder="Nombre de la partida" /></div>
          <div class="field">
            <label>U.M.</label>
            <select v-model="nuevaLibre.unidad">
              <option value="">—</option>
              <option v-for="u in UNIDADES" :key="u" :value="u">{{ u }}</option>
            </select>
          </div>
          <div class="field"><label>Metrado</label><input v-model="nuevaLibre.cantidad" type="number" step="0.01" inputmode="decimal" placeholder="0.00" /></div>
        </div>
        <button type="button" class="add-btn" @click="agregarLibre"><i class="ti ti-plus" /> Agregar partida</button>

        <ul v-if="libres.length" class="lista-filas">
          <li v-for="m in libres" :key="m.id">
            <span>{{ m.partidaNombre }} — {{ m.cantidad }} {{ m.unidad }}</span>
            <button type="button" class="del-btn" aria-label="Quitar" @click="quitarLibre(m.id)"><i class="ti ti-x" /></button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.blq-card {
  border-left: 4px solid var(--border-md);
}
.blq-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.blq-titulo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text2);
}
.blq-titulo i {
  font-size: 15px;
}
</style>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'
import { DIAMETROS_PERNO, MEDIAS_HORAS, TIPOS_CABLE, TIPOS_MALLA, TIPOS_PERNO, UBICACIONES_ELEMENTO, UNIDADES } from '../services/rdcConstantes'
import { gruposCriticos } from '../services/rdcCalculos'

const rdc = useRdcStore()
const reporte = computed(() => rdc.actual)
const guardar = () => rdc.guardar()

// --- Bloques 1 y 3: partidas fijas del catálogo ---------------------------
// El reporte guarda solo las que tienen cantidad; la lista completa sale del
// catálogo y la fila se crea al escribir. Se referencian por CÓDIGO y nunca
// por posición: en el RDC original se guardaban por índice de array y bastaba
// insertar una partida en medio para desalinear los borradores existentes.
const partidasDe = (bloque) => (rdc.catalogos?.partidasEstandar ?? []).filter((p) => String(p.bloque) === bloque)

const metradoDe = (codigo) => reporte.value.metrados.find((m) => m.partidaCodigo === codigo)

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
        tipo: d.clave === 'perf' ? n.tipo || null : d.clave === 'cable' ? n.tipo || null : d.clave === 'pull' ? 'Ensayo' : null,
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

  nuevo.value.n1 = ''
  nuevo.value.n2 = ''
  nuevo.value.cantidad = ''
  nuevo.value.ancho = ''
  nuevo.value.largo = ''
  guardar()
}

function quitarElemento(id) {
  reporte.value.elementos = reporte.value.elementos.filter((e) => e.id !== id)
  guardar()
}

const elementosDelTipo = computed(() =>
  reporte.value.elementos.filter((e) => e.elemento === definicion.value.elemento && e.actividad === definicion.value.actividad),
)
const resumenCriticas = computed(() => gruposCriticos(reporte.value))

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
    <p v-if="!reporte.frenteId" class="aviso">Elige primero un frente en el paso «Datos»: de él dependen los códigos de los elementos.</p>

    <section class="tarjeta">
      <h2>1. Actividades preliminares</h2>
      <div v-for="p in partidasDe('1')" :key="p.codigo" class="partida">
        <div class="partida-nombre">
          <span>{{ p.nombre }}</span>
          <span class="unidad">{{ p.unidad }}</span>
        </div>
        <div class="partida-campos">
          <input
            :value="metradoDe(p.codigo)?.cantidad ?? ''"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="0"
            @change="fijarMetrado(p, '1', 'cantidad', $event.target.value)"
          />
          <select :value="metradoDe(p.codigo)?.horaInicio ?? ''" @change="fijarMetrado(p, '1', 'horaInicio', $event.target.value)">
            <option value="">Inicio</option>
            <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
          </select>
          <select :value="metradoDe(p.codigo)?.horaFin ?? ''" @change="fijarMetrado(p, '1', 'horaFin', $event.target.value)">
            <option value="">Fin</option>
            <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
      </div>
    </section>

    <section class="tarjeta">
      <h2>2. Actividades críticas</h2>

      <div class="pestanas">
        <button
          v-for="t in TIPOS_ELEMENTO"
          :key="t.clave"
          type="button"
          class="pestana"
          :class="{ activa: tipoActivo === t.clave }"
          @click="tipoActivo = t.clave"
        >
          {{ t.etiqueta }}
        </button>
      </div>

      <div class="rejilla">
        <div class="campo">
          <label>Zona</label>
          <select v-model="nuevo.zona">
            <option value="">— Seleccionar —</option>
            <option v-for="z in zonas" :key="z" :value="z">{{ z }}</option>
          </select>
        </div>
        <div class="campo">
          <label>Sostenimiento</label>
          <select v-model="nuevo.sostenimiento">
            <option value="">— Seleccionar —</option>
            <option v-for="s in sostenimientos" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div v-if="opcionesPrefijo.length > 1" class="campo">
          <label>Prefijo</label>
          <select v-model="nuevo.prefijo">
            <option v-for="p in opcionesPrefijo" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div v-else-if="esManual" class="campo">
          <label>Código a mano</label>
          <input v-model="nuevo.prefijo" type="text" placeholder="Sin prefijo configurado" />
        </div>

        <template v-if="definicion.clave === 'malla'">
          <div class="campo">
            <label>Tipo de malla</label>
            <select v-model="nuevo.tipo">
              <option value="">— Seleccionar —</option>
              <option v-for="t in TIPOS_MALLA" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="campo"><label>Ancho (m)</label><input v-model="nuevo.ancho" type="number" step="0.01" inputmode="decimal" /></div>
          <div class="campo"><label>Largo (m)</label><input v-model="nuevo.largo" type="number" step="0.01" inputmode="decimal" /></div>
        </template>

        <template v-else>
          <div class="campo"><label>N° inicio</label><input v-model="nuevo.n1" type="number" min="1" inputmode="numeric" /></div>
          <div class="campo"><label>N° fin (opcional)</label><input v-model="nuevo.n2" type="number" min="1" inputmode="numeric" /></div>
          <div v-if="definicion.clave !== 'pull'" class="campo">
            <label>Longitud ({{ definicion.unidad }})</label>
            <input v-model="nuevo.cantidad" type="number" step="0.01" inputmode="decimal" />
          </div>
          <div v-if="definicion.clave === 'perf'" class="campo">
            <label>Tipo de perno</label>
            <select v-model="nuevo.tipo">
              <option value="">— Seleccionar —</option>
              <option v-for="t in TIPOS_PERNO" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div v-if="definicion.clave === 'perf'" class="campo">
            <label>Diámetro</label>
            <select v-model="nuevo.diametro">
              <option value="">— Seleccionar —</option>
              <option v-for="d in DIAMETROS_PERNO" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div v-if="definicion.clave === 'cable'" class="campo">
            <label>Tipo de cable</label>
            <select v-model="nuevo.tipo">
              <option value="">— Seleccionar —</option>
              <option v-for="t in TIPOS_CABLE" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div v-if="definicion.clave === 'perf' || definicion.clave === 'iny'" class="campo">
            <label>Ubicación</label>
            <select v-model="nuevo.ubicacion">
              <option value="">— Seleccionar —</option>
              <option v-for="u in UBICACIONES_ELEMENTO" :key="u" :value="u">{{ u }}</option>
            </select>
          </div>
        </template>

        <div class="campo">
          <label>Hora inicio</label>
          <select v-model="nuevo.horaInicio">
            <option value="">—</option>
            <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
        <div class="campo">
          <label>Hora fin</label>
          <select v-model="nuevo.horaFin">
            <option value="">—</option>
            <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
      </div>

      <button type="button" class="boton-secundario" style="margin-top: 0.6rem" @click="agregarElementos">
        Agregar {{ definicion.etiqueta.toLowerCase() }}
      </button>
      <p class="ayuda">Si pones N° inicio y N° fin se crea uno por cada número del rango (máximo {{ MAXIMO_RANGO }}).</p>

      <ul v-if="elementosDelTipo.length" class="lista-filas">
        <li v-for="e in elementosDelTipo" :key="e.id">
          <span><code>{{ e.codigo || '—' }}</code> — {{ e.cantidad }} {{ e.unidad }}{{ e.ubicacion ? ` · ${e.ubicacion}` : '' }}</span>
          <button type="button" class="quitar" aria-label="Quitar" @click="quitarElemento(e.id)">×</button>
        </li>
      </ul>

      <div v-if="resumenCriticas.length" class="resumen-criticas">
        <p v-for="g in resumenCriticas" :key="g.partida">
          <strong>{{ g.partida }}:</strong> {{ g.cantidad }} {{ g.unidad }} ({{ g.unidades }} un.)
        </p>
      </div>
    </section>

    <section class="tarjeta">
      <h2>3. Actividades complementarias</h2>
      <div v-for="p in partidasDe('3')" :key="p.codigo" class="partida">
        <div class="partida-nombre">
          <span>{{ p.nombre }}</span>
          <span class="unidad">{{ p.unidad }}</span>
        </div>
        <div class="partida-campos">
          <input
            :value="metradoDe(p.codigo)?.cantidad ?? ''"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="0"
            @change="fijarMetrado(p, '3', 'cantidad', $event.target.value)"
          />
          <select :value="metradoDe(p.codigo)?.horaInicio ?? ''" @change="fijarMetrado(p, '3', 'horaInicio', $event.target.value)">
            <option value="">Inicio</option>
            <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
          </select>
          <select :value="metradoDe(p.codigo)?.horaFin ?? ''" @change="fijarMetrado(p, '3', 'horaFin', $event.target.value)">
            <option value="">Fin</option>
            <option v-for="h in MEDIAS_HORAS" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
      </div>
    </section>

    <section class="tarjeta">
      <h2>Partidas libres</h2>
      <p class="ayuda">Para lo que se ejecutó y no está en los bloques.</p>
      <div class="rejilla">
        <div class="campo ancho"><label>Nombre</label><input v-model="nuevaLibre.nombre" type="text" /></div>
        <div class="campo">
          <label>Unidad</label>
          <select v-model="nuevaLibre.unidad">
            <option value="">—</option>
            <option v-for="u in UNIDADES" :key="u" :value="u">{{ u }}</option>
          </select>
        </div>
        <div class="campo"><label>Metrado</label><input v-model="nuevaLibre.cantidad" type="number" step="0.01" inputmode="decimal" /></div>
      </div>
      <button type="button" class="boton-secundario" style="margin-top: 0.5rem" @click="agregarLibre">Agregar partida</button>

      <ul v-if="libres.length" class="lista-filas">
        <li v-for="m in libres" :key="m.id">
          <span>{{ m.partidaNombre }} — {{ m.cantidad }} {{ m.unidad }}</span>
          <button type="button" class="quitar" aria-label="Quitar" @click="quitarLibre(m.id)">×</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
@import './formulario.css';

.aviso {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-card);
  font-size: 0.85rem;
  margin: 0 0 0.85rem;
}
.partida {
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--color-border);
}
.partida:last-child {
  border-bottom: none;
}
.partida-nombre {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
  color: var(--color-text);
}
.unidad {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-surface-2);
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-pill);
}
.partida-campos {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.4rem;
}
.partida-campos input,
.partida-campos select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.85rem;
  width: 100%;
}
.pestanas {
  display: flex;
  gap: 0.3rem;
  margin-bottom: 0.85rem;
  overflow-x: auto;
}
.pestana {
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.pestana.activa {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-ink);
}
code {
  font-family: ui-monospace, monospace;
}
.resumen-criticas {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.85rem;
}
.resumen-criticas p {
  margin: 0.2rem 0;
  color: var(--color-text-muted);
}
</style>

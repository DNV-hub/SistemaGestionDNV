<script setup>
import { computed, ref, watch } from 'vue'
import { useRdcStore } from '../store/rdc'
import { nuevoId } from '../services/rdcRepository'
import { DIAMETROS_PERNO, MEDIAS_HORAS, TIPOS_CABLE, TIPOS_MALLA, TIPOS_PERNO, UBICACIONES_ELEMENTO, UNIDADES } from '../services/rdcConstantes'

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

const prefijosDelFrente = computed(() => (rdc.catalogos?.prefijos ?? []).filter((p) => p.frente_id === reporte.value?.frenteId))
const zonas = computed(() => [...new Set(prefijosDelFrente.value.map((p) => p.zona))])
const sostenimientosDe = (zona) => {
  const lista = prefijosDelFrente.value.filter((p) => p.zona === zona).map((p) => p.sostenimiento)
  return lista.length ? lista : ['Manual']
}

// En el RDC original, cada una de las cinco sub-formas (Perforación, Inyección,
// Malla, Cable, Pull Test) es su propio acordeón con sus propios campos — no
// comparten estado entre sí. Acá se simula lo mismo: al cambiar de pestaña, el
// formulario se reinicia con los valores por defecto de esa actividad, en vez
// de arrastrar lo que había quedado tipeado en la anterior (que ni siquiera
// tendría las mismas opciones, p. ej. el "Tipo" de una malla no es un tipo de perno).
function formularioVacio(clave) {
  const zona = zonas.value[0] ?? ''
  return {
    zona,
    sostenimiento: sostenimientosDe(zona)[0] ?? 'Manual',
    prefijo: '',
    letra: '',
    codigo: '', // código manual de malla, distinto del prefijo
    n1: '',
    n2: '',
    cantidad: '', // longitud en ML (perf/iny/cable)
    ancho: '',
    largo: '',
    tipo: clave === 'perf' ? TIPOS_PERNO[0] : clave === 'malla' ? TIPOS_MALLA[0] : clave === 'cable' ? TIPOS_CABLE[0] : '',
    diametro: DIAMETROS_PERNO[0],
    diametroOtro: '',
    ubicacion: UBICACIONES_ELEMENTO[0],
    perforadora: 'Toku',
    horaInicio: '',
    horaFin: '',
  }
}

const nuevo = ref(formularioVacio('perf'))
watch(tipoActivo, (clave) => (nuevo.value = formularioVacio(clave)))

const filaPrefijo = computed(() =>
  prefijosDelFrente.value.find((p) => p.zona === nuevo.value.zona && p.sostenimiento === nuevo.value.sostenimiento),
)
// Una misma combinación puede admitir varios prefijos, separados por comas.
const opcionesPrefijo = computed(() => (filaPrefijo.value?.prefijo ?? '').split(',').map((x) => x.trim()).filter(Boolean))
const esManual = computed(() => !filaPrefijo.value || filaPrefijo.value.sostenimiento === 'Manual' || !opcionesPrefijo.value.length)
// Lo que se muestra en negrita junto a "Prefijo:" — el texto "Manual" cuando no
// hay ninguno configurado, o el prefijo resuelto cuando solo hay una opción (si
// hay varias, se elige de un select aparte, ver plantilla).
const prefijoMostrado = computed(() => (esManual.value ? 'Manual' : opcionesPrefijo.value.length === 1 ? opcionesPrefijo.value[0] : ''))

watch(opcionesPrefijo, (opciones) => {
  if (opciones.length === 1) nuevo.value.prefijo = opciones[0]
})

const areaMallaPreview = computed(() => {
  const a = Number(nuevo.value.ancho)
  const l = Number(nuevo.value.largo)
  return a > 0 && l > 0 ? (Math.round(a * l * 1000) / 1000).toFixed(3) : null
})

const MAXIMO_RANGO = 200

/** Arma el código de un elemento perf/iny/pull. Sin prefijo configurado, el
 * pull test cae a "P" + número (igual que el RDC original) y perf/iny quedan
 * con solo la letra + número, o vacío si tampoco hay letra. */
function codigoSecuencial(clave, prefijo, letra, numero) {
  if (clave === 'pull') return prefijo ? `${prefijo}${numero}` : `P${numero}`
  return prefijo ? `${prefijo}${letra}${numero}` : letra ? `${letra}${numero}` : ''
}

function agregarElementos() {
  const d = definicion.value
  const n = nuevo.value
  const prefijo = n.prefijo || ''
  const base = {
    elemento: d.elemento,
    actividad: d.actividad,
    unidad: d.unidad,
    zona: n.zona || null,
    sistema: n.sostenimiento || null,
    plano: !esManual.value ? filaPrefijo.value?.plano ?? null : null,
  }

  if (d.clave === 'malla') {
    const ancho = Number(n.ancho)
    const largo = Number(n.largo)
    if (!ancho || !largo) return
    const codigoManual = n.codigo.trim()
    reporte.value.elementos.push({
      ...base,
      id: nuevoId(),
      tipo: n.tipo || null,
      codigo: codigoManual || (prefijo ? `${prefijo}${reporte.value.elementos.length + 1}` : null),
      ubicacion: null,
      cantidad: Math.round(ancho * largo * 1000) / 1000,
      ancho,
      largo,
      diametro: null,
      tipoPerforadora: null,
      horaInicio: n.horaInicio || null,
      horaFin: n.horaFin || null,
      orden: reporte.value.elementos.length + 1,
    })
  } else if (d.clave === 'cable') {
    // Un cable no se cuenta pierna a pierna: N° inicio/fin nombran el TRAMO
    // (p. ej. "VM07-C1 → VM07-C5") y la longitud ingresada es la del tramo
    // completo — una sola fila, no una por número. Así se comporta el RDC
    // original y así se preserva la longitud real: repetirla por cada número
    // del rango la multiplicaría por la cantidad de números, no por la del cable.
    const desde = parseInt(n.n1)
    if (!desde) return
    const ml = Number(n.cantidad)
    if (!ml) return
    const hastaNum = parseInt(n.n2)
    const hasta = hastaNum >= desde ? hastaNum : desde
    const codigoInicio = prefijo ? `${prefijo}${desde}` : `C-${desde}`
    const codigoFin = hasta > desde ? (prefijo ? `${prefijo}${hasta}` : `C-${hasta}`) : ''
    reporte.value.elementos.push({
      ...base,
      id: nuevoId(),
      tipo: n.tipo || null,
      codigo: codigoFin ? `${codigoInicio} → ${codigoFin}` : codigoInicio,
      ubicacion: null,
      cantidad: ml,
      ancho: null,
      largo: null,
      diametro: null,
      tipoPerforadora: null,
      horaInicio: n.horaInicio || null,
      horaFin: n.horaFin || null,
      orden: reporte.value.elementos.length + 1,
    })
  } else {
    // perf / iny / pull: un elemento físico por número del rango.
    const desde = parseInt(n.n1)
    if (!desde) return
    const hastaNum = parseInt(n.n2)
    const hasta = hastaNum >= desde ? hastaNum : desde
    if (hasta - desde > MAXIMO_RANGO) return

    const cantidad = d.clave === 'pull' ? 1 : Number(n.cantidad)
    if (d.clave !== 'pull' && !cantidad) return

    const letra = (n.letra || '').toUpperCase()
    const diametroFinal = d.clave === 'perf' ? (n.diametro === '__otro__' ? `${n.diametroOtro}mm` : n.diametro) : null

    for (let i = desde; i <= hasta; i++) {
      reporte.value.elementos.push({
        ...base,
        id: nuevoId(),
        tipo: d.clave === 'perf' ? n.tipo || null : d.clave === 'pull' ? 'Ensayo' : null,
        codigo: codigoSecuencial(d.clave, prefijo, letra, i),
        ubicacion: n.ubicacion || null,
        cantidad,
        ancho: null,
        largo: null,
        diametro: diametroFinal,
        tipoPerforadora: d.clave === 'perf' ? n.perforadora || null : null,
        horaInicio: n.horaInicio || null,
        horaFin: n.horaFin || null,
        orden: reporte.value.elementos.length + 1,
      })
    }
  }

  // Se limpian los campos "de esta instancia" — cada elemento nuevo suele
  // tener su propia hora y su propio rango — pero se conservan zona, sost,
  // prefijo, tipo, diámetro, perforadora y ubicación: lo normal es cargar
  // varios elementos seguidos con esos mismos datos.
  Object.assign(nuevo.value, { n1: '', n2: '', cantidad: '', ancho: '', largo: '', codigo: '', letra: '', horaInicio: '', horaFin: '' })
  guardar()
}

function quitarElemento(id) {
  reporte.value.elementos = reporte.value.elementos.filter((e) => e.id !== id)
  guardar()
}

const elementosDelTipo = computed(() =>
  reporte.value.elementos.filter((e) => e.elemento === definicion.value.elemento && e.actividad === definicion.value.actividad),
)
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
        <p v-if="!reporte.frenteId" class="empty-msg">Selecciona primero el frente en la pestaña Datos.</p>

        <template v-else>
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
                  <option v-if="!zonas.length" value="">(sin zonas configuradas)</option>
                  <option v-for="z in zonas" :key="z" :value="z">{{ z || '(general)' }}</option>
                </select>
              </div>
              <div class="field">
                <label>Sostenimiento</label>
                <select v-model="nuevo.sostenimiento">
                  <option v-for="s in sostenimientosDe(nuevo.zona)" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
            </div>

            <div class="prefijo-row">
              <span class="prefijo-label">Prefijo:</span>
              <strong class="prefijo-valor">{{ prefijoMostrado || '—' }}</strong>
              <select v-if="opcionesPrefijo.length > 1" v-model="nuevo.prefijo" class="prefijo-select">
                <option v-for="p in opcionesPrefijo" :key="p" :value="p">{{ p }}</option>
              </select>
              <input v-else-if="esManual" v-model="nuevo.prefijo" type="text" class="prefijo-input" placeholder="Ej: VM07-" />
              <span class="prefijo-label" style="margin-left: 4px">Plano:</span>
              <span class="prefijo-plano">{{ !esManual ? filaPrefijo?.plano || '—' : '—' }}</span>
            </div>

            <!-- Tipo / Diámetro (solo perforación) -->
            <div v-if="definicion.clave === 'perf'" class="grid2">
              <div class="field">
                <label>Tipo</label>
                <select v-model="nuevo.tipo">
                  <option v-for="t in TIPOS_PERNO" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="field">
                <label>Diámetro</label>
                <select v-model="nuevo.diametro">
                  <option v-for="d in DIAMETROS_PERNO" :key="d" :value="d">{{ d }}</option>
                  <option value="__otro__">Otro</option>
                </select>
              </div>
            </div>
            <div v-if="definicion.clave === 'perf' && nuevo.diametro === '__otro__'" class="field">
              <label>Diámetro (mm)</label>
              <input v-model="nuevo.diametroOtro" type="number" min="1" inputmode="numeric" placeholder="41" />
            </div>

            <!-- Tipo de malla + Código -->
            <template v-if="definicion.clave === 'malla'">
              <div class="field">
                <label>Tipo de malla</label>
                <select v-model="nuevo.tipo">
                  <option v-for="t in TIPOS_MALLA" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="field">
                <label>Código</label>
                <input v-model="nuevo.codigo" type="text" class="mono" placeholder="Ej: M1" />
              </div>
            </template>

            <!-- Tipo de cable -->
            <div v-if="definicion.clave === 'cable'" class="field">
              <label>Tipo</label>
              <select v-model="nuevo.tipo">
                <option v-for="t in TIPOS_CABLE" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>

            <!-- Rango N° (todo menos malla) -->
            <div v-if="definicion.clave !== 'malla'" class="rango-n">
              <div class="field"><label>N° inicio</label><input v-model="nuevo.n1" type="number" min="1" step="1" inputmode="numeric" class="mono" /></div>
              <div class="flecha">→</div>
              <div class="field"><label>N° fin (opc)</label><input v-model="nuevo.n2" type="number" min="1" step="1" inputmode="numeric" class="mono" /></div>
            </div>

            <!-- Letra + Perforadora (perf) / Letra (iny) -->
            <div v-if="definicion.clave === 'perf'" class="grid2">
              <div class="field">
                <label>Letra (opcional)</label>
                <input v-model="nuevo.letra" type="text" maxlength="3" placeholder="Ej: R" class="mono mayus" />
              </div>
              <div class="field">
                <label>Perforadora</label>
                <div class="toggle-perforadora">
                  <button type="button" :class="{ activo: nuevo.perforadora === 'Toku' }" @click="nuevo.perforadora = 'Toku'">Toku</button>
                  <button type="button" :class="{ activo: nuevo.perforadora === 'Patín' }" @click="nuevo.perforadora = 'Patín'">Patín</button>
                </div>
              </div>
            </div>
            <div v-else-if="definicion.clave === 'iny'" class="field">
              <label>Letra (opcional) <span class="nota-inline">— para códigos tipo R3, R5, etc.</span></label>
              <input v-model="nuevo.letra" type="text" maxlength="3" placeholder="Ej: R" class="mono mayus" style="width: 72px" />
            </div>

            <!-- Longitud/Ubicación, Ancho×Largo, o solo Longitud (cable) -->
            <template v-if="definicion.clave === 'malla'">
              <div class="rango-n">
                <div class="field"><label>Ancho (m)</label><input v-model="nuevo.ancho" type="number" min="0" step="0.01" inputmode="decimal" /></div>
                <div class="flecha">×</div>
                <div class="field"><label>Largo (m)</label><input v-model="nuevo.largo" type="number" min="0" step="0.01" inputmode="decimal" /></div>
              </div>
              <div v-if="areaMallaPreview" class="area-preview">= <strong>{{ areaMallaPreview }}</strong> M2</div>
            </template>
            <div v-else-if="definicion.clave === 'perf' || definicion.clave === 'iny'" class="grid2">
              <div class="field"><label>Longitud (ML)</label><input v-model="nuevo.cantidad" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /></div>
              <div class="field">
                <label>Ubicación</label>
                <select v-model="nuevo.ubicacion">
                  <option v-for="u in UBICACIONES_ELEMENTO" :key="u" :value="u">{{ u }}</option>
                </select>
              </div>
            </div>
            <div v-else-if="definicion.clave === 'cable'" class="field">
              <label>Longitud (ML)</label>
              <input v-model="nuevo.cantidad" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />
            </div>

            <!-- Pull Test no lleva tipo, diámetro, letra, longitud ni ubicación —
                 solo el prefijo (arriba) y el rango N° (arriba también). -->

            <div class="grid2">
              <div class="field"><label>Hora inicio</label><input v-model="nuevo.horaInicio" type="time" /></div>
              <div class="field"><label>Hora fin</label><input v-model="nuevo.horaFin" type="time" /></div>
            </div>

            <button type="button" class="ctrl-add-btn" style="width: 100%" @click="agregarElementos"><i class="ti ti-plus" /> Agregar</button>
          </div>

          <table v-if="elementosDelTipo.length" class="ctrl-table">
            <thead>
              <tr>
                <th>Código</th>
                <th v-if="definicion.clave === 'perf'">Tipo/Ø</th>
                <th v-if="definicion.clave === 'malla'">Tipo malla</th>
                <th style="text-align: right">Cant.</th>
                <th v-if="conUbicacion">Ubic.</th>
                <th style="width: 28px" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in elementosDelTipo" :key="e.id">
                <td class="mono">{{ e.codigo || '—' }}</td>
                <td v-if="definicion.clave === 'perf'">{{ [e.tipo, e.diametro].filter(Boolean).join(' ') || '—' }}</td>
                <td v-if="definicion.clave === 'malla'">{{ e.tipo || '—' }}</td>
                <td style="text-align: right">{{ e.cantidad }} {{ e.unidad }}</td>
                <td v-if="conUbicacion">{{ e.ubicacion || '—' }}</td>
                <td style="text-align: center">
                  <button type="button" class="del-btn" aria-label="Eliminar" @click="quitarElemento(e.id)"><i class="ti ti-x" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
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

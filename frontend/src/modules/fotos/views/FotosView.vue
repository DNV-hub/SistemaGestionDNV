<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '../../../store/auth'
import { useRdcStore } from '../../rdc/store/rdc'
import { useFotosStore } from '../store/fotos'
import { useSketchesStore } from '../../sketches/store/sketches'
import { etiquetaDesdeNombre } from '../../sketches/services/sketchesService'
import { ENVIO } from '../services/fotosDb'
import VisorImagen from '../components/VisorImagen.vue'
import { useEsMovil } from '../../../composables/useEsMovil'

const auth = useAuthStore()
const esMovil = useEsMovil()
// Acordeones de Redline y Sketch en celular (cerrados hasta que se usan).
const abierto = ref({ red: false, ske: false })
const alternar = (k) => (abierto.value[k] = !abierto.value[k])
const rdc = useRdcStore()
const fotos = useFotosStore()
const sketches = useSketchesStore()

const nombreSupervisor = computed(() => {
  const supervisor = (rdc.catalogos?.supervisores ?? []).find((s) => s.usuario_id === auth.perfil?.id)
  return supervisor?.nombre ?? auth.perfil?.nombre ?? '—'
})
// El frente ya no se elige acá: es el que está seleccionado en el Reporte
// diario (rdc.frenteActualId), así las fotos y el reporte siempre van al
// mismo frente.
const nombreFrente = computed(() => rdc.frenteActual?.nombre ?? '')
watch(
  () => rdc.frenteActualId,
  (id) => {
    fotos.frenteId = id ?? null
  },
  { immediate: true },
)

onMounted(() => Promise.all([fotos.iniciar(), sketches.iniciar()]))
const fechaAnterior = ref(null) // fecha elegida en la fila ANTERIOR (null = la más reciente)
// Los "últimos planos" siguen al frente elegido arriba (antes eran dos
// pantallas con su propio selector de frente).
watch(
  () => fotos.frenteId,
  (id) => {
    if (id !== sketches.frenteId) sketches.elegirFrente(id)
    fechaAnterior.value = null
  },
  { immediate: true },
)

// --- Vista: Subir | Historial -------------------------------------------
const vista = ref('subir')
const hoyIso = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const esHoy = computed(() => !fotos.fecha || fotos.fecha === hoyIso)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
function diaMes(iso) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[m - 1]}`
}
function fechaCompleta(iso) {
  return iso ? iso.split('-').reverse().join('/') : ''
}

// --- Selección de archivos ----------------------------------------------
const inputsFile = {}
const fijarInputRef = (clave) => (el) => {
  inputsFile[clave] = el
}
const abrirSelector = (clave) => inputsFile[clave]?.click()

async function alSeleccionar(tipo, event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  await fotos.agregarFotos(tipo, files)
}

const contador = (tipo) => fotos.seleccion[tipo].length
const TIPOS_SKETCH = { sketch_perf: 'Perforación', sketch_iny: 'Inyección', sketch_malla: 'Malla' }
const sketchTotal = computed(() => Object.keys(TIPOS_SKETCH).reduce((s, k) => s + contador(k), 0))
const charlaLista = computed(() => contador('diarias') > 0)

// --- Planos anteriores (sketch) -------------------------------------------
// La fecha va dentro del nombre del archivo: Sketch_<frente>_<AAAA-MM-DD>_…
function fechaDeNombre(nombre) {
  return /(\d{4}-\d{2}-\d{2})/.exec(nombre ?? '')?.[1] ?? null
}
const sketchesPorFecha = computed(() => {
  const mapa = new Map()
  for (const s of sketches.fotos) {
    const f = fechaDeNombre(s.nombre) ?? 'sin-fecha'
    if (!mapa.has(f)) mapa.set(f, [])
    mapa.get(f).push(s)
  }
  return mapa
})
const fechasAnteriores = computed(() =>
  [...sketchesPorFecha.value.keys()].filter((f) => f !== 'sin-fecha').sort().reverse().slice(0, 6),
)
const fechaAnteriorActiva = computed(() => fechaAnterior.value ?? fechasAnteriores.value[0] ?? null)
const sketchesDeLaFecha = computed(() => sketchesPorFecha.value.get(fechaAnteriorActiva.value) ?? [])

// --- Visor ----------------------------------------------------------------
const visorFotos = ref([])
const visorIndice = ref(null)
function abrirVisor(lista, idx) {
  visorFotos.value = lista
  visorIndice.value = idx
}

// --- Envío ----------------------------------------------------------------
const enviando = ref(false)
const error = ref('')
const exito = ref(false)

async function alEnviar() {
  error.value = ''
  exito.value = false
  enviando.value = true
  try {
    await fotos.enviar()
    exito.value = true
  } catch (e) {
    error.value = e.message ?? String(e)
  } finally {
    enviando.value = false
  }
}

function detalleEnvio(e) {
  const parte = e.estado === ENVIO.ENVIADO ? 'enviado' : e.estado === ENVIO.ERROR ? `error — ${e.error ?? 'sin detalle'}` : 'pendiente'
  return `${e.etiqueta}: ${parte}`
}

// --- Historial: lo ya enviado de este frente, agrupado por día -----------
const enviosPorDia = computed(() => {
  const grupos = new Map()
  for (const e of fotos.envios) {
    // Cada supervisor ve solo lo que envió él: el envío guarda el nombre de
    // quien lo tomó (el mismo que se calcula al enviar), así que si otra
    // cuenta usó este mismo navegador, sus fotos no se mezclan.
    if (e.nombre !== nombreSupervisor.value) continue
    if (fotos.frenteId && e.frenteId !== fotos.frenteId) continue
    if (!grupos.has(e.fecha)) grupos.set(e.fecha, [])
    grupos.get(e.fecha).push(e)
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, envios]) => {
      const imagenes = envios.flatMap((e) =>
        (e.fotos ?? []).map((f) => ({ nombre: f.nombreArchivo, contenidoArchivo: f.contenidoArchivo, titulo: detalleEnvio(e) })),
      )
      return {
        fecha,
        etiqueta: `${fecha === hoyIso ? 'HOY · ' : ''}${diaMes(fecha).toUpperCase()}`,
        imagenes,
        pendientes: envios.filter((e) => e.estado !== ENVIO.ENVIADO).length,
      }
    })
})
</script>

<template>
  <div class="fs">
    <main v-if="!esMovil">
      <header class="cab">
        <div>
          <h1>Fotos y sketch</h1>
          <div class="sub">{{ nombreFrente || 'Sin frente' }} · fotos, redline y sketch de avance en un solo envío</div>
        </div>
      </header>

      <div class="barra">
        <div class="barra-izq">
          <span class="chip on frente-fijo" title="Es el frente elegido en el Reporte diario">{{ nombreFrente || 'Sin frente' }}</span>
          <router-link v-if="!nombreFrente" to="/rdc" class="gh">Elegir en el Reporte diario</router-link>
          <label class="fecha-lbl">Fecha<input v-model="fotos.fecha" type="date" class="campo" :max="hoyIso" /></label>
        </div>
        <div class="seg" role="group" aria-label="Vista">
          <button type="button" class="chip" :class="{ on: vista === 'subir' }" :aria-pressed="vista === 'subir'" @click="vista = 'subir'">{{ esHoy ? 'Subir hoy' : 'Subir' }}</button>
          <button type="button" class="chip" :class="{ on: vista === 'historial' }" :aria-pressed="vista === 'historial'" @click="vista = 'historial'">Historial</button>
        </div>
      </div>

      <div v-if="fotos.hayPendientes" class="aviso-amb">
        <span>Hay fotos esperando salir. Se enviarán solas en cuanto haya señal.</span>
        <button type="button" class="gh" @click="fotos.sincronizarAhora()">Reintentar ahora</button>
      </div>

      <!-- ===================== SUBIR ===================== -->
      <div v-if="vista === 'subir'" class="subir">
        <div class="col-izq">
          <!-- FOTOS DEL DÍA -->
          <section class="sc">
            <div class="sc-cab">
              <div class="sc-tit">
                <span class="ic" style="background: rgba(246, 168, 0, 0.16); color: #f6a800">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" /></svg>
                </span>
                <div>
                  <div class="t16">Fotos del día</div>
                  <div class="t13">Se etiquetan solas con el frente y la fecha</div>
                </div>
              </div>
              <div class="sc-acc">
                <input :ref="fijarInputRef('diarias')" type="file" accept="image/*" multiple hidden @change="alSeleccionar('diarias', $event)" />
                <input :ref="fijarInputRef('diarias_cam')" type="file" accept="image/*" capture="environment" hidden @change="alSeleccionar('diarias', $event)" />
                <button type="button" class="gh" @click="abrirSelector('diarias')">Galería</button>
                <button type="button" class="cta chico" @click="abrirSelector('diarias_cam')">Tomar foto</button>
              </div>
            </div>
            <div class="warn"><span aria-hidden="true">●</span>Obligatorio: una foto debe ser del inicio de la charla de seguridad</div>
            <div class="miniaturas">
              <div v-for="f in fotos.seleccion.diarias" :key="f.id" class="miniatura">
                <img :src="f.previewUrl" alt="" />
                <button type="button" aria-label="Quitar" @click="fotos.quitarFoto('diarias', f.id)">×</button>
              </div>
              <button type="button" class="anadir" @click="abrirSelector('diarias')">+ Añadir</button>
            </div>
          </section>

          <!-- REDLINE -->
          <section class="sc">
            <div class="sc-tit">
              <span class="ic" style="background: rgba(217, 45, 32, 0.16); color: #d92d20">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3" /></svg>
              </span>
              <div>
                <div class="t16">Redline</div>
                <div class="t13">Opcional · plano con las correcciones en rojo</div>
              </div>
            </div>
            <div class="zona-subida">
              <input :ref="fijarInputRef('redline')" type="file" accept="image/*" multiple hidden @change="alSeleccionar('redline', $event)" />
              <span>Sube el redline del <b>{{ fechaCompleta(fotos.fecha || hoyIso) }}</b></span>
              <button type="button" class="gh" @click="abrirSelector('redline')">Subir archivo</button>
            </div>
            <div v-if="fotos.seleccion.redline.length" class="miniaturas">
              <div v-for="f in fotos.seleccion.redline" :key="f.id" class="miniatura">
                <img :src="f.previewUrl" alt="" />
                <button type="button" aria-label="Quitar" @click="fotos.quitarFoto('redline', f.id)">×</button>
              </div>
            </div>
          </section>

          <!-- SKETCH DE AVANCE -->
          <section class="sc">
            <div class="sc-tit">
              <span class="ic" style="background: rgba(34, 160, 91, 0.16); color: #22a05b">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3" /></svg>
              </span>
              <div>
                <div class="t16">Sketch de avance</div>
                <div class="t13">Opcional · compara con el avance anterior</div>
              </div>
            </div>
            <div class="anteriores">
              <span class="lab">ANTERIOR</span>
              <button v-for="f in fechasAnteriores" :key="f" type="button" class="chip" :class="{ on: f === fechaAnteriorActiva }" @click="fechaAnterior = f">{{ diaMes(f) }}</button>
              <span v-if="!fechasAnteriores.length" class="t13" style="margin: 0">{{ sketches.cargando ? 'Cargando…' : 'Sin sketches anteriores' }}</span>
            </div>
            <div class="par">
              <div class="ph prev">
                <button v-if="sketchesDeLaFecha.length" type="button" class="ph-img" @click="abrirVisor(sketchesDeLaFecha, 0)">
                  <img :src="`data:image/jpeg;base64,${sketchesDeLaFecha[0].contenidoArchivo}`" :alt="sketchesDeLaFecha[0].nombre || ''" />
                  <span v-if="sketchesDeLaFecha.length > 1" class="ph-mas">+{{ sketchesDeLaFecha.length - 1 }}</span>
                </button>
                <span v-else-if="fechaAnteriorActiva">Sketch de avance del <b>{{ diaMes(fechaAnteriorActiva) }}</b></span>
                <span v-else>Aún no hay sketches de este frente</span>
              </div>
              <div class="ph up">
                <span>Sube el sketch de avance del <b>{{ fechaCompleta(fotos.fecha || hoyIso) }}</b></span>
                <div class="tipos">
                  <template v-for="(t, clave) in TIPOS_SKETCH" :key="clave">
                    <input :ref="fijarInputRef(clave)" type="file" accept="image/*" multiple hidden @change="alSeleccionar(clave, $event)" />
                    <button type="button" class="gh" :class="{ con: contador(clave) }" @click="abrirSelector(clave)">{{ t }}<b v-if="contador(clave)">{{ contador(clave) }}</b></button>
                  </template>
                </div>
              </div>
            </div>
            <div v-if="sketchTotal" class="miniaturas chicas">
              <template v-for="(t, clave) in TIPOS_SKETCH" :key="clave">
                <div v-for="f in fotos.seleccion[clave]" :key="f.id" class="miniatura" :title="t">
                  <img :src="f.previewUrl" alt="" />
                  <button type="button" aria-label="Quitar" @click="fotos.quitarFoto(clave, f.id)">×</button>
                </div>
              </template>
            </div>
          </section>
        </div>

        <!-- RESUMEN -->
        <aside class="sc resumen">
          <div class="lab grande">RESUMEN DEL ENVÍO</div>
          <div class="res-quien">
            {{ nombreFrente || '—' }} · {{ nombreSupervisor }}<br />
            <span class="mu">{{ fechaCompleta(fotos.fecha || hoyIso) }}</span>
          </div>
          <div class="res-filas">
            <div class="res-fila"><span>Fotos</span><span>{{ contador('diarias') }}</span></div>
            <div class="res-fila">
              <span>Charla de seguridad</span>
              <span :style="{ color: charlaLista ? '#22a05b' : '#d92d20' }">{{ charlaLista ? 'Listo' : 'Falta' }}</span>
            </div>
            <div class="res-fila"><span>Redline</span><span :class="{ mu: !contador('redline') }" :style="contador('redline') ? 'color:#22a05b' : null">{{ contador('redline') ? 'Listo' : 'Opcional' }}</span></div>
            <div class="res-fila"><span>Sketch de avance</span><span :class="{ mu: !sketchTotal }" :style="sketchTotal ? 'color:#22a05b' : null">{{ sketchTotal ? 'Listo' : 'Opcional' }}</span></div>
          </div>
          <div v-if="error" class="warn"><span>{{ error }}</span></div>
          <div v-if="exito" class="ok"><span>Fotos enviadas correctamente.</span></div>
          <button type="button" class="cta" :disabled="enviando || !fotos.totalSeleccionadas" @click="alEnviar">{{ enviando ? 'Enviando…' : 'Enviar fotos' }}</button>
        </aside>
      </div>

      <!-- ===================== HISTORIAL ===================== -->
      <div v-else class="historial">
        <section class="sc">
          <div class="lab grande">ÚLTIMOS PLANOS · {{ nombreFrente || '—' }}</div>
          <p v-if="!fotos.frenteId" class="t13">Elige el frente en el Reporte diario para ver sus sketches.</p>
          <p v-else-if="sketches.cargando" class="t13">Cargando sketches anteriores…</p>
          <p v-else-if="sketches.error" class="warn">{{ sketches.error }}</p>
          <p v-else-if="!sketches.fotos.length" class="t13">Aún no hay sketches registrados para este frente.</p>
          <template v-else>
            <div class="anteriores">
              <button v-for="f in fechasAnteriores" :key="f" type="button" class="chip" :class="{ on: f === fechaAnteriorActiva }" @click="fechaAnterior = f">{{ diaMes(f) }}</button>
            </div>
            <div class="grid-sk">
              <div v-for="(s, idx) in sketchesDeLaFecha.length ? sketchesDeLaFecha : sketches.fotos" :key="idx" class="sk-item">
                <button type="button" class="sk-thumb" @click="abrirVisor(sketchesDeLaFecha.length ? sketchesDeLaFecha : sketches.fotos, idx)">
                  <img :src="`data:image/jpeg;base64,${s.contenidoArchivo}`" :alt="s.nombre || ''" />
                </button>
                <div v-if="etiquetaDesdeNombre(s.nombre)" class="sk-et">{{ etiquetaDesdeNombre(s.nombre) }}</div>
              </div>
            </div>
            <div v-if="sketches.hayMas" style="text-align: center">
              <button type="button" class="gh" :disabled="sketches.cargandoMas" @click="sketches.cargarMas()">{{ sketches.cargandoMas ? 'Cargando…' : 'Ver más antiguos' }}</button>
            </div>
          </template>
        </section>

        <section v-for="g in enviosPorDia" :key="g.fecha" class="dia">
          <div class="lab grande">
            {{ g.etiqueta }}
            <span class="mu suave">· {{ g.imagenes.length }} foto{{ g.imagenes.length === 1 ? '' : 's' }}<template v-if="g.pendientes"> · {{ g.pendientes }} por enviar</template></span>
          </div>
          <div class="grid-fotos">
            <button v-for="(im, i) in g.imagenes" :key="i" type="button" class="foto" :title="im.titulo" @click="abrirVisor(g.imagenes, i)">
              <img :src="`data:image/jpeg;base64,${im.contenidoArchivo}`" alt="" />
            </button>
          </div>
        </section>
        <p v-if="!enviosPorDia.length" class="t13">Todavía no enviaste fotos desde este dispositivo.</p>
      </div>
    </main>

    <!-- ===================== Celular ===================== -->
    <main v-else class="fm">
      <header class="fm-top">
        <div class="fm-tit">
          <h1>Fotos y sketch</h1>
          <div class="fm-sub">{{ nombreFrente || 'Sin frente' }}</div>
        </div>
      </header>

      <div class="fm-chips">
        <span class="chip on frente-fijo">{{ nombreFrente || 'Sin frente' }}</span>
        <router-link v-if="!nombreFrente" to="/rdc" class="chip">Elegir en Reporte</router-link>
      </div>
      <div class="fm-fila">
        <input v-model="fotos.fecha" type="date" class="fm-fecha" :max="hoyIso" aria-label="Fecha" />
        <div class="fm-seg" role="group" aria-label="Vista">
          <button type="button" class="chip" :class="{ on: vista === 'subir' }" @click="vista = 'subir'">{{ esHoy ? 'Subir' : 'Subir' }}</button>
          <button type="button" class="chip" :class="{ on: vista === 'historial' }" @click="vista = 'historial'">Historial</button>
        </div>
      </div>

      <div v-if="fotos.hayPendientes" class="aviso-amb" style="margin-bottom: 10px">
        <span>Hay fotos esperando salir.</span>
        <button type="button" class="gh" @click="fotos.sincronizarAhora()">Reintentar</button>
      </div>

      <!-- SUBIR -->
      <template v-if="vista === 'subir'">
        <div class="fm-col">
          <section class="sc fm-card">
            <div class="fm-sp">
              <div class="sc-tit">
                <span class="ic" style="background: rgba(246, 168, 0, 0.16); color: #f6a800">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" /></svg>
                </span>
                <div>
                  <b class="fm-b">Fotos del día</b>
                  <div class="fm-s">{{ contador('diarias') }} foto{{ contador('diarias') === 1 ? '' : 's' }}</div>
                </div>
              </div>
              <div class="fm-acc">
                <input :ref="fijarInputRef('diarias')" type="file" accept="image/*" multiple hidden @change="alSeleccionar('diarias', $event)" />
                <input :ref="fijarInputRef('diarias_cam')" type="file" accept="image/*" capture="environment" hidden @change="alSeleccionar('diarias', $event)" />
                <button type="button" class="gh fm-btn" @click="abrirSelector('diarias')">Galería</button>
                <button type="button" class="cta fm-btn" @click="abrirSelector('diarias_cam')">Foto</button>
              </div>
            </div>
            <div class="fm-charla" :class="charlaLista ? 'ok' : 'falta'">{{ charlaLista ? '✓ Charla de seguridad cargada' : '● Falta la foto de la charla de seguridad' }}</div>
            <div class="fm-carrusel">
              <div v-for="f in fotos.seleccion.diarias" :key="f.id" class="miniatura fm-mini">
                <img :src="f.previewUrl" alt="" />
                <button type="button" aria-label="Quitar" @click="fotos.quitarFoto('diarias', f.id)">×</button>
              </div>
              <button type="button" class="anadir fm-mini" aria-label="Añadir foto" @click="abrirSelector('diarias')">+</button>
            </div>
          </section>

          <!-- Redline -->
          <section class="fm-acord">
            <button type="button" class="fm-acord-h" :aria-expanded="abierto.red" @click="alternar('red')">
              <span class="ic" style="background: rgba(217, 45, 32, 0.16); color: #d92d20; width: 36px; height: 36px">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3" /></svg>
              </span>
              <span class="fm-acord-t"><b>Redline</b><span>Opcional · correcciones en rojo</span></span>
              <span class="fm-pill" :class="{ ok: contador('redline') }">{{ contador('redline') ? 'Cargado' : 'Sin cargar' }}</span>
              <span class="fm-chev" :class="{ abierto: abierto.red }" aria-hidden="true">⌄</span>
            </button>
            <div v-if="abierto.red" class="fm-acord-b">
              <input :ref="fijarInputRef('redline')" type="file" accept="image/*" multiple hidden @change="alSeleccionar('redline', $event)" />
              <div class="zona-subida">
                <span>Sube el redline del <b>{{ fechaCompleta(fotos.fecha || hoyIso) }}</b></span>
                <button type="button" class="gh fm-btn" @click="abrirSelector('redline')">Subir archivo</button>
              </div>
              <div v-if="fotos.seleccion.redline.length" class="fm-carrusel">
                <div v-for="f in fotos.seleccion.redline" :key="f.id" class="miniatura fm-mini">
                  <img :src="f.previewUrl" alt="" />
                  <button type="button" aria-label="Quitar" @click="fotos.quitarFoto('redline', f.id)">×</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Sketch -->
          <section class="fm-acord">
            <button type="button" class="fm-acord-h" :aria-expanded="abierto.ske" @click="alternar('ske')">
              <span class="ic" style="background: rgba(34, 160, 91, 0.16); color: #22a05b; width: 36px; height: 36px">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3" /></svg>
              </span>
              <span class="fm-acord-t"><b>Sketch de avance</b><span>Opcional · compara con el anterior</span></span>
              <span class="fm-pill" :class="{ ok: sketchTotal }">{{ sketchTotal ? 'Cargado' : 'Sin cargar' }}</span>
              <span class="fm-chev" :class="{ abierto: abierto.ske }" aria-hidden="true">⌄</span>
            </button>
            <div v-if="abierto.ske" class="fm-acord-b">
              <div class="fm-ant">
                <span class="lab">ANTERIOR</span>
                <button v-for="f in fechasAnteriores" :key="f" type="button" class="chip" :class="{ on: f === fechaAnteriorActiva }" @click="fechaAnterior = f">{{ diaMes(f) }}</button>
                <span v-if="!fechasAnteriores.length" class="fm-s">{{ sketches.cargando ? 'Cargando…' : 'Sin sketches anteriores' }}</span>
              </div>
              <div class="fm-par">
                <div class="ph prev fm-ph">
                  <button v-if="sketchesDeLaFecha.length" type="button" class="ph-img" @click="abrirVisor(sketchesDeLaFecha, 0)">
                    <img :src="`data:image/jpeg;base64,${sketchesDeLaFecha[0].contenidoArchivo}`" :alt="sketchesDeLaFecha[0].nombre || ''" />
                    <span v-if="sketchesDeLaFecha.length > 1" class="ph-mas">+{{ sketchesDeLaFecha.length - 1 }}</span>
                  </button>
                  <span v-else>Sin sketch anterior</span>
                </div>
                <div class="ph up fm-ph">
                  <span>Sketch del <b>{{ fechaCompleta(fotos.fecha || hoyIso) }}</b></span>
                  <div class="tipos">
                    <template v-for="(t, clave) in TIPOS_SKETCH" :key="clave">
                      <input :ref="fijarInputRef(clave)" type="file" accept="image/*" multiple hidden @change="alSeleccionar(clave, $event)" />
                      <button type="button" class="gh fm-btn" :class="{ con: contador(clave) }" @click="abrirSelector(clave)">{{ t }}<b v-if="contador(clave)">{{ contador(clave) }}</b></button>
                    </template>
                  </div>
                </div>
              </div>
              <div v-if="sketchTotal" class="fm-carrusel">
                <template v-for="(t, clave) in TIPOS_SKETCH" :key="clave">
                  <div v-for="f in fotos.seleccion[clave]" :key="f.id" class="miniatura fm-mini" :title="t">
                    <img :src="f.previewUrl" alt="" />
                    <button type="button" aria-label="Quitar" @click="fotos.quitarFoto(clave, f.id)">×</button>
                  </div>
                </template>
              </div>
            </div>
          </section>
        </div>

        <!-- Barra fija de envío, sobre la barra inferior -->
        <div class="fm-barra">
          <div class="fm-barra-t">
            <b>{{ contador('diarias') }} foto{{ contador('diarias') === 1 ? '' : 's' }}</b>
            <div :class="error ? 'rojo' : charlaLista ? 'verde' : 'rojo'">{{ error || (exito ? 'Fotos enviadas' : charlaLista ? 'Listo para enviar' : 'Falta la charla de seguridad') }}</div>
          </div>
          <button type="button" class="cta fm-enviar" :style="{ opacity: charlaLista ? 1 : 0.55 }" :disabled="enviando || !fotos.totalSeleccionadas" @click="alEnviar">{{ enviando ? 'Enviando…' : 'Enviar fotos' }}</button>
        </div>
      </template>

      <!-- HISTORIAL -->
      <template v-else>
        <section class="sc fm-card">
          <div class="lab">ÚLTIMOS PLANOS</div>
          <p v-if="!fotos.frenteId" class="fm-s">Elige el frente en el Reporte diario.</p>
          <p v-else-if="sketches.cargando" class="fm-s">Cargando sketches anteriores…</p>
          <p v-else-if="!sketches.fotos.length" class="fm-s">Aún no hay sketches de este frente.</p>
          <template v-else>
            <div class="fm-ant">
              <button v-for="f in fechasAnteriores" :key="f" type="button" class="chip" :class="{ on: f === fechaAnteriorActiva }" @click="fechaAnterior = f">{{ diaMes(f) }}</button>
            </div>
            <div class="fm-ph16">
              <button v-if="sketchesDeLaFecha[0]" type="button" class="ph-img" @click="abrirVisor(sketchesDeLaFecha, 0)">
                <img :src="`data:image/jpeg;base64,${sketchesDeLaFecha[0].contenidoArchivo}`" :alt="sketchesDeLaFecha[0].nombre || ''" />
              </button>
            </div>
            <div v-if="sketches.hayMas" style="text-align: center">
              <button type="button" class="gh fm-btn" :disabled="sketches.cargandoMas" @click="sketches.cargarMas()">{{ sketches.cargandoMas ? 'Cargando…' : 'Ver más antiguos' }}</button>
            </div>
          </template>
        </section>
        <section v-for="g in enviosPorDia" :key="g.fecha" class="fm-dia">
          <div class="lab">{{ g.etiqueta }} · {{ g.imagenes.length }} FOTO{{ g.imagenes.length === 1 ? '' : 'S' }}</div>
          <div class="fm-grid3">
            <button v-for="(im, i) in g.imagenes" :key="i" type="button" class="foto" :title="im.titulo" @click="abrirVisor(g.imagenes, i)">
              <img :src="`data:image/jpeg;base64,${im.contenidoArchivo}`" alt="" />
            </button>
          </div>
        </section>
        <p v-if="!enviosPorDia.length" class="fm-s">Todavía no enviaste fotos desde este dispositivo.</p>
      </template>
    </main>

    <VisorImagen :fotos="visorFotos" :indice="visorIndice" @cerrar="visorIndice = null" />
  </div>
</template>

<style scoped>
.fs {
  --sf: var(--color-surface);
  --so: var(--color-surface-2);
  --ln: var(--color-border);
  --tx: var(--color-text);
  --mu: var(--color-text-muted);
  color: var(--tx);
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.fs * {
  box-sizing: border-box;
}
.fs button,
.fs input,
.fs select {
  font-family: inherit;
}
.fs button {
  cursor: pointer;
}
.fs :focus-visible {
  outline: 2px solid #f6a800;
  outline-offset: 2px;
}
main {
  width: 100%;
  max-width: 1800px;
  padding: 32px 40px 56px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.sub {
  font-size: 14px;
  color: var(--mu);
  font-weight: 500;
  margin-top: 4px;
}
.mu {
  color: var(--mu);
}
.mu.suave {
  font-weight: 600;
  letter-spacing: 0;
}

/* Barra superior */
.barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
}
.barra-izq {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  border: 0;
  background: var(--so);
  color: var(--mu);
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.chip.on {
  background: var(--tx);
  color: var(--color-bg);
}
.frente-fijo {
  display: inline-flex;
  align-items: center;
  cursor: default;
}
.seg {
  display: flex;
  gap: 4px;
  background: var(--so);
  padding: 4px;
  border-radius: 14px;
}
.seg .chip {
  background: transparent;
}
.seg .chip.on {
  background: var(--tx);
  color: var(--color-bg);
}
.fecha-lbl {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--mu);
}
.campo {
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: var(--sf);
  color: var(--tx);
  padding: 0 12px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 0 0 1px var(--ln);
  color-scheme: dark;
}
:root[data-theme='light'] .campo {
  color-scheme: light;
}

/* Botones */
.gh {
  border: 0;
  background: var(--sf);
  color: var(--mu);
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 0 0 1px var(--ln);
  white-space: nowrap;
}
.gh:hover {
  color: var(--tx);
}
.gh.con {
  color: #22a05b;
  box-shadow: 0 0 0 1px #22a05b;
}
.gh b {
  font-size: 11px;
}
.cta {
  border: 0;
  background: #f6a800;
  color: #111;
  font-size: 15px;
  font-weight: 800;
  height: 44px;
  padding: 0 20px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}
.cta:hover {
  background: #e59a00;
}
.cta:disabled {
  background: var(--so);
  color: var(--mu);
  cursor: not-allowed;
}
.cta.chico {
  height: 40px;
  font-size: 14px;
}

/* Avisos */
.aviso-amb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  padding: 10px 14px;
  background: rgba(246, 168, 0, 0.12);
  color: #d98e00;
  font-size: 13px;
  font-weight: 700;
}
.warn {
  display: flex;
  gap: 10px;
  border-radius: 12px;
  padding: 10px 14px;
  background: rgba(217, 45, 32, 0.1);
  color: #d92d20;
  font-size: 13px;
  font-weight: 700;
}
.ok {
  border-radius: 12px;
  padding: 10px 14px;
  background: rgba(34, 160, 91, 0.12);
  color: #22a05b;
  font-size: 13px;
  font-weight: 700;
}

/* Tarjetas */
.subir {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
.col-izq {
  flex: 999 1 520px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.sc {
  background: var(--sf);
  border-radius: 20px;
  box-shadow: 0 0 0 1px var(--ln);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sc-cab {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sc-tit {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sc-acc {
  display: flex;
  gap: 10px;
}
.ic {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.t16 {
  font-size: 16px;
  font-weight: 800;
}
.t13 {
  font-size: 13px;
  color: var(--mu);
  font-weight: 500;
  margin: 2px 0 0;
}
.lab {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--mu);
}
.lab.grande {
  font-size: 13px;
}

/* Miniaturas */
.miniaturas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}
.miniaturas.chicas {
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
}
.miniatura {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--so);
}
.miniatura img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.miniatura button {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: rgb(17 24 39 / 0.65);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}
.anadir {
  border-radius: 14px;
  border: 1.5px dashed var(--ln);
  background: transparent;
  color: var(--mu);
  font-size: 12px;
  font-weight: 700;
  aspect-ratio: 4 / 3;
}
.zona-subida {
  border-radius: 14px;
  border: 1.5px dashed var(--ln);
  padding: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--mu);
  font-size: 13px;
  font-weight: 600;
}
.zona-subida b {
  color: var(--tx);
}

/* Planos anteriores */
.anteriores {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.anteriores .lab {
  margin-right: 4px;
}
.par {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.ph {
  border-radius: 14px;
  background: var(--so);
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mu);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  padding: 8px;
  position: relative;
  overflow: hidden;
}
.ph.up {
  border: 1.5px dashed var(--ln);
  background: transparent;
  flex-direction: column;
  gap: 10px;
}
.ph b {
  color: var(--tx);
}
.tipos {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.ph-img {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  background: transparent;
}
.ph-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ph-mas {
  position: absolute;
  right: 8px;
  bottom: 8px;
  background: rgb(17 24 39 / 0.7);
  color: #fff;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}

/* Resumen */
.resumen {
  flex: 1 1 280px;
  max-width: 360px;
  position: sticky;
  top: 16px;
}
.res-quien {
  font-size: 14px;
  font-weight: 600;
}
.res-filas {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
}
.res-fila {
  display: flex;
  justify-content: space-between;
}

/* Historial */
.historial {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.dia {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grid-fotos,
.grid-sk {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.foto,
.sk-thumb {
  border: 0;
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--so);
}
.foto img,
.sk-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sk-et {
  font-size: 11px;
  color: var(--mu);
  text-align: center;
  margin-top: 4px;
}

@media (max-width: 760px) {
  main {
    padding: 20px 16px 110px;
  }
  .resumen {
    position: static;
    max-width: none;
    flex-basis: 100%;
  }
  .fecha-lbl {
    margin-left: 0;
  }
}

/* ---- Celular ---- */
.fm {
  padding: 0 16px calc(176px + env(safe-area-inset-bottom, 0px));
  gap: 0;
}
.fm-top {
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--color-bg);
  margin: 0 -16px;
  padding: 12px 16px 10px;
}
.fm-tit h1 {
  font-size: 22px;
}
.fm-sub,
.fm-s {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
}
.fm-s {
  margin: 2px 0 0;
}
.fm-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -16px 10px;
  padding: 0 16px;
  scrollbar-width: none;
}
.fm-chips::-webkit-scrollbar {
  display: none;
}
.chip {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  touch-action: manipulation;
}
.fm-fila {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.fm-fecha {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--sf);
  color: var(--tx);
  box-shadow: 0 0 0 1px var(--ln);
  padding: 0 12px;
  font-size: 16px;
  font-weight: 600;
  color-scheme: dark;
}
:root[data-theme='light'] .fm-fecha {
  color-scheme: light;
}
.fm-seg {
  display: flex;
  background: var(--so);
  border-radius: 14px;
  padding: 3px;
}
.fm-seg .chip {
  background: transparent;
  height: 38px;
}
.fm-seg .chip.on {
  background: var(--tx);
  color: var(--color-bg);
}
.fm-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fm-card {
  padding: 14px;
  border-radius: 18px;
  gap: 10px;
}
.fm-sp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fm-b {
  font-size: 14.5px;
  font-weight: 800;
}
.fm-acc {
  display: flex;
  gap: 8px;
}
.fm-btn {
  height: 44px;
  min-width: 44px;
  font-size: 13px;
  border-radius: 12px;
}
.fm-charla {
  border-radius: 11px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
}
.fm-charla.falta {
  background: rgba(217, 45, 32, 0.1);
  color: #d92d20;
}
.fm-charla.ok {
  background: rgba(34, 197, 94, 0.14);
  color: #22a05b;
}
.fm-carrusel {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -14px;
  padding: 0 14px;
  scrollbar-width: none;
}
.fm-carrusel::-webkit-scrollbar {
  display: none;
}
.fm-mini {
  flex: 0 0 84px;
  width: 84px;
  height: 84px;
  aspect-ratio: auto;
}
.fm-acord {
  background: var(--sf);
  border-radius: 18px;
  box-shadow: 0 0 0 1px var(--ln);
  overflow: hidden;
}
.fm-acord-h {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  text-align: left;
  min-height: 60px;
  touch-action: manipulation;
}
.fm-acord-t {
  flex: 1;
  min-width: 0;
}
.fm-acord-t b {
  font-size: 14.5px;
  display: block;
}
.fm-acord-t span {
  font-size: 11.5px;
  color: var(--mu);
  font-weight: 600;
}
.fm-pill {
  font-size: 11.5px;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 9px;
  white-space: nowrap;
  background: rgba(141, 146, 155, 0.2);
  color: #8d929b;
}
.fm-pill.ok {
  background: rgba(34, 197, 94, 0.16);
  color: #22a05b;
}
.fm-chev {
  color: var(--mu);
  font-size: 18px;
  transition: transform 0.15s;
}
.fm-chev.abierto {
  transform: rotate(180deg);
}
.fm-acord-b {
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fm-ant {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.fm-ant::-webkit-scrollbar {
  display: none;
}
.fm-par {
  display: flex;
  gap: 8px;
}
.fm-ph {
  flex: 1;
  min-width: 0;
  aspect-ratio: 4 / 3;
}
.fm-ph .tipos {
  gap: 4px;
}
.fm-ph .tipos .gh {
  height: 32px;
  font-size: 11px;
  padding: 0 8px;
}
.fm-ph16 {
  position: relative;
  border-radius: 14px;
  background: var(--so);
  aspect-ratio: 16 / 10;
  overflow: hidden;
}
.fm-dia {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fm-grid3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.fm-grid3 .foto {
  aspect-ratio: 1;
}
.fm-barra {
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
  z-index: 9;
  background: var(--sf);
  border-radius: 20px;
  box-shadow: 0 0 0 1px var(--ln), 0 10px 30px rgba(0, 0, 0, 0.18);
  padding: 10px 10px 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.fm-barra-t {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
}
.fm-barra-t div {
  font-size: 11.5px;
  font-weight: 700;
}
.fm-barra-t .rojo {
  color: #d92d20;
}
.fm-barra-t .verde {
  color: #22a05b;
}
.fm-enviar {
  height: 44px;
  border-radius: 14px;
}
@media (max-height: 700px) {
  .fm-barra {
    padding: 4px 6px 4px 14px;
    border-radius: 16px;
  }
  .fm-enviar {
    height: 44px;
  }
}
</style>

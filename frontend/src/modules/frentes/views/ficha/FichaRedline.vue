<script setup>
// Pestaña Redline · lienzo 6 (aprobado 20/11/2026). Flujo: legibilidad →
// alinear con el plano → revisar cambios (la IA propone, Planeamiento confirma
// o corrige) → aprobar y publicar. Nada cambia en el sistema hasta aprobar.
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../../../../store/auth'
import { cargarSectores, fechaCorta, num } from '../../services/controlObraService'
import { cargarRedlines, confirmarCambio, corregirCambio, aprobarRedline, devolverRedline, subirRedline } from '../../services/redlineService'

const props = defineProps({ frente: { type: Object, required: true } })
const auth = useAuthStore()
const puede = computed(() => auth.tienePermiso('procura.crear_version'))

const cargando = ref(true)
const datos = ref({ redlines: [], cambios: [], planoBase: null, partidaItem: [] })
const sectores = ref([])
const selId = ref(null)
const msg = ref('')
const err = ref('')
const trabajando = ref('')

async function cargar() {
  const [d, s] = await Promise.all([cargarRedlines(props.frente.id), cargarSectores(props.frente.id).catch(() => [])])
  datos.value = d; sectores.value = s
  if (!selId.value || !d.redlines.some((r) => r.id === selId.value)) selId.value = (d.redlines.find((r) => r.estado === 'en_revision') || d.redlines[0])?.id ?? null
}
onMounted(async () => { try { await cargar() } catch (e) { console.error(e); err.value = 'No se pudo cargar los redlines.' } finally { cargando.value = false } })

const rl = computed(() => datos.value.redlines.find((r) => r.id === selId.value) || null)
const cambios = computed(() => (rl.value ? datos.value.cambios.filter((c) => c.redline === rl.value.codigo) : []))
const nomSec = (c) => sectores.value.find((s) => s.codigo === c)?.nombre || c
const secsRl = computed(() => [...new Set(cambios.value.map((c) => c.sector_codigo))].map(nomSec).join(' y '))
const cantRl = (c) => Number(c.cantidad_corregida ?? c.cantidad_despues)
const nConf = computed(() => cambios.value.filter((c) => c.estado !== 'por_confirmar').length)
const nPend = computed(() => cambios.value.length - nConf.value)
const esUnd = (u) => ['und', 'UND', 'u'].includes(u)
const q = (x, u) => (esUnd(u) ? num(x, 0) : num(x, 2))
const delta = (c) => cantRl(c) - Number(c.constructivo)
const estadoTxt = { en_revision: 'En revisión', aprobado: 'Aprobado', devuelto: 'Devuelto' }

const pasos = computed(() => {
  const r = rl.value
  if (!r) return []
  const ap = r.estado === 'aprobado'
  return [
    { t: 'Legibilidad', s: r.imagen_campo || r.imagen_plano ? `Imagen legible · ${fechaCorta(r.fecha)}` : 'Falta la imagen del redline', ok: !!(r.imagen_campo || r.imagen_plano) },
    { t: 'Alinear con el plano', s: r.puntos_alineacion ? `Puntos: ${r.puntos_alineacion}` : 'Sin puntos de alineación', ok: !!r.puntos_alineacion },
    { t: 'Revisar cambios', s: `${cambios.value.length} leídos · ${nConf.value} confirmados · ${nPend.value} por confirmar`, ok: ap || (cambios.value.length > 0 && !nPend.value), on: !ap },
    { t: 'Aprobar y publicar', s: ap ? `Aprobado el ${fechaCorta(r.aprobado_en?.slice(0, 10))}` : 'Tú decides · actualiza sketch y datos', ok: ap },
  ]
})

const impacto = computed(() => {
  const m = new Map()
  for (const c of cambios.value) {
    const k = `${c.descripcion.split(' · ')[0]}|${c.unidad}`
    const x = m.get(k) || { mat: c.descripcion.split(' · ')[0], u: c.unidad, a: 0, b: 0 }
    x.a += Number(c.constructivo); x.b += cantRl(c)
    m.set(k, x)
  }
  return [...m.values()]
})
const partidasAfectadas = computed(() => {
  const items = new Set(cambios.value.map((c) => c.item_codigo))
  return [...new Set(datos.value.partidaItem.filter((p) => items.has(p.item_codigo)).map((p) => p.edt))].sort()
})
const actualiza = computed(() => [
  ['Sketch de avance', `El plano del frente pasa a ${rl.value?.titulo || 'este redline'} con sus cambios marcados.`],
  ['Metrado vigente', `${cambios.value.length} ítems del plano pasan a la cantidad del ${rl.value?.codigo} en Procura, Control y la conciliación.`],
  ['Procura y almacén', 'Nuevo previsto por material; la conciliación recalcula el acopio.'],
  ['Curva S y cronograma', partidasAfectadas.value.length ? `Las partidas ${partidasAfectadas.value.join(', ')} toman el metrado del ${rl.value?.codigo}; las HH no cambian (rebase solo si supera el 10 %).` : 'Ninguna partida del cronograma depende directo de estos ítems.'],
])

// ---------- acciones ----------
const editando = ref(null)
const valorCorr = ref('')
const notaCorr = ref('')
function abrirCorregir(c) { editando.value = c.id; valorCorr.value = String(cantRl(c)); notaCorr.value = '' }
async function accion(k, fn, ok) {
  trabajando.value = k; err.value = ''; msg.value = ''
  try { await fn(); await cargar(); if (ok) msg.value = ok } catch (e) { console.error(e); err.value = e?.message || 'No se pudo completar la acción.' } finally { trabajando.value = '' }
}
const confirmar = (c) => accion(c.id, () => confirmarCambio(c.id))
function guardarCorr(c) {
  const v = parseFloat(valorCorr.value)
  if (!(v >= 0)) { err.value = 'Escribe una cantidad válida.'; return }
  accion(c.id, () => corregirCambio(c.id, v, notaCorr.value.trim() || null)).then(() => { editando.value = null })
}
const planoRef = ref(null)
function verPlano() { planoRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }); planoRef.value?.classList.add('flash'); setTimeout(() => planoRef.value?.classList.remove('flash'), 1400) }
const aprobar = () => accion('ap', () => aprobarRedline(rl.value.id), `${rl.value.codigo} aprobado y publicado: metrado vigente, procura, sketch y curva S actualizados.`)
const devOn = ref(false)
const devNota = ref('')
const devolver = () => accion('dv', () => devolverRedline(rl.value.id, devNota.value), `${rl.value.codigo} devuelto al supervisor con tu nota.`).then(() => { if (!err.value) { devOn.value = false; devNota.value = '' } })

// ---------- subir redline ----------
const subOn = ref(false)
const nuevo = ref({ codigo: '', titulo: '', fecha: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10), origen: '', archivo: null })
const subir = () => accion('up', () => subirRedline(props.frente.id, nuevo.value), 'Redline subido: queda en revisión para que el agente lea los cambios.').then(() => { if (!err.value) subOn.value = false })
</script>

<template>
  <div class="pl-col rl">
    <p v-if="cargando" class="pl-empty">Cargando…</p>
    <template v-else>
      <div class="ban">
        <div class="bi">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
          <div v-if="rl">
            <p class="bt">Redline {{ rl.codigo }} · {{ frente.nombre }}<template v-if="secsRl"> · {{ secsRl }}</template></p>
            <p class="bs">{{ rl.origen || rl.titulo }} · {{ fechaCorta(rl.fecha) }}/{{ rl.fecha.slice(0, 4) }} · {{ rl.estado === 'en_revision' ? 'espera tu aprobación' : estadoTxt[rl.estado].toLowerCase() }}</p>
          </div>
          <div v-else><p class="bt">Sin redlines en este frente</p><p class="bs">Cuando supervisión u oficina técnica suba uno, aparece aquí para tu revisión.</p></div>
        </div>
        <div class="bb">
          <span v-if="rl" class="pill" :class="rl.firma_bba ? 'ok' : 'wa'">Firma BBA del {{ rl.codigo }}: {{ rl.firma_bba ? 'firmado' : 'pendiente' }}</span>
          <button v-if="puede" type="button" class="gh" @click="subOn = !subOn">+ Subir redline</button>
        </div>
      </div>

      <form v-if="subOn" class="card sub" @submit.prevent="subir">
        <label>Código<input v-model.trim="nuevo.codigo" required placeholder="RL02" /></label>
        <label class="w">Título<input v-model.trim="nuevo.titulo" required placeholder="Plano CE1087 · Redline 02" /></label>
        <label>Fecha<input v-model="nuevo.fecha" type="date" required /></label>
        <label class="w">Origen<input v-model.trim="nuevo.origen" placeholder="Foto de campo firmada por BBA" /></label>
        <label class="w">Imagen<input type="file" accept="image/*,application/pdf" @change="nuevo.archivo = $event.target.files[0]" /></label>
        <button type="submit" class="pri" :disabled="trabajando === 'up'">{{ trabajando === 'up' ? 'Subiendo…' : 'Subir' }}</button>
      </form>

      <p v-if="msg" class="okm">{{ msg }}</p>
      <p v-if="err" class="erm">{{ err }}</p>

      <template v-if="rl">
        <ol class="pasos">
          <li v-for="(p, i) in pasos" :key="p.t" :class="{ on: p.on && !p.ok }">
            <span class="n" :class="{ ok: p.ok, on: p.on && !p.ok }">{{ p.ok ? '✓' : i + 1 }}</span>
            <span><b>{{ p.t }}</b><small>{{ p.s }}</small></span>
          </li>
        </ol>

        <div class="g3">
          <div class="col">
            <section class="card">
              <h2>Redlines del frente</h2>
              <p class="subt">Lo que suben supervisión y oficina técnica</p>
              <ul class="lista">
                <li v-for="r in datos.redlines" :key="r.id">
                  <button type="button" :class="{ on: r.id === selId }" @click="selId = r.id">
                    <span class="lh"><b>{{ r.codigo }}</b><span class="pill" :class="r.estado === 'aprobado' ? 'ok' : r.estado === 'devuelto' ? 'ro' : 'wa'">{{ estadoTxt[r.estado] }}</span></span>
                    <span class="l2">{{ r.titulo }}</span>
                    <span class="l3">{{ fechaCorta(r.fecha) }}/{{ r.fecha.slice(0, 4) }}<template v-if="r.nota_devolucion"> · {{ r.nota_devolucion }}</template></span>
                  </button>
                </li>
                <li v-if="rl.origen && rl.imagen_campo"><div class="it"><span class="lh"><b>Foto de campo</b><span class="pill in">Origen del {{ rl.codigo }}</span></span><span class="l2">{{ rl.origen }}</span></div></li>
                <li v-if="datos.planoBase"><div class="it"><span class="lh"><b>REV0</b><span class="pill mu">Base</span></span><span class="l2">{{ datos.planoBase }}</span><span class="l3">Emitido para construcción</span></div></li>
              </ul>
            </section>
            <section class="card grow">
              <h2>Regla de Planeamiento</h2>
              <p class="txt">Nada cambia en el sistema hasta que apruebes aquí. Al aprobar se actualizan el sketch, el metrado vigente, la procura y la curva S. La <b>valorización</b> sigue el plano firmado por BBA: mientras el {{ rl.codigo }} no tenga firma, el metrado valorizable es el constructivo.</p>
            </section>
          </div>
          <div class="col">
            <section class="card">
              <h2>Foto del redline de campo</h2>
              <p class="subt">{{ fechaCorta(rl.fecha) }} · {{ rl.origen || 'imagen subida por supervisión' }}</p>
              <img v-if="rl.urlCampo" :src="rl.urlCampo" :alt="`Foto del redline ${rl.codigo} de ${frente.nombre}`" />
              <p v-else class="mu">Sin foto de campo.</p>
            </section>
            <section ref="planoRef" class="card grow">
              <h2>Plano {{ rl.codigo }} alineado</h2>
              <p class="subt">Marcas del redline en los cambios<template v-if="rl.puntos_alineacion"> · alineado en {{ rl.puntos_alineacion }}</template></p>
              <img v-if="rl.urlPlano" :src="rl.urlPlano" :alt="`Plano ${rl.titulo}`" class="wb" />
              <p v-else class="mu">Sin plano alineado todavía.</p>
            </section>
          </div>
          <section class="card cam">
            <h2>Cambios leídos del redline</h2>
            <p class="subt">La IA propone; tú confirmas cada cambio · {{ nConf }} de {{ cambios.length }} confirmados</p>
            <p v-if="!cambios.length" class="mu">El agente todavía no leyó cambios de este redline.</p>
            <ul class="cl">
              <li v-for="c in cambios" :key="c.id" :class="{ wa: c.estado === 'por_confirmar' }">
                <div class="ch"><p><b>{{ c.descripcion }}</b> <small>· {{ nomSec(c.sector_codigo) }} · {{ c.item_codigo }}</small></p>
                  <span class="pill" :class="c.estado === 'por_confirmar' ? 'wa' : c.estado === 'corregido' ? 'in' : 'ok'">{{ c.estado === 'por_confirmar' ? 'Por confirmar' : c.estado === 'corregido' ? 'Corregido' : 'Confirmado' }}</span></div>
                <p class="cq"><span class="mu">Constructivo</span> <b>{{ q(c.constructivo, c.unidad) }} {{ c.unidad }}</b> <span class="mu">→ {{ c.redline }}</span> <b>{{ q(cantRl(c), c.unidad) }} {{ c.unidad }}</b>
                  <b :style="{ color: Math.abs(delta(c)) < 1e-9 ? '#9ca3af' : delta(c) > 0 ? '#4ade80' : '#f87171' }">{{ Math.abs(delta(c)) < 1e-9 ? 'sin cambio' : (delta(c) > 0 ? '+' : '−') + q(Math.abs(delta(c)), c.unidad) + ' ' + c.unidad }}</b>
                  <small v-if="c.estado === 'corregido'" class="mu"> (leído {{ q(Number(c.cantidad_despues), c.unidad) }})</small></p>
                <p v-if="c.nota" class="cn">{{ c.nota }}</p>
                <div v-if="editando === c.id" class="ce">
                  <input v-model="valorCorr" type="number" step="0.01" min="0" :aria-label="`Cantidad corregida de ${c.item_codigo}`" />
                  <input v-model="notaCorr" class="w" placeholder="Motivo de la corrección (opcional)" />
                  <button type="button" class="pri s" :disabled="trabajando === c.id" @click="guardarCorr(c)">Guardar</button>
                  <button type="button" class="gh s" @click="editando = null">Cancelar</button>
                </div>
                <div v-else-if="rl.estado !== 'aprobado'" class="ca">
                  <button v-if="puede && c.estado === 'por_confirmar'" type="button" class="pri s" :disabled="trabajando === c.id" @click="confirmar(c)">Confirmar</button>
                  <button v-if="puede" type="button" class="gh s" @click="abrirCorregir(c)">Corregir</button>
                  <button type="button" class="gh s" @click="verPlano">Ver en el plano</button>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <div class="g2">
          <section class="card">
            <h2>Impacto en metrados y procura</h2>
            <p class="subt">Constructivo REV0 → {{ rl.codigo }}<template v-if="secsRl"> · suma de {{ secsRl }}</template></p>
            <table class="t" data-sin-filtro>
              <thead><tr><th>Material / ítem</th><th class="r">Constructivo</th><th class="r">{{ rl.codigo }}</th><th class="r">Cambio</th></tr></thead>
              <tbody>
                <tr v-for="x in impacto" :key="x.mat + x.u">
                  <td>{{ x.mat }}</td><td class="r mu">{{ q(x.a, x.u) }} {{ x.u }}</td><td class="r b">{{ q(x.b, x.u) }} {{ x.u }}</td>
                  <td class="r b" :style="{ color: Math.abs(x.b - x.a) < 1e-9 ? '#9ca3af' : x.b > x.a ? '#4ade80' : '#f87171' }">{{ Math.abs(x.b - x.a) < 1e-9 ? '—' : (x.b > x.a ? '+' : '−') + q(Math.abs(x.b - x.a), x.u) }}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section class="card fx">
            <h2>Qué se actualiza al aprobar</h2>
            <p class="subt">En este orden y con registro de quién y cuándo</p>
            <ul class="act">
              <li v-for="[t, d] in actualiza" :key="t"><span class="ck">✓</span><span><b>{{ t }}</b> · <span class="mu2">{{ d }}</span></span></li>
            </ul>
            <template v-if="rl.estado !== 'aprobado' && puede">
              <div class="bx">
                <button type="button" class="pri big" :disabled="!!nPend || trabajando === 'ap'" @click="aprobar">{{ trabajando === 'ap' ? 'Aprobando…' : `Aprobar y publicar ${rl.codigo}` }}</button>
                <button type="button" class="gh big" @click="devOn = !devOn">Devolver al supervisor</button>
              </div>
              <p v-if="nPend" class="wa2">Falta confirmar {{ nPend }} cambio(s) antes de aprobar.</p>
              <div v-if="devOn" class="dev">
                <textarea v-model="devNota" rows="2" placeholder="Qué debe corregir el supervisor (mínimo 10 caracteres)"></textarea>
                <button type="button" class="gh" :disabled="devNota.trim().length < 10 || trabajando === 'dv'" @click="devolver">Enviar devolución</button>
              </div>
            </template>
            <p v-else-if="rl.estado === 'aprobado'" class="okm">Aprobado el {{ fechaCorta(rl.aprobado_en?.slice(0, 10)) }}: ya rige en metrado vigente, procura, sketch y curva S.</p>
          </section>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.rl { gap: 16px; }
.ban { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px; border-radius: 12px; background: rgba(96, 165, 250, 0.08); border: 1px solid rgba(96, 165, 250, 0.35); }
.bi { display: flex; gap: 12px; align-items: center; color: #93c5fd; }
.bt { margin: 0; font-weight: 700; font-size: 15px; color: var(--p-text); }
.bs { margin: 3px 0 0; color: #d6dae0; font-size: 13px; }
.bb { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pill { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.pill.ok { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.pill.wa { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
.pill.ro { background: rgba(248, 113, 113, 0.16); color: #f87171; }
.pill.in { background: rgba(96, 165, 250, 0.16); color: #93c5fd; }
.pill.mu { background: var(--p-chip); color: var(--p-muted); }
.gh, .pri { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.gh { background: transparent; color: var(--p-text); border: 1px solid #3a3f47; font-weight: 600; }
.pri { background: #f5a800; color: #0d0f10; border: 0; }
.pri:disabled, .gh:disabled { opacity: 0.5; cursor: default; }
.s { min-height: 34px; padding: 0 12px; font-size: 13px; }
.big { flex: 1 1 180px; min-height: 44px; font-size: 14.5px; }
.pasos { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.pasos li { flex: 1 1 220px; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; background: var(--p-card); border: 1px solid var(--p-line); min-width: 0; }
.pasos li.on { border-color: #f5a800; }
.pasos b { display: block; font-size: 14px; }
.pasos small { display: block; color: var(--p-muted); font-size: 12px; margin-top: 2px; }
.n { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #2d3139; color: #c9ced6; font-weight: 700; font-size: 13px; }
.n.ok { background: #22c55e; color: #0d0f10; }
.n.on { background: #f5a800; color: #0d0f10; }
.g3 { display: grid; grid-template-columns: 290px minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
@media (max-width: 1100px) { .g3, .g2 { grid-template-columns: minmax(0, 1fr); } }
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.grow { flex: 1 1 auto; }
.card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.card h2 { margin: 0; font-size: 17px; font-weight: 700; }
.subt { margin: 4px 0 12px; color: var(--p-muted); font-size: 12.5px; }
.card img { display: block; width: 100%; height: auto; border-radius: 8px; }
.card img.wb { background: #fff; }
.flash { outline: 2px solid #f5a800; transition: outline 0.3s; }
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.lista button, .lista .it { display: block; width: 100%; text-align: left; padding: 12px; border-radius: 10px; border: 1px solid var(--p-line); background: var(--p-chip); color: var(--p-text); font: inherit; box-sizing: border-box; }
.lista button { cursor: pointer; }
.lista button.on { border-color: #f5a800; background: rgba(245, 168, 0, 0.08); }
.lh { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 14px; }
.l2 { display: block; margin-top: 4px; font-size: 12.5px; color: #d6dae0; }
.l3 { display: block; margin-top: 2px; font-size: 11.5px; color: var(--p-muted); }
.txt { margin: 0; font-size: 12.5px; line-height: 1.5; color: #d6dae0; }
.cam { display: flex; flex-direction: column; min-height: 0; }
@media (min-width: 1101px) { .cam { contain: size; } }
.cl { list-style: none; margin: 0; padding: 0 4px 0 0; display: flex; flex-direction: column; gap: 8px; flex: 1 1 0; min-height: 0; overflow: auto; }
.cl li { padding: 12px 14px; border-radius: 10px; background: var(--p-chip); border: 1px solid var(--p-line); }
.cl li.wa { border-color: rgba(245, 158, 11, 0.55); }
.ch { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.ch p { margin: 0; font-size: 14px; }
.ch small { color: var(--p-muted); font-weight: 500; font-size: 12px; }
.cq { margin: 6px 0 4px; font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.cn { margin: 0 0 8px; color: #c9ced6; font-size: 12.5px; line-height: 1.45; }
.ca, .ce { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ce input { min-height: 34px; padding: 0 8px; border-radius: 8px; border: 1px solid #3a3f47; background: #111315; color: #f1f3f5; font: inherit; font-size: 13px; width: 100px; }
.ce input.w { flex: 1 1 160px; width: auto; }
.t { width: 100%; border-collapse: collapse; font-size: 13px; }
.t th { text-align: left; padding: 9px 10px; color: var(--p-muted); font-size: 11.5px; font-weight: 600; text-transform: uppercase; border-bottom: 1px solid var(--p-line); }
.t td { padding: 9px 10px; border-bottom: 1px solid var(--p-line); }
.r { text-align: right; }
.b { font-weight: 700; }
.mu { color: var(--p-muted); }
.mu2 { color: #c9ced6; }
.fx { display: flex; flex-direction: column; }
.act { list-style: none; margin: 0 0 14px; padding: 0; }
.act li { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--p-line); font-size: 13px; line-height: 1.45; }
.ck { color: #4ade80; flex: none; }
.bx { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }
.wa2 { margin: 8px 0 0; color: #fbbf24; font-size: 12px; }
.dev { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.dev textarea, .sub input { padding: 8px 10px; border-radius: 8px; border: 1px solid #3a3f47; background: #111315; color: #f1f3f5; font: inherit; font-size: 13px; }
.sub { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.sub label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--p-muted); flex: 0 1 140px; }
.sub label.w { flex: 1 1 220px; }
.okm { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(34, 197, 94, 0.1); color: #86efac; font-size: 13px; }
.erm { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(248, 113, 113, 0.1); color: #fca5a5; font-size: 13px; }
</style>

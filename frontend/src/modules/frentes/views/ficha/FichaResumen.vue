<script setup>
// Resumen del frente · diseño v5 (PRUEBA 18/11/2026).
// Curva S por semana, avance por sector, Stand By con horas, fotos de la
// semana, reportes y alertas. Solo lectura.
import { computed, onMounted, ref, watch } from 'vue'
import { listarReportes } from '../../../rdc/services/rdcService'
import { listarPernos, listarPernosBiblioteca, listarMalla } from '../../../avance/services/avanceService'
import { listarAlertas } from '../../../alertas/services/alertasService'
import {
  cargarSectores, cargarCurva, cargarStandBy, cargarFotos,
  sectorDeCodigo, semanaDe, fechaCorta, num, horasTexto,
} from '../../services/controlObraService'
import CurvaSSemanal from '../../components/control/CurvaSSemanal.vue'

const props = defineProps({
  frente: { type: Object, required: true },
})

const cargando = ref(true)
const reportes = ref([])
const alertas = ref([])
const sectores = ref([])
const sector = ref('all')
const curva = ref({ param: null, puntos: [] })
const semana = ref('')
const pernos = ref(null)
const biblioteca = ref([])
const malla = ref([])
const standby = ref([])
const fotos = ref([])
const cargandoSemana = ref(false)
const fotoGrande = ref(null)

const seguro = (p, def) => p.catch((e) => { console.warn(e); return def })

onMounted(async () => {
  cargando.value = true
  const id = props.frente.id
  const [r, a, s, c, p, b, m] = await Promise.all([
    seguro(listarReportes({ frenteId: id }), []),
    seguro(listarAlertas({ estado: 'activa', frenteId: id }), []),
    seguro(cargarSectores(id), []),
    seguro(cargarCurva(id), { param: null, puntos: [] }),
    props.frente.rdc_control_pernos ? seguro(listarPernos(id), null) : Promise.resolve(null),
    seguro(listarPernosBiblioteca(id), []),
    seguro(listarMalla(id), []),
  ])
  reportes.value = r; alertas.value = a; sectores.value = s; curva.value = c
  pernos.value = p; biblioteca.value = b; malla.value = m
  const fd = c.param?.fecha_dato || r[0]?.fecha || new Date().toISOString().slice(0, 10)
  semana.value = semanaDe(fd).clave
  cargando.value = false
})

const semanaSel = computed(() => {
  const p = curva.value.puntos.find((x) => semanaDe(x.fecha).clave === semana.value)
  if (p) return semanaDe(p.fecha)
  const f = reportes.value.find((x) => semanaDe(x.fecha).clave === semana.value)
  return f ? semanaDe(f.fecha) : null
})

watch(semanaSel, async (s) => {
  if (!s) return
  cargandoSemana.value = true
  const [sb, fo] = await Promise.all([
    seguro(cargarStandBy(props.frente.id, s.desde, s.hasta), []),
    seguro(cargarFotos(props.frente.id, s.desde, s.hasta, 9), []),
  ])
  standby.value = sb; fotos.value = fo
  cargandoSemana.value = false
})

const opciones = computed(() => [{ codigo: 'all', nombre: 'Todo el frente' }, ...sectores.value])
const nombreSector = computed(() => opciones.value.find((o) => o.codigo === sector.value)?.nombre ?? '')
const codigos = computed(() => sectores.value.map((s) => s.codigo))
const enSector = (cod) => sector.value === 'all' || cod === sector.value

// Avance de pernos por sector (biblioteca del plano vs RDC)
const avanceSectores = computed(() => {
  const filas = [...sectores.value.map((s) => ({ ...s })), { codigo: 'GEN', nombre: 'Sin sector' }]
  const nz = (c) => (c ?? '').trim().toUpperCase()
  const est = new Map((pernos.value ?? []).map((p) => [p.codigo_norm || nz(p.codigo), p]))
  for (const f of filas) { f.plano = 0; f.perf = 0; f.iny = 0 }
  for (const b of biblioteca.value) {
    const sc = sectorDeCodigo(b.codigo, codigos.value)
    const f = filas.find((x) => x.codigo === sc)
    f.plano++
    const e = est.get(nz(b.codigo))
    if (e?.perforacion_fecha || e?.inyeccion_fecha) f.perf++
    if (e?.inyeccion_fecha) f.iny++
  }
  return filas.filter((f) => f.plano > 0)
})
const totSel = computed(() => {
  const fs = avanceSectores.value.filter((f) => enSector(f.codigo))
  return fs.reduce((a, f) => ({ plano: a.plano + f.plano, perf: a.perf + f.perf, iny: a.iny + f.iny }), { plano: 0, perf: 0, iny: 0 })
})
const mallaTotal = computed(() => malla.value.reduce((a, m) => a + (Number(m.area_m2) || 0), 0))

const ultimaCurva = computed(() => {
  const ps = curva.value.puntos.filter((p) => p.ejecutado_pct != null)
  const p = ps[ps.length - 1]
  return p ? { ...p, dv: Number(p.ejecutado_pct) - Number(p.programado_pct) } : null
})
const colorDv = (dv) => {
  const ti = Number(curva.value.param?.tol_inf ?? -3), ts = Number(curva.value.param?.tol_sup ?? 6), al = Number(curva.value.param?.alerta_desde ?? 4)
  if (dv < ti || dv > ts) return 'var(--p-danger)'
  if (dv > al) return 'var(--p-amber-txt)'
  return 'var(--p-ok-fg)'
}

const standbyCausas = computed(() => {
  const m = new Map()
  for (const s of standby.value) m.set(s.causa, (m.get(s.causa) || 0) + s.minutos)
  return [...m.entries()].map(([causa, min]) => ({ causa, min })).sort((a, b) => b.min - a.min)
})
const standbyTotal = computed(() => standby.value.reduce((a, s) => a + s.minutos, 0))
const sinHoras = computed(() => standby.value.filter((s) => !s.minutos).length)

const ultimosReportes = computed(() => reportes.value.slice(0, 6))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
</script>

<template>
  <div class="pl-col">
    <div class="pl-kpis">
      <div class="pl-kpi">
        <div class="l">Avance ejecutado</div>
        <div class="v">{{ ultimaCurva ? Number(ultimaCurva.ejecutado_pct).toFixed(1) + ' %' : '—' }}</div>
        <div class="s" v-if="ultimaCurva">Al {{ fechaCorta(ultimaCurva.fecha) }} · programado {{ Number(ultimaCurva.programado_pct).toFixed(1) }} %</div>
      </div>
      <div class="pl-kpi">
        <div class="l">Desviación</div>
        <div class="v" :style="ultimaCurva ? { color: colorDv(ultimaCurva.dv) } : {}">
          {{ ultimaCurva ? (ultimaCurva.dv > 0 ? '+' : '') + ultimaCurva.dv.toFixed(1) + ' %' : '—' }}
        </div>
        <div class="s">Banda {{ curva.param?.tol_inf ?? -3 }} / +{{ curva.param?.tol_sup ?? 6 }}</div>
      </div>
      <div class="pl-kpi">
        <div class="l">Pernos perforados · {{ nombreSector }}</div>
        <div class="v">{{ totSel.plano ? `${totSel.perf} / ${totSel.plano}` : '—' }}</div>
        <div class="bar"><i :style="{ width: pct(totSel.perf, totSel.plano) + '%' }"></i></div>
        <div class="s">Inyectados: {{ totSel.iny }}</div>
      </div>
      <div class="pl-kpi">
        <div class="l">Malla instalada</div>
        <div class="v">{{ mallaTotal ? num(mallaTotal) + ' m²' : '—' }}</div>
        <div class="s">Según RDC aprobados</div>
      </div>
      <div class="pl-kpi">
        <div class="l">Stand By · {{ semana }}</div>
        <div class="v" :style="standbyTotal ? 'color: var(--p-amber-txt)' : ''">{{ cargandoSemana ? '—' : horasTexto(standbyTotal) }}</div>
        <div class="s">{{ standby.length }} evento(s) en la semana</div>
      </div>
    </div>

    <div v-if="sectores.length" class="sectores" role="group" aria-label="Sector">
      <span class="lbl">Sector</span>
      <button
        v-for="o in opciones"
        :key="o.codigo"
        type="button"
        class="pl-seg"
        :class="{ on: sector === o.codigo }"
        :aria-pressed="sector === o.codigo"
        @click="sector = o.codigo"
      >
        {{ o.nombre }}
      </button>
      <span class="nota">Solo se muestran sectores con plano cargado.</span>
    </div>

    <p v-if="cargando" class="pl-empty">Cargando…</p>
    <div v-else class="cols">
      <div class="col izq">
        <CurvaSSemanal v-model:semana="semana" :puntos="curva.puntos" :param="curva.param" />

        <section class="pl-panel">
          <div class="pl-sh">Avance de pernos por sector</div>
          <p class="pl-sub">Códigos del plano vigente contra lo reportado en el RDC.</p>
          <p v-if="!avanceSectores.length" class="pl-empty">Este frente no tiene catálogo de pernos cargado.</p>
          <div v-else class="tabla">
            <div class="pl-th fila"><span>SECTOR</span><span class="pl-r">PLANO</span><span class="pl-r">PERFORADOS</span><span class="pl-r">INYECTADOS</span><span>AVANCE</span></div>
            <div v-for="f in avanceSectores" :key="f.codigo" class="pl-tr fila" :class="{ apagada: !enSector(f.codigo) }">
              <span class="pl-semi">{{ f.nombre }}</span>
              <span class="pl-r">{{ f.plano }}</span>
              <span class="pl-r">{{ f.perf }}</span>
              <span class="pl-r">{{ f.iny }}</span>
              <span class="av"><span class="bar"><i :style="{ width: pct(f.iny, f.plano) + '%' }"></i></span>{{ pct(f.iny, f.plano) }} %</span>
            </div>
          </div>
        </section>
      </div>

      <div class="col der">
        <section class="pl-panel">
          <div class="pl-sh">Stand By · {{ semana }}</div>
          <p class="pl-sub" v-if="semanaSel">{{ fechaCorta(semanaSel.desde) }} – {{ fechaCorta(semanaSel.hasta) }} · horas del RDC</p>
          <p v-if="cargandoSemana" class="pl-empty">Cargando…</p>
          <p v-else-if="!standby.length" class="pl-empty">Sin Stand By en la semana.</p>
          <template v-else>
            <div v-for="c in standbyCausas" :key="c.causa" class="sb">
              <span>{{ c.causa }}</span><b>{{ horasTexto(c.min) }}</b>
            </div>
            <div class="sb tot"><span>Total</span><b>{{ horasTexto(standbyTotal) }}</b></div>
            <p v-if="sinHoras" class="aviso">⚠ {{ sinHoras }} registro(s) sin hora de inicio y fin: pedir al supervisor que las complete (R-09).</p>
            <details class="det">
              <summary>Ver detalle por día</summary>
              <div v-for="(s, i) in standby" :key="i" class="sbd">
                <span>{{ fechaCorta(s.fecha) }}</span>
                <span>{{ s.actividad }}<small>{{ s.causa }}</small></span>
                <b>{{ s.minutos ? horasTexto(s.minutos) : 'sin hora' }}</b>
              </div>
            </details>
          </template>
        </section>

        <section class="pl-panel">
          <div class="pl-sh">Fotos del frente · {{ semana }}</div>
          <p v-if="cargandoSemana" class="pl-empty">Cargando…</p>
          <p v-else-if="!fotos.length" class="pl-empty">Sin fotos enviadas en la semana.</p>
          <div v-else class="fotos">
            <button v-for="(f, i) in fotos" :key="i" type="button" class="foto" @click="fotoGrande = f">
              <img :src="f.url" :alt="f.etiqueta" loading="lazy" />
              <span>{{ fechaCorta(f.fecha) }}</span>
            </button>
          </div>
        </section>

        <section class="pl-panel">
          <div class="pl-sh">Últimos reportes de campo</div>
          <p v-if="!ultimosReportes.length" class="pl-empty">Todavía no hay reportes.</p>
          <div v-for="r in ultimosReportes" :key="r.id" class="sb">
            <span>{{ fechaCorta(r.fecha) }} · {{ r.rdc_supervisores?.nombre ?? '—' }}</span>
            <span class="pl-sp" :class="r.estado === 'Finalizado' ? 'ok' : 'warn'">{{ r.estado === 'Finalizado' ? 'Enviado' : 'Borrador' }}</span>
          </div>
        </section>

        <section v-if="alertas.length" class="pl-panel">
          <div class="pl-sh">Alertas abiertas</div>
          <div v-for="a in alertas" :key="a.id" class="sb"><span>{{ a.mensaje ?? a.tipo }}</span></div>
        </section>
      </div>
    </div>

    <div v-if="fotoGrande" class="modal" role="dialog" aria-modal="true" @click="fotoGrande = null">
      <img :src="fotoGrande.url" :alt="fotoGrande.etiqueta" />
      <p>{{ fechaCorta(fotoGrande.fecha) }} · {{ fotoGrande.etiqueta }}</p>
    </div>
  </div>
</template>

<style scoped>
.pl-kpis { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.bar { display: inline-block; width: 100%; height: 7px; border-radius: 99px; background: var(--p-line); overflow: hidden; margin: 6px 0 2px; }
.bar i { display: block; height: 100%; background: #f5a800; border-radius: 99px; }
.sectores { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 14px; background: var(--p-card); }
.sectores .lbl { font-size: 12px; font-weight: 800; color: var(--p-muted); margin-right: 6px; text-transform: uppercase; }
.sectores .nota { margin-left: auto; font-size: 12px; color: var(--p-muted); }
.pl-seg.on { background: #f5a800; color: #0d0f10; }
.cols { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
.col { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.izq { flex: 8 1 620px; }
.der { flex: 4 1 340px; }
.tabla { overflow-x: auto; }
.fila { display: grid; grid-template-columns: minmax(120px, 1fr) 70px 100px 100px 150px; gap: 8px; align-items: center; padding: 0 8px; }
.apagada { opacity: 0.35; }
.av { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.av .bar { margin: 0; width: 80px; }
.sb { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--p-line); font-size: 13.5px; }
.sb.tot { font-weight: 800; border-bottom: 0; }
.aviso { font-size: 12.5px; color: var(--p-amber-txt); margin: 6px 0 0; }
.det summary { cursor: pointer; font-size: 13px; color: var(--p-muted); margin-top: 8px; }
.sbd { display: grid; grid-template-columns: 50px 1fr auto; gap: 8px; font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid var(--p-line); }
.sbd small { display: block; color: var(--p-muted); }
.fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.foto { position: relative; border: 0; padding: 0; background: none; cursor: pointer; border-radius: 10px; overflow: hidden; aspect-ratio: 4 / 3; }
.foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
.foto span { position: absolute; left: 6px; bottom: 6px; font-size: 11px; font-weight: 700; background: rgba(0, 0, 0, 0.6); color: #fff; padding: 2px 6px; border-radius: 6px; }
.modal { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100; padding: 24px; cursor: zoom-out; }
.modal img { max-width: 100%; max-height: 85vh; border-radius: 12px; }
.modal p { color: #fff; margin-top: 10px; }
</style>

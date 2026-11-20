<script setup>
// Planeamiento › Bandeja del agente · lienzo 6. Lo que el agente de
// planeamiento revisó en la bandeja de entrada (planos, redlines,
// cronogramas, fotos y reportes de campo) y las decisiones que necesita.
// Nada se carga al sistema sin la aprobación de Planeamiento.
import { computed, onMounted, ref } from 'vue'
import { cargarBandejaAgente, resolverHallazgo, reabrirHallazgo } from '../services/agenteService'

const cargando = ref(true)
const corrida = ref(null)
const hz = ref([])
const err = ref('')
const copiado = ref(false)
async function cargar() {
  try { const r = await cargarBandejaAgente(); corrida.value = r.corrida; hz.value = r.hallazgos } catch (e) { console.error(e); err.value = 'No se pudo cargar la bandeja.' } finally { cargando.value = false }
}
onMounted(cargar)
const de = (c) => hz.value.filter((h) => h.categoria === c)
const abiertasAlta = computed(() => hz.value.filter((h) => h.estado === 'abierto' && h.nivel === 'ALTA' && h.categoria !== 'informe').length)
const fotosRep = computed(() => de('evidencia').filter((h) => h.estado === 'abierto' && h.nivel === 'ALTA').length)
const NV = { ALTA: 'da', MEDIA: 'wa', BAJA: 'in', OK: 'ok' }
const fecha = (t) => (t ? new Date(t).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const trabajando = ref('')
async function resolver(h) { trabajando.value = h.id; try { await resolverHallazgo(h.id); await cargar() } finally { trabajando.value = '' } }
async function reabrir(h) { trabajando.value = h.id; try { await reabrirHallazgo(h.id); await cargar() } finally { trabajando.value = '' } }
async function copiar() {
  try { await navigator.clipboard.writeText('Procesa los reportes del día'); copiado.value = true; setTimeout(() => { copiado.value = false }, 2500) } catch { copiado.value = false }
}
</script>

<template>
  <div class="pl-col ban">
    <div class="top">
      <p class="mu">Última revisión: {{ fecha(corrida?.ejecutado_en) }} · {{ corrida?.carpetas || '—' }}</p>
      <button type="button" class="pri" title="El agente de planeamiento corre en Claude: copia la orden y pégala allí" @click="copiar">{{ copiado ? 'Orden copiada: pégala en Claude' : 'Procesar bandeja ahora' }}</button>
    </div>
    <p v-if="err" class="erm">{{ err }}</p>
    <p v-if="cargando" class="pl-empty">Cargando…</p>
    <template v-else>
      <div class="kpis">
        <div class="kpi"><p class="l">Archivos nuevos</p><p class="v">{{ corrida?.archivos_nuevos ?? 0 }}</p><p class="s">{{ corrida?.archivos_nuevos_detalle }}</p></div>
        <div class="kpi"><p class="l">Planos y redlines revisados</p><p class="v">{{ corrida?.planos_revisados ?? 0 }}</p><p class="s">{{ corrida?.planos_detalle }}</p></div>
        <div class="kpi"><p class="l">Cronogramas leídos</p><p class="v">{{ corrida?.cronogramas_leidos ?? 0 }}</p><p class="s">{{ corrida?.cronogramas_detalle }}</p></div>
        <div class="kpi"><p class="l">Hallazgos ALTA</p><p class="v ro">{{ abiertasAlta }}</p><p class="s">Requieren tu decisión</p></div>
        <div class="kpi"><p class="l">Fotos repetidas</p><p class="v ro">{{ fotosRep }}</p><p class="s">No se usan como evidencia</p></div>
      </div>

      <div class="g2">
        <section class="card dec">
          <h2>Decisiones que necesito de ti</h2>
          <p class="sub">Nada se carga al sistema sin tu aprobación</p>
          <ol class="dl">
            <li v-for="h in de('decision')" :key="h.id" :class="{ res: h.estado === 'resuelto' }">
              <span><b>{{ h.titulo }}:</b> {{ h.detalle }}<template v-if="h.estado === 'resuelto' && h.accion"> <em>{{ h.accion }}</em></template></span>
              <button type="button" class="gh s" :disabled="trabajando === h.id" @click="h.estado === 'resuelto' ? reabrir(h) : resolver(h)">{{ h.estado === 'resuelto' ? 'Reabrir' : 'Resuelta' }}</button>
            </li>
          </ol>
        </section>
        <section class="card">
          <h2>Fotos y archivos sueltos</h2>
          <p class="sub">Control de evidencia</p>
          <ul class="ev">
            <li v-for="h in de('evidencia')" :key="h.id"><span class="pill" :class="NV[h.nivel]">{{ h.nivel }}</span><div><b>{{ h.titulo }}</b><p>{{ h.detalle }}</p></div></li>
          </ul>
        </section>
      </div>

      <section class="card">
        <h2>Planos y redlines</h2>
        <p class="sub">Lectura de códigos de perno, malla y revisión de cada PDF</p>
        <div class="sx">
          <table class="t w15" data-sin-filtro>
            <thead><tr><th>Frente</th><th>Sector</th><th>Archivo</th><th>Pernos detectados</th><th>Malla del plano</th><th>Destino propuesto</th><th>Nivel</th><th>Hallazgo</th></tr></thead>
            <tbody>
              <tr v-for="h in de('plano')" :key="h.id">
                <td class="b">{{ h.frente }}</td><td><span class="pill" :class="(h.sector || '').includes('Activo') ? 'pr' : 'in'">{{ h.sector }}</span></td>
                <td class="mw">{{ h.titulo }}<span class="sm">{{ h.subtitulo }}</span></td><td>{{ h.dato1 }}</td><td>{{ h.dato2 }}</td><td class="mu2 sm2">{{ h.destino }}</td>
                <td><span class="pill" :class="NV[h.nivel]">{{ h.nivel }}</span></td><td class="det">{{ h.detalle }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>Cronogramas Rev00</h2>
        <p class="sub">Leídos del PDF: tareas, cantidades y fechas</p>
        <div class="sx">
          <table class="t w11" data-sin-filtro>
            <thead><tr><th>Cronograma (PDF)</th><th>Versión</th><th>Frentes</th><th>Nivel</th><th>Hallazgo</th></tr></thead>
            <tbody>
              <tr v-for="h in de('cronograma')" :key="h.id" :class="{ res: h.estado === 'resuelto' }">
                <td class="b">{{ h.titulo }}</td><td>{{ h.subtitulo }}</td><td class="mu2">{{ h.frente }}</td>
                <td><span class="pill" :class="h.estado === 'resuelto' ? 'ok' : NV[h.nivel]">{{ h.estado === 'resuelto' ? 'Resuelto' : h.nivel }}</span></td>
                <td class="det w">{{ h.detalle }}<template v-if="h.estado === 'resuelto' && h.accion"> <em>{{ h.accion }}</em></template></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>Filtro forense de reportes de campo</h2>
        <p class="sub">Ejemplos reales detectados en los RDC</p>
        <div class="sx">
          <table class="t w9" data-sin-filtro>
            <thead><tr><th>Frente</th><th>Texto reportado</th><th>Problema</th><th>Acción del agente</th></tr></thead>
            <tbody>
              <tr v-for="h in de('filtro')" :key="h.id"><td class="b">{{ h.frente }}</td><td>{{ h.titulo }}</td><td class="ro">{{ h.detalle }}</td><td class="mu2">{{ h.accion }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ban { gap: 16px; }
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.top p { margin: 0; font-size: 13px; }
.pri { min-height: 40px; padding: 0 16px; border-radius: 10px; background: #f5a800; color: #0d0f10; border: 0; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.gh { background: transparent; color: var(--p-text); border: 1px solid #3a3f47; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; }
.gh.s { min-height: 32px; padding: 0 10px; font-size: 12.5px; flex: none; }
.kpis { display: flex; flex-wrap: wrap; gap: 12px; }
.kpi { flex: 1 1 180px; padding: 14px 16px; border-radius: 12px; background: var(--p-card); border: 1px solid var(--p-line); }
.kpi .l { margin: 0; color: var(--p-muted); font-size: 12.5px; }
.kpi .v { margin: 6px 0 3px; font-size: 25px; font-weight: 700; }
.kpi .s { margin: 0; color: var(--p-muted); font-size: 12px; }
.ro { color: #fca5a5; }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
@media (max-width: 1100px) { .g2 { grid-template-columns: minmax(0, 1fr); } }
.card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.card.dec { border-color: rgba(245, 168, 0, 0.5); }
.card h2 { margin: 0; font-size: 17px; font-weight: 700; }
.sub { margin: 4px 0 12px; color: var(--p-muted); font-size: 12.5px; }
.dl { margin: 0; padding-left: 20px; font-size: 13.5px; color: #d6dae0; }
.dl li { margin-bottom: 8px; line-height: 1.5; }
.dl li > span { display: inline; }
.dl li { display: list-item; }
.dl li button { margin-left: 8px; vertical-align: middle; }
.dl li.res { color: var(--p-muted); }
.dl li.res b { text-decoration: line-through; }
em { color: #86efac; font-style: normal; }
.ev { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ev li { display: flex; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--p-chip); }
.ev b { font-size: 13.5px; }
.ev p { margin: 3px 0 0; color: #d6dae0; font-size: 12.5px; line-height: 1.45; }
.pill { display: inline-flex; padding: 2px 9px; border-radius: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; height: fit-content; }
.pill.ok { background: rgba(34, 197, 94, 0.16); color: #4ade80; }
.pill.wa { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
.pill.da { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
.pill.in { background: rgba(96, 165, 250, 0.16); color: #93c5fd; }
.pill.pr { background: rgba(192, 132, 252, 0.16); color: #d8b4fe; }
.sx { overflow-x: auto; }
.t { width: 100%; border-collapse: collapse; }
.t.w15 { min-width: 1500px; } .t.w11 { min-width: 1100px; } .t.w9 { min-width: 900px; }
.t th { text-align: left; padding: 9px 10px; font-size: 11.5px; font-weight: 700; color: var(--p-muted); text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid var(--p-line); }
.t td { padding: 10px; border-bottom: 1px solid var(--p-line); vertical-align: top; font-size: 13px; line-height: 1.45; }
.t tr.res td { opacity: 0.65; }
.b { font-weight: 700; }
.mw { min-width: 220px; }
.sm { display: block; color: var(--p-muted); font-size: 12px; }
.sm2 { font-size: 12.5px; }
.mu { color: var(--p-muted); }
.mu2 { color: #c9ced6; }
.det { font-size: 12.5px; color: #d6dae0; }
.det.w { min-width: 420px; }
.erm { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(248, 113, 113, 0.1); color: #fca5a5; font-size: 13px; }
</style>

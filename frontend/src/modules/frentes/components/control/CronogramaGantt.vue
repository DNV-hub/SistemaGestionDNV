<script setup>
// Cronograma Rev00 vs ejecutado (v5): sombra plomo = programado, marca
// ámbar = día con avance aprobado, línea amarilla = día seleccionado.
import { computed } from 'vue'
import { semanaDe } from '../../services/controlObraService'
import { descargarExcel } from '../../../../utils/exportarExcel'

const props = defineProps({
  partidas: { type: Array, default: () => [] },
  avance: { type: Array, default: () => [] },
  dia: { type: String, required: true },
  nombreFrente: { type: String, default: '' },
  sector: { type: String, default: 'all' },
  porAprobar: { type: Array, default: () => [] },
})

const iso = (d) => d.toISOString().slice(0, 10)
const addD = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const dias = computed(() => {
  if (!props.partidas.length) return []
  const ini = semanaDe(props.partidas.reduce((a, p) => (p.inicio < a ? p.inicio : a), props.partidas[0].inicio)).desde
  const finP = props.partidas.reduce((a, p) => (p.fin > a ? p.fin : a), props.partidas[0].fin)
  const fin = semanaDe(finP).hasta
  const out = []
  for (let d = ini; d <= fin; d = addD(d, 1)) out.push(d)
  return out
})
const semanas = computed(() => {
  const m = []
  for (const d of dias.value) {
    const s = semanaDe(d)
    if (!m.length || m[m.length - 1].clave !== s.clave) m.push({ ...s, n: 0 })
    m[m.length - 1].n++
  }
  return m
})
const BAC = computed(() => props.partidas.reduce((a, p) => a + Number(p.hh || 0), 0))
const porEdt = computed(() => {
  const m = new Map()
  for (const a of props.avance) {
    if (!m.has(a.edt)) m.set(a.edt, new Map())
    m.get(a.edt).set(a.fecha, Number(a.cantidad))
  }
  return m
})
const filas = computed(() => props.partidas.map((p) => {
  const av = porEdt.value.get(p.edt) ?? new Map()
  let acum = 0
  for (const [f, c] of av) if (f <= props.dia) acum += c
  const atrasada = (p.fin < props.dia && acum < Number(p.metrado) * 0.999) || (p.inicio <= props.dia && acum === 0)
  const pa = props.porAprobar.filter((x) => x.edt === p.edt).map((x) => x.fecha)
  return { ...p, av, pa, acum, atrasada, peso: BAC.value ? (Number(p.hh) / BAC.value) * 100 : 0 }
}))
const enSector = (f) => props.sector === 'all' || !f.sector_codigo || f.sector_codigo.split(',').includes(props.sector)
const grupos = computed(() => {
  const m = []
  for (const f of filas.value) {
    const g = f.grupo || 'Partidas'
    if (!m.length || m[m.length - 1].nombre !== g) m.push({ nombre: g, edt: f.edt.split('.')[0], filas: [] })
    m[m.length - 1].filas.push(f)
  }
  return m.map((g) => ({ ...g, peso: g.filas.reduce((a, f) => a + f.peso, 0) }))
})
const n = computed(() => dias.value.length)
const pos = (d) => (dias.value.indexOf(d) / n.value) * 100
const ancho = 100 / Math.max(1, 1)
const fmt = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const semDia = computed(() => semanaDe(props.dia).clave)

function exportar() {
  descargarExcel(`cronograma_rev00_vs_ejecutado_${props.nombreFrente || 'frente'}.xlsx`, [
    {
      nombre: 'Cronograma',
      filas: filas.value.map((f) => ({
        EDT: f.edt, Partida: f.nombre, Unidad: f.unidad, Metrado: Number(f.metrado), HH: Number(f.hh),
        'Peso %': Math.round(f.peso * 10) / 10, Inicio: f.inicio, Fin: f.fin,
        [`Ejecutado al ${fmt(props.dia)}`]: Math.round(f.acum * 100) / 100,
        'Avance %': Number(f.metrado) ? Math.round((f.acum / Number(f.metrado)) * 1000) / 10 : 0,
        Estado: f.atrasada ? 'Atrasada' : 'En plazo',
      })),
    },
    { nombre: 'Avance diario', filas: props.avance.map((a) => ({ EDT: a.edt, Fecha: a.fecha, Cantidad: Number(a.cantidad) })) },
  ])
}
void ancho
</script>

<template>
  <section class="v5-card">
    <div class="top">
      <div>
        <h2>Cronograma · Rev00 vs ejecutado</h2>
        <p>Línea base Rev00 · avance aprobado por día</p>
      </div>
      <button type="button" class="gh" :disabled="!partidas.length" @click="exportar">Excel</button>
    </div>
    <p v-if="!partidas.length" class="vacio">Este frente todavía no tiene la línea base por partida cargada.</p>
    <template v-else>
      <div class="ley">
        <span><i class="sh"></i>Sombra plomo: programado Rev00 (línea base)</span>
        <span><i class="am"></i>Marca ámbar: día con avance aprobado</span>
        <span><i class="ln"></i>Línea amarilla: día seleccionado / fecha de dato</span>
        <span><i class="pa-l"></i>Reportado, por aprobar en la bandeja</span>
        <span><b class="rojo">Partida</b> En rojo: partida atrasada</span>
      </div>
      <div class="tabla">
        <div class="cab">
          <span>EDT</span><span>Partida</span><span class="r">Peso</span>
          <div class="eje">
            <div class="sems">
              <span v-for="s in semanas" :key="s.clave" :style="{ width: (s.n / n) * 100 + '%' }" :class="{ act: s.clave === semDia }">{{ s.clave }} · {{ fmt(s.desde) }}–{{ fmt(s.hasta) }}</span>
            </div>
            <div class="nums"><span v-for="d in dias" :key="d" :style="{ width: 100 / n + '%' }">{{ +d.slice(8, 10) }}</span></div>
          </div>
        </div>
        <template v-for="g in grupos" :key="g.nombre">
          <div class="fila grp">
            <span class="edt g">{{ g.edt }}</span>
            <span class="nom g" :title="g.nombre">{{ g.nombre }}</span>
            <span class="r peso g">{{ g.peso.toFixed(1) }}%</span>
            <div class="eje barra"><i class="hoy" :style="{ left: (pos(dia) + 50 / n) + '%' }"></i></div>
          </div>
          <div v-for="f in g.filas" :key="f.edt" class="fila" :class="{ apagada: !enSector(f) }">
            <span class="edt">{{ f.edt }}</span>
            <span class="nom" :class="{ rojo: f.atrasada }" :title="f.nombre">{{ f.nombre }}</span>
            <span class="r peso">{{ f.peso.toFixed(1) }}%</span>
            <div class="eje barra">
              <i class="prog" :style="{ left: pos(f.inicio) + '%', width: ((dias.indexOf(f.fin) - dias.indexOf(f.inicio) + 1) / n) * 100 + '%' }"></i>
              <template v-for="[d] in f.av" :key="d">
                <i v-if="d <= dia && dias.includes(d)" class="ej" :style="{ left: pos(d) + '%', width: 100 / n + '%' }"></i>
              </template>
              <template v-for="d in f.pa" :key="'p' + d">
                <i v-if="d <= dia && dias.includes(d)" class="pa" :style="{ left: pos(d) + '%', width: 100 / n + '%' }" title="Reportado en RDC, por aprobar en la bandeja"></i>
              </template>
              <i class="hoy" :style="{ left: (pos(dia) + 50 / n) + '%' }"></i>
            </div>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.v5-card { background: var(--p-card); border: 1px solid var(--p-line); border-radius: 12px; padding: 16px; min-width: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
h2 { margin: 0; font-size: 17px; font-weight: 700; }
.top p { margin: 4px 0 0; color: var(--p-muted); font-size: 12.5px; }
.gh { min-height: 40px; padding: 0 16px; border-radius: 10px; font: inherit; font-weight: 700; cursor: pointer; background: transparent; color: var(--p-text); border: 1px solid var(--p-line); }
.vacio { color: var(--p-muted); font-size: 14px; }
.ley { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 10px 12px; border-radius: 10px; background: var(--p-chip); font-size: 12.5px; color: var(--p-muted); margin-bottom: 12px; }
.ley span { display: inline-flex; align-items: center; gap: 7px; }
.sh { width: 26px; height: 12px; background: #3a3f47; border: 1px solid #6b7280; border-radius: 3px; display: inline-block; }
.am { width: 10px; height: 10px; background: #f59e0b; border-radius: 2px; display: inline-block; }
.ln { width: 2px; height: 14px; background: #f5a800; display: inline-block; }
.rojo { color: #f87171 !important; }
.tabla { overflow-x: auto; }
.cab, .fila { display: grid; grid-template-columns: 52px minmax(180px, 260px) 52px minmax(520px, 1fr); gap: 6px; align-items: center; }
.cab { font-size: 11.5px; color: var(--p-muted); font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--p-line); }
.r { text-align: right; }
.sems { display: flex; }
.sems span { font-size: 11.5px; font-weight: 700; white-space: nowrap; overflow: hidden; }
.sems span.act { color: #f5a800; }
.nums { display: flex; }
.nums span { font-size: 10px; text-align: center; font-weight: 500; }
.grp { background: var(--p-chip); min-height: 30px !important; }
.g { font-weight: 800; font-size: 12px; color: var(--p-text) !important; text-transform: uppercase; letter-spacing: 0.2px; border-left: 0 !important; }
.apagada { opacity: 0.3; }
.fila { min-height: 35px; border-bottom: 1px solid var(--p-line); font-size: 13px; }
.edt { color: var(--p-muted); border-left: 2px solid #f5a800; padding-left: 4px; }
.nom { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.peso { color: var(--p-muted); font-size: 12px; }
.barra { position: relative; height: 22px; }
.prog { position: absolute; top: 3px; height: 16px; background: #3a3f47; border: 1px solid #6b7280; border-radius: 4px; box-sizing: border-box; }
.ej { position: absolute; top: 6px; height: 11px; background: #f59e0b; border-radius: 2px; box-sizing: border-box; border: 1px solid rgba(0,0,0,0.25); }
.pa { position: absolute; top: 6px; height: 11px; border: 1.5px dashed #f59e0b; border-radius: 2px; box-sizing: border-box; }
.pa-l { width: 10px; height: 10px; border: 1.5px dashed #f59e0b; display: inline-block; box-sizing: border-box; }
.hoy { position: absolute; top: -6px; bottom: -6px; width: 2px; background: #f5a800; }
</style>

<script setup>
// PRUEBA 18/11/2026 · Conciliación del frente con Almacén por sector.
// Lee solo vistas nuevas (ctl_conciliacion_material, ctl_vales_destino) y la
// tabla ctl_sectores: no escribe nada ni cambia el flujo actual de Procura.
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../../../services/supabaseClient'
import { descargarExcel } from '../../../utils/exportarExcel'

const props = defineProps({
  frenteId: { type: String, required: true },
  nombreFrente: { type: String, default: '' },
})

const cargando = ref(false)
const error = ref('')
const sectores = ref([])
const filas = ref([])
const vales = ref(null)
const sector = ref('todo')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [s, c, v] = await Promise.all([
      supabase.from('ctl_sectores').select('codigo, nombre, tipo, orden').eq('frente_id', props.frenteId).order('orden'),
      supabase.from('ctl_conciliacion_material').select('*').eq('frente_id', props.frenteId),
      supabase.from('ctl_vales_destino').select('*').eq('frente_id', props.frenteId).maybeSingle(),
    ])
    if (s.error) throw s.error
    if (c.error) throw c.error
    sectores.value = s.data ?? []
    filas.value = (c.data ?? []).sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || ''))
    vales.value = v.data ?? null
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo cargar la conciliación con Almacén.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)
watch(() => props.frenteId, cargar)

const opciones = computed(() => [
  { codigo: 'todo', nombre: 'Todo el frente' },
  ...sectores.value,
  { codigo: 'GEN', nombre: 'General / facilidades' },
])

const visibles = computed(() =>
  sector.value === 'todo' ? filas.value : filas.value.filter((f) => (f.sectores ?? ['GEN']).includes(sector.value)),
)

const nombreSector = (cod) => opciones.value.find((o) => o.codigo === cod)?.nombre ?? cod
const n = (x) => {
  const v = Number(x) || 0
  return v === 0 ? '—' : v.toLocaleString('es-PE', { maximumFractionDigits: 2 })
}

function alerta(f) {
  const neto = Number(f.neto_en_frente) || 0
  const porRecibir = Number(f.devolucion_por_recibir) || 0
  if (porRecibir > 0 && porRecibir > neto) return { t: 'Devolución mayor que lo neto en el frente', k: 'mal' }
  if (Number(f.sin_destino_declarado) > 0) return { t: 'Vale sin destino declarado', k: 'warn' }
  if (Number(f.declarado_facilidades) > 0) return { t: 'Parte usada en facilidades: no valoriza', k: 'info' }
  if (porRecibir > 0) return { t: 'Almacén debe recibir la devolución', k: 'warn' }
  return { t: 'OK', k: 'ok' }
}
const claseEstado = (e) => ({ Recibida: 'ok', 'Por recibir': 'warn', Rechazada: 'mal' })[e] ?? 'neu'

function exportar() {
  descargarExcel(`conciliacion_almacen_${props.nombreFrente || 'frente'}.xlsx`, [
    {
      nombre: 'Conciliación',
      filas: visibles.value.map((f) => ({
        Código: f.codigo,
        Material: f.descripcion,
        Unidad: f.unidad,
        Sector: (f.sectores ?? []).map(nombreSector).join(' · '),
        'Salió de almacén': Number(f.salida),
        'Transf. entrada': Number(f.transf_entrada),
        'Transf. salida': Number(f.transf_salida),
        'Devuelto (recibido)': Number(f.devuelto_recibido),
        'Devolución por recibir': Number(f.devolucion_por_recibir),
        'Neto en frente': Number(f.neto_en_frente),
        'Declarado en facilidades': Number(f.declarado_facilidades),
        'Sin destino declarado': Number(f.sin_destino_declarado),
        'Estado devolución': f.estado_devolucion,
        Devoluciones: f.devoluciones_detalle ?? '',
        Alerta: alerta(f).t,
      })),
    },
  ])
}
</script>

<template>
  <section class="cc">
    <div class="cc-head">
      <div>
        <div class="pl-sh">Conciliación con Almacén <span class="cc-prueba">Prueba</span></div>
        <p class="cc-sub">Salidas, transferencias y devoluciones según el estado de Almacén, por sector del frente.</p>
      </div>
      <button type="button" class="pl-ghost sm" :disabled="!visibles.length" @click="exportar">Exportar Excel</button>
    </div>

    <div class="cc-segs" role="group" aria-label="Sector">
      <button
        v-for="o in opciones"
        :key="o.codigo"
        type="button"
        class="pl-seg"
        :class="{ on: sector === o.codigo }"
        :aria-pressed="sector === o.codigo"
        @click="sector = o.codigo"
      >{{ o.nombre }}</button>
    </div>

    <p v-if="vales && vales.sin_destino" class="cc-aviso">
      {{ vales.sin_destino }} de {{ vales.vales }} vales de este frente no tienen destino declarado. Sin destino no se puede separar
      el sostenimiento de las facilidades (línea de vida, tirolina, barrera provisional, patín).
    </p>

    <p v-if="cargando" class="cc-vacio">Cargando…</p>
    <p v-else-if="error" class="cc-error">{{ error }}</p>
    <div v-else class="cc-tabla">
      <table data-sin-filtro>
        <thead>
          <tr>
            <th>Material</th>
            <th>Sector</th>
            <th class="r">Salió</th>
            <th class="r">Transf. ±</th>
            <th class="r">Devuelto</th>
            <th class="r">Por recibir</th>
            <th class="r">Neto en frente</th>
            <th class="r">En facilidades</th>
            <th>Devolución</th>
            <th>Alerta</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in visibles" :key="f.material_id">
            <td class="mat">{{ f.descripcion }}<span>{{ f.codigo }} · {{ f.unidad }}</span></td>
            <td class="sec">{{ (f.sectores ?? []).map(nombreSector).join(' · ') }}</td>
            <td class="r">{{ n(f.salida) }}</td>
            <td class="r">{{ n(Number(f.transf_entrada) - Number(f.transf_salida)) }}</td>
            <td class="r">{{ n(f.devuelto_recibido) }}</td>
            <td class="r">{{ n(f.devolucion_por_recibir) }}</td>
            <td class="r b">{{ n(f.neto_en_frente) }}</td>
            <td class="r">{{ n(f.declarado_facilidades) }}</td>
            <td><span class="cc-pill" :class="claseEstado(f.estado_devolucion)" :title="f.devoluciones_detalle || ''">{{ f.estado_devolucion }}</span></td>
            <td><span class="cc-pill" :class="alerta(f).k">{{ alerta(f).t }}</span></td>
          </tr>
          <tr v-if="!visibles.length">
            <td colspan="10" class="cc-vacio">Sin movimientos de Almacén para este sector.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.cc { background: var(--p-card); border-radius: 20px; box-shadow: 0 0 0 1px var(--p-line); padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.cc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.cc-sub { margin: 4px 0 0; color: var(--p-muted); font-size: 13px; }
.cc-prueba { margin-left: 8px; padding: 2px 8px; border-radius: 999px; background: var(--p-warn-bg); color: var(--p-warn-fg); font-size: 11px; letter-spacing: 0; }
.cc-segs { display: flex; flex-wrap: wrap; gap: 4px; }
.cc-aviso { margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--p-low-bg); color: var(--p-low-fg); font-size: 13px; line-height: 1.45; }
.cc-tabla { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 1100px; font-size: 13px; }
th { text-align: left; padding: 8px 10px; color: var(--p-muted); font-size: 11.5px; font-weight: 700; border-bottom: 1px solid var(--p-line); white-space: nowrap; }
td { padding: 9px 10px; border-bottom: 1px solid var(--p-line); vertical-align: top; }
.r { text-align: right; white-space: nowrap; }
.b { font-weight: 800; }
.mat { font-weight: 600; min-width: 220px; }
.mat span { display: block; color: var(--p-muted); font-size: 11.5px; font-weight: 400; }
.sec { color: var(--p-muted); font-size: 12px; }
.cc-pill { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.cc-pill.ok { background: var(--p-ok-bg); color: var(--p-ok-fg); }
.cc-pill.warn { background: var(--p-warn-bg); color: var(--p-warn-fg); }
.cc-pill.mal { background: var(--p-low-bg); color: var(--p-low-fg); }
.cc-pill.info { background: var(--p-info-bg); color: var(--p-info-fg); }
.cc-pill.neu { background: var(--p-neu-bg); color: var(--p-neu-fg); }
.cc-vacio { color: var(--p-muted); font-size: 13px; }
.cc-error { color: var(--p-danger); }
</style>

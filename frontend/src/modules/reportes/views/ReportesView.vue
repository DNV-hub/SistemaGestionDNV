<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useReportesStore } from '../store/reportes'
import { descargarExcel } from '../../../utils/exportarExcel'
import { formatearNumero } from '../../../utils/formatearNumero'

const reportes = useReportesStore()

const tab = ref('salidas')
const generando = ref(false)
const error = ref('')

onMounted(() => reportes.cargarFiltros())

// ---------------------------------------------------------------------------
// Salidas por frente: cuánto material salió de verdad (entregas físicas),
// agrupado por frente + material, en el rango de fechas que se elija.
// ---------------------------------------------------------------------------
const filtrosSalidas = reactive({ frenteId: '', desde: '', hasta: '' })
const filasSalidas = ref(null)

async function generarSalidas() {
  error.value = ''
  generando.value = true
  try {
    const salidas = await reportes.obtenerSalidasPorFrente({
      frenteId: filtrosSalidas.frenteId || null,
      desde: filtrosSalidas.desde || null,
      hasta: filtrosSalidas.hasta || null,
    })

    const porGrupo = new Map()
    for (const s of salidas) {
      const clave = `${s.frentes?.id}:${s.materiales?.id}`
      if (!porGrupo.has(clave)) {
        porGrupo.set(clave, {
          frenteCodigo: s.frentes?.codigo ?? '—',
          frenteNombre: s.frentes?.nombre ?? '—',
          contrato: s.contratos?.nombre ?? '—',
          codigo: s.materiales?.codigo ?? '—',
          descripcion: s.materiales?.descripcion ?? '—',
          unidad: s.materiales?.unidad ?? '',
          cantidad: 0,
        })
      }
      porGrupo.get(clave).cantidad += Number(s.cantidad)
    }
    filasSalidas.value = [...porGrupo.values()].sort(
      (a, b) => a.frenteCodigo.localeCompare(b.frenteCodigo) || a.codigo.localeCompare(b.codigo)
    )
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo generar el reporte.'
  } finally {
    generando.value = false
  }
}

function exportarSalidas() {
  descargarExcel(`salidas_por_frente_${filtrosSalidas.desde || 'inicio'}_${filtrosSalidas.hasta || 'hoy'}.xlsx`, [
    {
      nombre: 'Salidas por frente',
      filas: filasSalidas.value.map((f) => ({
        Frente: `${f.frenteCodigo} — ${f.frenteNombre}`,
        Contrato: f.contrato,
        Código: f.codigo,
        Material: f.descripcion,
        Unidad: f.unidad,
        'Cantidad entregada': f.cantidad,
      })),
    },
  ])
}

// ---------------------------------------------------------------------------
// Procura vs consumo, de todos los frentes a la vez — mismo cálculo que la
// comparación de cada frente, pero junto y con la columna "Excedido".
// ---------------------------------------------------------------------------
const filasComparacion = ref(null)

async function generarComparacion() {
  error.value = ''
  generando.value = true
  try {
    const comparacion = await reportes.obtenerComparacionGeneral()
    const frentesPorId = new Map(reportes.frentes.map((f) => [f.id, f]))
    const materialesPorId = new Map(reportes.materialesActivos.map((m) => [m.id, m]))

    filasComparacion.value = comparacion
      .map((c) => {
        const frente = frentesPorId.get(c.frente_id)
        const material = materialesPorId.get(c.material_id)
        return {
          frenteCodigo: frente?.codigo ?? '—',
          frenteNombre: frente?.nombre ?? '—',
          codigo: material?.codigo ?? '—',
          descripcion: material?.descripcion ?? '—',
          unidad: c.unidad,
          previsto: c.cantidad_prevista,
          reservado: c.cantidad_reservada,
          solicitado: c.cantidad_solicitada,
          entregado: c.cantidad_entregada,
          saldo: c.saldo,
          porcentaje: c.porcentaje_consumo,
          desviacion: c.desviacion,
          excedido: c.porcentaje_consumo !== null && c.porcentaje_consumo >= 100,
        }
      })
      .sort((a, b) => a.frenteCodigo.localeCompare(b.frenteCodigo) || a.codigo.localeCompare(b.codigo))
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo generar el reporte.'
  } finally {
    generando.value = false
  }
}

function exportarComparacion() {
  descargarExcel(`procura_vs_consumo_${new Date().toISOString().slice(0, 10)}.xlsx`, [
    {
      nombre: 'Procura vs consumo',
      filas: filasComparacion.value.map((f) => ({
        Frente: `${f.frenteCodigo} — ${f.frenteNombre}`,
        Código: f.codigo,
        Material: f.descripcion,
        Unidad: f.unidad,
        Previsto: f.previsto,
        Reservado: f.reservado,
        Solicitado: f.solicitado,
        Entregado: f.entregado,
        Saldo: f.saldo,
        '% Consumo': f.porcentaje ?? '',
        Desviación: f.desviacion,
        Excedido: f.excedido ? 'Sí' : 'No',
      })),
    },
  ])
}

const hayFilasSalidas = computed(() => filasSalidas.value?.length)
const hayFilasComparacion = computed(() => filasComparacion.value?.length)

// ---------------------------------------------------------------------------
// EDP: lo mismo que "Salidas por frente" pero en la unidad del cliente
// (m2, ml…) en vez de la unidad de Almacén — solo materiales que tienen
// conversión configurada en el catálogo.
// ---------------------------------------------------------------------------
const filtrosEdp = reactive({ frenteId: '', desde: '', hasta: '' })
const filasEdp = ref(null)

async function generarEdp() {
  error.value = ''
  generando.value = true
  try {
    const salidas = await reportes.obtenerSalidasEdp({
      frenteId: filtrosEdp.frenteId || null,
      desde: filtrosEdp.desde || null,
      hasta: filtrosEdp.hasta || null,
    })

    // El código de catálogo es SOLO una clasificación para este reporte:
    // varios materiales del almacén (ej. "Cable 15mm rojo" y "Cable 15mm
    // verde", cada uno su propia fila de stock) pueden compartir código
    // (CA.15) y acá sí van consolidados en una sola línea — pero eso nunca
    // toca ni fusiona las filas reales de stock, que siguen siendo
    // independientes por material.
    const porGrupo = new Map()
    for (const s of salidas) {
      const clave = `${s.frentes?.id}:${s.materiales?.codigo ?? '—'}`
      if (!porGrupo.has(clave)) {
        porGrupo.set(clave, {
          frenteCodigo: s.frentes?.codigo ?? '—',
          frenteNombre: s.frentes?.nombre ?? '—',
          codigo: s.materiales?.codigo ?? '—',
          descripcionEdp: null, // se resuelve abajo: nombre EDP configurado si hay, si no el código
          unidadEdp: s.materiales?.unidad_edp || '—',
          unidadAlmacen: s.materiales?.unidad ?? '',
          cantidadAlmacen: 0,
          cantidadEdp: 0,
        })
      }
      const grupo = porGrupo.get(clave)
      if (!grupo.descripcionEdp && s.materiales?.nombres_edp?.nombre) grupo.descripcionEdp = s.materiales.nombres_edp.nombre
      grupo.cantidadAlmacen += Number(s.cantidad)
      grupo.cantidadEdp += Number(s.cantidad_edp)
    }
    for (const grupo of porGrupo.values()) {
      grupo.descripcion = grupo.descripcionEdp ?? grupo.codigo
      grupo.descripcionEdp = grupo.descripcionEdp ?? '—'
    }
    filasEdp.value = [...porGrupo.values()].sort(
      (a, b) => a.frenteCodigo.localeCompare(b.frenteCodigo) || a.codigo.localeCompare(b.codigo)
    )
  } catch (e) {
    console.error(e)
    error.value = 'No se pudo generar el reporte.'
  } finally {
    generando.value = false
  }
}

function exportarEdp() {
  descargarExcel(`edp_${filtrosEdp.desde || 'inicio'}_${filtrosEdp.hasta || 'hoy'}.xlsx`, [
    {
      nombre: 'EDP',
      filas: filasEdp.value.map((f) => ({
        Frente: `${f.frenteCodigo} — ${f.frenteNombre}`,
        Código: f.codigo,
        Material: f.descripcion,
        'Descripción EDP': f.descripcionEdp,
        [`Cantidad (${f.unidadAlmacen})`]: f.cantidadAlmacen,
        'Cantidad EDP': Number(f.cantidadEdp.toFixed(2)),
        'Unidad EDP': f.unidadEdp,
      })),
    },
  ])
}

const hayFilasEdp = computed(() => filasEdp.value?.length)
</script>

<template>
  <div class="reportes">
    <header class="cabecera">
      <h1>Reportes</h1>
    </header>

    <nav class="tabs">
      <button :class="{ activo: tab === 'salidas' }" @click="tab = 'salidas'">Salidas por frente</button>
      <button :class="{ activo: tab === 'procura' }" @click="tab = 'procura'">Procura vs. consumo</button>
      <button :class="{ activo: tab === 'edp' }" @click="tab = 'edp'">EDP</button>
    </nav>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="tab === 'salidas'">
      <p class="ayuda">Cuánto material salió realmente (entregas físicas), agrupado por frente y material.</p>
      <div class="filtros">
        <select v-model="filtrosSalidas.frenteId">
          <option value="">Todos los frentes</option>
          <option v-for="f in reportes.frentes" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
        </select>
        <input v-model="filtrosSalidas.desde" type="date" title="Desde" />
        <input v-model="filtrosSalidas.hasta" type="date" title="Hasta" />
        <button type="button" :disabled="generando" @click="generarSalidas">
          {{ generando ? 'Generando…' : 'Generar reporte' }}
        </button>
        <button v-if="hayFilasSalidas" type="button" class="secundario" @click="exportarSalidas">Exportar Excel</button>
      </div>

      <div v-if="filasSalidas" class="marco-tabla">
        <table>
          <thead>
            <tr>
              <th>Frente</th>
              <th>Contrato</th>
              <th>Código</th>
              <th>Material</th>
              <th>Unidad</th>
              <th>Cantidad entregada</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(f, i) in filasSalidas" :key="i">
              <td>{{ f.frenteCodigo }} — {{ f.frenteNombre }}</td>
              <td>{{ f.contrato }}</td>
              <td>{{ f.codigo }}</td>
              <td class="col-descripcion">{{ f.descripcion }}</td>
              <td>{{ f.unidad }}</td>
              <td class="num">{{ formatearNumero(f.cantidad) }}</td>
            </tr>
            <tr v-if="!filasSalidas.length">
              <td colspan="6" class="vacio">No hay salidas para estos filtros.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else-if="tab === 'procura'">
      <p class="ayuda">
        Comparación Procura vs. consumo de todos los frentes a la vez — "Excedido" marca lo que ya superó el 100% de
        lo previsto.
      </p>
      <div class="filtros">
        <button type="button" :disabled="generando" @click="generarComparacion">
          {{ generando ? 'Generando…' : 'Generar reporte' }}
        </button>
        <button v-if="hayFilasComparacion" type="button" class="secundario" @click="exportarComparacion">
          Exportar Excel
        </button>
      </div>

      <div v-if="filasComparacion" class="marco-tabla">
        <table>
          <thead>
            <tr>
              <th>Frente</th>
              <th>Código</th>
              <th>Material</th>
              <th>Unidad</th>
              <th>Previsto</th>
              <th>Reservado</th>
              <th>Solicitado</th>
              <th>Entregado</th>
              <th>Saldo</th>
              <th>% Consumo</th>
              <th>Excedido</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(f, i) in filasComparacion" :key="i" :class="{ excedido: f.excedido }">
              <td>{{ f.frenteCodigo }} — {{ f.frenteNombre }}</td>
              <td>{{ f.codigo }}</td>
              <td class="col-descripcion">{{ f.descripcion }}</td>
              <td>{{ f.unidad }}</td>
              <td class="num">{{ formatearNumero(f.previsto) }}</td>
              <td class="num">{{ formatearNumero(f.reservado) }}</td>
              <td class="num">{{ formatearNumero(f.solicitado) }}</td>
              <td class="num">{{ formatearNumero(f.entregado) }}</td>
              <td class="num">{{ formatearNumero(f.saldo) }}</td>
              <td class="num">{{ f.porcentaje ?? '—' }}%</td>
              <td>
                <span class="badge" :class="f.excedido ? 'danger' : 'success'">{{ f.excedido ? 'Sí' : 'No' }}</span>
              </td>
            </tr>
            <tr v-if="!filasComparacion.length">
              <td colspan="11" class="vacio">No hay datos de Procura todavía.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else>
      <p class="ayuda">
        Cuánto salió realmente, ya convertido a la unidad del cliente (m2, ml…) — solo materiales con conversión
        configurada en el catálogo.
      </p>
      <div class="filtros">
        <select v-model="filtrosEdp.frenteId">
          <option value="">Todos los frentes</option>
          <option v-for="f in reportes.frentes" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
        </select>
        <input v-model="filtrosEdp.desde" type="date" title="Desde" />
        <input v-model="filtrosEdp.hasta" type="date" title="Hasta" />
        <button type="button" :disabled="generando" @click="generarEdp">
          {{ generando ? 'Generando…' : 'Generar reporte' }}
        </button>
        <button v-if="hayFilasEdp" type="button" class="secundario" @click="exportarEdp">Exportar Excel</button>
      </div>

      <div v-if="filasEdp" class="marco-tabla">
        <table>
          <thead>
            <tr>
              <th>Frente</th>
              <th>Código</th>
              <th>Material</th>
              <th>Descripción EDP</th>
              <th>Cantidad Almacén</th>
              <th>Cantidad EDP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(f, i) in filasEdp" :key="i">
              <td>{{ f.frenteCodigo }} — {{ f.frenteNombre }}</td>
              <td>{{ f.codigo }}</td>
              <td class="col-descripcion">{{ f.descripcion }}</td>
              <td>{{ f.descripcionEdp }}</td>
              <td class="num">{{ formatearNumero(f.cantidadAlmacen) }} {{ f.unidadAlmacen }}</td>
              <td class="num">{{ formatearNumero(f.cantidadEdp, { decimales: 2 }) }} {{ f.unidadEdp }}</td>
            </tr>
            <tr v-if="!filasEdp.length">
              <td colspan="6" class="vacio">No hay salidas con conversión de unidades para estos filtros.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.reportes {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}
.tabs button {
  background: none;
  border: none;
  padding: 0.5rem 0.9rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tabs button.activo {
  color: var(--color-text);
  font-weight: 600;
  border-bottom-color: var(--color-primary);
}
.ayuda {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0 0 1rem;
}
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.filtros select,
.filtros input {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.marco-tabla {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}
th,
td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.86rem;
  text-align: left;
  white-space: nowrap;
}
td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
td.col-descripcion {
  white-space: normal;
  min-width: 200px;
}
tr.excedido td {
  background: var(--color-danger-soft);
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.success {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
  white-space: normal;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

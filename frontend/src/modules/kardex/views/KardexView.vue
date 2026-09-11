<script setup>
import { onMounted, reactive, watch } from 'vue'
import { useKardexStore } from '../store/kardex'
import { useAuthStore } from '../../../store/auth'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'
import { descargarExcel } from '../../../utils/exportarExcel'
import { formatearNumero } from '../../../utils/formatearNumero'

const kardex = useKardexStore()
const auth = useAuthStore()

const filtros = reactive({
  materialId: '',
  almacenId: '',
  tipoMovimiento: '',
  desde: '',
  hasta: '',
})

const ETIQUETAS_TIPO = {
  ingreso: 'Ingreso',
  salida: 'Salida',
  ajuste_positivo: 'Ajuste +',
  ajuste_negativo: 'Ajuste −',
}

function buscar() {
  kardex.buscar({
    materialId: filtros.materialId || null,
    almacenId: filtros.almacenId || null,
    tipoMovimiento: filtros.tipoMovimiento || null,
    desde: filtros.desde || null,
    hasta: filtros.hasta || null,
  })
}

function limpiarFiltros() {
  filtros.materialId = ''
  filtros.almacenId = ''
  filtros.tipoMovimiento = ''
  filtros.desde = ''
  filtros.hasta = ''
  buscar()
}

watch(() => filtros.materialId, buscar)

onMounted(async () => {
  await kardex.cargarFiltros()
  buscar()
})

const ETIQUETAS_TIPO_EXPORT = {
  ingreso: 'Ingreso',
  salida: 'Salida',
  ajuste_positivo: 'Ajuste positivo',
  ajuste_negativo: 'Ajuste negativo',
}

async function exportar() {
  const movimientos = await kardex.obtenerParaExportar({
    materialId: filtros.materialId || null,
    almacenId: filtros.almacenId || null,
    tipoMovimiento: filtros.tipoMovimiento || null,
    desde: filtros.desde || null,
    hasta: filtros.hasta || null,
  })

  descargarExcel(`kardex_${filtros.desde || 'inicio'}_${filtros.hasta || 'hoy'}.xlsx`, [
    {
      nombre: 'Kardex',
      filas: movimientos.map((m) => ({
        'Fecha/Hora': new Date(m.fecha_hora).toLocaleString(),
        Tipo: ETIQUETAS_TIPO_EXPORT[m.tipo_movimiento] ?? m.tipo_movimiento,
        Almacén: m.almacenes?.nombre ?? '',
        Código: m.materiales?.codigo ?? '',
        Descripción: m.materiales?.descripcion ?? '',
        Cantidad: m.cantidad,
        Unidad: m.materiales?.unidad ?? '',
        'Saldo resultante': m.saldo_resultante,
        Vale: m.vales?.numero ?? '',
        'Frente código': m.vales?.frentes?.codigo ?? '',
        'Frente nombre': m.vales?.frentes?.nombre ?? '',
        'Frente área': m.vales?.frentes?.area ?? '',
        'Frente estado': m.vales?.frentes?.estado ?? '',
        'Frente fecha inicio': m.vales?.frentes?.fecha_inicio ?? '',
        'Frente fecha cierre': m.vales?.frentes?.fecha_cierre ?? '',
        'Solicitado por': m.vales?.usuarios?.nombre ?? '',
        Usuario: m.usuarios?.nombre ?? '',
        Observación: m.observacion ?? '',
      })),
    },
  ])
}
</script>

<template>
  <div class="kardex">
    <header class="cabecera">
      <h1>Kardex</h1>
      <button v-if="auth.tienePermiso('kardex.exportar')" class="secundario" :disabled="kardex.exportando" @click="exportar">
        {{ kardex.exportando ? 'Exportando…' : 'Exportar Excel' }}
      </button>
    </header>

    <div class="filtros">
      <BuscadorMaterial v-model="filtros.materialId" :materiales="kardex.materialesActivos" class="buscador" />

      <select v-model="filtros.almacenId" @change="buscar">
        <option value="">Todos los almacenes</option>
        <option v-for="a in kardex.almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
      </select>

      <select v-model="filtros.tipoMovimiento" @change="buscar">
        <option value="">Todos los movimientos</option>
        <option value="ingreso">Ingreso</option>
        <option value="salida">Salida</option>
        <option value="ajuste_positivo">Ajuste positivo</option>
        <option value="ajuste_negativo">Ajuste negativo</option>
      </select>

      <input v-model="filtros.desde" type="date" title="Desde" @change="buscar" />
      <input v-model="filtros.hasta" type="date" title="Hasta" @change="buscar" />

      <button type="button" class="secundario" @click="limpiarFiltros">Limpiar</button>
    </div>

    <p v-if="kardex.error" class="error">{{ kardex.error }}</p>
    <p v-if="kardex.cargando">Cargando…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>Fecha/Hora</th>
          <th>Tipo</th>
          <th>Almacén</th>
          <th>Código</th>
          <th>Descripción</th>
          <th>Cantidad</th>
          <th>Saldo resultante</th>
          <th>Vale</th>
          <th>Frente</th>
          <th>Solicitado por</th>
          <th>Usuario</th>
          <th>Observación</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in kardex.movimientos" :key="m.id">
          <td>{{ new Date(m.fecha_hora).toLocaleString() }}</td>
          <td>
            <span class="badge" :class="m.tipo_movimiento">{{ ETIQUETAS_TIPO[m.tipo_movimiento] }}</span>
          </td>
          <td>{{ m.almacenes?.nombre ?? '—' }}</td>
          <td>{{ m.materiales?.codigo ?? '—' }}</td>
          <td>{{ m.materiales?.descripcion ?? '—' }}</td>
          <td class="num">{{ formatearNumero(m.cantidad) }} {{ m.materiales?.unidad }}</td>
          <td class="num">{{ formatearNumero(m.saldo_resultante) }}</td>
          <td>{{ m.vales?.numero ?? '—' }}</td>
          <td v-if="m.vales?.frentes">{{ m.vales.frentes.codigo ? m.vales.frentes.codigo + ' — ' : '' }}{{ m.vales.frentes.nombre }}</td>
          <td v-else>—</td>
          <td>{{ m.vales?.usuarios?.nombre ?? '—' }}</td>
          <td>{{ m.usuarios?.nombre ?? '—' }}</td>
          <td>{{ m.observacion ?? '—' }}</td>
        </tr>
        <tr v-if="!kardex.movimientos.length">
          <td colspan="12" class="vacio">No hay movimientos para los filtros seleccionados.</td>
        </tr>
      </tbody>
    </table>
    <p v-if="kardex.movimientos.length === 300" class="aviso-limite">
      Mostrando los últimos 300 movimientos. Usa los filtros para acotar la búsqueda.
    </p>
  </div>
</template>

<style scoped>
.kardex {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.filtros .buscador {
  min-width: 240px;
  flex: 1;
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
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
  white-space: nowrap;
}
.tabla td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tabla th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.ingreso {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.salida {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.ajuste_positivo {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.ajuste_negativo {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
  white-space: normal;
}
.aviso-limite {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--color-warning);
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

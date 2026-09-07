<script setup>
import { onMounted, reactive, watch } from 'vue'
import { useKardexStore } from '../store/kardex'
import BuscadorMaterial from '../../../components/BuscadorMaterial.vue'

const kardex = useKardexStore()

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
</script>

<template>
  <div class="kardex">
    <header class="cabecera">
      <h1>Kardex</h1>
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
          <td>{{ m.cantidad }} {{ m.materiales?.unidad }}</td>
          <td>{{ m.saldo_resultante }}</td>
          <td>{{ m.vales?.numero ?? '—' }}</td>
          <td>{{ m.usuarios?.nombre ?? '—' }}</td>
          <td>{{ m.observacion ?? '—' }}</td>
        </tr>
        <tr v-if="!kardex.movimientos.length">
          <td colspan="10" class="vacio">No hay movimientos para los filtros seleccionados.</td>
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
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: #111827;
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
  border: 1px solid #d1d5db;
  border-radius: 4px;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.secundario {
  background: none;
  border: 1px solid #d1d5db;
  color: #374151;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.85rem;
  white-space: nowrap;
}
.tabla th {
  background: #f3f4f6;
  color: #374151;
  font-weight: 600;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.ingreso {
  background: #dcfce7;
  color: #166534;
}
.badge.salida {
  background: #dbeafe;
  color: #1e40af;
}
.badge.ajuste_positivo {
  background: #e0e7ff;
  color: #3730a3;
}
.badge.ajuste_negativo {
  background: #fee2e2;
  color: #991b1b;
}
.vacio {
  text-align: center;
  color: #6b7280;
  white-space: normal;
}
.aviso-limite {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #92400e;
}
.error {
  color: #b91c1c;
  font-size: 0.9rem;
}
</style>

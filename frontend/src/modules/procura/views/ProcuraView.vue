<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProcuraStore } from '../store/procura'
import { descargarExcel } from '../../../utils/exportarExcel'

const procura = useProcuraStore()
const router = useRouter()

const busqueda = ref('')
// Por defecto se ven TODOS los frentes sin importar su estado — cargar un
// metrado no depende de que el frente esté activo ahora mismo (ver pedido
// del usuario: un frente paralizado o planificado también necesita poder
// cargar/corregir su metrado). Este filtro es solo para acotar la vista
// cuando hace falta, nunca el motivo por el que algo deja de aparecer acá.
const filtroEstado = ref('')
const OPCIONES_ESTADO = [
  { value: '', etiqueta: 'Todos los estados' },
  { value: 'activo', etiqueta: 'Activo' },
  { value: 'proximo', etiqueta: 'Próximo' },
  { value: 'planificado', etiqueta: 'Planificado' },
  { value: 'paralizado', etiqueta: 'Paralizado' },
  { value: 'cerrado', etiqueta: 'Cerrado' },
]

/** Exporta el metrado vigente de TODOS los frentes en una sola hoja — el detalle de un solo frente se exporta desde su propia pantalla. */
function exportarExcel() {
  const filas = procura.metrados
    .filter((m) => Number(m.cantidad_contractual) > 0 || Number(m.cantidad_procura) > 0)
    .map((m) => {
      const frente = procura.frentes.find((f) => f.id === m.frente_id)
      return {
        'Frente código': frente?.codigo ?? '',
        'Frente nombre': frente?.nombre ?? '',
        Área: frente?.area ?? '',
        Sector: frente?.sector ?? '',
        'Nombre EDP': m.nombres_edp?.nombre ?? '',
        Unidad: m.unidad,
        Contractual: m.cantidad_contractual,
        Procura: m.cantidad_procura,
        'Total previsto': Number(m.cantidad_contractual) + Number(m.cantidad_procura),
      }
    })
  descargarExcel('procura_metrado_vigente.xlsx', [{ nombre: 'Metrado vigente', filas }])
}

onMounted(() => procura.cargar())

const bloquesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return procura.bloques.filter(
    (f) =>
      (!filtroEstado.value || f.estado === filtroEstado.value) &&
      (!q ||
        (f.codigo ?? '').toLowerCase().includes(q) ||
        f.nombre.toLowerCase().includes(q) ||
        (f.area ?? '').toLowerCase().includes(q) ||
        (f.sector ?? '').toLowerCase().includes(q))
  )
})

// Misma agrupación visual que en Frentes (sin pestañas): por contrato y,
// dentro de cada uno, por sector — el sector se dibuja como un "corchete"
// gris (fieldset) que envuelve sus bloques.
const gruposPorContrato = computed(() =>
  procura.contratos.map((contrato) => {
    const deEsteContrato = bloquesFiltrados.value.filter((f) => f.contrato_id === contrato.id)
    const porSector = new Map()
    for (const f of deEsteContrato) {
      const sector = f.sector ?? 'Sin sector'
      if (!porSector.has(sector)) porSector.set(sector, [])
      porSector.get(sector).push(f)
    }
    const sectores = [...porSector.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([sector, lista]) => ({ sector, frentes: lista.sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
    return { contrato, sectores, total: deEsteContrato.length }
  })
)

function abrir(frente) {
  router.push(`/procura/${frente.id}`)
}
</script>

<template>
  <div class="procura">
    <header class="cabecera">
      <h1>Metrados Procura</h1>
      <button type="button" class="secundario" @click="exportarExcel">Exportar Excel</button>
    </header>

    <div class="filtros">
      <input v-model="busqueda" type="search" placeholder="Buscar por código, frente, área o sector…" />
      <select v-model="filtroEstado" class="filtro-estado">
        <option v-for="op in OPCIONES_ESTADO" :key="op.value" :value="op.value">{{ op.etiqueta }}</option>
      </select>
    </div>

    <p v-if="procura.error" class="error">{{ procura.error }}</p>
    <p v-if="procura.cargando">Cargando…</p>

    <template v-else>
      <p v-if="!bloquesFiltrados.length" class="vacio">No hay frentes para mostrar.</p>

      <section v-for="grupo in gruposPorContrato" v-else :key="grupo.contrato.id" class="grupo-contrato">
        <h2 class="titulo-contrato">{{ grupo.contrato.nombre }}</h2>
        <p v-if="!grupo.total" class="vacio-contrato">Todavía no hay frentes en este contrato.</p>

        <fieldset v-for="gs in grupo.sectores" :key="gs.sector" class="corchete">
          <legend>{{ gs.sector }}</legend>
          <div class="grid-bloques">
            <button v-for="f in gs.frentes" :key="f.id" type="button" class="bloque" @click="abrir(f)">
              <div class="bloque-cabecera">
                <span v-if="f.codigo" class="codigo">{{ f.codigo }}</span>
                <span class="badge" :class="f.estado">{{ f.estado }}</span>
              </div>
              <div class="nombre">{{ f.nombre }}</div>
              <p
                v-if="f.tieneAlertaNoPrevisto"
                class="aviso-no-previsto"
                title="Hay materiales con salida o reserva en este frente que todavía no tienen metrado — se resuelve solo en cuanto los cargues aquí."
              >
                ⚠ Consumo sin metrado
              </p>
              <div class="area">{{ f.area ?? 'Sin área asignada' }}</div>
              <div class="metricas">
                <div class="metrica">
                  <span class="valor">{{ f.totalMateriales }}</span>
                  <span class="etiqueta">Materiales</span>
                </div>
                <div class="metrica">
                  <span class="valor">{{ f.unidadesDistintas }}</span>
                  <span class="etiqueta">Unidades</span>
                </div>
              </div>
            </button>
          </div>
        </fieldset>
      </section>
    </template>
  </div>
</template>

<style scoped>
.procura {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
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
.filtros {
  margin-bottom: 1.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.filtros input {
  width: 320px;
  max-width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
.filtro-estado {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
}

.grupo-contrato {
  margin-bottom: 1.75rem;
}
.titulo-contrato {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}
.vacio-contrato {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.corchete {
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 0.9rem 0.85rem 0.85rem;
  margin: 0 0 1rem;
  min-width: 0;
}
.corchete legend {
  padding: 0 0.5rem;
  margin-left: 0.4rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.grid-bloques {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 1rem;
}
.bloque {
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1rem 1.1rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font: inherit;
  color: inherit;
}
.bloque:hover {
  border-color: var(--color-text-muted);
}
.bloque:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.bloque-cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.codigo {
  font-weight: 700;
  color: var(--color-text);
  font-size: 0.95rem;
}
.nombre {
  font-weight: 600;
  color: var(--color-text);
}
.area {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin-top: -0.3rem;
}
.aviso-no-previsto {
  margin: -0.2rem 0 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-warning);
}
.metricas {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--color-border);
  text-align: center;
}
.metrica {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.metrica .valor {
  font-weight: 700;
  color: var(--color-text);
  font-size: 1.05rem;
}
.metrica .etiqueta {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.planificado {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.badge.proximo {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.badge.activo {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge.paralizado {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge.cerrado {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

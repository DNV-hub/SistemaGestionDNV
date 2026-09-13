<script setup>
import { computed, onMounted, ref } from 'vue'
import { useFrentesStore } from '../store/frentes'
import { useAuthStore } from '../../../store/auth'
import FrenteFormModal from '../components/FrenteFormModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'

const frentes = useFrentesStore()
const auth = useAuthStore()

const busqueda = ref('')
const mostrarModal = ref(false)
const frenteEnEdicion = ref(null)
const plantillaParaCopia = ref(null)
const aviso = ref('')

const puedeCrear = computed(() => auth.tienePermiso('frentes.crear'))
const puedeEditar = computed(
  () => auth.tienePermiso('frentes.editar') || auth.tienePermiso('frentes.cerrar')
)
const mostrarAcciones = computed(() => puedeEditar.value)

const frentesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return frentes.frentes
  return frentes.frentes.filter(
    (f) =>
      (f.codigo ?? '').toLowerCase().includes(q) ||
      f.nombre.toLowerCase().includes(q) ||
      f.area.toLowerCase().includes(q) ||
      f.sector.toLowerCase().includes(q)
  )
})

// Agrupación puramente visual (sin pestañas): por contrato primero, y
// dentro de cada contrato por sector — cada sector se dibuja como un
// "corchete" gris (fieldset) que envuelve sus tarjetas.
const gruposPorContrato = computed(() =>
  frentes.contratos.map((contrato) => {
    const deEsteContrato = frentesFiltrados.value.filter((f) => f.contrato_id === contrato.id)
    const porSector = new Map()
    for (const f of deEsteContrato) {
      if (!porSector.has(f.sector)) porSector.set(f.sector, [])
      porSector.get(f.sector).push(f)
    }
    const sectores = [...porSector.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([sector, lista]) => ({
        sector,
        frentes: lista.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      }))
    return { contrato, sectores, total: deEsteContrato.length }
  })
)

onMounted(() => frentes.cargar())

function abrirCrear() {
  frenteEnEdicion.value = null
  plantillaParaCopia.value = null
  mostrarModal.value = true
}

function abrirEditar(frente) {
  frenteEnEdicion.value = frente
  plantillaParaCopia.value = null
  mostrarModal.value = true
}

function abrirCopiar(frente) {
  frenteEnEdicion.value = null
  plantillaParaCopia.value = frente
  mostrarModal.value = true
}

function cerrarModal() {
  mostrarModal.value = false
  frenteEnEdicion.value = null
  plantillaParaCopia.value = null
}

async function guardar(payload) {
  aviso.value = ''
  if (frenteEnEdicion.value) {
    await frentes.actualizar(frenteEnEdicion.value.id, payload)
    aviso.value = 'Frente actualizado.'
  } else {
    await frentes.crear(payload)
    aviso.value = 'Frente creado.'
  }
  cerrarModal()
}

async function eliminar(frente) {
  if (!confirm(`¿Eliminar el frente "${frente.nombre}"?`)) return
  aviso.value = ''
  const resultado = await frentes.eliminar(frente.id)
  aviso.value = resultado.eliminado
    ? 'Frente eliminado.'
    : 'Este frente ya tiene vales, salidas o metrados asociados, así que no se puede eliminar: se cerró en su lugar.'
}
</script>

<template>
  <div class="frentes">
    <header class="cabecera">
      <h1>Frentes</h1>
      <button v-if="puedeCrear" @click="abrirCrear">+ Nuevo frente</button>
    </header>

    <div class="filtros">
      <input v-model="busqueda" type="search" placeholder="Buscar por código, frente, área o sector…" />
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="frentes.error" class="error">{{ frentes.error }}</p>

    <p v-if="frentes.cargando">Cargando frentes…</p>

    <template v-else>
      <p v-if="!frentesFiltrados.length" class="vacio">No hay frentes para mostrar.</p>

      <section v-for="grupo in gruposPorContrato" v-else :key="grupo.contrato.id" class="grupo-contrato">
        <h2 class="titulo-contrato">{{ grupo.contrato.nombre }}</h2>
        <p v-if="!grupo.total" class="vacio-contrato">Todavía no hay frentes en este contrato.</p>

        <fieldset v-for="gs in grupo.sectores" :key="gs.sector" class="corchete">
          <legend>{{ gs.sector }}</legend>
          <div class="tarjetas">
            <article
              v-for="f in gs.frentes"
              :key="f.id"
              class="tarjeta"
              :class="{ cerrado: f.estado === 'cerrado', planificado: f.estado === 'planificado' }"
            >
              <header class="tarjeta-cabecera">
                <span class="tarjeta-nombre">{{ f.nombre }}</span>
                <span class="badge" :class="f.estado">{{ f.estado }}</span>
              </header>
              <p class="tarjeta-meta">
                <span v-if="f.codigo" class="tarjeta-codigo">{{ f.codigo }}</span>
                <span>{{ f.area }}</span>
              </p>
              <p class="tarjeta-fechas">
                Desde {{ f.fecha_inicio }}<span v-if="f.fecha_cierre"> · Cerrado {{ f.fecha_cierre }}</span>
              </p>
              <div class="tarjeta-acciones">
                <BotonIcono v-if="puedeCrear" variante="copiar" titulo="Copiar frente" @click="abrirCopiar(f)" />
                <template v-if="mostrarAcciones">
                  <BotonIcono variante="editar" titulo="Editar" @click="abrirEditar(f)" />
                  <BotonIcono variante="eliminar" titulo="Eliminar" @click="eliminar(f)" />
                </template>
              </div>
            </article>
          </div>
        </fieldset>
      </section>
    </template>

    <FrenteFormModal
      v-if="mostrarModal"
      :frente="frenteEnEdicion"
      :plantilla="plantillaParaCopia"
      :contratos="frentes.contratos"
      :puede-editar-estado="auth.tienePermiso('frentes.cerrar') || auth.tienePermiso('frentes.editar')"
      @guardar="guardar"
      @cerrar="cerrarModal"
    />
  </div>
</template>

<style scoped>
.frentes {
  padding: 1.5rem 2rem;
}
.cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.filtros {
  margin-bottom: 1.25rem;
}
.filtros input {
  width: 320px;
  max-width: 100%;
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

/* El "corchete": un fieldset sin caja completa, solo el contorno con la
   etiqueta del sector cortando el borde — agrupa las tarjetas sin ser una
   pestaña ni un panel funcional, es puramente visual. */
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

.tarjetas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.tarjeta {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0.85rem;
}
.tarjeta.cerrado {
  opacity: 0.65;
}
.tarjeta.planificado {
  border-style: dashed;
}
.tarjeta-cabecera {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.tarjeta-nombre {
  font-weight: 600;
  color: var(--color-text);
  font-size: 0.92rem;
}
.tarjeta-meta {
  margin: 0;
  display: flex;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.tarjeta-codigo {
  font-weight: 600;
  color: var(--color-text);
}
.tarjeta-fechas {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.tarjeta-acciones {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge.planificado {
  background: var(--color-info-soft);
  color: var(--color-info);
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
.aviso {
  color: var(--color-success);
  font-size: 0.9rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
</style>

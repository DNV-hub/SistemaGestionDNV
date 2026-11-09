<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFrentesStore } from '../store/frentes'
import { useAuthStore } from '../../../store/auth'
import FrenteFormModal from '../components/FrenteFormModal.vue'
import BotonIcono from '../../../components/BotonIcono.vue'
import { descargarExcel } from '../../../utils/exportarExcel'
import { usarCabeceraPlaneamiento } from '../../planeamiento/composables/useCabeceraPlaneamiento'

const frentes = useFrentesStore()
const auth = useAuthStore()
const router = useRouter()

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
const puedeGestionarSectores = computed(() => auth.tienePermiso('rdc.catalogos_gestionar'))

onMounted(() => frentes.cargar())

function exportarFrentes() {
  descargarExcel(`frentes_${new Date().toISOString().slice(0, 10)}.xlsx`, [
    {
      nombre: 'Frentes',
      filas: frentesFiltrados.value.map((f) => ({
        CODIGO: f.codigo ?? '',
        NOMBRE: f.nombre,
        SECTOR: f.sector,
        AREA: f.area,
        ESTADO: ETIQUETA_ESTADO[f.estado] ?? f.estado,
        'TIPO RD': f.tipo_rd ?? '',
        INICIO: f.fecha_inicio ?? '',
        FIN: f.fecha_cierre ?? '',
      })),
    },
  ])
}

usarCabeceraPlaneamiento(
  () => ({ texto: 'Nuevo frente', visible: puedeCrear.value, ejecutar: abrirCrear }),
  () => [
    ...(puedeGestionarSectores.value
      ? [{ texto: 'Sectores (ir a Catálogo)', ejecutar: () => router.push('/planeamiento/catalogo/sectores') }]
      : []),
    { texto: 'Exportar frentes', ejecutar: exportarFrentes },
  ]
)

// Chips de estado: "Próximos" agrupa planificado+proximo (ambos son "todavía
// no arrancó", la única diferencia es si ya tiene fecha puesta) — el mockup
// solo pide 4 chips + Todos, no 5, y esos dos estados son justo la misma
// idea para quien está mirando la lista.
const ESTADO_CHIP = {
  planificado: 'proximo',
  proximo: 'proximo',
  activo: 'activo',
  paralizado: 'paralizado',
  cerrado: 'cerrado',
}
const CHIPS = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'activo', etiqueta: 'Activos' },
  { clave: 'paralizado', etiqueta: 'Paralizados' },
  { clave: 'proximo', etiqueta: 'Próximos' },
  { clave: 'cerrado', etiqueta: 'Finalizados' },
]
const chipActivo = ref('todos')

const conteosChip = computed(() => {
  const c = { todos: frentes.frentes.length, activo: 0, paralizado: 0, proximo: 0, cerrado: 0 }
  for (const f of frentes.frentes) c[ESTADO_CHIP[f.estado] ?? 'cerrado']++
  return c
})

const frentesFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return frentes.frentes.filter((f) => {
    if (chipActivo.value !== 'todos' && (ESTADO_CHIP[f.estado] ?? 'cerrado') !== chipActivo.value) return false
    if (!q) return true
    return (
      (f.codigo ?? '').toLowerCase().includes(q) ||
      f.nombre.toLowerCase().includes(q) ||
      f.area.toLowerCase().includes(q) ||
      f.sector.toLowerCase().includes(q)
    )
  })
})

// Frentes agrupados por Área (orden alfabético; dentro, por código).
const gruposPorArea = computed(() => {
  const mapa = new Map()
  for (const f of frentesFiltrados.value) {
    const area = (f.area ?? '').trim() || 'Sin área'
    if (!mapa.has(area)) mapa.set(area, [])
    mapa.get(area).push(f)
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] === 'Sin área') - (b[0] === 'Sin área') || a[0].localeCompare(b[0], 'es'))
    .map(([area, lista]) => ({
      area,
      frentes: [...lista].sort((x, y) => (x.codigo ?? x.nombre).localeCompare(y.codigo ?? y.nombre, 'es', { numeric: true })),
    }))
})

const ETIQUETA_ESTADO = {
  planificado: 'Planificado',
  proximo: 'Próximo',
  activo: 'Activo',
  paralizado: 'Paralizado',
  cerrado: 'Cerrado',
}

function fechaCorta(f) {
  return f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : '—'
}

function tieneProcuraDe(f) {
  return frentes.frentesConProcura.has(f.id)
}
function pernosPendientesDe(f) {
  return frentes.pernosPendientes.get(f.id) ?? 0
}
function alertasDe(f) {
  return frentes.alertasPorFrente.get(f.id) ?? 0
}
function sinPendientes(f) {
  return pernosPendientesDe(f) === 0 && alertasDe(f) === 0
}

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
  <div class="pl-col">
    <div class="pl-filters">
      <div class="chips" role="group" aria-label="Estado del frente">
        <button
          v-for="c in CHIPS"
          :key="c.clave"
          type="button"
          class="pl-seg"
          :class="{ on: chipActivo === c.clave }"
          :aria-pressed="chipActivo === c.clave"
          @click="chipActivo = c.clave"
        >
          {{ c.etiqueta }}<span class="n">{{ conteosChip[c.clave] }}</span>
        </button>
      </div>
      <label class="pl-search buscador-der">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input v-model="busqueda" type="search" placeholder="Buscar frente" aria-label="Buscar frente" />
      </label>
    </div>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="frentes.error" class="error">{{ frentes.error }}</p>
    <p v-if="frentes.cargando">Cargando frentes…</p>

    <template v-else>
      <p v-if="!frentesFiltrados.length" class="vacio">No hay frentes para mostrar.</p>

      <section v-for="g in gruposPorArea" v-else :key="g.area" class="grupo-area">
        <h2 class="area-titulo">{{ g.area }}<span class="n">{{ g.frentes.length }}</span></h2>
      <div class="tarjetas">
        <article v-for="f in g.frentes" :key="f.id" class="tarjeta">
          <!-- "Enlace extendido": cubre toda la tarjeta por debajo de todo
               lo demás, así cualquier click fuera de los botones de acción
               abre la ficha — sin anidar un <button> dentro de un <a>
               (HTML inválido) ni agregar un botón "Abrir ficha" aparte. -->
          <router-link :to="`/frentes/${f.id}`" class="tarjeta-link" :aria-label="`Abrir ficha de ${f.nombre}`" />

          <header class="tarjeta-cabecera">
            <span class="tarjeta-nombre">{{ f.nombre }}</span>
            <span class="estado-frente" :class="f.estado">
              <span class="sd"></span>{{ ETIQUETA_ESTADO[f.estado] ?? f.estado }}
            </span>
          </header>

          <div class="pills">
            <span class="pill">{{ f.sector }}</span>
            <span v-if="f.tipo_rd" class="pill pill-info">RD {{ f.tipo_rd }}</span>
          </div>

          <div class="capsulas">
            <span v-if="tieneProcuraDe(f)" class="cap cap-procura">Procura</span>
            <span v-if="f.rdc_control_pernos" class="cap cap-pernos">Pernos</span>
          </div>

          <div class="fechas">
            <div>
              <div class="fecha-etiqueta">INICIO</div>
              <div class="fecha-valor">{{ fechaCorta(f.fecha_inicio) }}</div>
            </div>
            <div>
              <div class="fecha-etiqueta">FIN</div>
              <div class="fecha-valor">{{ fechaCorta(f.fecha_cierre) }}</div>
            </div>
          </div>

          <div class="franja-pendientes">
            <span v-if="pernosPendientesDe(f)" class="pend ambar">{{ pernosPendientesDe(f) }} pernos pendientes</span>
            <span v-if="alertasDe(f)" class="pend rojo">{{ alertasDe(f) }} alertas</span>
            <span v-if="sinPendientes(f)" class="pend-texto">Sin pendientes</span>
          </div>

          <div v-if="puedeCrear || mostrarAcciones" class="tarjeta-acciones">
            <BotonIcono v-if="puedeCrear" variante="copiar" titulo="Copiar frente" @click="abrirCopiar(f)" />
            <template v-if="mostrarAcciones">
              <BotonIcono variante="editar" titulo="Editar" @click="abrirEditar(f)" />
              <BotonIcono variante="eliminar" titulo="Eliminar" @click="eliminar(f)" />
            </template>
          </div>
        </article>
      </div>
      </section>
    </template>

    <FrenteFormModal
      v-if="mostrarModal"
      :frente="frenteEnEdicion"
      :plantilla="plantillaParaCopia"
      :contratos="frentes.contratos"
      :sectores="frentes.sectores"
      :puede-editar-estado="auth.tienePermiso('frentes.cerrar') || auth.tienePermiso('frentes.editar')"
      @guardar="guardar"
      @cerrar="cerrarModal"
    />

  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.buscador-der {
  max-width: 360px;
  margin-left: auto;
}

.grupo-area + .grupo-area {
  margin-top: 28px;
}
.area-titulo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-text);
}
.area-titulo .n {
  font-size: 12px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}
.tarjetas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
.tarjeta {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 18px;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.tarjeta:hover,
.tarjeta:focus-within {
  border-color: var(--color-primary);
  background: var(--color-surface-2);
  box-shadow: 0 0 0 1px var(--color-primary), 0 8px 24px rgba(245, 165, 36, 0.12);
  transform: translateY(-2px);
}
.tarjeta-link {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
}
.tarjeta-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.tarjeta-cabecera {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.tarjeta-nombre {
  font-weight: 700;
  font-size: 16px;
  color: var(--color-text);
  line-height: 1.3;
}
.badge,
.pill,
.pend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
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
  background: var(--color-warning-soft, #fff7e5);
  color: var(--color-warning);
}
.badge.cerrado {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pill {
  color: var(--color-text);
  background: var(--color-surface-2);
}
.pill-info {
  color: var(--color-info);
  background: var(--color-info-soft);
}
.estado-frente {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  color: var(--color-text-muted);
}
.estado-frente .sd {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b5b8be;
}
.estado-frente.activo { color: var(--color-success); }
.estado-frente.activo .sd { background: #22c55e; }
.estado-frente.paralizado { color: var(--color-warning); }
.estado-frente.paralizado .sd { background: #f59e0b; }
.estado-frente.planificado { color: var(--color-info); }
.estado-frente.planificado .sd { background: #3b82f6; }
.estado-frente.proximo { color: var(--color-primary); }
.estado-frente.proximo .sd { background: var(--color-primary); }
.capsulas {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 26px;
}
.cap {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.cap-procura { background: var(--cap-procura-bg); color: var(--cap-procura-fg); }
.cap-pernos { background: var(--cap-pernos-bg); color: var(--cap-pernos-fg); }
.fechas {
  display: flex;
  gap: 32px;
}
.fecha-etiqueta {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #8d929b;
}
.fecha-valor {
  margin-top: 3px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
}
.franja-pendientes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}
.pend.ambar {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.pend.rojo {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.pend-texto {
  font-size: 12px;
  color: var(--color-text-muted);
}
.tarjeta-acciones {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  gap: 0.15rem;
  margin-top: -0.4rem;
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

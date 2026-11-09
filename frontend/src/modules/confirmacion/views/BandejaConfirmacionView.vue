<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useFrentesStore } from '../../frentes/store/frentes'
import {
  listarConfirmaciones,
  listarAlertas,
  confirmarMetrado,
  corregirMetrado,
  ignorarMetrado,
  listarPartidasEdtDelFrente,
} from '../services/confirmacionService'
import TarjetaPendiente from '../../frentes/components/metrados/TarjetaPendiente.vue'

const frentesStore = useFrentesStore()

const hoy = new Date().toISOString().slice(0, 10)
const inicioDeMes = `${hoy.slice(0, 7)}-01`
const desde = ref(inicioDeMes)
const hasta = ref(hoy)
const frenteId = ref('')
const soloConAlerta = ref(false)

const confirmaciones = ref([])
const alertas = ref([])
const partidasEdt = ref([])
const cargando = ref(true)
const error = ref('')
const procesandoId = ref(null)

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [c, a, p] = await Promise.all([
      listarConfirmaciones({ frenteId: frenteId.value || null, desde: desde.value, hasta: hasta.value }),
      listarAlertas(frenteId.value || null),
      listarPartidasEdtDelFrente(frenteId.value || null),
    ])
    confirmaciones.value = c
    alertas.value = a
    partidasEdt.value = p
  } catch (e) {
    console.error(e)
    error.value = `No se pudieron cargar los metrados${e?.message ? ': ' + e.message : '.'}`
  } finally {
    cargando.value = false
  }
}
onMounted(() => {
  if (!frentesStore.frentes.length) frentesStore.cargar()
  cargar()
})
watch([desde, hasta, frenteId], cargar)

const alertasPorConfirmacion = computed(() => {
  const mapa = new Map()
  for (const a of alertas.value) {
    if (!mapa.has(a.confirmacion_id)) mapa.set(a.confirmacion_id, [])
    mapa.get(a.confirmacion_id).push(a)
  }
  return mapa
})

const pendientes = computed(() => {
  let filas = confirmaciones.value.filter((c) => c.estado === 'por_confirmar')
  if (soloConAlerta.value) filas = filas.filter((c) => (alertasPorConfirmacion.value.get(c.id)?.length ?? 0) > 0)
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha))
})

const partidasPorFrente = computed(() => {
  const mapa = new Map()
  for (const p of partidasEdt.value) {
    if (!mapa.has(p.frente_id)) mapa.set(p.frente_id, [])
    mapa.get(p.frente_id).push(p)
  }
  return mapa
})

const nombreFrente = computed(() => new Map(frentesStore.frentes.map((f) => [f.id, f])))
const porFrente = computed(() => {
  const mapa = new Map()
  for (const c of pendientes.value) {
    if (!mapa.has(c.frente_id)) mapa.set(c.frente_id, [])
    mapa.get(c.frente_id).push(c)
  }
  return [...mapa.entries()]
    .map(([id, filas]) => ({ id, frente: nombreFrente.value.get(id), filas }))
    .sort((a, b) => (a.frente?.codigo ?? '').localeCompare(b.frente?.codigo ?? ''))
})

const kpis = computed(() => ({
  porConfirmar: confirmaciones.value.filter((c) => c.estado === 'por_confirmar').length,
  confirmadas: confirmaciones.value.filter((c) => c.estado === 'confirmado' || c.estado === 'corregido').length,
  superanPrevisto: confirmaciones.value.filter(
    (c) => c.estado === 'por_confirmar' && (alertasPorConfirmacion.value.get(c.id) ?? []).some((a) => a.tipo === 'supera_previsto' || a.tipo === 'glb_cerrada')
  ).length,
  noConsideradas: confirmaciones.value.filter((c) => c.estado === 'ignorado').length,
}))

function previstoDe() {
  return null // la Bandeja no muestra "Quedaría: X/Y" (cruza varios frentes) — eso vive en la ficha.
}

async function accion(fn, ...args) {
  procesandoId.value = args[0]
  error.value = ''
  try {
    await fn(...args)
    await cargar()
  } catch (e) {
    console.error(e)
    error.value = `No se pudo completar la acción${e?.message ? ': ' + e.message : '.'}`
  } finally {
    procesandoId.value = null
  }
}
const onConfirmar = (id, payload) => accion(confirmarMetrado, id, payload?.partidaEdtId ?? null)
const onCorregir = (id, payload) => accion(corregirMetrado, id, payload.cantidad, payload.motivo, payload.partidaEdtId ?? null)
const onIgnorar = (id, payload) => accion(ignorarMetrado, id, payload.motivo)
</script>

<template>
  <div class="bandeja">
    <header>
      <h1>Confirmación de metrados</h1>
      <p class="subtitulo">Lo que reportan los supervisores, pendiente de pasar a oficial.</p>
    </header>

    <div class="kpis">
      <div class="kpi">
        <span class="valor">{{ kpis.porConfirmar }}</span>
        <span class="etiqueta">Por confirmar</span>
      </div>
      <div class="kpi verde">
        <span class="valor">{{ kpis.confirmadas }}</span>
        <span class="etiqueta">Confirmadas</span>
      </div>
      <div class="kpi ambar">
        <span class="valor">{{ kpis.superanPrevisto }}</span>
        <span class="etiqueta">Superan previsto</span>
      </div>
      <div class="kpi roja">
        <span class="valor">{{ kpis.noConsideradas }}</span>
        <span class="etiqueta">No consideradas</span>
      </div>
    </div>

    <div class="toolbar">
      <label>
        Desde
        <input v-model="desde" type="date" />
      </label>
      <label>
        Hasta
        <input v-model="hasta" type="date" />
      </label>
      <label>
        Frente
        <select v-model="frenteId">
          <option value="">Todos los frentes</option>
          <option v-for="f in frentesStore.frentes" :key="f.id" :value="f.id">{{ f.codigo }} · {{ f.nombre }}</option>
        </select>
      </label>
      <label class="check">
        <input v-model="soloConAlerta" type="checkbox" />
        Solo con alerta
      </label>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando" class="vacio">Cargando…</p>

    <template v-else>
      <p v-if="!porFrente.length" class="vacio">No hay metrados pendientes de confirmar en este rango.</p>

      <section v-for="grupo in porFrente" :key="grupo.id" class="grupo-frente">
        <div class="cabecera-grupo">
          <h2>{{ grupo.frente?.codigo ?? '—' }} · {{ grupo.frente?.nombre ?? 'Frente' }} <span class="contador">{{ grupo.filas.length }}</span></h2>
          <router-link :to="`/frentes/${grupo.id}/metrados`" class="abrir-ficha">
            Abrir ficha
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </router-link>
        </div>
        <div class="grid-pendientes">
          <TarjetaPendiente
            v-for="item in grupo.filas"
            :key="item.id"
            :item="item"
            :alertas="alertasPorConfirmacion.get(item.id) ?? []"
            :previsto="previstoDe(item)"
            :acumulado-oficial="0"
            :partidas="partidasPorFrente.get(grupo.id) ?? []"
            :procesando="procesandoId === item.id"
            @confirmar="(payload) => onConfirmar(item.id, payload)"
            @corregir="(payload) => onCorregir(item.id, payload)"
            @ignorar="(payload) => onIgnorar(item.id, payload)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.bandeja {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1200px;
  margin: 0 auto;
}
header h1 {
  margin: 0;
  font-size: 22px;
  color: var(--color-text);
}
.subtitulo {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.kpi {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi .valor {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text);
}
.kpi .etiqueta {
  font-size: 12px;
  color: var(--color-text-muted);
}
.kpi.verde .valor {
  color: var(--color-success);
}
.kpi.ambar .valor {
  color: var(--color-warning);
}
.kpi.roja .valor {
  color: #f87171;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
}
.toolbar label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.toolbar input[type='date'],
.toolbar select {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13.5px;
}
.toolbar label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text);
}
.toolbar input[type='checkbox'] {
  width: 16px;
  height: 16px;
}

.error {
  color: var(--color-danger);
  font-size: 0.85rem;
}
.vacio {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-align: center;
  padding: 1.5rem 0;
}

.grupo-frente {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px 18px;
}
.cabecera-grupo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.cabecera-grupo h2 {
  margin: 0;
  font-size: 15px;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;
}
.contador {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-info-soft);
  color: var(--color-info);
  font-size: 12px;
  font-weight: 700;
}
.abrir-ficha {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
  white-space: nowrap;
}
.grid-pendientes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}
</style>

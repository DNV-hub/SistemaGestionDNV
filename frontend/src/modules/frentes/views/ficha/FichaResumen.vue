<script setup>
import { computed, onMounted, ref } from 'vue'
import { listarReportes } from '../../../rdc/services/rdcService'
import { listarPernos } from '../../../avance/services/avanceService'
import { listarAlertas } from '../../../alertas/services/alertasService'

const props = defineProps({
  frente: { type: Object, required: true },
})

const reportes = ref([])
const pernosPendientes = ref(null) // null = no aplica (sin control de pernos)
const alertas = ref([])
const cargando = ref(true)

onMounted(async () => {
  cargando.value = true
  try {
    const tareas = [listarReportes({ frenteId: props.frente.id }), listarAlertas({ estado: 'activa', frenteId: props.frente.id })]
    if (props.frente.rdc_control_pernos) tareas.push(listarPernos(props.frente.id))
    const [r, a, p] = await Promise.all(tareas)
    reportes.value = r
    alertas.value = a
    if (p) pernosPendientes.value = p.filter((x) => x.estado === 'perforado').length
  } catch (e) {
    console.error(e)
  } finally {
    cargando.value = false
  }
})

// "Días en obra": desde que arrancó hasta hoy (o hasta que cerró, si ya
// cerró) — un frente planificado que todavía no tiene fecha_inicio no tiene
// forma de contar esto todavía.
const diasEnObra = computed(() => {
  if (!props.frente.fecha_inicio) return '—'
  const inicio = new Date(`${props.frente.fecha_inicio}T00:00:00`)
  const fin = props.frente.fecha_cierre ? new Date(`${props.frente.fecha_cierre}T00:00:00`) : new Date()
  return Math.max(0, Math.round((fin - inicio) / 86400000))
})

const ultimoReporte = computed(() => reportes.value[0] ?? null)
const ultimosReportes = computed(() => reportes.value.slice(0, 8))

function fechaCorta(f) {
  return f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : '—'
}
</script>

<template>
  <div class="pl-col">
    <div class="pl-kpis">
      <div class="pl-kpi">
        <div class="l">Días en obra</div>
        <div class="v">{{ diasEnObra }}</div>
      </div>
      <div class="pl-kpi">
        <div class="l">RDC recibidos</div>
        <div class="v">{{ cargando ? '—' : reportes.length }}</div>
        <div v-if="ultimoReporte" class="s">Último: {{ fechaCorta(ultimoReporte.fecha) }}</div>
      </div>
      <div class="pl-kpi">
        <div class="l">Pernos pendientes</div>
        <div class="v" :style="pernosPendientes > 0 ? 'color: var(--p-amber-txt)' : ''">{{ cargando || pernosPendientes === null ? '—' : pernosPendientes }}</div>
      </div>
      <div class="pl-kpi">
        <div class="l">Alertas abiertas</div>
        <div class="v" :style="alertas.length ? 'color: var(--p-danger)' : ''">{{ cargando ? '—' : alertas.length }}</div>
      </div>
    </div>

    <div class="dos-paneles">
      <section class="pl-panel">
        <div class="pl-sh">Datos del frente</div>
        <dl class="pl-dl">
          <template v-if="frente.codigo"><dt>Código</dt><dd>{{ frente.codigo }}</dd></template>
          <dt>Sector</dt><dd>{{ frente.sector }}</dd>
          <dt>Área</dt><dd>{{ frente.area }}</dd>
          <template v-if="frente.contratos"><dt>Contrato</dt><dd>{{ frente.contratos.nombre }}</dd></template>
          <dt>Inicio</dt><dd>{{ fechaCorta(frente.fecha_inicio) }}</dd>
          <template v-if="frente.fecha_paralizacion"><dt>Paralizado desde</dt><dd>{{ fechaCorta(frente.fecha_paralizacion) }}</dd></template>
          <template v-if="frente.fecha_cierre"><dt>Cierre</dt><dd>{{ fechaCorta(frente.fecha_cierre) }}</dd></template>
        </dl>
      </section>

      <section class="pl-panel panel-tabla">
        <div class="pl-sh titulo-panel">Últimos reportes de campo</div>
        <p v-if="cargando" class="pl-empty">Cargando…</p>
        <p v-else-if="!ultimosReportes.length" class="pl-empty titulo-panel">Todavía no hay reportes para este frente.</p>
        <div v-else class="tabla-mini">
          <div class="pl-th fila-rep"><span>FECHA</span><span>SUPERVISOR</span><span>ESTADO</span></div>
          <div v-for="r in ultimosReportes" :key="r.id" class="pl-tr fila-rep">
            <span>{{ fechaCorta(r.fecha) }}</span>
            <span class="pl-semi">{{ r.rdc_supervisores?.nombre ?? '—' }}</span>
            <span><span class="pl-sp" :class="r.estado === 'Finalizado' ? 'ok' : 'warn'">{{ r.estado === 'Finalizado' ? 'Enviado' : 'Borrador' }}</span></span>
          </div>
        </div>
      </section>
    </div>

    <section class="pl-panel">
      <div class="pl-sh">Alertas abiertas</div>
      <p v-if="cargando" class="pl-empty">Cargando…</p>
      <p v-else-if="!alertas.length" class="pl-empty">Sin alertas abiertas.</p>
      <ul v-else class="lista-alertas">
        <li v-for="a in alertas" :key="a.id">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" /></svg>
          <span>{{ a.mensaje ?? a.tipo }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.dos-paneles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 24px;
  align-items: start;
}
.panel-tabla {
  padding: 18px 16px;
}
.titulo-panel {
  padding: 0 8px;
}
.fila-rep {
  grid-template-columns: 90px minmax(120px, 1fr) 100px;
  padding: 0 8px;
}
.pl-th.fila-rep {
  height: 32px;
}
.tabla-mini {
  overflow-x: auto;
}
.lista-alertas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lista-alertas li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  font-weight: 600;
  color: var(--p-warn-fg);
}
.lista-alertas li span {
  color: var(--p-text);
}
</style>

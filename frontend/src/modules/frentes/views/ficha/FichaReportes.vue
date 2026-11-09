<script setup>
import { onMounted, ref } from 'vue'
import { listarReportes } from '../../../rdc/services/rdcService'

const props = defineProps({
  frente: { type: Object, required: true },
})

const reportes = ref([])
const cargando = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    reportes.value = await listarReportes({ frenteId: props.frente.id })
  } catch (e) {
    console.error(e)
    error.value = `No se pudieron cargar los reportes${e?.message ? ': ' + e.message : '.'}`
  } finally {
    cargando.value = false
  }
})

function fechaCorta(f) {
  return f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : '—'
}
</script>

<template>
  <div class="pl-col">
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando" class="pl-empty">Cargando…</p>
    <div v-else class="pl-table">
      <div class="in">
        <div class="pl-th cols">
          <span>FECHA</span><span>SUPERVISOR</span><span>ESTADO</span><span>ENVÍO</span><span class="pl-r">ACCIONES</span>
        </div>
        <div v-for="r in reportes" :key="r.id" class="pl-tr cols">
          <span>{{ fechaCorta(r.fecha) }}</span>
          <span class="pl-semi">{{ r.rdc_supervisores?.nombre ?? '—' }}</span>
          <span><span class="pl-sp" :class="r.estado === 'Finalizado' ? 'ok' : 'warn'">{{ r.estado === 'Finalizado' ? 'Enviado' : 'Borrador' }}</span></span>
          <span :class="r.estado_sharepoint === 'enviado' ? 'envio-ok' : r.estado_sharepoint === 'error' ? 'envio-error' : 'pl-mut'">
            {{ r.estado_sharepoint === 'enviado' ? 'SharePoint OK' : r.estado_sharepoint === 'error' ? 'Error' : '—' }}
          </span>
          <span class="pl-r">
            <router-link class="pl-ghost sm" :to="{ name: 'rdc-detalle', params: { id: r.id } }">Ver</router-link>
          </span>
        </div>
        <div v-if="!reportes.length" class="pl-vacio">Todavía no hay reportes de campo para este frente.</div>
      </div>
    </div>

    <section class="pl-panel">
      <div class="pl-sh">RD emitidos</div>
      <div class="pl-empty">Todavía no se emitió ningún RD para este frente.</div>
    </section>
  </div>
</template>

<style scoped>
.cols {
  grid-template-columns: 110px minmax(160px, 1fr) 120px 150px 90px;
}
.envio-ok {
  color: var(--p-ok-fg);
  font-weight: 600;
}
.envio-error {
  color: var(--p-low-fg);
  font-weight: 600;
}
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
</style>

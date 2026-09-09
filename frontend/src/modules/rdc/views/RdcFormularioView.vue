<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRdcStore } from '../store/rdc'
import { ESTADO } from '../services/rdcDb'
import PasoDatos from '../components/PasoDatos.vue'
import PasoJornada from '../components/PasoJornada.vue'
import PasoMetrados from '../components/PasoMetrados.vue'
import PasoObservaciones from '../components/PasoObservaciones.vue'
import PasoResumen from '../components/PasoResumen.vue'

const rdc = useRdcStore()
const route = useRoute()
const router = useRouter()

const PASOS = [
  { clave: 'datos', titulo: 'Datos', componente: PasoDatos },
  { clave: 'jornada', titulo: 'Jornada', componente: PasoJornada },
  { clave: 'metrados', titulo: 'Metrados', componente: PasoMetrados },
  { clave: 'obs', titulo: 'Observaciones', componente: PasoObservaciones },
  { clave: 'resumen', titulo: 'Resumen', componente: PasoResumen },
]

const paso = ref(0)
const listo = ref(false)

onMounted(async () => {
  if (!rdc.catalogos) await rdc.iniciar()
  const id = route.params.id
  if (id) await rdc.abrir(id)
  if (!rdc.actual) {
    const nuevo = await rdc.nuevo()
    router.replace({ name: 'rdc-editar', params: { id: nuevo.id } })
  }
  listo.value = true
})

const esUltimo = computed(() => paso.value === PASOS.length - 1)
const componenteActual = computed(() => PASOS[paso.value].componente)

function ir(indice) {
  paso.value = indice
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Sale del formulario. No hace falta confirmar ni guardar: cada cambio ya se
 * escribió en el dispositivo cuando ocurrió. */
function salir() {
  router.push({ name: 'rdc' })
}
</script>

<template>
  <div class="formulario">
    <header class="cabecera">
      <button class="secundario chico" @click="salir">← Volver</button>
      <h1>{{ rdc.actual?.estado === ESTADO.BORRADOR ? 'Reporte del día' : 'Corrección' }}</h1>
    </header>

    <nav class="pasos">
      <button
        v-for="(p, i) in PASOS"
        :key="p.clave"
        class="paso"
        :class="{ activo: i === paso, hecho: i < paso }"
        @click="ir(i)"
      >
        <span class="numero">{{ i + 1 }}</span>
        <span class="titulo">{{ p.titulo }}</span>
      </button>
    </nav>

    <p v-if="!listo" class="cargando">Cargando…</p>

    <template v-else-if="rdc.actual">
      <component :is="componenteActual" />

      <div class="navegacion">
        <button v-if="paso > 0" class="secundario" @click="ir(paso - 1)">Anterior</button>
        <span class="espacio" />
        <button v-if="!esUltimo" @click="ir(paso + 1)">Siguiente</button>
      </div>
    </template>

    <p class="guardado">Todo lo que escribes se guarda en este dispositivo, con o sin señal.</p>
  </div>
</template>

<style scoped>
.formulario {
  padding: 1.5rem 2rem 3rem;
  max-width: 900px;
}
.cabecera {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.pasos {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 1.25rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}
.paso {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.paso.activo {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-ink);
}
.paso.hecho {
  color: var(--color-text);
}
.numero {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-surface-2);
  font-size: 0.7rem;
}
.paso.activo .numero {
  background: rgb(255 255 255 / 0.25);
}
.navegacion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.espacio {
  flex: 1;
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
.chico {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}
.cargando,
.guardado {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
.guardado {
  margin-top: 2rem;
  text-align: center;
}

@media (max-width: 640px) {
  .formulario {
    padding: 1rem 1rem 3rem;
  }
  /* En el celular el título del paso ocupa demasiado: queda el número, que
     alcanza para saber dónde estás, y el paso activo sí muestra su nombre. */
  .paso .titulo {
    display: none;
  }
  .paso.activo .titulo {
    display: inline;
  }
  .navegacion button {
    flex: 1;
    padding: 0.8rem;
  }
}
</style>

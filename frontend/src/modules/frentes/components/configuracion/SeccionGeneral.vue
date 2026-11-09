<script setup>
import { computed, onMounted, ref } from 'vue'
import { actualizarFrente, listarFrentes } from '../../services/frentesService'
import { listarUsuariosVinculables } from '../../../catalogo/rdc/services/catalogosRdcService'

const props = defineProps({
  frente: { type: Object, required: true },
})
const emit = defineEmits(['actualizado'])

const frentesP = ref([])
const usuarios = ref([])
const cargando = ref(true)
const error = ref('')
const guardandoCampo = ref('')

onMounted(async () => {
  try {
    const [todos, u] = await Promise.all([listarFrentes(), listarUsuariosVinculables()])
    // Un frente no puede ser su propio RD P (lo exige también el trigger del
    // lado de la base) — se filtra acá para no ofrecerlo como opción inválida.
    frentesP.value = todos.filter((f) => f.tipo_rd === 'P' && f.id !== props.frente.id)
    usuarios.value = u
  } catch (e) {
    console.error(e)
    error.value = 'No se pudieron cargar las opciones.'
  } finally {
    cargando.value = false
  }
})

const esTipoP = computed(() => props.frente.tipo_rd === 'P')

async function guardar(campo, valor) {
  guardandoCampo.value = campo
  error.value = ''
  try {
    const actualizado = await actualizarFrente(props.frente.id, { [campo]: valor })
    emit('actualizado', actualizado)
  } catch (e) {
    console.error(e)
    error.value = e?.message ?? 'No se pudo guardar el cambio.'
  } finally {
    guardandoCampo.value = ''
  }
}

// Si pasa de "P" a "S" no se toca rd_padre_id solo (puede quedar null, lo
// elige después); si pasa de "S" a "P" sí hay que limpiar rd_padre_id —
// el trigger de la base lo rechazaría de todas formas (un RD P no puede
// tener padre), pero mejor no mandar un valor que se sabe que va a fallar.
async function cambiarTipoRd(valor) {
  if (valor === 'P' && props.frente.rd_padre_id) {
    await guardar('rd_padre_id', null)
  }
  await guardar('tipo_rd', valor)
}

const ETIQUETA_ESTADO = {
  planificado: 'Planificado',
  proximo: 'Próximo',
  activo: 'Activo',
  paralizado: 'Paralizado',
  cerrado: 'Cerrado',
}
</script>

<template>
  <section class="pl-panel">
    <div class="pl-sh">General</div>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="campos">
      <div>
        <label class="pl-lbl" for="cfg-tipo-rd">Tipo de RD</label>
        <select id="cfg-tipo-rd" class="pl-sel" :value="frente.tipo_rd" :disabled="guardandoCampo === 'tipo_rd'" @change="cambiarTipoRd($event.target.value)">
          <option value="S">S — secundario</option>
          <option value="P">P — principal (multifrente)</option>
        </select>
      </div>

      <div v-if="!esTipoP">
        <label class="pl-lbl" for="cfg-rd-padre">Agrupado en RD P</label>
        <select
          id="cfg-rd-padre"
          class="pl-sel"
          :value="frente.rd_padre_id ?? ''"
          :disabled="cargando || guardandoCampo === 'rd_padre_id'"
          @change="guardar('rd_padre_id', $event.target.value || null)"
        >
          <option value="">Ninguno</option>
          <option v-for="f in frentesP" :key="f.id" :value="f.id">{{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}</option>
        </select>
      </div>

      <div>
        <label class="pl-lbl" for="cfg-residente">Residente</label>
        <select
          id="cfg-residente"
          class="pl-sel"
          :value="frente.residente_id ?? ''"
          :disabled="cargando || guardandoCampo === 'residente_id'"
          @change="guardar('residente_id', $event.target.value || null)"
        >
          <option value="">Sin asignar</option>
          <option v-for="u in usuarios" :key="u.id" :value="u.id">{{ u.estado === 'activo' ? u.nombre : `${u.nombre} (inactivo)` }}</option>
        </select>
      </div>

      <div>
        <span class="pl-lbl">Estado</span>
        <div class="estado-fila">
          <span class="pl-sx" :class="frente.estado"><span class="pl-sd" :class="frente.estado"></span>{{ ETIQUETA_ESTADO[frente.estado] ?? frente.estado }}</span>
          <router-link to="/planeamiento/frentes" class="nota-link">Cambiar desde Frentes</router-link>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.error {
  color: var(--p-danger);
  font-size: 14px;
  margin: 0;
}
.campos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.estado-fila {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.nota-link {
  font-size: 13px;
  font-weight: 700;
  color: var(--p-amber-txt);
  text-decoration: none;
}
.nota-link:hover {
  text-decoration: underline;
}
</style>

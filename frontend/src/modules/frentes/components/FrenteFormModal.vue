<script setup>
import { textoCrudo } from '../../../utils/mensajeError'
import { reactive, ref, useAttrs, watch } from 'vue'
import ModalFormulario from '../../../components/ModalFormulario.vue'

const props = defineProps({
  frente: { type: Object, default: null }, // null = creando, objeto = editando
  // Al copiar una tarjeta: crea uno nuevo (frente sigue null) pero con área/
  // sector/contrato ya rellenados — nombre, código, estado y fecha siempre
  // arrancan de cero, nunca se copian.
  plantilla: { type: Object, default: null },
  contratos: { type: Array, default: () => [] },
  sectores: { type: Array, default: () => [] },
  puedeEditarEstado: { type: Boolean, default: false },
})

defineEmits(['cerrar'])
// emit() de Vue siempre devuelve undefined y no propaga errores del padre —
// invocamos attrs.onGuardar directamente para que el try/catch de abajo
// capture fallos reales (ver la corrección aplicada en el resto de modales).
const attrs = useAttrs()

function estadoInicial() {
  const base = props.frente ?? props.plantilla
  return {
    area: base?.area ?? '',
    // sector_id es el real (lo usa el Reporte Diario para derivar el sector
    // de cada reporte — sin esto el supervisor se queda trabado con "falta
    // completar: el sector" al cerrar). `sector` es el texto libre viejo,
    // que se sigue mandando por compatibilidad pero ahora se deriva solo
    // del sector elegido, nunca se vuelve a tipear a mano (ver watch abajo).
    sector_id: base?.sector_id ?? '',
    sector: base?.sector ?? '',
    nombre: props.frente?.nombre ?? '',
    codigo: props.frente?.codigo ?? '',
    contrato_id: base?.contrato_id ?? props.contratos[0]?.id ?? '',
    // Un frente nuevo nace 'planificado': existe en el catálogo pero no
    // aparece todavía en el Reporte Diario ni en Vales hasta que
    // Planeamiento lo pase a 'activo' a mano, cuando el trabajo arranque
    // de verdad.
    estado: props.frente?.estado ?? 'planificado',
    // Vacío por defecto en un frente nuevo, a propósito: "planificado"
    // significa justamente que todavía no se sabe cuándo arranca. Ponerle
    // la fecha de hoy acá haría que el trigger de la base lo pasara a
    // 'activo' de inmediato, apenas se guarda — lo probó el usuario y es
    // exactamente el bug que reportó.
    fecha_inicio: props.frente?.fecha_inicio ?? '',
    fecha_cierre: props.frente?.fecha_cierre ?? '',
    fecha_paralizacion: props.frente?.fecha_paralizacion ?? '',
  }
}

const form = reactive(estadoInicial())
const guardando = ref(false)
const error = ref('')

watch(
  () => props.frente,
  () => Object.assign(form, estadoInicial())
)

// El texto libre `sector` se deriva solo del sector_id elegido — nunca se
// vuelve a tipear a mano, para que las dos columnas no puedan desincronizarse.
watch(
  () => form.sector_id,
  (id) => {
    form.sector = props.sectores.find((s) => s.id === id)?.nombre ?? ''
  }
)

// Al elegir "Planificado" a mano, se borra la fecha de inicio en el mismo
// momento — no alcanza con que el trigger de la base la ignore, porque el
// trigger deriva el estado A PARTIR de la fecha: si un frente que ya
// estaba activo (con su fecha de ayer, de anteayer, la que sea) se edita y
// se le pone "Planificado" pero esa fecha vieja se manda igual, el propio
// trigger la vuelve a leer y recalcula 'activo' de nuevo — exactamente el
// bug que reportó el usuario. Solo reacciona a un CAMBIO real a
// 'planificado' (no dispara si ya estaba así desde que se abrió el
// formulario), para no pisar una fecha que alguien recién tipeó para
// programarlo (eso sí tiene que sobrevivir: el trigger la toma y lo pasa
// solo a "Próximo").
watch(
  () => form.estado,
  (nuevo, anterior) => {
    if (nuevo === 'planificado') form.fecha_inicio = ''
    // Se propone hoy como fecha de paralización apenas se elige el estado
    // (así no hace falta escribirla a mano si de verdad se paró hoy), pero
    // queda editable — el usuario puede estar cargando algo que ya paró
    // días atrás y quiere poner la fecha real.
    if (nuevo === 'paralizado' && anterior !== 'paralizado' && !form.fecha_paralizacion) {
      form.fecha_paralizacion = new Date().toISOString().slice(0, 10)
    }
  }
)

async function onSubmit() {
  error.value = ''
  if (!form.area.trim() || !form.sector_id || !form.nombre.trim() || !form.contrato_id) {
    error.value = 'Área, sector, frente y contrato son obligatorios.'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      area: form.area.trim(),
      sector_id: form.sector_id,
      sector: form.sector,
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim() || null,
      contrato_id: form.contrato_id,
      estado: form.estado,
      fecha_inicio: form.fecha_inicio || null,
      fecha_cierre: form.fecha_cierre || null,
      fecha_paralizacion: form.estado === 'paralizado' ? form.fecha_paralizacion || null : null,
    })
  } catch (e) {
    console.error(e)
    error.value = textoCrudo(e).includes('duplicate')
      ? 'Ya existe un frente con ese código.'
      : `No se pudo guardar el frente${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <ModalFormulario
    :titulo="frente ? 'Editar frente' : plantilla ? 'Copiar frente' : 'Nuevo frente'"
    :subtitulo="plantilla ? `Se copiaron área, sector y contrato de “${plantilla.nombre}”. Completa el nombre (y el código, si aplica).` : 'Dónde se trabaja y cuándo arranca.'"
    :guardando="guardando"
    :error="error"
    @cerrar="$emit('cerrar')"
    @enviar="onSubmit"
  >
    <div class="mf-grid">
      <div class="mf-campo">
        <span class="mf-rotulo">Área</span>
        <input v-model="form.area" type="text" required />
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Sector</span>
        <select v-model="form.sector_id" required>
          <option value="" disabled>Elige un sector…</option>
          <option v-for="s in sectores" :key="s.id" :value="s.id">{{ s.nombre }}</option>
        </select>
        <p class="mf-ayuda">Con esto el Reporte Diario asigna el sector solo, sin pedírselo al supervisor.</p>
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Frente</span>
        <input v-model="form.nombre" type="text" required />
      </div>

      <!-- El código se puede corregir también al editar: esta es la única
           pantalla que administra frentes. -->
      <div class="mf-campo">
        <span class="mf-rotulo">Código <em>(opcional)</em></span>
        <input v-model="form.codigo" type="text" />
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Contrato</span>
        <select v-model="form.contrato_id" required>
          <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>

      <div class="mf-campo">
        <span class="mf-rotulo">Fecha de inicio <em>(opcional)</em></span>
        <input v-model="form.fecha_inicio" type="date" />
        <p v-if="!form.fecha_inicio && (form.estado === 'planificado' || form.estado === 'proximo')" class="mf-ayuda">
          Déjala vacía mientras no se sepa cuándo arranca: eso es justo "Planificado".
        </p>
      </div>

      <div v-if="puedeEditarEstado" class="mf-campo">
        <span class="mf-rotulo">Estado</span>
        <select v-model="form.estado">
          <option value="planificado">Planificado (aún no inició)</option>
          <!-- "Próximo" sale solo al poner una fecha de inicio futura; aparece
               deshabilitado solo para poder mostrar ese valor si ya lo tiene. -->
          <option value="proximo" disabled>Próximo (automático, según la fecha de inicio)</option>
          <option value="activo">Activo</option>
          <option value="paralizado">Paralizado</option>
          <option value="cerrado">Cerrado</option>
        </select>
      </div>

      <div v-if="frente && form.estado === 'cerrado'" class="mf-campo">
        <span class="mf-rotulo">Fecha de cierre</span>
        <input v-model="form.fecha_cierre" type="date" />
      </div>

      <div v-if="form.estado === 'paralizado'" class="mf-campo">
        <span class="mf-rotulo">Fecha en que se paralizó</span>
        <input v-model="form.fecha_paralizacion" type="date" />
        <p class="mf-ayuda">Sirve para calcular hace cuántos días está parado en el Dashboard.</p>
      </div>

      <p v-if="puedeEditarEstado && form.estado === 'planificado'" class="mf-info mf-span">
        Mientras no tenga fecha de inicio, no aparece en el Reporte Diario ni en Vales. Ponle una fecha de inicio: pasa
        a "Próximo" solo y, el día que llegue, a "Activo" también.
      </p>
      <p v-else-if="puedeEditarEstado && form.estado === 'proximo'" class="mf-info mf-span">
        Tiene fecha de inicio programada: pasará a "Activo" solo ese día.
      </p>
    </div>
  </ModalFormulario>
</template>

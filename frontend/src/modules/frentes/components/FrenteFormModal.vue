<script setup>
import { reactive, ref, useAttrs, watch } from 'vue'

const props = defineProps({
  frente: { type: Object, default: null }, // null = creando, objeto = editando
  // Al copiar una tarjeta: crea uno nuevo (frente sigue null) pero con área/
  // sector/contrato ya rellenados — nombre, código, estado y fecha siempre
  // arrancan de cero, nunca se copian.
  plantilla: { type: Object, default: null },
  contratos: { type: Array, default: () => [] },
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
  }
}

const form = reactive(estadoInicial())
const guardando = ref(false)
const error = ref('')

watch(
  () => props.frente,
  () => Object.assign(form, estadoInicial())
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
  (nuevo) => {
    if (nuevo === 'planificado') form.fecha_inicio = ''
  }
)

async function onSubmit() {
  error.value = ''
  if (!form.area.trim() || !form.sector.trim() || !form.nombre.trim() || !form.contrato_id) {
    error.value = 'Área, sector, frente y contrato son obligatorios.'
    return
  }

  guardando.value = true
  try {
    await attrs.onGuardar({
      area: form.area.trim(),
      sector: form.sector.trim(),
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim() || null,
      contrato_id: form.contrato_id,
      estado: form.estado,
      fecha_inicio: form.fecha_inicio || null,
      fecha_cierre: form.fecha_cierre || null,
    })
  } catch (e) {
    console.error(e)
    error.value = e?.message?.includes('duplicate')
      ? 'Ya existe un frente con ese código.'
      : `No se pudo guardar el frente${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <form class="modal" @submit.prevent="onSubmit">
      <h2>{{ frente ? 'Editar frente' : plantilla ? 'Copiar frente' : 'Nuevo frente' }}</h2>
      <p v-if="plantilla" class="ayuda">
        Se copiaron área, sector y contrato de "{{ plantilla.nombre }}" — completa el nombre (y el código, si aplica).
      </p>

      <label>
        Área
        <input v-model="form.area" type="text" required />
      </label>

      <label>
        Sector
        <input v-model="form.sector" type="text" required />
      </label>

      <label>
        Frente
        <input v-model="form.nombre" type="text" required />
      </label>

      <label>
        Código (opcional)
        <!-- Antes se bloqueaba al editar (:disabled="!!frente") porque
             corregirlo era cosa del catálogo de Frentes dentro de Catálogos
             RDC. Ahora que ese catálogo quedó de solo lectura, esta es la
             única pantalla que administra frentes — tiene que poder
             corregirse acá, igual que el resto de los campos. -->
        <input v-model="form.codigo" type="text" />
      </label>

      <label>
        Contrato
        <select v-model="form.contrato_id" required>
          <option v-for="c in contratos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </label>

      <label>
        Fecha de inicio (opcional)
        <input v-model="form.fecha_inicio" type="date" />
        <span v-if="!form.fecha_inicio && (form.estado === 'planificado' || form.estado === 'proximo')" class="ayuda">
          Déjala vacía mientras no se sepa cuándo arranca — eso es justo lo que significa "Planificado".
        </span>
      </label>

      <label v-show="puedeEditarEstado">
        Estado
        <select v-model="form.estado">
          <option value="planificado">Planificado (aún no inició)</option>
          <!-- "Próximo" no se elige a mano: sale solo en cuanto se le pone una
               fecha de inicio futura (ver la ayuda de abajo), y por eso acá
               aparece deshabilitada — solo está para que el desplegable
               pueda MOSTRAR ese valor cuando ya es lo que tiene guardado. -->
          <option value="proximo" disabled>Próximo (automático, ver fecha de inicio)</option>
          <option value="activo">Activo</option>
          <option value="paralizado">Paralizado</option>
          <option value="cerrado">Cerrado</option>
        </select>
        <span v-if="form.estado === 'planificado'" class="ayuda">
          Mientras no tenga fecha de inicio, no va a aparecer en el Reporte Diario de Campo ni en el selector de
          Vales. Ponle una fecha de inicio para que pase a "Próximo" solo — y en cuanto llegue esa fecha, a "Activo"
          solo también, sin que haga falta volver a entrar acá.
        </span>
        <span v-else-if="form.estado === 'proximo'" class="ayuda">
          Tiene fecha de inicio programada — va a pasar a "Activo" solo el día que llegue esa fecha.
        </span>
      </label>

      <label v-if="frente && form.estado === 'cerrado'">
        Fecha de cierre
        <input v-model="form.fecha_cierre" type="date" />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button type="button" class="secundario" @click="$emit('cerrar')">Cancelar</button>
        <button type="submit" :disabled="guardando">
          {{ guardando ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: grid;
  place-items: center;
  z-index: 40;
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 380px;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text);
}
input,
select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
}
input:disabled {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
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
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.error {
  color: var(--color-danger);
  font-size: 0.85rem;
  margin: 0;
}
.ayuda {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
</style>

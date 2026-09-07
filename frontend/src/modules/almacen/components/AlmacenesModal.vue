<script setup>
import { reactive, ref, useAttrs } from 'vue'
import BotonIcono from '../../../components/BotonIcono.vue'

defineProps({
  almacenes: { type: Array, default: () => [] },
})

defineEmits(['cerrar'])
// emit() no espera de verdad ni propaga errores del padre (siempre devuelve
// undefined) — invocamos attrs.onCrear/onEditar/onEliminar directamente
// para que los try/catch de abajo capturen fallos reales.
const attrs = useAttrs()

const editando = ref(null) // null = creando, objeto = editando
const form = reactive({ codigo: '', nombre: '', ubicacion: '', estado: 'activo' })
const guardando = ref(false)
const error = ref('')

function limpiarForm() {
  editando.value = null
  form.codigo = ''
  form.nombre = ''
  form.ubicacion = ''
  form.estado = 'activo'
}

function iniciarEdicion(almacen) {
  editando.value = almacen
  form.codigo = almacen.codigo
  form.nombre = almacen.nombre
  form.ubicacion = almacen.ubicacion ?? ''
  form.estado = almacen.estado
}

async function onSubmit() {
  error.value = ''
  if (!form.codigo.trim() || !form.nombre.trim()) {
    error.value = 'Código y nombre son obligatorios.'
    return
  }

  const payload = {
    codigo: form.codigo.trim(),
    nombre: form.nombre.trim(),
    ubicacion: form.ubicacion.trim() || null,
  }

  guardando.value = true
  try {
    if (editando.value) {
      await attrs.onEditar({ id: editando.value.id, payload: { ...payload, estado: form.estado } })
    } else {
      await attrs.onCrear(payload)
    }
    limpiarForm()
  } catch (e) {
    console.error(e)
    error.value = e?.message?.includes('duplicate')
      ? 'Ya existe un almacén con ese código.'
      : `No se pudo guardar el almacén${e?.message ? ': ' + e.message : '.'}`
  } finally {
    guardando.value = false
  }
}

async function eliminar(almacen) {
  if (!confirm(`¿Eliminar el almacén "${almacen.codigo} — ${almacen.nombre}"?`)) return
  error.value = ''
  try {
    await attrs.onEliminar(almacen)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo eliminar el almacén${e?.message ? ': ' + e.message : '.'}`
  }
}
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Almacenes</h2>

      <ul class="lista">
        <li v-for="a in almacenes" :key="a.id">
          <strong>{{ a.codigo }}</strong> — {{ a.nombre }}
          <span v-if="a.ubicacion" class="ubicacion">({{ a.ubicacion }})</span>
          <span class="badge" :class="a.estado">{{ a.estado }}</span>
          <span class="fila-acciones">
            <BotonIcono variante="editar" titulo="Editar" @click="iniciarEdicion(a)" />
            <BotonIcono variante="eliminar" titulo="Eliminar" @click="eliminar(a)" />
          </span>
        </li>
        <li v-if="!almacenes.length" class="vacio">Todavía no hay almacenes.</li>
      </ul>

      <form class="form" @submit.prevent="onSubmit">
        <p v-if="editando" class="editando-aviso">Editando "{{ editando.codigo }}"</p>
        <label>
          Código
          <input v-model="form.codigo" type="text" placeholder="ALM-01" required />
        </label>
        <label>
          Nombre
          <input v-model="form.nombre" type="text" placeholder="Almacén central" required />
        </label>
        <label>
          Ubicación (opcional)
          <input v-model="form.ubicacion" type="text" />
        </label>
        <label v-if="editando">
          Estado
          <select v-model="form.estado">
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="acciones-form">
          <button v-if="editando" type="button" class="secundario" @click="limpiarForm">Cancelar edición</button>
          <button type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar almacén' }}
          </button>
        </div>
      </form>

      <button type="button" class="secundario" @click="$emit('cerrar')">Cerrar</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: grid;
  place-items: center;
  z-index: 10;
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
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
.lista li {
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.lista li:last-child {
  border-bottom: none;
}
.ubicacion {
  color: #6b7280;
  font-size: 0.8rem;
}
.fila-acciones {
  margin-left: auto;
  display: flex;
  gap: 0.1rem;
}
.badge {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
}
.badge.activo {
  background: #dcfce7;
  color: #166534;
}
.badge.inactivo {
  background: #f3f4f6;
  color: #6b7280;
}
.vacio {
  color: #6b7280;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e5e7eb;
}
.editando-aviso {
  margin: 0;
  font-size: 0.8rem;
  color: #2563eb;
  font-weight: 600;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #374151;
}
input,
select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font: inherit;
}
.acciones-form {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
button {
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.secundario {
  background: none;
  border: 1px solid #d1d5db;
  color: #374151;
}
.error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0;
}
</style>

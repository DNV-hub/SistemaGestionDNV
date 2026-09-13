<script setup>
import { reactive, ref, watch } from 'vue'
import BotonIcono from '../../../../components/BotonIcono.vue'

// Tabla genérica de "hoja de cálculo" para un catálogo del RDC: cada celda
// se guarda sola al perder el foco (o al cambiar, en un <select>), sin botón
// "Guardar" ni modal de por medio — es lo que hace que administrar 340 filas
// de la biblioteca de pernos, por ejemplo, sea rápido y no una tortura de
// abrir-cerrar un formulario por cada una.
//
// No hace las llamadas a Supabase directamente (eso vive en el catálogo que
// contiene esta tabla, que sabe con qué tabla real está hablando): recibe
// `alCrear` / `alActualizar` / `alEliminar` como funciones que devuelven una
// promesa, para poder esperarlas y reaccionar (revertir si falla, limpiar la
// fila nueva si sale bien) sin un viaje de ida y vuelta por eventos.
const props = defineProps({
  columnas: { type: Array, required: true },
  filas: { type: Array, required: true },
  campoActivo: { type: String, default: null },
  opciones: { type: Object, default: () => ({}) },
  nuevaFilaBase: { type: Object, default: () => ({}) },
  alCrear: { type: Function, default: null },
  alActualizar: { type: Function, default: null },
  alEliminar: { type: Function, default: null },
  // Para un catálogo que ya se administra desde su propio módulo (Frentes,
  // por ejemplo): acá solo se ve, para no tener dos pantallas distintas que
  // editen lo mismo y puedan desincronizarse. Sin fila nueva, sin inputs,
  // sin borrar — una tabla plana nomás.
  soloLectura: { type: Boolean, default: false },
})

const error = ref('')

function filaVacia() {
  return { ...props.nuevaFilaBase }
}
const nuevaFila = reactive(filaVacia())
// Cuando cambia el frente seleccionado (catálogos "por frente"), la fila en
// blanco tiene que arrancar de nuevo con el frente_id correcto.
watch(
  () => props.nuevaFilaBase,
  () => Object.assign(nuevaFila, filaVacia()),
)

const creando = ref(false)
const faltaRequerido = (fila) => props.columnas.some((c) => c.requerido && (fila[c.clave] === '' || fila[c.clave] == null))

async function crear() {
  if (faltaRequerido(nuevaFila) || creando.value) return
  error.value = ''
  creando.value = true
  try {
    await props.alCrear({ ...nuevaFila })
    Object.assign(nuevaFila, filaVacia())
  } catch (e) {
    error.value = e?.message ?? 'No se pudo crear la fila.'
  } finally {
    creando.value = false
  }
}

// Valor con el que entró cada celda, para poder revertir si el guardado
// falla — sin esto, un error de red dejaría la celda mostrando algo que en
// realidad nunca se guardó, sin ningún aviso de que está desincronizada.
const valorAlEntrar = new WeakMap()
function recordar(fila, clave) {
  if (!valorAlEntrar.has(fila)) valorAlEntrar.set(fila, {})
  valorAlEntrar.get(fila)[clave] = fila[clave]
}

const guardandoCeldas = reactive(new Set())
const claveCelda = (fila, clave) => `${fila.id}::${clave}`

async function guardarCampo(fila, clave) {
  const anterior = valorAlEntrar.get(fila)?.[clave]
  if (anterior === fila[clave]) return // sin cambios reales, no hay nada que mandar
  const k = claveCelda(fila, clave)
  guardandoCeldas.add(k)
  error.value = ''
  try {
    await props.alActualizar(fila.id, { [clave]: fila[clave] })
  } catch (e) {
    fila[clave] = anterior
    error.value = e?.message ?? 'No se pudo guardar el cambio.'
  } finally {
    guardandoCeldas.delete(k)
  }
}

// Solo para el modo de lectura: el valor plano de una celda 'seleccion' es
// un id/código, no lo que hay que mostrarle a alguien — se busca su
// etiqueta en las mismas opciones que usa el modo editable.
function valorLegible(fila, columna) {
  const valor = fila[columna.clave]
  if (columna.tipo === 'seleccion') {
    return (props.opciones[columna.opciones] ?? []).find((o) => o.value === valor)?.label ?? valor ?? '—'
  }
  return valor ?? '—'
}

const eliminandoIds = reactive(new Set())
async function eliminar(fila) {
  const etiqueta = fila.nombre ?? fila.codigo ?? fila.tipo ?? 'esta fila'
  if (!confirm(`¿Borrar "${etiqueta}"? Si algún reporte ya la usó, la base va a impedirlo — no se puede deshacer si lo permite.`)) return
  eliminandoIds.add(fila.id)
  error.value = ''
  try {
    await props.alEliminar(fila.id)
  } catch (e) {
    error.value = e?.message ?? 'No se pudo borrar: probablemente algún reporte ya la está usando.'
  } finally {
    eliminandoIds.delete(fila.id)
  }
}
</script>

<template>
  <div class="tabla-catalogo">
    <p v-if="soloLectura" class="aviso-solo-lectura">
      Solo lectura. Para crear, editar o borrar, ve al módulo <router-link to="/frentes">Frentes</router-link> —
      administrarlo también desde acá haría fácil que las dos pantallas terminen diciendo cosas distintas.
    </p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th v-for="c in columnas" :key="c.clave">{{ c.etiqueta }}</th>
            <th v-if="campoActivo">Activo</th>
            <th v-if="!soloLectura"></th>
          </tr>
        </thead>
        <tbody v-if="soloLectura">
          <tr v-for="fila in filas" :key="fila.id">
            <td v-for="c in columnas" :key="c.clave">{{ valorLegible(fila, c) }}</td>
            <td v-if="campoActivo">{{ fila[campoActivo] ? 'Sí' : 'No' }}</td>
          </tr>
          <tr v-if="!filas.length">
            <td :colspan="columnas.length + (campoActivo ? 1 : 0)" class="vacio">Todavía no hay filas.</td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr class="fila-nueva">
            <td v-for="c in columnas" :key="c.clave">
              <input
                v-if="c.tipo === 'texto'"
                v-model="nuevaFila[c.clave]"
                type="text"
                :placeholder="c.etiqueta"
              />
              <input v-else-if="c.tipo === 'numero'" v-model.number="nuevaFila[c.clave]" type="number" :placeholder="c.etiqueta" />
              <select v-else-if="c.tipo === 'seleccion'" v-model="nuevaFila[c.clave]">
                <option v-if="c.permiteVacio" :value="null">—</option>
                <option v-for="o in opciones[c.opciones]" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </td>
            <td v-if="campoActivo"></td>
            <td>
              <button type="button" class="boton-agregar" :disabled="faltaRequerido(nuevaFila) || creando" @click="crear">
                {{ creando ? 'Agregando…' : '+ Agregar' }}
              </button>
            </td>
          </tr>

          <tr v-for="fila in filas" :key="fila.id">
            <td v-for="c in columnas" :key="c.clave">
              <input
                v-if="c.tipo === 'texto'"
                v-model="fila[c.clave]"
                type="text"
                :disabled="guardandoCeldas.has(claveCelda(fila, c.clave))"
                @focus="recordar(fila, c.clave)"
                @blur="guardarCampo(fila, c.clave)"
              />
              <input
                v-else-if="c.tipo === 'numero'"
                v-model.number="fila[c.clave]"
                type="number"
                :disabled="guardandoCeldas.has(claveCelda(fila, c.clave))"
                @focus="recordar(fila, c.clave)"
                @blur="guardarCampo(fila, c.clave)"
              />
              <select
                v-else-if="c.tipo === 'seleccion'"
                v-model="fila[c.clave]"
                :disabled="guardandoCeldas.has(claveCelda(fila, c.clave))"
                @focus="recordar(fila, c.clave)"
                @change="guardarCampo(fila, c.clave)"
              >
                <option v-if="c.permiteVacio" :value="null">—</option>
                <option v-for="o in opciones[c.opciones]" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </td>
            <td v-if="campoActivo" class="celda-activo">
              <input
                type="checkbox"
                v-model="fila[campoActivo]"
                :disabled="guardandoCeldas.has(claveCelda(fila, campoActivo))"
                @focus="recordar(fila, campoActivo)"
                @change="guardarCampo(fila, campoActivo)"
              />
            </td>
            <td class="celda-acciones">
              <BotonIcono variante="eliminar" titulo="Borrar" :disabled="eliminandoIds.has(fila.id)" @click="eliminar(fila)" />
            </td>
          </tr>

          <tr v-if="!filas.length">
            <td :colspan="columnas.length + (campoActivo ? 2 : 1)" class="vacio">Todavía no hay filas.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tabla-catalogo {
  background: var(--color-surface);
  border-radius: var(--radius-card);
}
.scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
th,
td {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
thead th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: left;
}
input[type='text'],
input[type='number'],
select {
  width: 100%;
  min-width: 90px;
  padding: 0.35rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text);
  font-size: 0.85rem;
}
input[type='text']:hover,
input[type='number']:hover,
select:hover {
  border-color: var(--color-border);
}
input[type='text']:focus,
input[type='number']:focus,
select:focus {
  border-color: var(--color-primary);
  background: var(--color-surface);
  outline: none;
}
input:disabled,
select:disabled {
  opacity: 0.5;
}
.celda-activo {
  text-align: center;
}
.celda-activo input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.celda-acciones {
  text-align: center;
}
.fila-nueva {
  background: var(--color-surface-2);
}
.boton-agregar {
  padding: 0.35rem 0.7rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  font-size: 0.8rem;
  white-space: nowrap;
  cursor: pointer;
}
.boton-agregar:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
}
.error {
  color: var(--color-danger);
  font-size: 0.85rem;
  padding: 0.5rem 0;
}
.aviso-solo-lectura {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.8rem;
  background: var(--color-info-soft);
  color: var(--color-text);
  border-radius: var(--radius-control);
  font-size: 0.85rem;
}
.aviso-solo-lectura a {
  color: var(--color-primary);
  font-weight: 600;
}
</style>

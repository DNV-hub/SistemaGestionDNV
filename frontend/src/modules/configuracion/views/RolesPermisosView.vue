<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../../../store/auth'
import { listarRoles, listarPermisos, listarAsignaciones, asignarPermiso, quitarPermiso } from '../services/rolesPermisosService'

const auth = useAuthStore()

const roles = ref([])
const permisos = ref([])
// Set de "rolId::permisoId" — más simple de consultar celda por celda que
// buscar en un arreglo cada vez que se dibuja la tabla.
const asignados = ref(new Set())
const cargando = ref(true)
const error = ref('')
const guardando = ref(new Set()) // "rolId::permisoId" en vuelo, para no dejar tocar la misma celda dos veces

const clave = (rolId, permisoId) => `${rolId}::${permisoId}`

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [r, p, a] = await Promise.all([listarRoles(), listarPermisos(), listarAsignaciones()])
    roles.value = r
    permisos.value = p
    asignados.value = new Set(a.map((x) => clave(x.rol_id, x.permiso_id)))
  } catch (e) {
    error.value = e?.message ?? 'No se pudieron cargar los roles y permisos.'
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

const gruposPermisos = computed(() => {
  const grupos = new Map()
  for (const p of permisos.value) {
    if (!grupos.has(p.modulo)) grupos.set(p.modulo, [])
    grupos.get(p.modulo).push(p)
  }
  return [...grupos.entries()].map(([modulo, items]) => ({ modulo, items }))
})

function tiene(rolId, permisoId) {
  return asignados.value.has(clave(rolId, permisoId))
}

/** Quitarle 'roles.gestionar' al propio rol deja a todo el que lo tenga sin
 * forma de volver a entrar acá — ni siquiera para deshacerlo — hasta que
 * alguien lo arregle con una migración. No se bloquea del todo (podría ser
 * una decisión real), pero se pide una confirmación aparte, más específica
 * que la genérica de un error de guardado. */
function esRiesgoAutobloqueo(rolId, permisoCodigo, activar) {
  return !activar && permisoCodigo === 'roles.gestionar' && rolId === auth.perfil?.rol_id
}

async function alternar(rolId, permiso, activar) {
  const k = clave(rolId, permiso.id)
  if (guardando.value.has(k)) return

  if (esRiesgoAutobloqueo(rolId, permiso.codigo, activar)) {
    const seguir = confirm(
      'Le vas a quitar "roles.gestionar" al rol con el que estás conectado ahora mismo. ' +
        'Si lo haces, ni tú ni nadie con ese rol va a poder volver a entrar a esta pantalla para deshacerlo — ' +
        'habría que arreglarlo con una migración. ¿Seguro que quieres continuar?',
    )
    if (!seguir) return
  }

  error.value = ''
  guardando.value = new Set(guardando.value).add(k)
  try {
    if (activar) await asignarPermiso(rolId, permiso.id)
    else await quitarPermiso(rolId, permiso.id)

    const nuevo = new Set(asignados.value)
    if (activar) nuevo.add(k)
    else nuevo.delete(k)
    asignados.value = nuevo
  } catch (e) {
    error.value = e?.message ?? 'No se pudo guardar el cambio.'
  } finally {
    const restante = new Set(guardando.value)
    restante.delete(k)
    guardando.value = restante
  }
}
</script>

<template>
  <div class="config">
    <header class="cabecera">
      <h1>Roles y permisos</h1>
    </header>

    <p class="ayuda">
      Marca o desmarca para dar o quitar un permiso a un rol. Los cambios se guardan al toque, sin necesidad de nada más.
    </p>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando">Cargando…</p>

    <div v-else class="tabla-scroll">
      <table class="tabla-permisos">
        <thead>
          <tr>
            <th class="col-permiso">Permiso</th>
            <th v-for="r in roles" :key="r.id" :title="r.descripcion">{{ r.nombre }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="grupo in gruposPermisos" :key="grupo.modulo">
            <tr class="fila-modulo">
              <td :colspan="roles.length + 1">{{ grupo.modulo }}</td>
            </tr>
            <tr v-for="p in grupo.items" :key="p.id">
              <td class="col-permiso" :title="p.descripcion">
                <span class="codigo">{{ p.codigo }}</span>
                <span class="descripcion">{{ p.descripcion }}</span>
              </td>
              <td v-for="r in roles" :key="r.id" class="celda-check">
                <input
                  type="checkbox"
                  :checked="tiene(r.id, p.id)"
                  :disabled="guardando.has(clave(r.id, p.id))"
                  @change="alternar(r.id, p, $event.target.checked)"
                />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.config {
  padding: 1.5rem 2rem;
}
.cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.ayuda {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
}
.tabla-scroll {
  overflow-x: auto;
  background: var(--color-surface);
  border-radius: var(--radius-card);
}
.tabla-permisos {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.tabla-permisos th,
.tabla-permisos td {
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
.tabla-permisos thead th {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
}
.col-permiso {
  text-align: left;
  white-space: normal;
  min-width: 220px;
}
.col-permiso .codigo {
  display: block;
  font-weight: 600;
  color: var(--color-text);
}
.col-permiso .descripcion {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.fila-modulo td {
  background: var(--color-surface-2);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}
.celda-check {
  text-align: center;
}
.celda-check input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
</style>

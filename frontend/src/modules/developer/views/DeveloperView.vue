<script setup>
import { computed, onMounted, ref } from 'vue'
import { listarUsuarios } from '../../usuarios/services/usuariosService'
import {
  listarValesParaBorrar,
  borrarVale,
  listarReportesRdcParaBorrar,
  borrarReporteRdc,
  suplantarUsuario,
  reiniciarIngresos,
} from '../services/developerService'

const cargando = ref(true)
const error = ref('')
const aviso = ref('')

const usuarios = ref([])
const vales = ref([])
const reportes = ref([])

const valesSeleccionados = ref(new Set())
const reportesSeleccionados = ref(new Set())
const borrando = ref(false)
const suplantando = ref(false)
const reiniciandoIngresos = ref(false)

onMounted(async () => {
  cargando.value = true
  error.value = ''
  try {
    const [u, v, r] = await Promise.all([listarUsuarios(), listarValesParaBorrar(), listarReportesRdcParaBorrar()])
    usuarios.value = u.filter((x) => x.estado === 'activo')
    vales.value = v
    reportes.value = r
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cargar la información: ${e.message ?? e}`
  } finally {
    cargando.value = false
  }
})

const usuariosPorRol = computed(() => {
  const grupos = new Map()
  for (const u of usuarios.value) {
    const rol = u.roles?.nombre ?? '—'
    if (!grupos.has(rol)) grupos.set(rol, [])
    grupos.get(rol).push(u)
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b))
})

function alternar(set, id) {
  if (set.has(id)) set.delete(id)
  else set.add(id)
}

async function verComo(usuario) {
  if (!confirm(`¿Ver el sistema como ${usuario.nombre} (${usuario.roles?.nombre})? Vas a salir de tu cuenta Developer y entrar como esa cuenta.`)) return
  suplantando.value = true
  error.value = ''
  try {
    await suplantarUsuario(usuario.id)
    window.location.assign('/')
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cambiar de cuenta: ${e.message ?? e}`
    suplantando.value = false
  }
}

async function reiniciarTodosLosIngresos() {
  const primeraConfirmacion = confirm(
    'Esto borra TODOS los ingresos de TODOS los materiales y almacenes, su kardex, y repone el stock físico a 0. ' +
      'Se niega solo si ya hay entregas (salidas) o stock reservado. No se puede deshacer.\n\n¿Seguro?'
  )
  if (!primeraConfirmacion) return
  const segundaConfirmacion = prompt('Para confirmar, escribí BORRAR TODO (en mayúsculas):')
  if (segundaConfirmacion !== 'BORRAR TODO') {
    aviso.value = ''
    return
  }

  reiniciandoIngresos.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { ingresosBorrados, kardexBorrado, stockBorrado } = await reiniciarIngresos()
    aviso.value = `Se borraron ${ingresosBorrados} ingresos, ${kardexBorrado} filas de kardex y ${stockBorrado} filas de stock. Queda como recién empezado, listo para reingresar.`
  } catch (e) {
    console.error(e)
    error.value = `No se pudo reiniciar: ${e.message ?? e}`
  } finally {
    reiniciandoIngresos.value = false
  }
}

async function borrarValesSeleccionados() {
  if (!valesSeleccionados.value.size) return
  if (!confirm(`¿Borrar ${valesSeleccionados.value.size} vale(s)? No se puede deshacer.`)) return
  borrando.value = true
  aviso.value = ''
  error.value = ''
  const fallidos = []
  for (const id of valesSeleccionados.value) {
    try {
      await borrarVale(id)
    } catch (e) {
      fallidos.push({ id, mensaje: e.message ?? String(e) })
    }
  }
  vales.value = await listarValesParaBorrar()
  valesSeleccionados.value = new Set()
  borrando.value = false
  if (fallidos.length) {
    error.value = `${fallidos.length} vale(s) no se pudieron borrar: ${fallidos.map((f) => f.mensaje).join(' · ')}`
  } else {
    aviso.value = 'Vale(s) borrado(s).'
  }
}

async function borrarReportesSeleccionados() {
  if (!reportesSeleccionados.value.size) return
  if (!confirm(`¿Borrar ${reportesSeleccionados.value.size} reporte(s) del RDC? No se puede deshacer.`)) return
  borrando.value = true
  aviso.value = ''
  error.value = ''
  const fallidos = []
  for (const id of reportesSeleccionados.value) {
    try {
      await borrarReporteRdc(id)
    } catch (e) {
      fallidos.push({ id, mensaje: e.message ?? String(e) })
    }
  }
  reportes.value = await listarReportesRdcParaBorrar()
  reportesSeleccionados.value = new Set()
  borrando.value = false
  if (fallidos.length) {
    error.value = `${fallidos.length} reporte(s) no se pudieron borrar: ${fallidos.map((f) => f.mensaje).join(' · ')}`
  } else {
    aviso.value = 'Reporte(s) borrado(s).'
  }
}
</script>

<template>
  <div class="developer">
    <header class="cabecera">
      <h1>Developer</h1>
      <p class="subtitulo">Herramientas de prueba: no existen para ningún otro rol.</p>
    </header>

    <p v-if="aviso" class="aviso">{{ aviso }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="cargando">Cargando…</p>

    <template v-else>
      <section class="tarjeta">
        <h2>Ver como otra cuenta</h2>
        <p class="ayuda">
          Abre una sesión real como la cuenta elegida — no es una vista simulada, se comporta exactamente igual que
          si esa cuenta hubiera iniciado sesión. Desde el menú de usuario vas a poder volver a tu cuenta Developer.
        </p>
        <div v-for="[rol, lista] in usuariosPorRol" :key="rol" class="grupo-rol">
          <h3>{{ rol }}</h3>
          <div class="lista-usuarios">
            <button v-for="u in lista" :key="u.id" class="chip-usuario" :disabled="suplantando" @click="verComo(u)">
              {{ u.nombre }}
            </button>
          </div>
        </div>
      </section>

      <section class="tarjeta peligro-total">
        <h2>Reiniciar todos los ingresos</h2>
        <p class="ayuda">
          Borra TODOS los ingresos de TODOS los materiales y almacenes (y su kardex), y borra también las filas de
          stock — no quedan en 0, desaparecen del todo y se vuelven a crear solas con el próximo ingreso. Para cuando
          el ingreso inicial se cargó mal y hay que reingresar todo de cero con la plantilla. Se niega en el servidor
          si ya hay entregas (salidas) o stock reservado de por medio.
        </p>
        <button class="peligro" :disabled="reiniciandoIngresos" @click="reiniciarTodosLosIngresos">
          {{ reiniciandoIngresos ? 'Reiniciando…' : 'Borrar todos los ingresos' }}
        </button>
      </section>

      <section class="tarjeta">
        <h2>Borrar vales de prueba</h2>
        <p class="ayuda">
          No deja borrar un vale que ya tuvo una entrega física real (eso quedó en kardex, no es una prueba) — para
          esos casos hay que revertirlos con Devoluciones.
        </p>
        <button class="peligro" :disabled="!valesSeleccionados.size || borrando" @click="borrarValesSeleccionados">
          {{ borrando ? 'Borrando…' : `Borrar ${valesSeleccionados.size || ''} seleccionado(s)` }}
        </button>
        <table class="tabla">
          <thead>
            <tr>
              <th></th>
              <th>Número</th>
              <th>Fecha</th>
              <th>Frente</th>
              <th>Supervisor</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in vales" :key="v.id">
              <td><input type="checkbox" :checked="valesSeleccionados.has(v.id)" @change="alternar(valesSeleccionados, v.id)" /></td>
              <td>{{ v.numero }}</td>
              <td>{{ v.fecha }}</td>
              <td>{{ v.frentes?.codigo ?? '—' }}</td>
              <td>{{ v.usuarios?.nombre ?? '—' }}</td>
              <td>{{ v.estado }}</td>
            </tr>
            <tr v-if="!vales.length"><td colspan="6" class="vacio">No hay vales.</td></tr>
          </tbody>
        </table>
      </section>

      <section class="tarjeta">
        <h2>Borrar reportes del RDC de prueba</h2>
        <button class="peligro" :disabled="!reportesSeleccionados.size || borrando" @click="borrarReportesSeleccionados">
          {{ borrando ? 'Borrando…' : `Borrar ${reportesSeleccionados.size || ''} seleccionado(s)` }}
        </button>
        <table class="tabla">
          <thead>
            <tr>
              <th></th>
              <th>Fecha</th>
              <th>Frente</th>
              <th>Supervisor</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reportes" :key="r.id">
              <td><input type="checkbox" :checked="reportesSeleccionados.has(r.id)" @change="alternar(reportesSeleccionados, r.id)" /></td>
              <td>{{ r.fecha }}</td>
              <td>{{ r.rdc_frentes?.nombre ?? '—' }}</td>
              <td>{{ r.rdc_supervisores?.nombre ?? '—' }}</td>
              <td>{{ r.estado }}</td>
            </tr>
            <tr v-if="!reportes.length"><td colspan="5" class="vacio">No hay reportes.</td></tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.developer {
  padding: 1.5rem 2rem;
}
.cabecera {
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0;
  color: var(--color-text);
}
.subtitulo {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.tarjeta {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}
.tarjeta.peligro-total {
  border-color: var(--color-danger);
  border-width: 2px;
}
h2 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  color: var(--color-text);
}
h3 {
  margin: 0.75rem 0 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}
.ayuda {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.lista-usuarios {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip-usuario {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: 0.82rem;
  cursor: pointer;
}
.chip-usuario:hover {
  border-color: var(--color-primary);
}
.chip-usuario:disabled {
  opacity: 0.6;
  cursor: default;
}
button.peligro {
  padding: 0.5rem 0.9rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-danger);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 0.6rem;
}
button.peligro:disabled {
  opacity: 0.55;
  cursor: default;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
}
.tabla th,
.tabla td {
  text-align: left;
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
}
.tabla th {
  color: var(--color-text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.vacio {
  text-align: center;
  color: var(--color-text-muted);
}
.aviso {
  color: var(--color-success);
  font-size: 0.9rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.9rem;
  white-space: pre-wrap;
}
</style>

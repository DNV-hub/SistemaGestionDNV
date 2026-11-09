<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../../../store/auth'
import {
  listarRoles,
  listarPermisos,
  listarAsignaciones,
  contarUsuariosPorRol,
  asignarPermiso,
  quitarPermiso,
  crearRol,
  eliminarRol,
} from '../services/rolesPermisosService'
import NuevoRolModal from '../components/NuevoRolModal.vue'

const auth = useAuthStore()

// ---------------------------------------------------------------------------
// Presentación: nombre visible y orden de los módulos y de los roles. Lo que
// no esté en estas listas (un módulo o rol nuevo) se muestra igual, al final.
// ---------------------------------------------------------------------------
const MODULOS_META = {
  vales: 'Vales',
  almacen: 'Almacén',
  reservas: 'Reservas',
  devoluciones: 'Devoluciones',
  transferencias: 'Transferencias',
  kardex: 'Kárdex',
  catalogo: 'Catálogo de materiales',
  procura: 'Procura',
  frentes: 'Frentes',
  rdc: 'Reporte diario (RDC)',
  dashboard: 'Dashboard',
  alertas: 'Alertas',
  reportes: 'Reportes generales',
  usuarios: 'Usuarios y roles',
  auditoria: 'Auditoría',
  sistema: 'Sistema',
}
const ORDEN_ROLES = ['Developer', 'Coordinador', 'Administrador', 'Planeamiento', 'Almacen', 'Residencia', 'Supervisor', 'Consulta']
const ACCESO_TOTAL = new Set(['Developer', 'Administrador'])
const SENSIBLES = new Set([
  'roles.gestionar',
  'usuarios.crear',
  'usuarios.editar',
  'usuarios.desactivar',
  'sistema.borrar_pruebas',
  'sistema.suplantar_usuario',
  'almacenes.gestionar',
  'auditoria.ver',
  'alertas.configurar_umbrales',
  'rdc.editar_todos',
])
const nombreRol = (n) => (n === 'Almacen' ? 'Almacén' : n)
const capitalizar = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const nombreModulo = (m) => MODULOS_META[m] ?? capitalizar(m)
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// ---------------------------------------------------------------------------
// Datos y estado
// ---------------------------------------------------------------------------
const roles = ref([])
const permisos = ref([])
const usuariosPorRol = ref({})
// "Guardado" (base) y "en pantalla" (cur): rolId -> Set de permisoId. Los
// cambios viven en cur hasta que se aprieta Guardar.
const base = ref(new Map())
const cur = ref(new Map())

const cargando = ref(true)
const error = ref('')
const guardando = ref(false)
const mostrarModalNuevoRol = ref(false)

const tab = ref('rol')
const rolSel = ref(null)
const busqueda = ref('')
const soloActivos = ref(false)
const abiertos = ref(new Set(['vales', 'rdc']))

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [r, p, a, u] = await Promise.all([listarRoles(), listarPermisos(), listarAsignaciones(), contarUsuariosPorRol()])
    roles.value = ordenarRoles(r)
    permisos.value = p
    usuariosPorRol.value = u
    const mapa = new Map(r.map((x) => [x.id, new Set()]))
    for (const x of a) mapa.get(x.rol_id)?.add(x.permiso_id)
    base.value = mapa
    cur.value = new Map([...mapa].map(([id, set]) => [id, new Set(set)]))
    if (!rolSel.value || !r.some((x) => x.id === rolSel.value)) {
      rolSel.value = (roles.value.find((x) => x.nombre === 'Planeamiento') ?? roles.value[0])?.id ?? null
    }
  } catch (e) {
    error.value = e?.message ?? 'No se pudieron cargar los roles y permisos.'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

function ordenarRoles(lista) {
  const pos = (n) => {
    const i = ORDEN_ROLES.indexOf(n)
    return i === -1 ? ORDEN_ROLES.length : i
  }
  return [...lista].sort((a, b) => pos(a.nombre) - pos(b.nombre) || a.nombre.localeCompare(b.nombre))
}

const modulos = computed(() => {
  const grupos = new Map()
  for (const p of permisos.value) {
    if (!grupos.has(p.modulo)) grupos.set(p.modulo, [])
    grupos.get(p.modulo).push(p)
  }
  const orden = Object.keys(MODULOS_META)
  const pos = (m) => {
    const i = orden.indexOf(m)
    return i === -1 ? orden.length : i
  }
  return [...grupos.entries()]
    .sort((a, b) => pos(a[0]) - pos(b[0]) || a[0].localeCompare(b[0]))
    .map(([clave, items]) => ({ clave, nombre: nombreModulo(clave), items }))
})

const rol = computed(() => roles.value.find((r) => r.id === rolSel.value) ?? null)
const permisosDe = (rolId) => cur.value.get(rolId) ?? new Set()
const usuariosDe = (rolId) => usuariosPorRol.value[rolId] ?? 0

// ---------------------------------------------------------------------------
// Cambios sin guardar
// ---------------------------------------------------------------------------
function diferencias(rolId) {
  const b = base.value.get(rolId) ?? new Set()
  const c = cur.value.get(rolId) ?? new Set()
  return {
    agregados: [...c].filter((id) => !b.has(id)),
    quitados: [...b].filter((id) => !c.has(id)),
  }
}
const cambiosDe = (rolId) => {
  const d = diferencias(rolId)
  return d.agregados.length + d.quitados.length
}
const totalCambios = computed(() => roles.value.reduce((s, r) => s + cambiosDe(r.id), 0))
const cambioEn = (rolId, permisoId) => (cur.value.get(rolId)?.has(permisoId) ?? false) !== (base.value.get(rolId)?.has(permisoId) ?? false)

function cambiarConjunto(rolId, fn) {
  const nuevo = new Set(cur.value.get(rolId) ?? [])
  fn(nuevo)
  cur.value = new Map(cur.value).set(rolId, nuevo)
}
function alternarPermiso(permisoId) {
  if (!rol.value) return
  cambiarConjunto(rol.value.id, (s) => (s.has(permisoId) ? s.delete(permisoId) : s.add(permisoId)))
}
function estadoModulo(m) {
  const set = permisosDe(rolSel.value)
  const n = m.items.filter((p) => set.has(p.id)).length
  return { n, total: m.items.length, valor: n === 0 ? 'false' : n === m.items.length ? 'true' : 'mixed' }
}
function alternarModulo(m) {
  if (!rol.value) return
  const todos = estadoModulo(m).valor === 'true'
  cambiarConjunto(rol.value.id, (s) => m.items.forEach((p) => (todos ? s.delete(p.id) : s.add(p.id))))
}

// ---------------------------------------------------------------------------
// Vista "Por rol"
// ---------------------------------------------------------------------------
const q = computed(() => busqueda.value.trim().toLowerCase())
const modulosVisibles = computed(() => {
  const set = permisosDe(rolSel.value)
  return modulos.value
    .map((m) => ({
      ...m,
      filas: m.items.filter(
        (p) =>
          (!q.value || `${p.descripcion ?? ''} ${p.codigo} ${m.nombre}`.toLowerCase().includes(q.value)) &&
          (!soloActivos.value || set.has(p.id)),
      ),
    }))
    .filter((m) => m.filas.length)
})
const estaAbierto = (clave) => !!q.value || abiertos.value.has(clave)
function alternarAbierto(clave) {
  const s = new Set(abiertos.value)
  s.has(clave) ? s.delete(clave) : s.add(clave)
  abiertos.value = s
}
const todoAbierto = computed(() => abiertos.value.size >= modulos.value.length)
function alternarTodo() {
  abiertos.value = todoAbierto.value ? new Set() : new Set(modulos.value.map((m) => m.clave))
}

// ---------------------------------------------------------------------------
// Vista "Comparar roles"
// ---------------------------------------------------------------------------
function celda(rolId, m) {
  const set = permisosDe(rolId)
  const n = m.items.filter((p) => set.has(p.id)).length
  return { n, total: m.items.length, clase: n === m.items.length ? 'all' : n ? 'some' : 'none' }
}
function abrirDesdeMatriz(rolId, modulo) {
  rolSel.value = rolId
  tab.value = 'rol'
  busqueda.value = ''
  abiertos.value = new Set(abiertos.value).add(modulo)
  window.scrollTo?.({ top: 0 })
}

// ---------------------------------------------------------------------------
// Guardar / descartar
// ---------------------------------------------------------------------------
const aviso = ref('')
let temporizadorAviso = null
function avisar(texto) {
  aviso.value = texto
  clearTimeout(temporizadorAviso)
  temporizadorAviso = setTimeout(() => (aviso.value = ''), 2200)
}

// Diálogo de confirmación propio (no confirm()): { titulo, texto, textoOk, accion }
const dialogo = ref(null)
function confirmar(opciones) {
  dialogo.value = opciones
}
async function aceptarDialogo() {
  const d = dialogo.value
  dialogo.value = null
  await d?.accion()
}

/** Quitarle 'roles.gestionar' al rol con el que se está conectado deja a todos
 * los de ese rol sin forma de volver acá a deshacerlo; y a Developer quitarle
 * 'sistema.suplantar_usuario' lo deja sin su herramienta de soporte. No se
 * bloquea (puede ser decisión real), pero se pide confirmación expresa. */
function riesgosDeGuardar() {
  const riesgos = []
  const idRoles = permisos.value.find((p) => p.codigo === 'roles.gestionar')?.id
  const idSuplantar = permisos.value.find((p) => p.codigo === 'sistema.suplantar_usuario')?.id
  const propio = roles.value.find((r) => r.id === auth.perfil?.rol_id)
  if (propio && idRoles && cambiosQuitan(propio.id, idRoles)) {
    riesgos.push(
      `Le vas a quitar "roles.gestionar" al rol con el que estás conectado (${nombreRol(propio.nombre)}). Si lo guardas, ni tú ni nadie con ese rol podrá volver a esta pantalla para deshacerlo: habría que arreglarlo con una migración.`,
    )
  }
  const dev = roles.value.find((r) => r.nombre === 'Developer')
  if (dev && idSuplantar && cambiosQuitan(dev.id, idSuplantar)) {
    riesgos.push('Le vas a quitar "sistema.suplantar_usuario" a Developer: perderá la opción de abrir una sesión como otra cuenta.')
  }
  return riesgos
}
const cambiosQuitan = (rolId, permisoId) => diferencias(rolId).quitados.includes(permisoId)

function guardar() {
  const riesgos = riesgosDeGuardar()
  if (riesgos.length) {
    confirmar({ titulo: 'Este cambio puede dejarte sin acceso', texto: riesgos.join('\n\n'), textoOk: 'Guardar de todos modos', peligro: true, accion: ejecutarGuardado })
    return
  }
  ejecutarGuardado()
}

async function ejecutarGuardado() {
  error.value = ''
  guardando.value = true
  let hechos = 0
  try {
    for (const r of roles.value) {
      const { agregados, quitados } = diferencias(r.id)
      for (const id of agregados) {
        await asignarPermiso(r.id, id)
        base.value.get(r.id)?.add(id)
        hechos++
      }
      for (const id of quitados) {
        await quitarPermiso(r.id, id)
        base.value.get(r.id)?.delete(id)
        hechos++
      }
    }
    avisar(`${plural(hechos, 'cambio guardado', 'cambios guardados')}`)
  } catch (e) {
    error.value = `${e?.message ?? 'No se pudo guardar.'} Se guardaron ${hechos}; el resto sigue pendiente.`
  } finally {
    base.value = new Map(base.value) // vuelve a evaluar lo pendiente
    guardando.value = false
  }
}

function descartar() {
  cur.value = new Map([...base.value].map(([id, set]) => [id, new Set(set)]))
  error.value = ''
  avisar('Cambios descartados')
}

// ---------------------------------------------------------------------------
// Roles: crear y eliminar (misma lógica de siempre)
// ---------------------------------------------------------------------------
async function crear(payload) {
  const nuevo = await crearRol(payload)
  roles.value = ordenarRoles([...roles.value, nuevo])
  base.value = new Map(base.value).set(nuevo.id, new Set())
  cur.value = new Map(cur.value).set(nuevo.id, new Set())
  rolSel.value = nuevo.id
  tab.value = 'rol'
  mostrarModalNuevoRol.value = false
}

const eliminando = ref(false)
function pedirEliminar() {
  const r = rol.value
  if (!r) return
  if (r.id === auth.perfil?.rol_id) {
    error.value = 'No puedes eliminar el rol con el que estás conectado ahora mismo.'
    return
  }
  confirmar({
    titulo: `Eliminar el rol "${nombreRol(r.nombre)}"`,
    texto: 'No se puede deshacer. Si todavía hay usuarios con este rol, no se podrá eliminar.',
    textoOk: 'Eliminar rol',
    peligro: true,
    accion: () => eliminar(r),
  })
}
async function eliminar(r) {
  error.value = ''
  eliminando.value = true
  try {
    await eliminarRol(r.id)
    roles.value = roles.value.filter((x) => x.id !== r.id)
    const b = new Map(base.value)
    const c = new Map(cur.value)
    b.delete(r.id)
    c.delete(r.id)
    base.value = b
    cur.value = c
    rolSel.value = (roles.value.find((x) => x.nombre === 'Planeamiento') ?? roles.value[0])?.id ?? null
  } catch (e) {
    error.value =
      e?.code === '23503'
        ? `No se puede eliminar "${r.nombre}": todavía hay usuarios con este rol. Reasígnalos primero desde Usuarios.`
        : (e?.message ?? 'No se pudo eliminar el rol.')
  } finally {
    eliminando.value = false
  }
}
</script>

<template>
  <div class="rp">
    <header class="rp-head">
      <div class="rp-head-t">
        <h1>Roles y permisos</h1>
        <p v-if="!cargando">{{ plural(roles.length, 'rol', 'roles') }} · {{ plural(permisos.length, 'permiso', 'permisos') }} · {{ plural(modulos.length, 'módulo', 'módulos') }}</p>
      </div>
      <button type="button" class="cta" @click="mostrarModalNuevoRol = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Nuevo rol
      </button>
    </header>

    <div class="seg" role="tablist" aria-label="Vista">
      <button type="button" role="tab" :aria-selected="tab === 'rol'" @click="tab = 'rol'">Por rol</button>
      <button type="button" role="tab" :aria-selected="tab === 'cmp'" @click="tab = 'cmp'">Comparar roles</button>
    </div>

    <p v-if="error" class="rp-error" role="alert">{{ error }}</p>
    <p v-if="cargando" class="rp-vacio">Cargando…</p>

    <!-- ============================ POR ROL ============================ -->
    <div v-else-if="tab === 'rol' && rol" class="cols">
      <div class="roles" role="tablist" aria-label="Roles">
        <button
          v-for="r in roles"
          :key="r.id"
          type="button"
          class="rl"
          role="tab"
          :aria-selected="r.id === rolSel"
          @click="rolSel = r.id"
        >
          <b>{{ nombreRol(r.nombre) }}</b>
          <span>{{ plural(permisosDe(r.id).size, 'permiso', 'permisos') }} · {{ plural(usuariosDe(r.id), 'usuario', 'usuarios') }}</span>
        </button>
      </div>

      <div class="main">
        <div class="rh">
          <div class="rh-fila">
            <h2>{{ nombreRol(rol.nombre) }}</h2>
            <button type="button" class="eliminar" :disabled="eliminando" @click="pedirEliminar">Eliminar rol</button>
          </div>
          <div class="d">{{ rol.descripcion || 'Sin descripción. Agrega una para que otros sepan para qué sirve este rol.' }}</div>
          <div class="tags">
            <span class="tg am">{{ permisosDe(rol.id).size }} de {{ permisos.length }} permisos</span>
            <span class="tg bl">{{ plural(usuariosDe(rol.id), 'usuario', 'usuarios') }}</span>
            <span v-if="ACCESO_TOTAL.has(rol.nombre)" class="tg gr">Acceso total</span>
          </div>
        </div>

        <div class="tools">
          <label class="srch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input v-model="busqueda" type="search" placeholder="Buscar un permiso…" aria-label="Buscar un permiso" />
          </label>
          <button type="button" class="chip" :aria-pressed="soloActivos" @click="soloActivos = !soloActivos">Solo los que tiene</button>
          <button type="button" class="chip" @click="alternarTodo">{{ todoAbierto ? 'Contraer todo' : 'Expandir todo' }}</button>
        </div>

        <section v-for="m in modulosVisibles" :key="m.clave" class="mod" :data-open="estaAbierto(m.clave) ? 1 : 0">
          <div class="mh-fila">
            <button type="button" class="mh" :aria-expanded="estaAbierto(m.clave)" @click="alternarAbierto(m.clave)">
              <span class="t"><b>{{ m.nombre }}</b></span>
              <span class="cnt" :class="estadoModulo(m).valor === 'true' ? 'all' : estadoModulo(m).valor === 'mixed' ? 'some' : ''">
                {{ estadoModulo(m).n }} de {{ estadoModulo(m).total }}
              </span>
              <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <span class="hit">
              <button
                type="button"
                class="sw"
                role="switch"
                :aria-checked="estadoModulo(m).valor"
                :aria-label="`Activar o quitar todo en ${m.nombre}`"
                @click="alternarModulo(m)"
              ></button>
            </span>
          </div>
          <div v-if="estaAbierto(m.clave)" class="body">
            <div v-for="p in m.filas" :key="p.id" class="pr" :class="{ chg: cambioEn(rol.id, p.id) }">
              <div class="x">
                <b>
                  {{ p.descripcion || p.codigo }}
                  <span v-if="SENSIBLES.has(p.codigo)" class="tg rd sens">Sensible</span>
                </b>
                <code>{{ p.codigo }}</code>
              </div>
              <span class="hit">
                <button
                  type="button"
                  class="sw"
                  role="switch"
                  :aria-checked="permisosDe(rol.id).has(p.id)"
                  :aria-label="p.descripcion || p.codigo"
                  @click="alternarPermiso(p.id)"
                ></button>
              </span>
            </div>
          </div>
        </section>
        <div v-if="!modulosVisibles.length" class="rp-vacio caja">Ningún permiso coincide con la búsqueda.</div>

        <p v-if="usuariosDe(rol.id) > 0 && cambiosDe(rol.id)" class="nota">
          Este rol lo {{ usuariosDe(rol.id) === 1 ? 'usa 1 persona' : `usan ${usuariosDe(rol.id)} personas` }}: los cambios se aplican al guardar.
        </p>
      </div>
    </div>

    <!-- ========================== COMPARAR ROLES ========================== -->
    <template v-else-if="tab === 'cmp'">
      <div class="lg">
        <span class="tg gr">Todo</span><span class="tg am">Parcial</span><span class="tg">Ninguno</span>
        <span>Toca una celda para abrir ese rol en ese módulo.</span>
      </div>
      <div class="mx">
        <table>
          <thead>
            <tr>
              <th class="f">Módulo</th>
              <th v-for="r in roles" :key="r.id">{{ nombreRol(r.nombre) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in modulos" :key="m.clave">
              <td class="f">{{ m.nombre }}</td>
              <td v-for="r in roles" :key="r.id">
                <button
                  type="button"
                  class="c"
                  :class="celda(r.id, m).clase"
                  :aria-label="`${nombreRol(r.nombre)}, ${m.nombre}: ${celda(r.id, m).n} de ${celda(r.id, m).total}`"
                  @click="abrirDesdeMatriz(r.id, m.clave)"
                >
                  <span class="p">{{ celda(r.id, m).n }}/{{ celda(r.id, m).total }}</span>
                </button>
              </td>
            </tr>
            <tr>
              <td class="f">Total</td>
              <td v-for="r in roles" :key="r.id"><b class="tot">{{ permisosDe(r.id).size }}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ===================== BARRA DE CAMBIOS SIN GUARDAR ===================== -->
    <div v-if="totalCambios" class="bar" role="region" aria-label="Cambios sin guardar">
      <div>
        <span class="w">{{ plural(totalCambios, 'cambio sin guardar', 'cambios sin guardar') }}</span>
        <span class="s">{{ totalCambios }} sin guardar</span>
      </div>
      <button type="button" class="ghost" :disabled="guardando" @click="descartar">Descartar</button>
      <button type="button" class="cta" :disabled="guardando" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar cambios' }}</button>
    </div>

    <div class="toast" :class="{ on: aviso }" role="status">{{ aviso }}</div>

    <!-- Confirmación dentro de la página -->
    <div v-if="dialogo" class="dlg-fondo">
      <div class="dlg" role="alertdialog" aria-modal="true" :aria-label="dialogo.titulo">
        <h3>{{ dialogo.titulo }}</h3>
        <p>{{ dialogo.texto }}</p>
        <div class="dlg-acc">
          <button type="button" class="ghost" autofocus @click="dialogo = null">Cancelar</button>
          <button type="button" class="cta" :class="{ peligro: dialogo.peligro }" @click="aceptarDialogo">{{ dialogo.textoOk }}</button>
        </div>
      </div>
    </div>

    <NuevoRolModal v-if="mostrarModalNuevoRol" @crear="crear" @cerrar="mostrarModalNuevoRol = false" />
  </div>
</template>

<style scoped>
/* Tokens locales sobre los de la app: claro y oscuro salen solos. */
.rp {
  --bg: var(--color-bg);
  --sf: var(--color-surface);
  --so: var(--color-surface-2);
  --ln: var(--color-border);
  --tx: var(--color-text);
  --mu: var(--color-text-muted);
  --am: var(--color-primary);
  --amb: color-mix(in srgb, var(--color-primary) 16%, transparent);
  --amt: color-mix(in srgb, var(--color-primary) 62%, var(--color-text));
  --gr: color-mix(in srgb, var(--color-success) 70%, var(--color-text));
  --grv: var(--color-success);
  --grb: color-mix(in srgb, var(--color-success) 15%, transparent);
  --rd: color-mix(in srgb, var(--color-danger) 75%, var(--color-text));
  --rdb: color-mix(in srgb, var(--color-danger) 13%, transparent);
  --bl: color-mix(in srgb, var(--color-info) 70%, var(--color-text));
  --blb: color-mix(in srgb, var(--color-info) 14%, transparent);
  --m: ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--tx);
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px max(16px, env(safe-area-inset-left, 0px)) 24px max(16px, env(safe-area-inset-right, 0px));
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 14px;
  line-height: 1.4;
}
button,
input {
  font: inherit;
  color: inherit;
}
button {
  cursor: pointer;
}
:focus-visible {
  outline: 2px solid var(--am);
  outline-offset: 2px;
}
.rp-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.rp-head-t {
  flex: 1 1 220px;
}
h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.rp-head p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--mu);
  font-weight: 600;
}
.cta {
  border: 0;
  background: var(--am);
  color: var(--color-primary-ink);
  height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  font-weight: 800;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cta:hover {
  filter: brightness(0.95);
}
.cta:disabled {
  opacity: 0.5;
  cursor: default;
}
.cta.peligro {
  background: var(--color-danger);
  color: #fff;
}
.ghost {
  border: 0;
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 13.5px;
  color: var(--tx);
}
.ghost:disabled {
  opacity: 0.5;
  cursor: default;
}
.seg {
  display: inline-flex;
  background: var(--so);
  border-radius: 13px;
  padding: 3px;
  align-self: flex-start;
}
.seg button {
  border: 0;
  background: none;
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 13.5px;
  color: var(--mu);
}
.seg button[aria-selected='true'] {
  background: var(--sf);
  color: var(--tx);
  box-shadow: 0 0 0 1px var(--ln);
}
.rp-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 13.5px;
  font-weight: 600;
}
.rp-vacio {
  margin: 0;
  color: var(--mu);
  font-weight: 600;
  font-size: 13.5px;
}
.rp-vacio.caja {
  padding: 28px 16px;
  text-align: center;
  background: var(--sf);
  border-radius: 16px;
  box-shadow: inset 0 0 0 1px var(--ln);
}

/* ----- Por rol ----- */
.cols {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.roles {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.rl {
  border: 0;
  text-align: left;
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rl b {
  font-size: 14.5px;
  font-weight: 800;
}
.rl span {
  font-size: 12px;
  color: var(--mu);
  font-weight: 600;
}
.rl[aria-selected='true'] {
  background: var(--tx);
  box-shadow: none;
}
.rl[aria-selected='true'] b {
  color: var(--bg);
}
.rl[aria-selected='true'] span {
  color: var(--bg);
  opacity: 0.72;
}
.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rh {
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  border-radius: 18px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rh-fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rh h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.eliminar {
  border: 0;
  background: none;
  color: var(--mu);
  font-size: 12.5px;
  font-weight: 700;
  padding: 8px 10px;
  border-radius: 10px;
}
.eliminar:hover {
  background: var(--rdb);
  color: var(--rd);
}
.eliminar:disabled {
  opacity: 0.5;
  cursor: default;
}
.d {
  font-size: 13.5px;
  color: var(--mu);
  font-weight: 600;
  max-width: 70ch;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tg {
  font-size: 12px;
  font-weight: 800;
  border-radius: 99px;
  padding: 3px 10px;
  background: var(--so);
  color: var(--mu);
  white-space: nowrap;
}
.tg.am {
  background: var(--amb);
  color: var(--amt);
}
.tg.rd {
  background: var(--rdb);
  color: var(--rd);
}
.tg.bl {
  background: var(--blb);
  color: var(--bl);
}
.tg.gr {
  background: var(--grb);
  color: var(--gr);
}
.tg.sens {
  margin-left: 6px;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.srch {
  flex: 1 1 220px;
  position: relative;
  min-width: 0;
}
.srch svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--mu);
}
.srch input {
  width: 100%;
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  padding: 0 12px 0 36px;
  font-size: 14px;
  font-weight: 600;
}
.chip {
  border: 0;
  background: var(--so);
  color: var(--mu);
  height: 36px;
  padding: 0 14px;
  border-radius: 99px;
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
}
.chip[aria-pressed='true'] {
  background: var(--tx);
  color: var(--bg);
}
.mod {
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  border-radius: 16px;
  overflow: hidden;
}
.mh-fila {
  display: flex;
  align-items: center;
  padding-right: 6px;
}
.mh {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px 0 16px;
  min-height: 56px;
  border: 0;
  background: none;
  text-align: left;
}
.mh:hover {
  background: var(--so);
}
.mh .t {
  flex: 1;
  min-width: 0;
}
.mh .t b {
  font-size: 15px;
  font-weight: 800;
  display: block;
}
.cnt {
  font-size: 12.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  border-radius: 99px;
  padding: 3px 10px;
  background: var(--so);
  color: var(--mu);
  white-space: nowrap;
}
.cnt.all {
  background: var(--grb);
  color: var(--gr);
}
.cnt.some {
  background: var(--amb);
  color: var(--amt);
}
.chev {
  transition: transform 0.15s;
  color: var(--mu);
  flex: none;
}
.mod[data-open='1'] .chev {
  transform: rotate(90deg);
}
.body {
  border-top: 1px solid var(--ln);
}
.pr {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 16px;
  min-height: 56px;
  border-top: 1px solid var(--ln);
}
.pr:first-child {
  border-top: 0;
}
.pr .x {
  flex: 1;
  min-width: 0;
}
.pr .x b {
  display: block;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}
.pr .x code {
  font-family: var(--m);
  font-size: 11.5px;
  color: var(--mu);
}
.pr.chg {
  background: var(--amb);
}
.hit {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 44px;
  flex: none;
}
.sw {
  position: relative;
  flex: none;
  width: 48px;
  height: 28px;
  border-radius: 99px;
  border: 0;
  background: var(--ln);
  transition: background 0.15s;
}
.sw::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s;
}
.sw[aria-checked='true'] {
  background: var(--grv);
}
.sw[aria-checked='true']::after {
  transform: translateX(20px);
}
.sw[aria-checked='mixed'] {
  background: var(--am);
}
.sw[aria-checked='mixed']::after {
  transform: translateX(10px);
}
.nota {
  margin: 0;
  padding: 0 4px;
  font-size: 12.5px;
  color: var(--mu);
  font-weight: 600;
}

/* ----- Comparar ----- */
.lg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12.5px;
  color: var(--mu);
  font-weight: 600;
  align-items: center;
}
.mx {
  background: var(--sf);
  box-shadow: inset 0 0 0 1px var(--ln);
  border-radius: 16px;
  overflow-x: auto;
}
.mx table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  min-width: 760px;
}
.mx th,
.mx td {
  padding: 0;
  border-bottom: 1px solid var(--ln);
  text-align: center;
}
.mx thead th {
  position: sticky;
  top: 0;
  background: var(--sf);
  font-size: 12px;
  font-weight: 800;
  height: 52px;
  padding: 0 6px;
  color: var(--mu);
}
.mx th.f,
.mx td.f {
  position: sticky;
  left: 0;
  text-align: left;
  background: var(--sf);
  padding: 0 14px;
  font-weight: 800;
  font-size: 13.5px;
  min-width: 150px;
  z-index: 1;
}
.mx tbody tr:last-child td {
  border-bottom: 0;
}
.mx .c {
  display: block;
  width: 100%;
  height: 48px;
  border: 0;
  background: none;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-size: 13px;
  color: var(--mu);
}
.mx .c:hover {
  background: var(--so);
}
.mx .c .p {
  display: inline-block;
  min-width: 44px;
  border-radius: 99px;
  padding: 3px 8px;
}
.mx .c.all .p {
  background: var(--grb);
  color: var(--gr);
}
.mx .c.some .p {
  background: var(--amb);
  color: var(--amt);
}
.mx .c.none .p {
  color: var(--mu);
  opacity: 0.55;
}
.tot {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

/* ----- Barra, aviso y confirmación ----- */
.bar {
  position: sticky;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  z-index: 5;
  background: var(--sf);
  box-shadow: 0 0 0 1px var(--ln), 0 10px 30px rgba(0, 0, 0, 0.3);
  border-radius: 16px;
  padding: 10px 10px 10px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar > div {
  flex: 1;
  font-weight: 800;
  font-size: 13.5px;
  white-space: nowrap;
}
.bar .s {
  display: none;
}
.toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  background: var(--tx);
  color: var(--bg);
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 13px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 60;
}
.toast.on {
  opacity: 1;
}
.dlg-fondo {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 14, 0.6);
  display: grid;
  place-items: center;
  z-index: 70;
  padding: 16px;
}
.dlg {
  width: min(460px, 100%);
  background: var(--sf);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
}
.dlg h3 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 800;
}
.dlg p {
  margin: 0 0 16px;
  white-space: pre-line;
  color: var(--mu);
  font-size: 13.5px;
  font-weight: 600;
}
.dlg-acc {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 860px) {
  .cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .roles {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    gap: 8px;
    margin: 0 -16px;
    padding: 0 16px;
    scrollbar-width: none;
  }
  .roles::-webkit-scrollbar {
    display: none;
  }
  .rl {
    flex: 0 0 auto;
    min-width: 150px;
  }
  h1 {
    font-size: 24px;
  }
  /* Por encima de la barra de navegación flotante de abajo. */
  .bar {
    bottom: calc(96px + env(safe-area-inset-bottom, 0px));
    padding-left: 14px;
  }
  .bar .w {
    display: none;
  }
  .bar .s {
    display: inline;
  }
  .bar .ghost,
  .bar .cta {
    padding: 0 12px;
  }
  .toast {
    bottom: calc(160px + env(safe-area-inset-bottom, 0px));
  }
  .srch input {
    font-size: 16px; /* iOS no hace zoom al enfocar */
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>

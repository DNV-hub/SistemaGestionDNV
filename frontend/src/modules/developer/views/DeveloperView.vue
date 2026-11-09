<script setup>
import { computed, onMounted, ref } from 'vue'
import { listarUsuarios, actualizarUsuario } from '../../usuarios/services/usuariosService'
import {
  suplantarUsuario,
  reiniciarIngresos,
  reiniciarDevoluciones,
  vaciarCatalogo,
} from '../services/developerService'

const cargando = ref(true)
const error = ref('')
const aviso = ref('')

const usuarios = ref([])

const suplantando = ref(false)
const reiniciandoIngresos = ref(false)
const reiniciandoDevoluciones = ref(false)
const vaciandoCatalogo = ref(false)

onMounted(async () => {
  cargando.value = true
  error.value = ''
  try {
    const u = await listarUsuarios()
    usuarios.value = u.filter((x) => x.estado === 'activo')
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cargar la información: ${e.message ?? e}`
  } finally {
    cargando.value = false
  }
})

const supervisores = computed(() => usuarios.value.filter((u) => u.roles?.nombre === 'Supervisor'))
const guardandoHerencia = ref(new Set())

/** rdc_heredar_reporte_completo: para esta cuenta puntual, un reporte nuevo
 * del RDC clona el anterior COMPLETO (metrados, elementos, bitácora, stand
 * by, programación, observaciones, restricciones, redline incluidos), no
 * solo sector/frente/supervisor/capataz/cuadrilla/equipo como el resto —
 * ver crearBorradorDesde() en rdcRepository.js para por qué esto no es un
 * comportamiento global. Se guarda al toque, como el resto del panel. */
async function alternarHerenciaCompleta(usuario) {
  if (guardandoHerencia.value.has(usuario.id)) return
  guardandoHerencia.value = new Set(guardandoHerencia.value).add(usuario.id)
  error.value = ''
  try {
    const actualizado = await actualizarUsuario(usuario.id, {
      rdc_heredar_reporte_completo: !usuario.rdc_heredar_reporte_completo,
    })
    const idx = usuarios.value.findIndex((u) => u.id === usuario.id)
    if (idx !== -1) usuarios.value[idx] = actualizado
  } catch (e) {
    console.error(e)
    error.value = `No se pudo cambiar la herencia de reporte de ${usuario.nombre}: ${e.message ?? e}`
  } finally {
    const restante = new Set(guardandoHerencia.value)
    restante.delete(usuario.id)
    guardandoHerencia.value = restante
  }
}

// El rol Developer no entra acá: "ver como" existe para probar cómo ve el
// sistema otro rol — no tiene sentido suplantar a otra cuenta Developer
// (hoy es, de hecho, la propia cuenta de quien está mirando esta lista).
const usuariosPorRol = computed(() => {
  const grupos = new Map()
  for (const u of usuarios.value) {
    const rol = u.roles?.nombre ?? '—'
    if (rol === 'Developer') continue
    if (!grupos.has(rol)) grupos.set(rol, [])
    grupos.get(rol).push(u)
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b))
})

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

async function reiniciarTodasLasDevoluciones() {
  const primeraConfirmacion = confirm(
    'Esto borra TODAS las devoluciones (cualquier estado). Si alguna ya fue recibida y movió stock, conviene ' +
      '"Reiniciar ingresos" primero para no dejar ese movimiento sin limpiar. No se puede deshacer.\n\n¿Seguro?'
  )
  if (!primeraConfirmacion) return
  const segundaConfirmacion = prompt('Para confirmar, escribí BORRAR TODO (en mayúsculas):')
  if (segundaConfirmacion !== 'BORRAR TODO') {
    aviso.value = ''
    return
  }

  reiniciandoDevoluciones.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { devolucionesBorradas } = await reiniciarDevoluciones()
    aviso.value = `Se borraron ${devolucionesBorradas} devoluciones. Queda como recién empezado.`
  } catch (e) {
    console.error(e)
    error.value = `No se pudo reiniciar: ${e.message ?? e}`
  } finally {
    reiniciandoDevoluciones.value = false
  }
}

async function vaciarCatalogoCompleto() {
  const primeraConfirmacion = confirm(
    'Esto revisa TODOS los materiales activos del catálogo: los que no tengan stock, vales ni movimientos se borran ' +
      'de verdad; los que ya tienen historial registrado quedan desactivados (no se pierde ese historial). Para ' +
      'cuando vas a resubir el catálogo entero por Excel. No se puede deshacer.\n\n¿Seguro?'
  )
  if (!primeraConfirmacion) return
  const segundaConfirmacion = prompt('Para confirmar, escribí BORRAR TODO (en mayúsculas):')
  if (segundaConfirmacion !== 'BORRAR TODO') {
    aviso.value = ''
    return
  }

  vaciandoCatalogo.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { eliminados, desactivados } = await vaciarCatalogo()
    aviso.value = `Catálogo vaciado: ${eliminados} materiales eliminados, ${desactivados} desactivados por tener historial. Ya podés resubir el Excel.`
  } catch (e) {
    console.error(e)
    error.value = `No se pudo vaciar el catálogo: ${e.message ?? e}`
  } finally {
    vaciandoCatalogo.value = false
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

      <section class="tarjeta">
        <h2>Heredar reporte RDC completo</h2>
        <p class="ayuda">
          Por defecto, un reporte nuevo del RDC solo arrastra sector/frente/supervisor/capataz/cuadrilla/equipo del
          anterior — el trabajo del día (metrados, elementos, bitácora, stand by, programación, observaciones...)
          siempre arranca en blanco, porque cambia a diario. Activa esto solo para una cuenta cuya rutina se repita
          casi entera día a día: su próximo reporte va a clonar el anterior completo, listo para editar en vez de
          partir de cero.
        </p>
        <table class="tabla">
          <thead>
            <tr>
              <th>Supervisor</th>
              <th>Hereda reporte completo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in supervisores" :key="u.id">
              <td class="td-titulo">{{ u.nombre }}</td>
              <td data-label="Hereda reporte completo">
                <label class="switch">
                  <input
                    type="checkbox"
                    :checked="u.rdc_heredar_reporte_completo"
                    :disabled="guardandoHerencia.has(u.id)"
                    @change="alternarHerenciaCompleta(u)"
                  />
                  {{ u.rdc_heredar_reporte_completo ? 'Sí' : 'No' }}
                </label>
              </td>
            </tr>
            <tr v-if="!supervisores.length"><td colspan="2" class="vacio">No hay supervisores activos.</td></tr>
          </tbody>
        </table>
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

      <section class="tarjeta peligro-total">
        <h2>Reiniciar todas las devoluciones</h2>
        <p class="ayuda">
          Borra TODAS las devoluciones (sin importar el estado). Si alguna ya fue recibida y movió stock, hacé
          primero "Borrar todos los ingresos" para no dejar ese movimiento sin limpiar.
        </p>
        <button class="peligro" :disabled="reiniciandoDevoluciones" @click="reiniciarTodasLasDevoluciones">
          {{ reiniciandoDevoluciones ? 'Reiniciando…' : 'Borrar todas las devoluciones' }}
        </button>
      </section>

      <section class="tarjeta peligro-total">
        <h2>Vaciar el catálogo</h2>
        <p class="ayuda">
          Para cuando hay que resubir el catálogo entero por Excel: borra de verdad los materiales sin movimientos y
          desactiva (sin perder el historial) los que ya tienen stock, vales o kardex. Después de esto, reimportar el
          Excel vuelve a crear los códigos que quedaron desactivados como materiales nuevos.
        </p>
        <button class="peligro" :disabled="vaciandoCatalogo" @click="vaciarCatalogoCompleto">
          {{ vaciandoCatalogo ? 'Vaciando…' : 'Vaciar todo el catálogo' }}
        </button>
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
button.secundario {
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 0.6rem;
}
button.secundario:disabled {
  opacity: 0.55;
  cursor: default;
}
.acciones-papelera {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.nota {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin: 0 0 0.6rem;
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
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text);
}
.switch input {
  width: 16px;
  height: 16px;
  cursor: pointer;
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

/* Celular: cada fila de tabla pasa a tarjeta (mismo patrón que ya usan
   Almacén y Catálogo) — una tabla de 5-6 columnas angosta era imposible de
   leer con scroll horizontal. El checkbox de selección queda arriba a la
   derecha de la tarjeta en vez de perderse como una columna más. */
@media (max-width: 760px) {
  .developer {
    padding: 1.25rem 1rem;
  }
  .tarjeta {
    padding: 0.9rem 1rem;
  }
  .tabla {
    display: block;
  }
  .tabla thead {
    display: none;
  }
  .tabla tbody {
    display: block;
  }
  .tabla tbody tr {
    display: block;
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    margin-bottom: 0.6rem;
    padding: 0.75rem 0.85rem;
  }
  .tabla td {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--color-border);
    text-align: right;
    font-size: 0.85rem;
  }
  .tabla td:last-child {
    border-bottom: none;
  }
  .tabla td[data-label]::before {
    content: attr(data-label);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
    flex-shrink: 0;
    text-align: left;
  }
  .tabla .td-titulo {
    display: block;
    font-weight: 700;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.55rem;
    margin-bottom: 0.15rem;
  }
  .tabla .td-check {
    justify-content: flex-end;
    border-bottom: none;
    padding: 0 0 0.4rem;
  }
  .tabla .vacio {
    display: block;
    text-align: center;
    padding: 1rem 0;
  }
}
</style>

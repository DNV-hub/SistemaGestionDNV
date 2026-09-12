<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useValesStore } from '../store/vales'
import { useValeNuevoStore } from '../store/valeNuevo'
import { useAuthStore } from '../../../store/auth'

const vales = useValesStore()
const borrador = useValeNuevoStore()
const auth = useAuthStore()
const router = useRouter()

const enviando = ref(false)
const error = ref('')

onMounted(async () => {
  if (!vales.frentesActivos.length) await vales.cargarLista()
  if (!borrador.frenteId) borrador.frenteId = vales.frentesActivos[0]?.id ?? ''
})

const esSupervisor = computed(() => auth.nombreRol === 'Supervisor')
const lineasValidas = computed(() =>
  borrador.lineas.every((l) => Number(l.cantidad) > 0 && Number(l.cantidad) <= l.disponible)
)
const puedeEnviar = computed(() => borrador.frenteId && borrador.lineas.length > 0 && lineasValidas.value && !enviando.value)

function irASelector() {
  router.push('/vales/nuevo/material')
}

function quitar(materialId) {
  borrador.quitarMaterial(materialId)
}

// No se puede pedir más de lo que hay ni menos de 1 — si escriben algo
// fuera de rango, se corrige apenas sueltan el campo.
function limitarCantidad(l) {
  const n = Number(l.cantidad)
  if (!Number.isFinite(n) || n < 1) l.cantidad = 1
  else if (n > l.disponible) l.cantidad = l.disponible
  else l.cantidad = Math.floor(n)
}

function cerrar() {
  borrador.reiniciar()
  router.push({ name: 'vales' })
}

async function enviar() {
  if (!puedeEnviar.value) return
  error.value = ''
  enviando.value = true
  try {
    const vale = await vales.crearYEnviar({
      frente_id: borrador.frenteId,
      supervisor_id: esSupervisor.value ? auth.session.user.id : undefined,
      creado_por: esSupervisor.value ? null : auth.session.user.id,
      observaciones: borrador.observaciones.trim() || null,
      lineas: borrador.lineas.map((l) => ({ material_id: l.material_id, cantidad_solicitada: Number(l.cantidad) })),
    })
    borrador.reiniciar()
    router.push(`/vales/${vale.id}`)
  } catch (e) {
    console.error(e)
    error.value = `No se pudo enviar el vale${e?.message ? ': ' + e.message : '.'}`
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="vale-nuevo">
    <header class="appbar">
      <button type="button" class="icon-btn" aria-label="Cancelar" @click="cerrar">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5.5 5.5l11 11M16.5 5.5l-11 11"/></svg>
      </button>
      <div class="appbar-title">Nuevo vale</div>
      <div class="icon-btn"></div>
    </header>

    <main class="content">
      <label class="campo">
        <span class="campo-label">Frente</span>
        <select v-model="borrador.frenteId" class="campo-input">
          <option value="" disabled>Selecciona un frente…</option>
          <option v-for="f in vales.frentesActivos" :key="f.id" :value="f.id">
            {{ f.codigo ? f.codigo + ' — ' : '' }}{{ f.nombre }}
          </option>
        </select>
      </label>

      <div class="seccion">
        <div class="seccion-head">
          <span class="seccion-titulo">MATERIALES SOLICITADOS</span>
          <span class="seccion-cuenta">{{ borrador.lineas.length }}</span>
        </div>

        <div v-if="!borrador.lineas.length" class="vacio">Todavía no agregaste ningún material.</div>

        <div v-for="l in borrador.lineas" :key="l.material_id" class="tarjeta-mat">
          <div class="tarjeta-mat-main">
            <div class="tarjeta-mat-nombre">{{ l.descripcion }}</div>
            <div class="tarjeta-mat-codigo">{{ l.codigo }} · de {{ l.disponible }} disponibles</div>
          </div>
          <input
            v-model.number="l.cantidad"
            type="number"
            min="1"
            :max="l.disponible"
            step="1"
            class="cantidad-input"
            @change="limitarCantidad(l)"
          />
          <span class="tarjeta-mat-unidad">{{ l.unidad }}</span>
          <button type="button" class="quitar-btn" aria-label="Quitar material" @click="quitar(l.material_id)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </div>

        <button type="button" class="agregar-btn" @click="irASelector">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>
          Agregar material
        </button>
      </div>

      <label class="campo">
        <span class="campo-label">Observaciones (opcional)</span>
        <textarea v-model="borrador.observaciones" class="campo-input textarea" rows="3" placeholder="Detalles adicionales…"></textarea>
      </label>

      <p v-if="error" class="error">{{ error }}</p>
    </main>

    <div class="actionbar">
      <button type="button" class="btn btn-sec" @click="cerrar">Cancelar</button>
      <button type="button" class="btn btn-pri" :disabled="!puedeEnviar" @click="enviar">
        {{ enviando ? 'Enviando…' : 'Enviar vale' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.vale-nuevo {
  /* Esta pantalla es de tema claro siempre, sin importar si el Sistema
     está en modo oscuro — sin esto, los controles nativos del navegador
     (inputs sin `background` propio, como el de cantidad) heredan el
     `color-scheme: dark` de más arriba y el navegador los renderiza con
     fondo negro y texto que no combina con el resto de la pantalla, que
     sigue clara. */
  color-scheme: light;
  --bg: #f4f5f7;
  --card: #ffffff;
  --border-lista: #e4e7ec;
  --text: #1e293b;
  --text-2: #667085;
  --text-3: #98a2b3;
  --amber: #f5a800;
  --gray-bg: #f2f4f7;
  --err: #dc2626;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  color: var(--text);
  background: var(--bg);
  height: 100vh;
  height: calc(100dvh - env(safe-area-inset-top));
  display: flex;
  flex-direction: column;
}
.appbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border-lista);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
}
.icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
}
.appbar-title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.campo-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.campo-input {
  height: 48px;
  border-radius: 11px;
  border: 1.5px solid var(--border-lista);
  background: var(--card);
  padding: 0 13px;
  font-size: 16px;
  font-family: inherit;
  color: var(--text);
}
.campo-input.textarea {
  height: auto;
  padding: 11px 13px;
  resize: vertical;
}

.seccion {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.seccion-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.seccion-titulo {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: var(--text-3);
}
.seccion-cuenta {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  background: var(--gray-bg);
  border-radius: 20px;
  padding: 1px 8px;
}
.vacio {
  font-size: 13px;
  color: var(--text-3);
  padding: 10px 0;
}

.tarjeta-mat {
  background: var(--card);
  border: 1px solid var(--border-lista);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.tarjeta-mat-main {
  flex: 1;
  min-width: 0;
}
.tarjeta-mat-nombre {
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.28;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tarjeta-mat-codigo {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 2px;
}
.cantidad-input {
  width: 56px;
  height: 38px;
  border-radius: 9px;
  border: 1.5px solid var(--border-lista);
  text-align: center;
  font-size: 16px;
  font-family: inherit;
  /* Sin `background` propio, algunos navegadores de Android oscurecen el
     input solo (modo oscuro forzado del sistema) sin ajustar el color del
     texto a la par — quedaba fondo negro con números casi ilegibles. Fijar
     los dos y `color-scheme: light` evita que el navegador reinvente nada. */
  background: var(--card);
  color: var(--text);
  color-scheme: light;
  flex-shrink: 0;
}
.tarjeta-mat-unidad {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  flex-shrink: 0;
}
.quitar-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  background: var(--gray-bg);
  border: none;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
}

.agregar-btn {
  height: 48px;
  border-radius: 11px;
  border: 1.5px dashed var(--amber);
  background: #fff7e5;
  color: #b45309;
  font-size: 14.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}

.error {
  color: var(--err);
  font-size: 13px;
}

.actionbar {
  flex-shrink: 0;
  background: var(--card);
  border-top: 1px solid var(--border-lista);
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  gap: 10px;
}
.btn {
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  flex: 1;
  border: none;
  cursor: pointer;
}
.btn-sec {
  background: var(--card);
  border: 1.5px solid var(--border-lista);
  color: var(--text-3);
}
.btn-pri {
  background: var(--amber);
  color: #1a1206;
}
.btn-pri:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

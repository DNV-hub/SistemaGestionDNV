<script setup>
import { useCerrarConEscape } from '../composables/useCerrarConEscape'
// Cuadro estándar para agregar o corregir algo: ancho cómodo, título con una
// línea de ayuda, campos en dos columnas y un pie fijo con el error a la vista
// y los botones. Cada formulario solo pone sus campos; el diseño es de aquí.
// Las clases .mf-* (campos, grilla, notas) están en el bloque global de abajo.
const props = defineProps({
  titulo: { type: String, required: true },
  subtitulo: { type: String, default: '' },
  ancho: { type: String, default: '720px' },
  guardando: { type: Boolean, default: false },
  textoGuardar: { type: String, default: 'Guardar' },
  textoGuardando: { type: String, default: 'Guardando…' },
  textoCancelar: { type: String, default: 'Cancelar' },
  // Botón de confirmar en rojo (cancelar un vale, etc.).
  peligro: { type: Boolean, default: false },
  // Solo informa: un único botón que cierra (ej. contraseña temporal, listas).
  soloCerrar: { type: Boolean, default: false },
  error: { type: String, default: '' },
  bloquearGuardar: { type: Boolean, default: false },
})
const emit = defineEmits(['cerrar', 'enviar'])

// Esc cierra la ventana (salvo mientras se está guardando).
useCerrarConEscape(() => {
  if (!props.guardando) emit('cerrar')
})
</script>

<template>
  <div class="mf-overlay">
    <form class="mf-modal" role="dialog" :aria-label="titulo" :style="{ width: `min(${ancho}, calc(100vw - 2rem))` }" @submit.prevent="$emit('enviar')">
      <header class="mf-cab">
        <div>
          <h2>{{ titulo }}</h2>
          <p v-if="subtitulo" class="mf-sub">{{ subtitulo }}</p>
        </div>
        <slot name="cabecera" />
      </header>

      <div class="mf-cuerpo">
        <slot />
      </div>

      <footer class="mf-pie">
        <p v-if="error" class="mf-error">{{ error }}</p>
        <span v-else class="mf-pie-info"><slot name="pie" /></span>
        <div class="mf-acciones">
          <button v-if="soloCerrar" type="button" @click="$emit('cerrar')">{{ textoGuardar }}</button>
          <template v-else>
            <button type="button" class="mf-secundario" @click="$emit('cerrar')">{{ textoCancelar }}</button>
            <slot name="acciones" />
            <button type="submit" :class="{ 'mf-peligro': peligro }" :disabled="guardando || bloquearGuardar">
              {{ guardando ? textoGuardando : textoGuardar }}
            </button>
          </template>
        </div>
      </footer>
    </form>
  </div>
</template>

<style>
.mf-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 14, 0.6);
  display: grid;
  place-items: center;
  z-index: 40;
}
.mf-modal {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 2rem);
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.mf-cab {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
.mf-cab h2 {
  margin: 0;
  font-size: 1.25rem;
}
.mf-sub {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.mf-cuerpo {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1.25rem 1.75rem;
  overflow-y: auto;
}
.mf-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.1rem;
}
.mf-span {
  grid-column: 1 / -1;
}
.mf-campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}
.mf-rotulo {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}
.mf-rotulo em {
  font-style: normal;
  font-weight: 400;
  color: var(--color-text-muted);
}
.mf-campo input:not([type='checkbox']),
.mf-campo select,
.mf-campo textarea {
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font: inherit;
  width: 100%;
}
.mf-campo input:disabled {
  background: var(--color-neutral-soft);
  color: var(--color-text-muted);
}
.mf-ayuda {
  margin: 0;
  font-size: 0.76rem;
  color: var(--color-text-muted);
}
.mf-nota {
  margin: 0;
  padding: 0.6rem 0.8rem;
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border-radius: var(--radius-control);
  font-size: 0.82rem;
}
.mf-info {
  margin: 0;
  padding: 0.6rem 0.8rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  font-size: 0.85rem;
}
.mf-info.positivo {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.mf-info.negativo {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.mf-con-unidad {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.mf-unidad {
  padding: 0.4rem 0.7rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}
.mf-opciones {
  display: flex;
  gap: 0.4rem;
}
.mf-opciones button {
  flex: 1;
  padding: 0.6rem 0.5rem;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.mf-opciones button.activo {
  background: var(--color-primary);
  color: var(--color-primary-ink);
}
.mf-pie {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.75rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
.mf-pie-info {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.mf-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}
.mf-acciones {
  display: flex;
  gap: 0.6rem;
  margin-left: auto;
}
.mf-acciones button {
  padding: 0.65rem 1.3rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}
.mf-acciones button:disabled {
  opacity: 0.6;
  cursor: default;
}
.mf-acciones .mf-peligro {
  background: var(--color-danger);
  color: #fff;
}
.mf-acciones .mf-secundario {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
@media (max-width: 720px) {
  .mf-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .mf-cab,
  .mf-cuerpo,
  .mf-pie {
    padding-left: 1.1rem;
    padding-right: 1.1rem;
  }
}
</style>

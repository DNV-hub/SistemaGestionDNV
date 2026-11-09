<script setup>
import { ref } from 'vue'

// Estructura del archivo lista para copiar: los encabezados van separados por
// TABULACIÓN, así que al pegarlos en la celda A1 de un Excel cada uno cae en
// su propia columna. El botón es solo un ícono (cambia a ✓ al copiar).
const props = defineProps({
  encabezados: { type: Array, required: true },
  nota: { type: String, default: 'Pégalos en la celda A1 de tu Excel y cada uno queda en su columna.' },
})

const copiado = ref(false)
const fallo = ref(false)

async function copiar() {
  fallo.value = false
  try {
    await navigator.clipboard.writeText(props.encabezados.join('\t'))
    copiado.value = true
    setTimeout(() => (copiado.value = false), 2000)
  } catch {
    fallo.value = true
  }
}
</script>

<template>
  <div class="estructura">
    <div class="estructura-fila">
      <code>{{ encabezados.join(' / ') }}</code>
      <button
        type="button"
        class="estructura-copiar"
        :class="{ ok: copiado }"
        :title="copiado ? 'Copiado' : 'Copiar encabezados'"
        :aria-label="copiado ? 'Copiado' : 'Copiar encabezados'"
        @click="copiar"
      >
        <svg v-if="!copiado" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </div>
    <p class="estructura-nota">{{ fallo ? 'No se pudo copiar automáticamente. Escríbelos a mano en la primera fila.' : nota }}</p>
  </div>
</template>

<style scoped>
.estructura {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.estructura-fila {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}
.estructura-fila code {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.7rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font-size: 0.78rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.estructura-copiar {
  display: grid;
  place-items: center;
  width: 38px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
}
.estructura-copiar:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.estructura-copiar.ok {
  border-color: var(--color-success);
  color: var(--color-success);
}
.estructura-nota {
  margin: 0;
  font-size: 0.76rem;
  color: var(--color-text-muted);
}
</style>

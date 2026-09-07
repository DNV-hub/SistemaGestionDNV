<script setup>
defineProps({
  usuario: { type: Object, required: true },
  passwordTemporal: { type: String, required: true },
})

defineEmits(['cerrar'])
</script>

<template>
  <div class="overlay" @click.self="$emit('cerrar')">
    <div class="modal">
      <h2>Usuario creado</h2>
      <p class="texto">
        Comparte esta contraseña temporal con <strong>{{ usuario.nombre }}</strong> ({{ usuario.email }}) por un
        canal seguro. No se va a poder volver a ver — si se pierde, tendrás que restablecerla desde Supabase.
      </p>
      <div class="password">{{ passwordTemporal }}</div>
      <button type="button" @click="$emit('cerrar')">Listo</button>
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
  z-index: 20;
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 360px;
  max-width: calc(100vw - 2rem);
  padding: 1.5rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
.texto {
  margin: 0;
  font-size: 0.85rem;
  color: #374151;
}
.password {
  font-family: 'Courier New', monospace;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 0.75rem;
  background: #f3f4f6;
  border-radius: 6px;
  color: #111827;
  user-select: all;
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
</style>

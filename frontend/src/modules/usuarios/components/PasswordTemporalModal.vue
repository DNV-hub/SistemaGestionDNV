<script setup>
import ModalFormulario from '../../../components/ModalFormulario.vue'
defineProps({
  usuario: { type: Object, required: true },
  passwordTemporal: { type: String, required: true },
  titulo: { type: String, default: 'Usuario creado' },
})

defineEmits(['cerrar'])
</script>

<template>
  <ModalFormulario
    :titulo="titulo"
    ancho="520px"
    texto-guardar="Listo"
    solo-cerrar
    @cerrar="$emit('cerrar')"
  >
    <p class="mf-info">
      Comparte esta contraseña con <strong>{{ usuario.nombre }}</strong> ({{ usuario.email }}) por un canal seguro. No
      se va a poder volver a ver: si se pierde, hay que restablecerla de nuevo.
    </p>
    <div class="password">{{ passwordTemporal }}</div>
  </ModalFormulario>
</template>

<style scoped>
.password {
  padding: 1rem;
  border-radius: var(--radius-control);
  background: var(--color-surface-2);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  user-select: all;
}
</style>

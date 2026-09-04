<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../store/auth'

const email = ref('')
const password = ref('')
const error = ref('')
const enviando = ref(false)

const auth = useAuthStore()
const router = useRouter()

async function onSubmit() {
  error.value = ''
  enviando.value = true
  try {
    await auth.signIn(email.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = 'No se pudo iniciar sesión. Revisa el correo y la contraseña.'
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="login">
    <form class="login-card" @submit.prevent="onSubmit">
      <h1>Sistema de Gestión de Materiales</h1>
      <label>
        Correo
        <input v-model="email" type="email" required autocomplete="username" />
      </label>
      <label>
        Contraseña
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="enviando">
        {{ enviando ? 'Ingresando…' : 'Ingresar' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f3f4f6;
}
.login-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 320px;
  padding: 2rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
h1 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #374151;
}
input {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.95rem;
}
button {
  margin-top: 0.5rem;
  padding: 0.6rem;
  border: none;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0;
}
</style>

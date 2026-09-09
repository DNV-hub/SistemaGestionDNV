<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../store/auth'

const email = ref('')
const password = ref('')
const mostrarPassword = ref(false)
const recordar = ref(true)
const mostrarAyuda = ref(false)
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
  <div class="pagina">
    <section class="hero">
      <div class="hero-resplandor"></div>
      <div class="hero-contenido">
        <div class="marca">
          <span class="marca-icono">D</span>
          <div>
            <div class="marca-nombre">Grupo Desnivel</div>
            <div class="marca-sub">Sistema de Almacén</div>
          </div>
        </div>

        <div>
          <span class="etiqueta">Gestión inteligente</span>
          <h1>Control total de tus <em>materiales</em> y almacén</h1>
          <p class="parrafo">
            Monitorea stock, registra vales, gestiona reservas y sigue el consumo contra lo previsto — todo desde un
            solo sistema.
          </p>
        </div>
      </div>
    </section>

    <section class="panel-form">
      <form class="tarjeta" @submit.prevent="onSubmit">
        <h2>Bienvenido de vuelta</h2>
        <p class="subtitulo">Ingresa tus credenciales para acceder al sistema de gestión.</p>

        <label>
          Correo electrónico
          <input v-model="email" type="email" required autocomplete="username" placeholder="nombre@grupodesnivel.com" />
        </label>

        <label>
          Contraseña
          <div class="campo-password">
            <input v-model="password" :type="mostrarPassword ? 'text' : 'password'" required autocomplete="current-password" />
            <button type="button" class="ver-password" @click="mostrarPassword = !mostrarPassword">
              {{ mostrarPassword ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
        </label>

        <div class="fila-opciones">
          <label class="recordar">
            <input v-model="recordar" type="checkbox" />
            Recordar sesión
          </label>
          <button type="button" class="link-ayuda" @click="mostrarAyuda = !mostrarAyuda">¿Olvidaste tu contraseña?</button>
        </div>
        <p v-if="mostrarAyuda" class="ayuda">
          Pide a un Administrador que te la restablezca desde <strong>Usuarios</strong> — por seguridad, nadie puede
          recuperarla, solo definir una nueva.
        </p>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="ingresar" :disabled="enviando">
          {{ enviando ? 'Ingresando…' : 'Ingresar al sistema' }}
        </button>

        <p class="restringido">
          Acceso restringido — solo personal autorizado de <strong>Grupo Desnivel</strong> puede iniciar sesión.
        </p>
      </form>
    </section>
  </div>
</template>

<style scoped>
.pagina {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--color-bg);
}
.hero {
  position: relative;
  overflow: hidden;
  padding: 2.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-right: 1px solid var(--color-border);
}
.hero-resplandor {
  position: absolute;
  top: -20%;
  left: -10%;
  width: 60%;
  height: 60%;
  background: radial-gradient(circle, var(--color-primary-soft) 0%, transparent 70%);
  pointer-events: none;
}
.hero-contenido {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  max-width: 460px;
}
.marca {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.marca-icono {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  display: grid;
  place-items: center;
  font-weight: 800;
}
.marca-nombre {
  color: var(--color-text);
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.2;
}
.marca-sub {
  color: var(--color-text-muted);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.etiqueta {
  display: inline-block;
  padding: 0.3rem 0.7rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
h1 {
  margin: 0 0 0.85rem;
  font-size: 2.1rem;
  line-height: 1.2;
  color: var(--color-text);
  font-weight: 700;
  text-wrap: balance;
}
h1 em {
  font-style: normal;
  color: var(--color-primary);
}
.parrafo {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.95rem;
  line-height: 1.6;
}
.panel-form {
  display: grid;
  place-items: center;
  padding: 2rem;
}
.tarjeta {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
h2 {
  margin: 0;
  font-size: 1.4rem;
  color: var(--color-text);
  font-weight: 700;
}
.subtitulo {
  margin: -0.4rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: var(--color-text-muted);
  font-weight: 500;
}
input[type='email'],
input[type='password'],
input[type='text'] {
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.95rem;
}
input:focus {
  outline: none;
  border-color: var(--color-primary);
}
.campo-password {
  position: relative;
  display: flex;
}
.campo-password input {
  flex: 1;
  padding-right: 3.5rem;
}
.ver-password {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.3rem;
}
.ver-password:hover {
  color: var(--color-primary);
}
.fila-opciones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.recordar {
  flex-direction: row;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.recordar input {
  accent-color: var(--color-primary);
}
.link-ayuda {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.ayuda {
  margin: -0.4rem 0 0;
  padding: 0.6rem 0.7rem;
  background: var(--color-surface-2);
  border-radius: var(--radius-control);
  font-size: 0.78rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.ayuda strong {
  color: var(--color-text);
}
.ingresar {
  padding: 0.75rem;
  border: none;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
}
.ingresar:hover {
  filter: brightness(1.05);
}
.ingresar:disabled {
  opacity: 0.6;
  cursor: default;
}
.restringido {
  margin: 0.5rem 0 0;
  text-align: center;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.restringido strong {
  color: var(--color-text);
}
.error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.85rem;
}

@media (max-width: 860px) {
  .pagina {
    grid-template-columns: 1fr;
  }
  .hero {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    padding: 2rem 1.5rem;
  }
  h1 {
    font-size: 1.6rem;
  }
}
</style>

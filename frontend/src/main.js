import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/tokens.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { useTemaStore } from './store/tema'
import { useAuthStore } from './store/auth'

const app = createApp(App)
app.use(createPinia())
useTemaStore().aplicar()

// app.use(router) dispara la primera navegación en el acto (Vue Router
// resuelve la URL actual apenas se instala, no cuando se monta la app) —
// así que auth.init() tiene que terminar ANTES de esa línea, o el guard
// decide con la sesión todavía en null. Eso era lo que dejaba el panel
// montado sobre /login al refrescar: el guard dejaba pasar a /login (sin
// sesión todavía), y para cuando init() encontraba la sesión real, la
// navegación ya había terminado — nadie volvía a redirigir.
await useAuthStore().init()

app.use(router)
app.mount('#app')

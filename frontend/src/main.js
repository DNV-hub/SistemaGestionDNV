import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/tokens.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { useTemaStore } from './store/tema'
import { useAuthStore } from './store/auth'
import { iniciarFiltroColumnas } from './utils/filtroColumnas'

// Es una app de trabajo en campo, no una página para leer: el zoom con dos
// dedos (y el doble toque) solo estorba. iOS ya no obedece user-scalable=no del
// viewport, así que el pellizco se corta aquí.
for (const evento of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(evento, (e) => e.preventDefault())
}

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

// Filtro por columna tipo Excel en todas las tablas (ver utils/filtroColumnas.js).
iniciarFiltroColumnas()

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // No cachear NADA de la red en runtime más allá del propio app shell:
      // ni las consultas a Supabase ni los webhooks de Power Automate deben
      // pasar por este Service Worker. Esas peticiones ya tienen su propia
      // estrategia offline (rdcSync.js / fotosSync.js, con cola en
      // IndexedDB) — si el Service Worker las interceptara también, un
      // supervisor sin señal podría recibir una respuesta cacheada vieja de
      // Supabase en vez de un error de red limpio, y la cola nunca se
      // enteraría de que hay algo pendiente por reintentar. Al no declarar
      // `runtimeCaching`, cualquier request fuera del build (todo lo que no
      // sea same-origin y esté precacheado) simplemente va directo a la red.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Cualquier navegación a una ruta que el Service Worker no tenga
        // cacheada (p. ej. /rdc/<id>/editar, una URL profunda que solo
        // existe del lado del cliente) cae al mismo index.html — es el
        // equivalente offline del redirect `/* -> /index.html` que
        // netlify.toml ya hace para vue-router en modo history cuando SÍ
        // hay servidor. Sin esto, abrir la PWA instalada directamente en
        // una ruta profunda sin conexión mostraría un 404 en blanco.
        navigateFallback: '/index.html',
        // Las llamadas a Supabase y Power Automate no son de este origen,
        // así que ya quedan fuera del navigateFallback (que solo aplica a
        // `mode: 'navigate'`) y no hace falta excluirlas a mano.
      },
      manifest: {
        name: 'Sistema de Gestión de Materiales — DNV',
        short_name: 'Gestión DNV',
        description: 'Almacén, vales, kardex, procura y Reporte Diario de Campo — Grupo Desnivel.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        lang: 'es',
        // Mismos colores de marca que el resto del Sistema (tokens.css):
        // ámbar como color de acento, y el fondo oscuro que ya es el look
        // por defecto de la aplicación.
        background_color: '#111315',
        theme_color: '#111315',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})

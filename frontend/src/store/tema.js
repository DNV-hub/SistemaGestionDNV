import { defineStore } from 'pinia'

const CLAVE = 'dnv-tema'

/** El look de marca es oscuro; claro es una preferencia explícita del usuario. */
export const useTemaStore = defineStore('tema', {
  state: () => ({
    modo: localStorage.getItem(CLAVE) === 'light' ? 'light' : 'dark',
  }),

  actions: {
    aplicar() {
      document.documentElement.setAttribute('data-theme', this.modo)
      // La barra del navegador/PWA (Android e iPhone) toma el color del fondo.
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.modo === 'dark' ? '#0e0f12' : '#f6f6f4')
    },

    alternar() {
      this.modo = this.modo === 'dark' ? 'light' : 'dark'
      localStorage.setItem(CLAVE, this.modo)
      this.aplicar()
    },
  },
})

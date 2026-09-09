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
    },

    alternar() {
      this.modo = this.modo === 'dark' ? 'light' : 'dark'
      localStorage.setItem(CLAVE, this.modo)
      this.aplicar()
    },
  },
})

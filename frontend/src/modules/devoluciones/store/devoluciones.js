import { defineStore } from 'pinia'
import {
  crearDevolucion,
  listarDevoluciones,
  recibirDevolucion,
  rechazarDevolucion,
} from '../services/devolucionesService'

export const useDevolucionesStore = defineStore('devoluciones', {
  state: () => ({
    devoluciones: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        this.devoluciones = await listarDevoluciones()
      } catch (e) {
        this.error = 'No se pudo cargar las devoluciones.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async crear(payload) {
      const devolucion = await crearDevolucion(payload)
      this.devoluciones.unshift(devolucion)
      return devolucion
    },

    async recibir(payload) {
      await recibirDevolucion(payload)
      await this.cargar()
    },

    async rechazar(payload) {
      await rechazarDevolucion(payload)
      await this.cargar()
    },
  },
})

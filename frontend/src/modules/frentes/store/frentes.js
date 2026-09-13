import { defineStore } from 'pinia'
import {
  listarFrentes,
  crearFrente,
  actualizarFrente,
  eliminarFrente,
} from '../services/frentesService'
import { listarContratos } from '../../../services/contratosService'

export const useFrentesStore = defineStore('frentes', {
  state: () => ({
    frentes: [],
    contratos: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        const [frentes, contratos] = await Promise.all([listarFrentes(), listarContratos()])
        this.frentes = frentes
        this.contratos = contratos
      } catch (e) {
        this.error = 'No se pudo cargar los frentes.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async crear(payload) {
      const frente = await crearFrente(payload)
      this.frentes.push(frente)
      // El código es opcional (puede venir null): ordenar con localeCompare
      // directo rompía apenas se creaba un frente sin código — el insert ya
      // había pasado, pero el error se disparaba después, en el navegador,
      // y el modal se quedaba abierto mostrando "No se pudo guardar" de un
      // frente que en realidad sí se guardó.
      this.frentes.sort((a, b) => (a.codigo ?? '').localeCompare(b.codigo ?? ''))
      return frente
    },

    async actualizar(id, payload) {
      const frente = await actualizarFrente(id, payload)
      const idx = this.frentes.findIndex((f) => f.id === id)
      if (idx !== -1) this.frentes[idx] = frente
      return frente
    },

    /**
     * Igual que catalogo.eliminar / almacen.eliminarAlmacen: intenta borrar
     * y, si el frente ya tiene vales/salidas/reservas/metrados asociados,
     * la FK lo rechaza (23503) y se cierra en su lugar en vez de perder el
     * historial.
     */
    async eliminar(id) {
      try {
        await eliminarFrente(id)
        this.frentes = this.frentes.filter((f) => f.id !== id)
        return { eliminado: true }
      } catch (e) {
        if (e.code === '23503') {
          await this.actualizar(id, { estado: 'cerrado', fecha_cierre: new Date().toISOString().slice(0, 10) })
          return { eliminado: false, cerrado: true }
        }
        throw e
      }
    },
  },
})

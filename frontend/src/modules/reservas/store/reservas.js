import { defineStore } from 'pinia'
import {
  listarReservas,
  liberarReserva,
  obtenerDiasReservaProlongada,
  listarAlmacenes,
  listarFrentes,
} from '../services/reservasService'

export const useReservasStore = defineStore('reservas', {
  state: () => ({
    reservas: [],
    almacenes: [],
    frentes: [],
    diasReservaProlongada: 15,
    cargando: false,
    error: '',
  }),

  actions: {
    async cargarFiltros() {
      const [almacenes, frentes, dias] = await Promise.all([
        listarAlmacenes(),
        listarFrentes(),
        obtenerDiasReservaProlongada(),
      ])
      this.almacenes = almacenes
      this.frentes = frentes
      this.diasReservaProlongada = dias
    },

    async buscar(filtros) {
      this.cargando = true
      this.error = ''
      try {
        this.reservas = await listarReservas(filtros)
      } catch (e) {
        this.error = 'No se pudo cargar las reservas.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async liberar({ reserva_id, motivo, usuario_id }) {
      await liberarReserva({ reserva_id, motivo, usuario_id })
      const idx = this.reservas.findIndex((r) => r.id === reserva_id)
      if (idx !== -1) this.reservas[idx] = { ...this.reservas[idx], estado: 'Liberada' }
    },
  },
})

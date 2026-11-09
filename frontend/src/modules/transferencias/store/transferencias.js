import { defineStore } from 'pinia'
import { crearTransferencia, listarTransferencias } from '../services/transferenciasService'

export const useTransferenciasStore = defineStore('transferencias', {
  state: () => ({
    transferencias: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        this.transferencias = await listarTransferencias()
      } catch (e) {
        this.error = 'No se pudo cargar las transferencias.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async crear(payload) {
      const transferencia = await crearTransferencia(payload)
      this.transferencias.unshift(transferencia)
      return transferencia
    },
  },
})

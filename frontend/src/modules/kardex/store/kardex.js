import { defineStore } from 'pinia'
import { listarKardex, listarKardexParaExportar, listarMaterialesActivos, listarAlmacenes } from '../services/kardexService'

export const useKardexStore = defineStore('kardex', {
  state: () => ({
    movimientos: [],
    materialesActivos: [],
    almacenes: [],
    cargando: false,
    exportando: false,
    error: '',
  }),

  actions: {
    async cargarFiltros() {
      const [materialesActivos, almacenes] = await Promise.all([listarMaterialesActivos(), listarAlmacenes()])
      this.materialesActivos = materialesActivos
      this.almacenes = almacenes
    },

    async buscar(filtros) {
      this.cargando = true
      this.error = ''
      try {
        this.movimientos = await listarKardex(filtros)
      } catch (e) {
        this.error = 'No se pudo cargar el kardex.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    /** Trae todos los movimientos que calzan con los filtros (sin el tope de 300 de la vista). */
    async obtenerParaExportar(filtros) {
      this.exportando = true
      try {
        return await listarKardexParaExportar(filtros)
      } finally {
        this.exportando = false
      }
    },
  },
})

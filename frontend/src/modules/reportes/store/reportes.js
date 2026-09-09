import { defineStore } from 'pinia'
import {
  listarFrentes,
  listarMaterialesActivos,
  listarSalidasReporte,
  listarComparacionGeneral,
} from '../services/reportesService'

export const useReportesStore = defineStore('reportes', {
  state: () => ({
    frentes: [],
    materialesActivos: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargarFiltros() {
      this.cargando = true
      this.error = ''
      try {
        const [frentes, materialesActivos] = await Promise.all([listarFrentes(), listarMaterialesActivos()])
        this.frentes = frentes
        this.materialesActivos = materialesActivos
      } catch (e) {
        this.error = 'No se pudo cargar los filtros.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async obtenerSalidasPorFrente(filtros) {
      return listarSalidasReporte(filtros)
    },

    async obtenerComparacionGeneral() {
      return listarComparacionGeneral()
    },
  },
})

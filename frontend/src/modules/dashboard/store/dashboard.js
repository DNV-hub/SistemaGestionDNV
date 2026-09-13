import { defineStore } from 'pinia'
import {
  listarStockCritico,
  listarAlertasCriticasRecientes,
  listarFrentesEnCampo,
  listarFrentesProximos,
  listarFrentesParalizados,
} from '../services/dashboardService'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    frentesEnCampo: [],
    frentesProximos: [],
    frentesParalizados: [],
    stockCritico: [],
    alertasRecientes: [],
    cargando: false,
    actualizadoEn: null,
  }),

  actions: {
    /**
     * Cada panel solo se pide si el usuario tiene el permiso del módulo que
     * lo alimenta, y cada uno se atrapa por separado: si uno falla (o el rol
     * no tiene acceso a esa tabla) el resto del dashboard igual se pinta.
     */
    async cargar(permisos) {
      this.cargando = true
      const tareas = []

      if (permisos.rdcCampo) {
        tareas.push(
          listarFrentesEnCampo()
            .then((v) => (this.frentesEnCampo = v))
            .catch(() => {})
        )
      }
      if (permisos.frentes) {
        tareas.push(
          listarFrentesProximos()
            .then((v) => (this.frentesProximos = v))
            .catch(() => {}),
          listarFrentesParalizados()
            .then((v) => (this.frentesParalizados = v))
            .catch(() => {})
        )
      }
      if (permisos.stock) {
        tareas.push(
          listarStockCritico()
            .then((v) => (this.stockCritico = v))
            .catch(() => {})
        )
      }
      if (permisos.alertas) {
        tareas.push(
          listarAlertasCriticasRecientes()
            .then((v) => (this.alertasRecientes = v))
            .catch(() => {})
        )
      }

      await Promise.all(tareas)
      this.actualizadoEn = new Date()
      this.cargando = false
    },
  },
})

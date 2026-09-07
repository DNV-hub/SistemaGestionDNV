import { defineStore } from 'pinia'
import {
  contarAlertasActivas,
  contarValesPendientes,
  contarReservasActivas,
  contarFrentesActivos,
  contarStockBajo,
  listarAlertasCriticasRecientes,
  listarValesPendientesRecientes,
} from '../services/dashboardService'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    alertas: null,
    valesPendientes: null,
    reservasActivas: null,
    frentesActivos: null,
    stockBajo: null,
    alertasRecientes: [],
    valesRecientes: [],
    cargando: false,
  }),

  actions: {
    /**
     * Cada tile solo se pide si el usuario tiene el permiso del módulo que
     * la alimenta, y cada una se atrapa por separado: si una falla (o el rol
     * no tiene acceso a esa tabla) el resto del dashboard igual se pinta.
     */
    async cargar(permisos) {
      this.cargando = true
      const tareas = []

      if (permisos.alertas) {
        tareas.push(
          contarAlertasActivas()
            .then((v) => (this.alertas = v))
            .catch(() => {}),
          listarAlertasCriticasRecientes()
            .then((v) => (this.alertasRecientes = v))
            .catch(() => {})
        )
      }
      if (permisos.vales) {
        tareas.push(
          contarValesPendientes()
            .then((v) => (this.valesPendientes = v))
            .catch(() => {}),
          listarValesPendientesRecientes()
            .then((v) => (this.valesRecientes = v))
            .catch(() => {})
        )
      }
      if (permisos.reservas) {
        tareas.push(
          contarReservasActivas()
            .then((v) => (this.reservasActivas = v))
            .catch(() => {})
        )
      }
      if (permisos.frentes) {
        tareas.push(
          contarFrentesActivos()
            .then((v) => (this.frentesActivos = v))
            .catch(() => {})
        )
      }
      if (permisos.stock) {
        tareas.push(
          contarStockBajo()
            .then((v) => (this.stockBajo = v))
            .catch(() => {})
        )
      }

      await Promise.all(tareas)
      this.cargando = false
    },
  },
})

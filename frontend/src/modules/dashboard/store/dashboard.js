import { defineStore } from 'pinia'
import {
  contarAlertasActivas,
  contarValesPendientes,
  contarReservasActivas,
  contarFrentesActivos,
  listarStockCritico,
  listarFrentesSobreconsumo,
  listarMaterialesSinMetrado,
  listarMovimientosSemana,
  listarStockPorCategoria,
  listarUltimosMovimientos,
  listarAlertasCriticasRecientes,
  listarValesPendientesRecientes,
} from '../services/dashboardService'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    alertas: null,
    valesPorAprobar: null,
    reservasActivas: null,
    frentesActivos: null,
    stockCritico: [],
    frentesSobreconsumo: [],
    materialesSinMetrado: [],
    movimientosSemana: [],
    stockPorCategoria: [],
    ultimosMovimientos: [],
    alertasRecientes: [],
    valesRecientes: [],
    cargando: false,
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
            .then((v) => (this.valesPorAprobar = v))
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
          listarStockCritico()
            .then((v) => (this.stockCritico = v))
            .catch(() => {}),
          listarStockPorCategoria()
            .then((v) => (this.stockPorCategoria = v))
            .catch(() => {})
        )
      }
      if (permisos.kardex) {
        tareas.push(
          listarMovimientosSemana()
            .then((v) => (this.movimientosSemana = v))
            .catch(() => {}),
          listarUltimosMovimientos()
            .then((v) => (this.ultimosMovimientos = v))
            .catch(() => {})
        )
      }
      if (permisos.procura) {
        tareas.push(
          listarFrentesSobreconsumo()
            .then((v) => (this.frentesSobreconsumo = v))
            .catch(() => {}),
          listarMaterialesSinMetrado()
            .then((v) => (this.materialesSinMetrado = v))
            .catch(() => {})
        )
      }

      await Promise.all(tareas)
      this.cargando = false
    },
  },
})

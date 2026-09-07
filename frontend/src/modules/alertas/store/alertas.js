import { defineStore } from 'pinia'
import {
  listarAlertas,
  resolverAlerta,
  evaluarAlertas,
  listarConfiguracion,
  actualizarConfiguracion,
  listarFrentesActivos,
} from '../services/alertasService'

export const useAlertasStore = defineStore('alertas', {
  state: () => ({
    alertas: [],
    configuracion: [],
    frentesActivos: [],
    cargando: false,
    evaluando: false,
    error: '',
  }),

  actions: {
    async cargarFiltros() {
      this.frentesActivos = await listarFrentesActivos()
    },

    async buscar(filtros) {
      this.cargando = true
      this.error = ''
      try {
        this.alertas = await listarAlertas(filtros)
      } catch (e) {
        this.error = 'No se pudo cargar las alertas.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async resolver(id, usuarioId) {
      const alerta = await resolverAlerta(id, usuarioId)
      const idx = this.alertas.findIndex((a) => a.id === id)
      if (idx !== -1) this.alertas[idx] = alerta
      return alerta
    },

    async evaluarYRecargar(filtrosActuales) {
      this.evaluando = true
      this.error = ''
      try {
        await evaluarAlertas()
        await this.buscar(filtrosActuales)
      } catch (e) {
        this.error = 'No se pudo actualizar las alertas.'
        console.error(e)
      } finally {
        this.evaluando = false
      }
    },

    async cargarConfiguracion() {
      this.configuracion = await listarConfiguracion()
    },

    async guardarConfiguracion(clave, valor, usuarioId) {
      const actualizado = await actualizarConfiguracion(clave, valor, usuarioId)
      const idx = this.configuracion.findIndex((c) => c.clave === clave)
      if (idx !== -1) this.configuracion[idx] = actualizado
      return actualizado
    },
  },
})

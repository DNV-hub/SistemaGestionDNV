import { defineStore } from 'pinia'
import {
  listarVales,
  obtenerVale,
  crearVale,
  actualizarVale,
  agregarLinea,
  eliminarLinea,
  rechazarLinea,
  cancelarLinea,
  aprobarLinea,
  liberarReserva,
  listarReservasDeVale,
  obtenerReservaActivaDeLinea,
  registrarSalida,
  listarFrentesActivos,
  listarMaterialesActivos,
  listarAlmacenesActivos,
} from '../services/valesService'

export const useValesStore = defineStore('vales', {
  state: () => ({
    vales: [],
    valeActual: null,
    frentesActivos: [],
    materialesActivos: [],
    almacenesActivos: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargarLista() {
      this.cargando = true
      this.error = ''
      try {
        const [vales, frentesActivos, materialesActivos, almacenesActivos] = await Promise.all([
          listarVales(),
          listarFrentesActivos(),
          listarMaterialesActivos(),
          listarAlmacenesActivos(),
        ])
        this.vales = vales
        this.frentesActivos = frentesActivos
        this.materialesActivos = materialesActivos
        this.almacenesActivos = almacenesActivos
      } catch (e) {
        this.error = 'No se pudo cargar los vales.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async cargarDetalle(id) {
      this.cargando = true
      this.error = ''
      try {
        const [vale, materialesActivos, almacenesActivos] = await Promise.all([
          obtenerVale(id),
          listarMaterialesActivos(),
          listarAlmacenesActivos(),
        ])
        this.valeActual = vale
        this.materialesActivos = materialesActivos
        this.almacenesActivos = almacenesActivos
      } catch (e) {
        this.error = 'No se pudo cargar el vale.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async recargarDetalle() {
      if (!this.valeActual) return
      this.valeActual = await obtenerVale(this.valeActual.id)
    },

    async crear(payload) {
      const vale = await crearVale(payload)
      this.vales.unshift(vale)
      return vale
    },

    async enviar(id) {
      const vale = await actualizarVale(id, { estado: 'Enviado' })
      this._actualizarEnLista(vale)
      if (this.valeActual?.id === id) this.valeActual = { ...this.valeActual, ...vale }
      return vale
    },

    async agregarLinea(valeId, linea) {
      const nueva = await agregarLinea(valeId, linea)
      if (this.valeActual?.id === valeId) this.valeActual.lineas.push(nueva)
      return nueva
    },

    async eliminarLinea(valeId, lineaId) {
      await eliminarLinea(lineaId)
      if (this.valeActual?.id === valeId) {
        this.valeActual.lineas = this.valeActual.lineas.filter((l) => l.id !== lineaId)
      }
    },

    async aprobarLinea({ vale_detalle_id, almacen_id, cantidad, usuario_id }) {
      await aprobarLinea({ vale_detalle_id, almacen_id, cantidad, usuario_id })
      await this.recargarDetalle()
      await this._actualizarEstadoValeSiCorresponde()
    },

    async rechazarLinea(lineaId) {
      const linea = await rechazarLinea(lineaId)
      if (this.valeActual) {
        const idx = this.valeActual.lineas.findIndex((l) => l.id === lineaId)
        if (idx !== -1) this.valeActual.lineas[idx] = linea
      }
      await this._actualizarEstadoValeSiCorresponde()
    },

    /** Si ya no quedan líneas pendientes, refleja que la revisión terminó. */
    async _actualizarEstadoValeSiCorresponde() {
      const vale = this.valeActual
      if (!vale || !['Enviado', 'En revision'].includes(vale.estado)) return
      const quedaPendiente = vale.lineas.some((l) => l.estado === 'Pendiente')
      if (!quedaPendiente) {
        const actualizado = await actualizarVale(vale.id, { estado: 'Aprobado' })
        this.valeActual = { ...this.valeActual, ...actualizado }
        this._actualizarEnLista(actualizado)
      }
    },

    /**
     * Cancela el vale: libera (con fn_liberar_reserva) las reservas activas
     * de sus líneas, cancela las líneas todavía pendientes y por último
     * marca el vale como Cancelado. Así no queda stock reservado "colgado".
     */
    async cancelar(usuario_id, motivo) {
      const vale = this.valeActual
      if (!vale) return

      const lineasActivas = vale.lineas.filter((l) => !['Rechazado', 'Cancelado'].includes(l.estado))
      const reservas = await listarReservasDeVale(lineasActivas.map((l) => l.id))
      const reservasActivas = reservas.filter((r) => ['Activa', 'Parcial'].includes(r.estado))

      for (const reserva of reservasActivas) {
        await liberarReserva({ reserva_id: reserva.id, motivo, usuario_id, cancelar: true })
      }

      const idsConReserva = new Set(reservas.map((r) => r.vale_detalle_id))
      const lineasSinReserva = lineasActivas.filter((l) => !idsConReserva.has(l.id))
      for (const linea of lineasSinReserva) {
        await cancelarLinea(linea.id)
      }

      const actualizado = await actualizarVale(vale.id, { estado: 'Cancelado' })
      this._actualizarEnLista(actualizado)
      await this.recargarDetalle()
    },

    async obtenerReservaDeLinea(lineaId) {
      return obtenerReservaActivaDeLinea(lineaId)
    },

    /**
     * Registra la entrega física (parcial o total) de una línea ya
     * reservada. El trigger de `salidas` (fn_trg_salida) descuenta stock
     * físico, escribe en kardex y avanza la reserva/línea/vale
     * automáticamente — acá solo insertamos la fila y refrescamos.
     */
    async registrarEntrega({ linea, reserva, cantidad, documento_referencia, usuario_id }) {
      await registrarSalida({
        material_id: linea.material_id,
        almacen_id: reserva.almacen_id,
        cantidad,
        documento_referencia,
        frente_id: this.valeActual.frente_id,
        vale_detalle_id: linea.id,
        reserva_id: reserva.id,
        usuario_id,
      })
      await this.recargarDetalle()
    },

    _actualizarEnLista(vale) {
      const idx = this.vales.findIndex((v) => v.id === vale.id)
      if (idx !== -1) this.vales[idx] = { ...this.vales[idx], ...vale }
    },
  },
})

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
  cerrarLinea,
  aprobarLinea,
  liberarReserva,
  listarReservasDeVale,
  obtenerReservaActivaDeLinea,
  registrarEntregaMultilote,
  listarFrentesActivos,
  listarFrentesParaDevolucion,
  listarMaterialesActivos,
  listarAlmacenesActivos,
  listarStockDisponible,
  listarSupervisores,
  obtenerAlertasVale,
} from '../services/valesService'

export const useValesStore = defineStore('vales', {
  state: () => ({
    vales: [],
    valeActual: null,
    frentesActivos: [],
    frentesParaDevolucion: [], // activos + paralizados — ver listarFrentesParaDevolucion
    materialesActivos: [],
    almacenesActivos: [],
    supervisoresActivos: [],
    stockDisponible: [],
    alertasStockPorMaterial: new Map(),
    alertasProcuraPorMaterial: new Map(),
    alertasUmbralSobreconsumo: 90,
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

    /** Se pide aparte (no en cargarLista) porque solo la pantalla de
     * Devolución la necesita — pedir material nuevo y transferir siguen
     * restringidos a frentes activos nomás. */
    async cargarFrentesParaDevolucion() {
      this.frentesParaDevolucion = await listarFrentesParaDevolucion()
    },

    async cargarDetalle(id) {
      this.cargando = true
      this.error = ''
      try {
        // Materiales y almacenes activos casi no cambian: se piden solo la
        // primera vez (cargarLista también los trae). Antes se descargaban de
        // nuevo en CADA vale que se abría, y con la bandeja del almacenero —
        // donde se saltan vales uno tras otro — eso se notaba.
        const [vale, materialesActivos, almacenesActivos] = await Promise.all([
          obtenerVale(id),
          this.materialesActivos.length ? this.materialesActivos : listarMaterialesActivos(),
          this.almacenesActivos.length ? this.almacenesActivos : listarAlmacenesActivos(),
        ])
        this.valeActual = vale
        this.materialesActivos = materialesActivos
        this.almacenesActivos = almacenesActivos
        await this._cargarAlertas()
      } catch (e) {
        this.error = 'No se pudo cargar el vale.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    /**
     * Situación de cada material del vale frente a stock y Procura. Se
     * atrapa aparte (no bloquea el resto del detalle si falla, ej. un rol
     * sin procura.ver_comparacion) y en silencio deja los mapas vacíos.
     */
    async _cargarAlertas() {
      const vale = this.valeActual
      if (!vale?.lineas?.length || !vale.frentes?.contrato_id) {
        this.alertasStockPorMaterial = new Map()
        this.alertasProcuraPorMaterial = new Map()
        return
      }
      try {
        const { stockPorMaterial, procuraPorMaterial, umbralSobreconsumo } = await obtenerAlertasVale({
          frenteId: vale.frente_id,
          contratoId: vale.frentes.contrato_id,
          materialIds: [...new Set(vale.lineas.map((l) => l.material_id))],
        })
        this.alertasStockPorMaterial = stockPorMaterial
        this.alertasProcuraPorMaterial = procuraPorMaterial
        this.alertasUmbralSobreconsumo = umbralSobreconsumo
      } catch (e) {
        console.error(e)
        this.alertasStockPorMaterial = new Map()
        this.alertasProcuraPorMaterial = new Map()
      }
    },

    async recargarDetalle() {
      if (!this.valeActual) return
      this.valeActual = await obtenerVale(this.valeActual.id)
      await this._cargarAlertas()
    },

    async crear(payload) {
      const vale = await crearVale(payload)
      this.vales.unshift(vale)
      return vale
    },

    /** Panel móvil del supervisor: un solo paso, sin pasar por Borrador editable. */
    async crearYEnviar(payload) {
      const vale = await this.crear(payload)
      return this.enviar(vale.id)
    },

    async cargarStockDisponible() {
      this.error = ''
      try {
        this.stockDisponible = await listarStockDisponible()
      } catch (e) {
        this.error = `No se pudo cargar el stock${e?.message ? ': ' + e.message : '.'}`
        console.error(e)
      }
    },

    /** Solo para quien puede crear vales a nombre de otro (vales.crear_para_otro). */
    async cargarSupervisores() {
      this.supervisoresActivos = await listarSupervisores()
    },

    async enviar(id) {
      const vale = await actualizarVale(id, { estado: 'Enviado', fecha_envio: new Date().toISOString() })
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

    /** `recargar: false` deja el refresco del detalle (y del estado del vale)
     * a quien llama — para aprobar varias líneas seguidas sin volver a
     * descargar el vale, sus alertas y la comparación con Procura entre una
     * línea y la siguiente (eso era lo que hacía lenta la respuesta de un
     * vale: ~2 s por línea). */
    async aprobarLinea({ vale_detalle_id, almacen_id, cantidad, usuario_id, recargar = true }) {
      await aprobarLinea({ vale_detalle_id, almacen_id, cantidad, usuario_id })
      if (!recargar) return
      await this.recargarDetalle()
      await this._actualizarEstadoValeSiCorresponde()
    },

    /** Red de seguridad: si todas las líneas ya se respondieron pero el vale
     * se quedó en Enviado / En revisión (el último paso del flujo falló o se
     * cortó), lo pone en su estado real. No hace nada si el vale está bien. */
    async reconciliarEstado() {
      const vale = this.valeActual
      if (!vale?.lineas?.length) return false
      const antes = vale.estado
      await this._actualizarEstadoValeSiCorresponde()
      return this.valeActual?.estado !== antes
    },

    async rechazarLinea(lineaId) {
      const linea = await rechazarLinea(lineaId)
      if (this.valeActual) {
        const idx = this.valeActual.lineas.findIndex((l) => l.id === lineaId)
        if (idx !== -1) this.valeActual.lineas[idx] = linea
      }
      await this._actualizarEstadoValeSiCorresponde()
    },

    /**
     * Mientras quede alguna línea Pendiente, el vale se queda en estado de
     * espera (Enviado / En revisión) — nadie decidió nada todavía. Recién
     * cuando ya no queda ninguna se refleja lo que Almacén decidió de
     * verdad: si rechazó todas las líneas, el vale queda Rechazado; si
     * aprobó al menos una, queda Aprobado. Antes esto siempre ponía
     * "Aprobado" apenas no quedaban líneas pendientes, así que rechazar la
     * única línea de un vale lo dejaba marcado como aprobado.
     */
    async _actualizarEstadoValeSiCorresponde() {
      const vale = this.valeActual
      if (!vale || !['Enviado', 'En revision'].includes(vale.estado)) return
      const quedaPendiente = vale.lineas.some((l) => l.estado === 'Pendiente')
      if (quedaPendiente) return

      const lineasRelevantes = vale.lineas.filter((l) => l.estado !== 'Cancelado')
      const estadoFinal =
        lineasRelevantes.length && lineasRelevantes.every((l) => l.estado === 'Rechazado') ? 'Rechazado' : 'Aprobado'

      const actualizado = await actualizarVale(vale.id, { estado: estadoFinal })
      this.valeActual = { ...this.valeActual, ...actualizado }
      this._actualizarEnLista(actualizado)
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

    /**
     * Almacén decide no entregar (más) de una línea aprobada: la base libera
     * la reserva y cierra la línea en un solo paso — Cancelado si no se
     * entregó nada, Entregado con lo entregado si ya salió una parte — y
     * recalcula el vale. Es la única forma de soltar material de un vale.
     */
    async cerrarLinea(linea, motivo) {
      await cerrarLinea(linea.id, motivo)
      await this.recargarDetalle()
      this._actualizarEnLista(this.valeActual)
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
    /** Registra la entrega física (parcial o total) de una línea reservada,
     * repartida entre uno o más lotes en una sola llamada atómica. Los
     * triggers de `salidas` descuentan stock, escriben el kardex y avanzan
     * la reserva/línea/vale por cada lote — acá solo se manda el array y
     * se refresca el detalle. */
    async registrarEntrega({ linea, reserva, documento_referencia, asignaciones, usuario_id }) {
      await registrarEntregaMultilote({
        material_id: linea.material_id,
        almacen_id: reserva.almacen_id,
        frente_id: this.valeActual.frente_id,
        vale_detalle_id: linea.id,
        reserva_id: reserva.id,
        usuario_id,
        documento_referencia,
        asignaciones,
      })
      await this.recargarDetalle()
    },

    _actualizarEnLista(vale) {
      const idx = this.vales.findIndex((v) => v.id === vale.id)
      if (idx !== -1) this.vales[idx] = { ...this.vales[idx], ...vale }
    },
  },

  getters: {
    /** Stock real, sumado entre almacenes, uno por material — es lo único
     * que un supervisor puede pedir en un vale nuevo ahora: si no hay nada
     * de un material, no aparece para elegirlo (no tiene sentido pedir lo
     * que no existe). */
    stockPorMaterial(state) {
      const mapa = new Map()
      for (const s of state.stockDisponible) {
        if (!s.materiales || !s.material_id) continue
        const previo = mapa.get(s.material_id)
        const cantidad = Number(s.cantidad_disponible) || 0
        if (previo) previo.disponible += cantidad
        else {
          mapa.set(s.material_id, {
            id: s.material_id,
            descripcion: s.materiales.descripcion,
            unidad: s.materiales.unidad,
            disponible: cantidad,
          })
        }
      }
      return [...mapa.values()].filter((m) => m.disponible > 0).sort((a, b) => a.descripcion.localeCompare(b.descripcion))
    },
  },
})

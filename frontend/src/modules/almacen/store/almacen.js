import { defineStore } from 'pinia'
import {
  listarAlmacenes,
  crearAlmacen,
  actualizarAlmacen,
  eliminarAlmacen,
  listarStock,
  listarIngresos,
  crearIngreso,
  crearIngresosMasivo,
  listarAjustes,
  crearAjuste,
  listarSalidas,
  listarMaterialesActivos,
  listarIngresosSinMedidas,
  actualizarMedidasIngreso,
} from '../services/almacenService'
import { listarContratos } from '../../../services/contratosService'
import { crearMaterialesEnLote } from '../../catalogo/services/catalogoService'
import { conTiempoLimite } from '../../../utils/conTiempoLimite'

export const useAlmacenStore = defineStore('almacen', {
  state: () => ({
    almacenes: [],
    contratos: [],
    stock: [],
    ingresos: [],
    ajustes: [],
    salidas: [],
    materialesActivos: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        // conTiempoLimite: si una de las siete consultas se cuelga (red
        // inestable, token refrescándose) sin resolver ni rechazar nunca,
        // esta pantalla se quedaba en "Cargando…" indefinidamente y la
        // única salida era recargar la página a ciegas. A los 20s se corta
        // sola con un error que sí se puede reintentar desde acá.
        const [almacenes, contratos, stock, ingresos, ajustes, salidas, materialesActivos] = await conTiempoLimite(
          Promise.all([
            listarAlmacenes(),
            listarContratos(),
            listarStock(),
            listarIngresos(),
            listarAjustes(),
            listarSalidas(),
            listarMaterialesActivos(),
          ])
        )
        this.almacenes = almacenes
        this.contratos = contratos
        this.stock = stock
        this.ingresos = ingresos
        this.ajustes = ajustes
        this.salidas = salidas
        this.materialesActivos = materialesActivos
      } catch (e) {
        this.error = e?.message ?? 'No se pudo cargar la información de almacén.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async crearAlmacen(payload) {
      const almacen = await crearAlmacen(payload)
      this.almacenes.push(almacen)
      this.almacenes.sort((a, b) => a.nombre.localeCompare(b.nombre))
      return almacen
    },

    async actualizarAlmacen(id, payload) {
      const almacen = await actualizarAlmacen(id, payload)
      const idx = this.almacenes.findIndex((a) => a.id === id)
      if (idx !== -1) this.almacenes[idx] = almacen
      return almacen
    },

    /**
     * Igual que catalogo.eliminar: intenta borrar y, si el almacén ya tiene
     * stock/ingresos/ajustes asociados, la FK lo rechaza (23503) y se
     * desactiva en su lugar en vez de perder el historial.
     */
    async eliminarAlmacen(id) {
      try {
        await eliminarAlmacen(id)
        this.almacenes = this.almacenes.filter((a) => a.id !== id)
        return { eliminado: true }
      } catch (e) {
        if (e.code === '23503') {
          await this.actualizarAlmacen(id, { estado: 'inactivo' })
          return { eliminado: false, desactivado: true }
        }
        throw e
      }
    },

    async refrescarStock() {
      this.stock = await listarStock()
    },

    async registrarIngreso(payload) {
      const ingreso = await crearIngreso(payload)
      this.ingresos.unshift(ingreso)
      await this.refrescarStock()
      return ingreso
    },

    async importarIngresosMasivo(filas) {
      const creados = await crearIngresosMasivo(filas)
      this.ingresos.unshift(...creados)
      await this.refrescarStock()
      return creados
    },

    /** materialesACrear de procesarFilasIngreso: [{codigo, descripcion, unidad,
     * tipo_conversion}]. Da de alta cada material nuevo ANTES de registrar
     * los ingresos, para tener su id real y poder resolver material_id en
     * cada fila pendiente. */
    async crearMaterialesFaltantes(materialesACrear) {
      if (!materialesACrear.length) return []
      const creados = await crearMaterialesEnLote(
        materialesACrear.map((m) => ({
          codigo: m.codigo,
          descripcion: m.descripcion,
          unidad: m.unidad,
          tipo_conversion: m.tipo_conversion,
        }))
      )
      this.materialesActivos.push(...creados)
      return creados
    },

    async obtenerIngresosSinMedidas() {
      return listarIngresosSinMedidas()
    },

    /** aAplicar de procesarFilasMedidas: [{id, ancho, largo}]. Devuelve los
     * que fallaron (cada fila es independiente, una no tumba al resto). */
    async importarMedidasIngresos(aAplicar) {
      const fallidos = []
      for (const { id, ancho, largo } of aAplicar) {
        try {
          await actualizarMedidasIngreso(id, { ancho, largo })
        } catch (e) {
          fallidos.push({ id, error: e.message ?? String(e) })
        }
      }
      await this.refrescarStock()
      return fallidos
    },

    async registrarAjuste(payload) {
      const ajuste = await crearAjuste(payload)
      this.ajustes.unshift(ajuste)
      await this.refrescarStock()
      return ajuste
    },
  },
})

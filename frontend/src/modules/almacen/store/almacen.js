import { defineStore } from 'pinia'
import {
  listarAlmacenes,
  crearAlmacen,
  actualizarAlmacen,
  eliminarAlmacen,
  listarStock,
  listarIngresos,
  crearIngreso,
  listarAjustes,
  crearAjuste,
  listarSalidas,
  listarMaterialesActivos,
} from '../services/almacenService'

export const useAlmacenStore = defineStore('almacen', {
  state: () => ({
    almacenes: [],
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
        const [almacenes, stock, ingresos, ajustes, salidas, materialesActivos] = await Promise.all([
          listarAlmacenes(),
          listarStock(),
          listarIngresos(),
          listarAjustes(),
          listarSalidas(),
          listarMaterialesActivos(),
        ])
        this.almacenes = almacenes
        this.stock = stock
        this.ingresos = ingresos
        this.ajustes = ajustes
        this.salidas = salidas
        this.materialesActivos = materialesActivos
      } catch (e) {
        this.error = 'No se pudo cargar la información de almacén.'
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

    async registrarAjuste(payload) {
      const ajuste = await crearAjuste(payload)
      this.ajustes.unshift(ajuste)
      await this.refrescarStock()
      return ajuste
    },
  },
})

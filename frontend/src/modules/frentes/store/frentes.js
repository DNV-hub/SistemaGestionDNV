import { defineStore } from 'pinia'
import {
  listarFrentes,
  crearFrente,
  actualizarFrente,
  eliminarFrente,
  listarSectores,
  crearSector,
  listarFrentesConMetradoProcura,
} from '../services/frentesService'
import { listarContratos } from '../../../services/contratosService'
import { listarPernos } from '../../avance/services/avanceService'
import { listarAlertas } from '../../alertas/services/alertasService'

export const useFrentesStore = defineStore('frentes', {
  state: () => ({
    frentes: [],
    contratos: [],
    sectores: [],
    // Map frente_id -> cantidad, Set de frente_id. Viven aparte de
    // `frentes` (no se mezclan en cada fila) porque son datos derivados de
    // otras tablas, no columnas propias del frente.
    pernosPendientes: new Map(),
    alertasPorFrente: new Map(),
    frentesConProcura: new Set(),
    cargando: false,
    error: '',
  }),

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        const [frentes, contratos, sectores, frentesConProcura, pernos, alertas] = await Promise.all([
          listarFrentes(),
          listarContratos(),
          listarSectores(),
          listarFrentesConMetradoProcura(),
          // null: todos los frentes con control de pernos activo, de una.
          listarPernos(null),
          listarAlertas({ estado: 'activa' }),
        ])
        this.frentes = frentes
        this.contratos = contratos
        this.sectores = sectores
        this.frentesConProcura = frentesConProcura

        const pernosPorFrente = new Map()
        for (const p of pernos) {
          if (p.estado !== 'perforado') continue
          pernosPorFrente.set(p.frente_id, (pernosPorFrente.get(p.frente_id) ?? 0) + 1)
        }
        this.pernosPendientes = pernosPorFrente

        const alertasPorFrente = new Map()
        for (const a of alertas) {
          if (!a.frente_id) continue
          alertasPorFrente.set(a.frente_id, (alertasPorFrente.get(a.frente_id) ?? 0) + 1)
        }
        this.alertasPorFrente = alertasPorFrente
      } catch (e) {
        this.error = 'No se pudo cargar los frentes.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async crearSector(nombre) {
      const sector = await crearSector(nombre)
      this.sectores = [...this.sectores, sector].sort((a, b) => a.nombre.localeCompare(b.nombre))
      return sector
    },

    async crear(payload) {
      const frente = await crearFrente(payload)
      this.frentes.push(frente)
      // El código es opcional (puede venir null): ordenar con localeCompare
      // directo rompía apenas se creaba un frente sin código — el insert ya
      // había pasado, pero el error se disparaba después, en el navegador,
      // y el modal se quedaba abierto mostrando "No se pudo guardar" de un
      // frente que en realidad sí se guardó.
      this.frentes.sort((a, b) => (a.codigo ?? '').localeCompare(b.codigo ?? ''))
      return frente
    },

    async actualizar(id, payload) {
      const frente = await actualizarFrente(id, payload)
      const idx = this.frentes.findIndex((f) => f.id === id)
      if (idx !== -1) this.frentes[idx] = frente
      return frente
    },

    /**
     * Igual que catalogo.eliminar / almacen.eliminarAlmacen: intenta borrar
     * y, si el frente ya tiene vales/salidas/reservas/metrados asociados,
     * la FK lo rechaza (23503) y se cierra en su lugar en vez de perder el
     * historial.
     */
    async eliminar(id) {
      try {
        await eliminarFrente(id)
        this.frentes = this.frentes.filter((f) => f.id !== id)
        return { eliminado: true }
      } catch (e) {
        if (e.code === '23503') {
          await this.actualizar(id, { estado: 'cerrado', fecha_cierre: new Date().toISOString().slice(0, 10) })
          return { eliminado: false, cerrado: true }
        }
        throw e
      }
    },
  },
})

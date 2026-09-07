import { defineStore } from 'pinia'
import {
  listarMateriales,
  listarCategorias,
  crearMaterial,
  actualizarMaterial,
  crearCategoria,
  listarNombresEdp,
  crearNombreEdp,
  crearNombresEdpEnLote,
  crearMaterialesEnLote,
  eliminarMaterial,
} from '../services/catalogoService'
import { normalizarClave } from '../utils/importarExcel'

export const useCatalogoStore = defineStore('catalogo', {
  state: () => ({
    materiales: [],
    categorias: [],
    nombresEdp: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        const [materiales, categorias, nombresEdp] = await Promise.all([
          listarMateriales(),
          listarCategorias(),
          listarNombresEdp(),
        ])
        this.materiales = materiales
        this.categorias = categorias
        this.nombresEdp = nombresEdp
      } catch (e) {
        this.error = 'No se pudo cargar el catálogo.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async crear(payload) {
      const material = await crearMaterial(payload)
      this.materiales.push(material)
      this.materiales.sort((a, b) => a.codigo.localeCompare(b.codigo))
      return material
    },

    async actualizar(id, payload) {
      const material = await actualizarMaterial(id, payload)
      const idx = this.materiales.findIndex((m) => m.id === id)
      if (idx !== -1) this.materiales[idx] = { ...this.materiales[idx], ...material }
      return material
    },

    async crearCategoria(payload) {
      const categoria = await crearCategoria(payload)
      this.categorias.push(categoria)
      this.categorias.sort((a, b) => a.nombre.localeCompare(b.nombre))
      return categoria
    },

    async crearNombreEdp(payload) {
      const nombreEdp = await crearNombreEdp(payload)
      this.nombresEdp.push(nombreEdp)
      this.nombresEdp.sort((a, b) => a.nombre.localeCompare(b.nombre))
      return nombreEdp
    },

    /**
     * Aplica el resultado de `procesarFilas` (ver utils/importarExcel.js):
     * crea primero los nombres EDP que no existían y luego inserta los
     * materiales en un solo lote, ya con el descripcion_edp_id resuelto.
     */
    async importarMateriales({ filas, nombresEdpNuevos }) {
      const nombresCreados = await crearNombresEdpEnLote(
        nombresEdpNuevos.map((nombre) => ({ nombre }))
      )
      this.nombresEdp.push(...nombresCreados)
      this.nombresEdp.sort((a, b) => a.nombre.localeCompare(b.nombre))

      const idPorNombreEdp = new Map(this.nombresEdp.map((n) => [normalizarClave(n.nombre), n.id]))

      const payloads = filas.map((f) => ({
        codigo: f.codigo,
        descripcion: f.descripcion,
        unidad: f.unidad,
        unidad_edp: f.unidad_edp,
        descripcion_edp_id:
          f.descripcionEdpId ??
          (f.descripcionEdpNombre ? idPorNombreEdp.get(normalizarClave(f.descripcionEdpNombre)) : null) ??
          null,
      }))

      const creados = await crearMaterialesEnLote(payloads)
      this.materiales.push(...creados)
      this.materiales.sort((a, b) => a.codigo.localeCompare(b.codigo))
      return creados
    },

    /**
     * Intenta borrar el material. Si ya tiene movimientos asociados (stock,
     * vales, kardex…) la base de datos rechaza el DELETE por la llave
     * foránea (código 23503) y en ese caso lo desactivamos en su lugar, sin
     * perder el historial.
     */
    async eliminar(id) {
      try {
        await eliminarMaterial(id)
        this.materiales = this.materiales.filter((m) => m.id !== id)
        return { eliminado: true }
      } catch (e) {
        if (e.code === '23503') {
          await this.actualizar(id, { estado: 'inactivo' })
          return { eliminado: false, desactivado: true }
        }
        throw e
      }
    },
  },
})

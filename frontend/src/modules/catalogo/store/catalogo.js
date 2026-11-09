import { defineStore } from 'pinia'
import {
  listarMateriales,
  listarCategorias,
  crearMaterial,
  actualizarMaterial,
  crearCategoria,
  crearCategoriasEnLote,
  listarNombresEdp,
  crearNombreEdp,
  crearNombresEdpEnLote,
  crearMaterialesEnLote,
  eliminarMaterial,
  actualizarConversionEnLote,
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
      this.materiales.sort((a, b) => a.descripcion.localeCompare(b.descripcion))
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
     * crea primero los nombres EDP y categorías que no existían, y luego
     * inserta los materiales en un solo lote, ya con esos ids resueltos.
     */
    async importarMateriales({ filas, nombresEdpNuevos, categoriasNuevas = [] }) {
      const [nombresCreados, categoriasCreadas] = await Promise.all([
        crearNombresEdpEnLote(nombresEdpNuevos.map((nombre) => ({ nombre }))),
        crearCategoriasEnLote(categoriasNuevas.map((nombre) => ({ nombre }))),
      ])
      this.nombresEdp.push(...nombresCreados)
      this.nombresEdp.sort((a, b) => a.nombre.localeCompare(b.nombre))
      this.categorias.push(...categoriasCreadas)
      this.categorias.sort((a, b) => a.nombre.localeCompare(b.nombre))

      const idPorNombreEdp = new Map(this.nombresEdp.map((n) => [normalizarClave(n.nombre), n.id]))
      const idPorCategoria = new Map(this.categorias.map((c) => [normalizarClave(c.nombre), c.id]))

      const payloads = filas.map((f) => ({
        codigo: f.codigo,
        descripcion: f.descripcion,
        unidad: f.unidad,
        unidad_edp: f.unidad_edp,
        descripcion_edp_id:
          f.descripcionEdpId ??
          (f.descripcionEdpNombre ? idPorNombreEdp.get(normalizarClave(f.descripcionEdpNombre)) : null) ??
          null,
        categoria_id:
          f.categoriaId ?? (f.categoriaNombre ? idPorCategoria.get(normalizarClave(f.categoriaNombre)) : null) ?? null,
        // La columna es NOT NULL (default 20%) — si el Excel no trae el
        // dato, se cae al estándar en vez de mandar null y que la base
        // rechace el insert.
        stock_minimo_pct: f.stock_minimo_pct ?? 0.2,
      }))

      const creados = payloads.length ? await crearMaterialesEnLote(payloads) : []
      this.materiales.push(...creados)
      this.materiales.sort((a, b) => a.descripcion.localeCompare(b.descripcion))
      return creados
    },

    /** aActualizar de procesarFilas: [{id, codigo, tipo_conversion}]. */
    async importarActualizacionesConversion(aActualizar) {
      if (!aActualizar.length) return { ok: 0, fallidos: [] }
      const resultados = await actualizarConversionEnLote(aActualizar)
      for (const r of resultados) {
        if (!r.ok) continue
        const idx = this.materiales.findIndex((m) => m.id === r.id)
        const original = aActualizar.find((a) => a.id === r.id)
        if (idx !== -1 && original) this.materiales[idx] = { ...this.materiales[idx], tipo_conversion: original.tipo_conversion }
      }
      const fallidos = resultados.filter((r) => !r.ok)
      return { ok: resultados.length - fallidos.length, fallidos }
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

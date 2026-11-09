import { defineStore } from 'pinia'
import {
  listarAlmacenes,
  crearAlmacen,
  actualizarAlmacen,
  eliminarAlmacen,
  listarStock,
  listarStockMinimos,
  listarIngresos,
  crearIngresosMasivo,
  listarAjustes,
  crearAjuste,
  listarSalidas,
  listarMaterialesActivos,
  editarDatosIngresos,
} from '../services/almacenService'
import { listarContratos } from '../../../services/contratosService'
import { crearMaterialesEnLote, crearNombresEdpEnLote, actualizarConversionEnLote } from '../../catalogo/services/catalogoService'
import { registrarGuiaEdp } from '../../catalogo/composables/useGuiasEdp'
import { conTiempoLimite } from '../../../utils/conTiempoLimite'

// Caso real: en el campamento la energía (y con ella el internet) tarda en
// prender cada mañana — el almacenero llega a su oficina antes que vuelva la
// señal y ya le preguntan el stock. No necesita datos en vivo en ese
// momento, le alcanza con lo último que sí se cargó. Guardamos una copia de
// lectura en localStorage después de cada carga exitosa y, si la próxima
// falla por falta de red, se muestra esa copia en vez de una pantalla en
// blanco — con su fecha, para que quede claro que no es en vivo. Nunca se
// usa para escribir nada: cualquier acción (ingreso/ajuste/etc.) necesita
// conexión igual que siempre.
const CLAVE_SNAPSHOT = 'dnv-almacen-snapshot'

function guardarSnapshot(datos) {
  try {
    localStorage.setItem(CLAVE_SNAPSHOT, JSON.stringify({ ...datos, guardadoEn: new Date().toISOString() }))
  } catch {
    // localStorage lleno o bloqueado (modo privado): sin snapshot, sin
    // problema — la próxima carga exitosa lo vuelve a intentar.
  }
}

function leerSnapshot() {
  try {
    const crudo = localStorage.getItem(CLAVE_SNAPSHOT)
    return crudo ? JSON.parse(crudo) : null
  } catch {
    return null
  }
}

export const useAlmacenStore = defineStore('almacen', {
  state: () => ({
    almacenes: [],
    contratos: [],
    stock: [],
    stockMinimos: [],
    ingresos: [],
    ajustes: [],
    salidas: [],
    materialesActivos: [],
    cargando: false,
    error: '',
    // Fecha/hora del snapshot que se está mostrando — null cuando los datos
    // en pantalla sí son de la carga en vivo más reciente.
    sinConexionDesde: null,
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
        const [almacenes, contratos, stock, stockMinimos, ingresos, ajustes, salidas, materialesActivos] = await conTiempoLimite(
          Promise.all([
            listarAlmacenes(),
            listarContratos(),
            listarStock(),
            listarStockMinimos(),
            listarIngresos(),
            listarAjustes(),
            listarSalidas(),
            listarMaterialesActivos(),
          ])
        )
        this.almacenes = almacenes
        this.contratos = contratos
        this.stock = stock
        this.stockMinimos = stockMinimos
        this.ingresos = ingresos
        this.ajustes = ajustes
        this.salidas = salidas
        this.materialesActivos = materialesActivos
        this.sinConexionDesde = null
        guardarSnapshot({ almacenes, contratos, stock, stockMinimos, ingresos, ajustes, salidas, materialesActivos })
      } catch (e) {
        const snapshot = leerSnapshot()
        if (snapshot) {
          this.almacenes = snapshot.almacenes
          this.contratos = snapshot.contratos
          this.stock = snapshot.stock
          this.stockMinimos = snapshot.stockMinimos
          this.ingresos = snapshot.ingresos
          this.ajustes = snapshot.ajustes
          this.salidas = snapshot.salidas
          this.materialesActivos = snapshot.materialesActivos
          this.sinConexionDesde = snapshot.guardadoEn
        } else {
          this.error = e?.message ?? 'No se pudo cargar la información de almacén.'
        }
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
      // Un ingreso nuevo cambia el "último ingreso" de esa fila, así que el
      // mínimo efectivo hay que refrescarlo junto con el stock — quedarse
      // con el viejo mostraría un umbral basado en un lote que ya no es el
      // más reciente.
      const [stock, stockMinimos] = await Promise.all([listarStock(), listarStockMinimos()])
      this.stock = stock
      this.stockMinimos = stockMinimos
    },

    async importarIngresosMasivo(filas) {
      const creados = await crearIngresosMasivo(filas)
      this.ingresos.unshift(...creados)
      await this.refrescarStock()
      return creados
    },

    /** materialesACrear de procesarFilasIngreso: [{descripcion, unidad,
     * tipo_conversion}]. Da de alta cada material nuevo ANTES de registrar
     * los ingresos, para tener su id real y poder resolver material_id en
     * cada fila pendiente. */
    async crearMaterialesFaltantes(materialesACrear) {
      if (!materialesACrear.length) return []
      // Nombres EDP nuevos que escribió el almacenero (el grupo puede crecer):
      // se crean primero, una sola vez por nombre.
      const edpNuevosPorClave = new Map()
      for (const m of materialesACrear) {
        if (m.nombre_edp_nuevo) edpNuevosPorClave.set(m.nombre_edp_nuevo.toUpperCase(), m.nombre_edp_nuevo)
      }
      const edpCreados = edpNuevosPorClave.size
        ? await crearNombresEdpEnLote([...edpNuevosPorClave.values()].map((nombre) => ({ nombre })))
        : []
      const edpIdPorClave = new Map(edpCreados.map((n) => [n.nombre.toUpperCase(), n.id]))
      const edpIdDe = (m) => m.descripcion_edp_id ?? (m.nombre_edp_nuevo ? edpIdPorClave.get(m.nombre_edp_nuevo.toUpperCase()) : null)
      const creados = await crearMaterialesEnLote(
        materialesACrear.map((m) => ({
          descripcion: m.descripcion,
          unidad: m.unidad,
          tipo_conversion: m.tipo_conversion,
          // stock_minimo_pct es NOT NULL en la base (default 20%): si esta
          // fila no lo trae (ej. el importador masivo de ingresos, que
          // todavía no pregunta esto), se omite y la base pone el estándar
          // en vez de mandar null.
          ...(m.stock_minimo_pct != null ? { stock_minimo_pct: m.stock_minimo_pct } : {}),
          ...(edpIdDe(m) ? { descripcion_edp_id: edpIdDe(m) } : {}),
        }))
      )
      this.materialesActivos.push(...creados)
      // Lo que dijo la guía pasa a ser una opción más de su nombre EDP.
      for (const m of materialesACrear) {
        const id = edpIdDe(m)
        if (id && m.guia) {
          const nombre = edpCreados.find((n) => n.id === id)?.nombre ?? ''
          await registrarGuiaEdp(id, nombre, m.guia)
        }
      }
      return creados
    },

    /** materialesAActualizarConversion de procesarFilasIngreso: [{id,
     * tipo_conversion}] — materiales que ya existían sin conversión y esta
     * importación de ingresos les completó ANCHO/LARGO. Se actualiza el
     * catálogo local (materialesActivos) para que quede consistente sin
     * tener que recargar toda la pantalla. */
    async actualizarConversionMateriales(actualizaciones) {
      if (!actualizaciones.length) return
      const resultados = await actualizarConversionEnLote(actualizaciones)
      for (const r of resultados) {
        if (!r.ok) continue
        const idx = this.materialesActivos.findIndex((m) => m.id === r.id)
        const original = actualizaciones.find((a) => a.id === r.id)
        if (idx !== -1 && original) this.materialesActivos[idx] = { ...this.materialesActivos[idx], tipo_conversion: original.tipo_conversion }
      }
    },

    async editarDatosIngresos(ids, datos) {
      await editarDatosIngresos(ids, datos)
      const lista = new Set(ids)
      this.ingresos = this.ingresos.map((i) => (lista.has(i.id) ? { ...i, ...datos } : i))
    },

    async registrarAjuste(payload) {
      const ajuste = await crearAjuste(payload)
      this.ajustes.unshift(ajuste)
      await this.refrescarStock()
      return ajuste
    },
  },
})

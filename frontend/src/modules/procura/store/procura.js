import { defineStore } from 'pinia'
import {
  listarMetradosVigentes,
  listarHistorialFrente,
  crearVersionMetrado,
  crearVersionesMetradoEnLote,
  listarComparacion,
  listarFrentes,
  listarMaterialesActivos,
  listarAlertasNoPrevisto,
} from '../services/procuraService'
import { listarContratos } from '../../../services/contratosService'

// "Eliminar" un material del metrado no borra nada (metrados_procura solo
// admite insert, nunca update/delete — así el historial queda intacto):
// se registra una versión nueva en 0/0, que equivale a "ya no está previsto"
// y se filtra de la planilla y del conteo de materiales del bloque.
function estaEliminado(m) {
  return Number(m.cantidad_contractual) === 0 && Number(m.cantidad_procura) === 0
}

// Un metrado es único por frente + nombre EDP + zona ('' = sin zona).
export const claveMetrado = (m) => `${m.frente_id}:${m.descripcion_edp_id}:${m.zona ?? ''}`

export const useProcuraStore = defineStore('procura', {
  state: () => ({
    // Todos los frentes, de cualquier estado — ver listarFrentes().
    frentes: [],
    contratos: [],
    materialesActivos: [],
    metrados: [], // filas vigentes, de todos los frentes (alimenta los bloques)
    historial: [], // versiones del frente actualmente abierto
    comparacion: [], // procura_vs_consumo del frente actualmente abierto
    alertasNoPrevisto: [], // alertas activas de tipo material_no_previsto, para avisar en el bloque
    cargando: false,
    error: '',
  }),

  getters: {
    /** Un material puede no tener grupo EDP (rarísimo, ver catalogo-codigo-no-es-identidad);
     * esos simplemente no pueden usarse en Procura, que ahora trabaja por grupo. */
    nombresEdpActivos: (state) => {
      const mapa = new Map()
      for (const m of state.materialesActivos) {
        if (!m.descripcion_edp_id || mapa.has(m.descripcion_edp_id)) continue
        mapa.set(m.descripcion_edp_id, {
          id: m.descripcion_edp_id,
          nombre: m.nombres_edp?.nombre ?? '—',
          unidad_edp: m.unidad_edp || m.unidad,
        })
      }
      return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
    },
    nombreEdpPorId: (state) => (id) => state.materialesActivos.find((m) => m.descripcion_edp_id === id)?.nombres_edp ?? null,

    /** Orden estable por nombre EDP — así las filas no saltan de lugar al editar. */
    metradosPorFrente: (state) => (frenteId) => {
      const filas = state.metrados.filter((m) => m.frente_id === frenteId && !estaEliminado(m))
      // Zonas en el orden en que vienen en el Excel (la que aparece primero va
      // primero); lo que no tiene orden (anterior a esta función) va al final
      // y por nombre.
      const ordenZona = new Map()
      for (const m of filas) {
        const o = m.orden ?? Infinity
        ordenZona.set(m.zona ?? '', Math.min(ordenZona.get(m.zona ?? '') ?? Infinity, o))
      }
      return filas.sort(
        (a, b) =>
          (ordenZona.get(a.zona ?? '') ?? Infinity) - (ordenZona.get(b.zona ?? '') ?? Infinity) ||
          (a.zona ?? '').localeCompare(b.zona ?? '', 'es', { numeric: true }) ||
          (a.orden ?? Infinity) - (b.orden ?? Infinity) ||
          (a.nombres_edp?.nombre ?? '').localeCompare(b.nombres_edp?.nombre ?? ''),
      )
    },

    bloques: (state) =>
      state.frentes.map((f) => {
        const materiales = state.metrados.filter((m) => m.frente_id === f.id && !estaEliminado(m))
        return {
          ...f,
          totalMateriales: materiales.length,
          unidadesDistintas: new Set(materiales.map((m) => m.unidad)).size,
          tieneAlertaNoPrevisto: state.alertasNoPrevisto.some((a) => a.frente_id === f.id),
        }
      }),
  },

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        const [frentes, contratos, materialesActivos, metrados, alertasNoPrevisto] = await Promise.all([
          listarFrentes(),
          listarContratos(),
          listarMaterialesActivos(),
          listarMetradosVigentes(),
          listarAlertasNoPrevisto().catch(() => []),
        ])
        this.frentes = frentes
        this.contratos = contratos
        this.materialesActivos = materialesActivos
        this.metrados = metrados
        this.alertasNoPrevisto = alertasNoPrevisto
      } catch (e) {
        this.error = 'No se pudo cargar Procura.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async cargarDetalleFrente(frenteId) {
      this.cargando = true
      this.error = ''
      try {
        const [frentes, materialesActivos, historial, comparacion] = await Promise.all([
          this.frentes.length ? Promise.resolve(this.frentes) : listarFrentes(),
          this.materialesActivos.length ? Promise.resolve(this.materialesActivos) : listarMaterialesActivos(),
          listarHistorialFrente(frenteId),
          listarComparacion(frenteId),
        ])
        this.frentes = frentes
        this.materialesActivos = materialesActivos
        this.historial = historial
        this.comparacion = comparacion
        // las filas vigentes del frente pueden no estar cargadas si se entra
        // directo por URL sin pasar antes por el listado de bloques.
        if (!this.metrados.some((m) => m.frente_id === frenteId)) {
          this.metrados = [...this.metrados, ...historial.filter((h) => h.vigente)]
        }
      } catch (e) {
        this.error = 'No se pudo cargar el detalle del frente.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async guardarFila(payload) {
      const metrado = await crearVersionMetrado(payload)
      this.metrados = [
        metrado,
        ...this.metrados.filter((m) => claveMetrado(m) !== claveMetrado(metrado)),
      ]
      this.historial = [metrado, ...this.historial]
      return metrado
    },

    /**
     * "Elimina" un grupo EDP del metrado: como metrados_procura solo admite
     * insert (nunca update/delete, para no perder el historial), esto crea
     * una versión más en 0/0 — el getter la trata como si no existiera.
     */
    async eliminarFila(fila, usuarioId) {
      return this.guardarFila({
        frente_id: fila.frente_id,
        descripcion_edp_id: fila.descripcion_edp_id,
        zona: fila.zona ?? '',
        orden: fila.orden ?? null,
        unidad: fila.unidad,
        cantidad_contractual: 0,
        cantidad_procura: 0,
        responsable_id: usuarioId,
        observaciones: 'Eliminado del metrado.',
      })
    },

    /** Vacía el metrado de un frente: no borra nada (la tabla solo admite
     * versiones nuevas), deja cada fila vigente en 0/0 y el historial intacto.
     * `salvo`: claves (claveMetrado) que no se tocan porque se van a reemplazar. */
    async vaciarFrente(frenteId, usuarioId, { salvo = new Set() } = {}) {
      const pendientes = this.metrados.filter((m) => m.frente_id === frenteId && !estaEliminado(m) && !salvo.has(claveMetrado(m)))
      if (!pendientes.length) return 0
      const payloads = pendientes.map((m) => ({
        frente_id: m.frente_id,
        descripcion_edp_id: m.descripcion_edp_id,
        zona: m.zona ?? '',
        orden: m.orden ?? null,
        unidad: m.unidad,
        cantidad_contractual: 0,
        cantidad_procura: 0,
        responsable_id: usuarioId,
        observaciones: 'Metrado reemplazado.',
      }))
      const creados = await crearVersionesMetradoEnLote(payloads)
      const claves = new Set(creados.map(claveMetrado))
      this.metrados = [...creados, ...this.metrados.filter((m) => !claves.has(claveMetrado(m)))]
      this.historial = [...creados, ...this.historial]
      return creados.length
    },

    /** Carga masiva de grupos EDP al metrado de un frente (ver ImportarMetradoModal). */
    async importarMetradoMasivo(payloads) {
      let creados = []
      try {
        creados = await crearVersionesMetradoEnLote(payloads)
      } catch (errorLote) {
        // El lote entero falló: se reintenta fila por fila para importar las que sí
        // pasan y decir cuáles fallaron y por qué (en vez de un error genérico).
        console.error(errorLote)
        const fallos = []
        for (const p of payloads) {
          try {
            creados.push(...(await crearVersionesMetradoEnLote([p])))
          } catch (e) {
            fallos.push(`${this.nombreEdpPorId(p.descripcion_edp_id)?.nombre ?? p.descripcion_edp_id}: ${e?.message ?? 'error'}`)
          }
        }
        if (fallos.length) {
          const hechos = new Set(creados.map(claveMetrado))
          this.metrados = [...creados, ...this.metrados.filter((m) => !hechos.has(claveMetrado(m)))]
          this.historial = [...creados, ...this.historial]
          throw new Error(`Se importaron ${creados.length} y fallaron ${fallos.length} → ${fallos.join(' | ')}`)
        }
      }
      const claves = new Set(creados.map(claveMetrado))
      this.metrados = [...creados, ...this.metrados.filter((m) => !claves.has(claveMetrado(m)))]
      this.historial = [...creados, ...this.historial]
      return creados
    },
  },
})

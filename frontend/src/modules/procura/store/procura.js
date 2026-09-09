import { defineStore } from 'pinia'
import {
  listarMetradosVigentes,
  listarHistorialFrente,
  crearVersionMetrado,
  crearVersionesMetradoEnLote,
  listarComparacion,
  listarFrentesActivos,
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

export const useProcuraStore = defineStore('procura', {
  state: () => ({
    frentesActivos: [],
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
    materialPorId: (state) => (id) => state.materialesActivos.find((m) => m.id === id) ?? null,

    /** Orden estable por código de material — así las filas no saltan de lugar al editar. */
    metradosPorFrente: (state) => (frenteId) =>
      state.metrados
        .filter((m) => m.frente_id === frenteId && !estaEliminado(m))
        .sort((a, b) => (a.materiales?.codigo ?? '').localeCompare(b.materiales?.codigo ?? '')),

    bloques: (state) =>
      state.frentesActivos.map((f) => {
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
        const [frentesActivos, contratos, materialesActivos, metrados, alertasNoPrevisto] = await Promise.all([
          listarFrentesActivos(),
          listarContratos(),
          listarMaterialesActivos(),
          listarMetradosVigentes(),
          listarAlertasNoPrevisto().catch(() => []),
        ])
        this.frentesActivos = frentesActivos
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
        const [frentesActivos, materialesActivos, historial, comparacion] = await Promise.all([
          this.frentesActivos.length ? Promise.resolve(this.frentesActivos) : listarFrentesActivos(),
          this.materialesActivos.length ? Promise.resolve(this.materialesActivos) : listarMaterialesActivos(),
          listarHistorialFrente(frenteId),
          listarComparacion(frenteId),
        ])
        this.frentesActivos = frentesActivos
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
        ...this.metrados.filter(
          (m) => !(m.frente_id === metrado.frente_id && m.material_id === metrado.material_id)
        ),
      ]
      this.historial = [metrado, ...this.historial]
      return metrado
    },

    /**
     * "Elimina" un material del metrado: como metrados_procura solo admite
     * insert (nunca update/delete, para no perder el historial), esto crea
     * una versión más en 0/0 — el getter la trata como si no existiera.
     */
    async eliminarFila(fila, usuarioId) {
      return this.guardarFila({
        frente_id: fila.frente_id,
        material_id: fila.material_id,
        unidad: fila.unidad,
        cantidad_contractual: 0,
        cantidad_procura: 0,
        responsable_id: usuarioId,
        observaciones: 'Eliminado del metrado.',
      })
    },

    /** Carga masiva de materiales al metrado de un frente (ver ImportarMetradoModal). */
    async importarMetradoMasivo(payloads) {
      const creados = await crearVersionesMetradoEnLote(payloads)
      const claves = new Set(creados.map((m) => `${m.frente_id}:${m.material_id}`))
      this.metrados = [...creados, ...this.metrados.filter((m) => !claves.has(`${m.frente_id}:${m.material_id}`))]
      this.historial = [...creados, ...this.historial]
      return creados
    },
  },
})

import { defineStore } from 'pinia'
import {
  listarMetradosVigentes,
  listarHistorialFrente,
  crearVersionMetrado,
  listarComparacion,
  listarFrentesActivos,
  listarMaterialesActivos,
} from '../services/procuraService'

export const useProcuraStore = defineStore('procura', {
  state: () => ({
    frentesActivos: [],
    materialesActivos: [],
    metrados: [], // filas vigentes, de todos los frentes (alimenta los bloques)
    historial: [], // versiones del frente actualmente abierto
    comparacion: [], // procura_vs_consumo del frente actualmente abierto
    cargando: false,
    error: '',
  }),

  getters: {
    materialPorId: (state) => (id) => state.materialesActivos.find((m) => m.id === id) ?? null,

    /** Orden estable por código de material — así las filas no saltan de lugar al editar. */
    metradosPorFrente: (state) => (frenteId) =>
      state.metrados
        .filter((m) => m.frente_id === frenteId)
        .sort((a, b) => (a.materiales?.codigo ?? '').localeCompare(b.materiales?.codigo ?? '')),

    bloques: (state) =>
      state.frentesActivos.map((f) => {
        const materiales = state.metrados.filter((m) => m.frente_id === f.id)
        return {
          ...f,
          totalMateriales: materiales.length,
          unidadesDistintas: new Set(materiales.map((m) => m.unidad)).size,
        }
      }),
  },

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        const [frentesActivos, materialesActivos, metrados] = await Promise.all([
          listarFrentesActivos(),
          listarMaterialesActivos(),
          listarMetradosVigentes(),
        ])
        this.frentesActivos = frentesActivos
        this.materialesActivos = materialesActivos
        this.metrados = metrados
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
  },
})

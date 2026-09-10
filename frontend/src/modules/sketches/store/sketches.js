import { acceptHMRUpdate, defineStore } from 'pinia'
import { useRdcStore } from '../../rdc/store/rdc'
import { obtenerPaginaSketches } from '../services/sketchesService'

export const useSketchesStore = defineStore('sketches', {
  state: () => ({
    frenteId: null,
    fotos: [],
    pagina: 0,
    hayMas: false,
    cargando: false,
    cargandoMas: false,
    error: '',
    // Para descartar la respuesta de una consulta vieja si el usuario cambió
    // de frente antes de que llegara — mismo motivo que _sketchesAnterioresReqId
    // en el original: sin esto, cambiar de frente rápido podía mostrar
    // sketches del frente anterior si esa respuesta llegaba después.
    solicitudId: 0,
  }),

  actions: {
    async iniciar() {
      const rdc = useRdcStore()
      if (!rdc.catalogos) await rdc.iniciar()
    },

    nombreFrente(id) {
      const rdc = useRdcStore()
      return (rdc.catalogos?.frentes ?? []).find((f) => f.id === id)?.nombre ?? ''
    },

    async elegirFrente(frenteId) {
      this.frenteId = frenteId
      this.fotos = []
      this.pagina = 0
      this.hayMas = false
      this.error = ''
      if (!frenteId) return
      await this.cargar()
    },

    async cargar() {
      const frente = this.nombreFrente(this.frenteId)
      if (!frente) return
      const solicitud = ++this.solicitudId
      this.cargando = true
      this.error = ''
      try {
        const { fotos, hayMas } = await obtenerPaginaSketches(frente, 0)
        if (solicitud !== this.solicitudId) return // llegó tarde, ya no importa
        this.fotos = fotos
        this.pagina = 0
        this.hayMas = hayMas
      } catch (e) {
        if (solicitud !== this.solicitudId) return
        this.error = 'No se pudieron cargar los sketches. Revisa tu conexión.'
        console.error(e)
      } finally {
        if (solicitud === this.solicitudId) this.cargando = false
      }
    },

    async cargarMas() {
      const frente = this.nombreFrente(this.frenteId)
      if (!frente || this.cargandoMas) return
      const solicitud = this.solicitudId
      this.cargandoMas = true
      try {
        const siguientePagina = this.pagina + 1
        const { fotos, hayMas } = await obtenerPaginaSketches(frente, siguientePagina)
        if (solicitud !== this.solicitudId) return
        this.fotos = [...this.fotos, ...fotos]
        this.pagina = siguientePagina
        this.hayMas = hayMas
      } catch (e) {
        console.error(e)
      } finally {
        if (solicitud === this.solicitudId) this.cargandoMas = false
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSketchesStore, import.meta.hot))
}

import { acceptHMRUpdate, defineStore } from 'pinia'
import { useAuthStore } from '../../../store/auth'
import { useRdcStore } from '../../rdc/store/rdc'
import { comprimirImagen, FOTO_TIPOS, nombreArchivoFoto } from '../services/fotosConstantes'
import { ENVIO } from '../services/fotosDb'
import * as repo from '../services/fotosRepository'
import { iniciarSincronizacionAutomatica, sincronizar } from '../services/fotosSync'

let detenerSincronizacion = null

const CATEGORIA_VACIA = () => ({ diarias: [], redline: [], sketch_perf: [], sketch_iny: [], sketch_malla: [] })

export const useFotosStore = defineStore('fotos', {
  state: () => ({
    // La selección actual vive SOLO en memoria, igual que en el RDC
    // original: son archivos recién elegidos, todavía no hay nada que
    // encolar hasta que el supervisor presiona "Enviar fotos". Si cierra la
    // app antes de eso, se pierde la selección — ni más ni menos que hoy.
    seleccion: CATEGORIA_VACIA(),
    idSiguiente: 0,
    fecha: null,
    frenteId: null,
    enviando: false,
    envios: [],
    cargando: true,
  }),

  getters: {
    hayPendientes: (state) => state.envios.some((e) => e.estado !== ENVIO.ENVIADO),
    totalSeleccionadas: (state) => Object.values(state.seleccion).reduce((s, arr) => s + arr.length, 0),
  },

  actions: {
    async iniciar() {
      this.cargando = true
      try {
        const rdc = useRdcStore()
        if (!rdc.catalogos) await rdc.iniciar()
        if (!this.fecha) {
          const d = new Date()
          this.fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        this.envios = await repo.listar()
        this.arrancarSincronizacion()
      } finally {
        this.cargando = false
      }
    },

    arrancarSincronizacion() {
      if (detenerSincronizacion) return
      detenerSincronizacion = iniciarSincronizacionAutomatica()
    },

    async agregarFotos(tipoFoto, files) {
      for (const file of files) {
        if (!file.type?.startsWith('image/')) continue
        const id = this.idSiguiente++
        const previewUrl = URL.createObjectURL(file)
        // Se comprime AL SELECCIONAR, no al enviar: así "Enviar fotos" solo
        // tiene que guardar texto (base64) en la cola, sin depender de que
        // el archivo original siga disponible más tarde.
        const contenidoArchivo = (await comprimirImagen(file)).split(',')[1]
        this.seleccion[tipoFoto].push({ id, previewUrl, contenidoArchivo })
      }
    },

    quitarFoto(tipoFoto, id) {
      const foto = this.seleccion[tipoFoto].find((f) => f.id === id)
      if (foto) URL.revokeObjectURL(foto.previewUrl)
      this.seleccion[tipoFoto] = this.seleccion[tipoFoto].filter((f) => f.id !== id)
    },

    /** Encola un envío por cada categoría con fotos (diarias es obligatoria,
     * el resto solo si el supervisor cargó algo). Cada categoría es un envío
     * independiente — así lo espera el flujo, y así un error en una no
     * bloquea a las demás. */
    async enviar() {
      const auth = useAuthStore()
      const rdc = useRdcStore()

      if (!this.totalSeleccionadas) throw new Error('Selecciona al menos una foto para enviar.')
      if (!this.frenteId) throw new Error('Selecciona el frente.')
      if (!this.fecha) throw new Error('Selecciona la fecha.')

      const supervisor = (rdc.catalogos?.supervisores ?? []).find((s) => s.usuario_id === auth.perfil?.id)
      const nombre = supervisor?.nombre ?? auth.perfil?.nombre ?? ''
      const frenteNombre = (rdc.catalogos?.frentes ?? []).find((f) => f.id === this.frenteId)?.nombre ?? ''

      const categorias = Object.keys(this.seleccion).filter((c) => this.seleccion[c].length)

      this.enviando = true
      try {
        for (const categoria of categorias) {
          const seleccionadas = this.seleccion[categoria]
          const fotos = seleccionadas.map((f, idx) => ({
            nombreArchivo: nombreArchivoFoto(categoria, idx, { rol: 'Supervisor', nombreSinEspacios: nombre.replace(/\s+/g, ''), frente: frenteNombre, fecha: this.fecha }),
            contenidoArchivo: f.contenidoArchivo,
          }))
          const envio = repo.crearEnvio({
            fecha: this.fecha,
            frenteId: this.frenteId,
            frenteNombre,
            rol: 'Supervisor',
            nombre,
            categoria: FOTO_TIPOS[categoria].categoria,
            etiqueta: FOTO_TIPOS[categoria].etiqueta,
            fotos,
          })
          await repo.guardar(envio)

          seleccionadas.forEach((f) => URL.revokeObjectURL(f.previewUrl))
          this.seleccion[categoria] = []
        }
        this.envios = await repo.listar()
      } finally {
        this.enviando = false
      }

      this.sincronizarAhora()
    },

    async sincronizarAhora() {
      const resumen = await sincronizar()
      this.envios = await repo.listar()
      return resumen
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFotosStore, import.meta.hot))
}

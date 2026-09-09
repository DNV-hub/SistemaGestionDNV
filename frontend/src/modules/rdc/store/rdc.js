import { acceptHMRUpdate, defineStore } from 'pinia'
import { useAuthStore } from '../../../store/auth'
import { ENVIO, ESTADO } from '../services/rdcDb'
import * as repo from '../services/rdcRepository'
import { descargarCatalogos, listarReportes } from '../services/rdcService'
import { iniciarSincronizacionAutomatica, sincronizar } from '../services/rdcSync'
import { PERSONAL_INDIRECTO_SALA_ELECTRICA } from '../services/rdcRepository'
import { SECTOR_SALA_ELECTRICA } from '../services/rdcConstantes'

// Store del módulo RDC.
//
// A diferencia de los otros módulos del Sistema, este NO consulta Supabase para
// mostrar cosas: todo sale del repositorio local (IndexedDB). La red aparece
// solo en dos momentos, y ninguno bloquea al supervisor: refrescar catálogos y
// sincronizar lo que ya se cerró.

// Encadena los guardados para que nunca se crucen. `guardar()` se llama en
// cada cambio de campo — varias veces por segundo si el supervisor toca
// rápido un stepper — y antes cada llamada era una escritura independiente
// que además REEMPLAZABA el borrador en memoria por lo que ella misma
// acababa de guardar. Si dos guardados se superponían y el más viejo
// resolvía después del más nuevo (perfectamente posible: son promesas
// independientes, nada garantiza el orden de llegada), el viejo pisaba al
// nuevo — en memoria y en el disco, silenciosamente. Encadenarlos en una
// sola fila, y releer `this.actual` recién cuando le toca el turno a cada
// uno (no en el momento en que se llamó), garantiza que la ÚLTIMA escritura
// sea siempre la más reciente, sin importar cuántos guardados se hayan
// pedido de encima.
let colaGuardado = Promise.resolve()

// Vive fuera del store porque es un suscriptor de eventos del navegador, no
// estado de la aplicación: guardarlo en `state` haría que Pinia intente
// volverlo reactivo sin ninguna razón.
let detenerSincronizacion = null

export const useRdcStore = defineStore('rdc', {
  state: () => ({
    catalogos: null,
    reportes: [],
    historicoRemoto: [],
    actual: null,
    cargando: true,
    sinCatalogos: false,
    sincronizando: false,
    ultimaSincronizacion: null,
    error: '',
  }),

  getters: {
    /** Los catálogos vinieron de una carga previa y todavía no se pudieron
     * refrescar en esta sesión. La interfaz lo avisa para que nadie se extrañe
     * de no ver un frente creado hoy. */
    hayPendientes: (state) =>
      state.reportes.some((r) => r.estado === ESTADO.FINALIZADO && (r.estadoSupabase !== ENVIO.ENVIADO || r.estadoSharepoint !== ENVIO.ENVIADO)),

    esSalaElectrica: (state) =>
      !!state.actual && state.catalogos?.sectores?.find((s) => s.id === state.actual.sectorId)?.nombre === SECTOR_SALA_ELECTRICA,

    frentesDelSector: (state) => {
      if (!state.actual?.sectorId) return state.catalogos?.frentes ?? []
      return (state.catalogos?.frentes ?? []).filter((f) => f.sector_id === state.actual.sectorId)
    },
  },

  actions: {
    async iniciar() {
      this.cargando = true
      try {
        this.catalogos = await repo.leerCatalogos()
        this.reportes = await repo.listar()
        this.sinCatalogos = !(await repo.hayCatalogos())
        // Refrescar catálogos es "mejor si se puede", nunca un requisito: si no
        // hay señal se sigue trabajando con la copia local.
        this.refrescarCatalogos().catch(() => {})
        this.arrancarSincronizacion()
      } finally {
        this.cargando = false
      }
    },

    /** Deja corriendo el envío en segundo plano por el resto de la sesión: al
     * recuperar señal, al volver a la pestaña y cada tanto. Se arranca una sola
     * vez, la primera que se entra al módulo. */
    arrancarSincronizacion() {
      if (detenerSincronizacion) return
      detenerSincronizacion = iniciarSincronizacionAutomatica(() => this.catalogos)
    },

    async refrescarCatalogos() {
      if (!navigator.onLine) return
      const catalogos = await descargarCatalogos()
      await repo.guardarCatalogos(catalogos)
      this.catalogos = await repo.leerCatalogos()
      this.sinCatalogos = false
    },

    async listar() {
      this.reportes = await repo.listar()
    },

    /** Reportes que viven solo en el servidor. Un supervisor casi no los tiene
     * (los suyos están en el celular), pero Planeamiento y Consulta ven así
     * los de todos. Falla en silencio: sin señal la lista local sigue estando. */
    async cargarHistorico(filtros = {}) {
      if (!navigator.onLine) return
      try {
        const remotos = await listarReportes(filtros)
        const localesPorId = new Set(this.reportes.map((r) => r.id))
        this.historicoRemoto = remotos.filter((r) => !localesPorId.has(r.id))
      } catch (e) {
        console.error('No se pudo cargar el histórico del servidor', e)
      }
    },

    /** Crea un reporte nuevo. Arrastra sector, frente, supervisor y capataz del
     * último reporte: el supervisor trabaja en el mismo frente días seguidos y
     * volver a elegirlos cada mañana es fricción pura. El RDC actual hace lo
     * mismo y conviene no perderlo. */
    async nuevo() {
      const auth = useAuthStore()
      const ultimo = this.reportes[0]
      const supervisorPropio = (this.catalogos?.supervisores ?? []).find((s) => s.usuario_id === auth.perfil?.id)

      const reporte = repo.crearBorrador({
        creadoPor: auth.perfil?.id,
        supervisorId: supervisorPropio?.id ?? ultimo?.supervisorId ?? null,
        sectorId: ultimo?.sectorId ?? null,
        frenteId: ultimo?.frenteId ?? null,
        capatazId: ultimo?.capatazId ?? null,
      })

      this.actual = await repo.guardar(reporte)
      await this.listar()
      return this.actual
    },

    async abrir(id) {
      // Espera a que termine de escribirse cualquier guardado que haya
      // quedado en camino de una visita anterior a este mismo borrador,
      // ANTES de leerlo del disco. Sin esto, volver a entrar rápido podía
      // ganarle la carrera a un guardado pendiente: `abrir` reemplaza
      // `this.actual` con lo que hubiera en el disco en ESE instante (que
      // podía ser una versión vieja, a medio escribir), y como los
      // guardados encolados leen `this.actual` recién cuando les toca su
      // turno, el o los que todavía estuvieran pendientes terminaban
      // regrabando esa misma versión vieja encima de lo que sí se había
      // alcanzado a guardar — perdiendo lo último que se escribió antes de
      // salir, en vez de conservarlo.
      await colaGuardado
      this.actual = (await repo.obtener(id)) ?? null
      return this.actual
    },

    /** Guardado progresivo: cada cambio del formulario pasa por acá. Es
     * deliberado que escriba en cada llamada — un reporte a medio llenar que se
     * pierde porque el navegador se cerró es el peor resultado posible. */
    async guardar() {
      if (!this.actual) return
      // El objeto reactivo (`this.actual`) sigue siendo la única fuente de
      // verdad en memoria en todo momento — nunca se reemplaza por lo que
      // devuelve `repo.guardar()`. Cada turno de la cola lee el estado
      // ACTUAL (no el que había cuando se pidió el guardado) y lo escribe;
      // si varios guardados quedaron en fila, los primeros terminan siendo
      // redundantes y el último siempre grava lo más reciente.
      colaGuardado = colaGuardado.then(() => (this.actual ? repo.guardar(this.actual) : null))
      await colaGuardado
    },

    /** Ajusta las categorías de personal indirecto según el sector elegido.
     * Solo Sala Eléctrica las lleva; si se cambia a otro sector, se retiran. */
    async ajustarPersonalIndirecto() {
      if (!this.actual) return
      const directas = this.actual.personal.filter((p) => p.tipo === 'directa')
      const indirectasActuales = this.actual.personal.filter((p) => p.tipo === 'indirecta')

      const indirectas = this.esSalaElectrica
        ? PERSONAL_INDIRECTO_SALA_ELECTRICA.map((categoria, i) => {
            const previa = indirectasActuales.find((p) => p.categoria === categoria)
            return previa ?? { id: repo.nuevoId(), categoria, tipo: 'indirecta', cantidad: 0, orden: directas.length + i + 1 }
          })
        : []

      this.actual.personal = [...directas, ...indirectas]
      await this.guardar()
    },

    async eliminarBorrador(id) {
      await repo.eliminarBorrador(id)
      if (this.actual?.id === id) this.actual = null
      await this.listar()
    },

    /** Cierra el reporte y lo pone en la cola. El envío en sí lo hace el
     * servicio de sincronización cuando haya señal — acá no se espera por la
     * red, para que el supervisor pueda cerrar y seguir con lo suyo. */
    async finalizar() {
      if (!this.actual) return
      this.actual.estado = ESTADO.FINALIZADO
      await this.guardar()
      await this.listar()
      this.sincronizarAhora()
    },

    /** Reabre un reporte ya enviado para corregirlo. No borra nada: el
     * siguiente envío sale como archivo nuevo con "(C)", igual que hoy, para
     * que en SharePoint queden el original y la corrección. */
    async corregir(id) {
      const reporte = await repo.obtener(id)
      if (!reporte) return null
      reporte.estado = ESTADO.BORRADOR
      reporte.esCorreccion = true
      reporte.estadoSupabase = ENVIO.PENDIENTE
      reporte.estadoSharepoint = ENVIO.PENDIENTE
      this.actual = await repo.guardar(reporte)
      await this.listar()
      return this.actual
    },

    async sincronizarAhora() {
      if (this.sincronizando) return
      this.sincronizando = true
      try {
        const resumen = await sincronizar({ catalogos: this.catalogos })
        this.ultimaSincronizacion = { ...resumen, en: new Date().toISOString() }
        await this.listar()
        if (this.actual) this.actual = (await repo.obtener(this.actual.id)) ?? this.actual
        return resumen
      } finally {
        this.sincronizando = false
      }
    },
  },
})

// Sin esto, cada vez que Vite recarga este archivo en caliente durante el
// desarrollo (algo que pasa seguido mientras se ajusta el módulo), Pinia
// puede perder el borrador que el store tenía en memoria — el reporte sigue
// intacto en IndexedDB, pero la pantalla que ya estaba abierta se queda con
// el estado nuevo (vacío) hasta que se vuelve a navegar. Esto no afecta nada
// en producción, donde el módulo no se recarga en caliente.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useRdcStore, import.meta.hot))
}

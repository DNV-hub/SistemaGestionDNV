import { acceptHMRUpdate, defineStore } from 'pinia'
import { useAuthStore } from '../../../store/auth'
import { ENVIO, ESTADO } from '../services/rdcDb'
import * as repo from '../services/rdcRepository'
import { descargarCatalogos, eliminarReporteRemoto, listarReportes, obtenerReporteCompleto } from '../services/rdcService'
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

    /** El registro de rdc_supervisores vinculado a la cuenta que está
     * conectada ahora — null para quien no es supervisor de campo
     * (Planeamiento, Administrador…), que es justo la señal que usa
     * PasoDatos.vue para decidir si hay que mostrar el selector de
     * "Supervisor" (un supervisor de verdad nunca lo necesita: el reporte
     * es siempre suyo). */
    supervisorPropio: (state) => {
      const auth = useAuthStore()
      return (state.catalogos?.supervisores ?? []).find((s) => s.usuario_id === auth.perfil?.id) ?? null
    },
  },

  actions: {
    async iniciar() {
      this.cargando = true
      try {
        this.catalogos = await repo.leerCatalogos()
        await this.listar()
        this.sinCatalogos = !(await repo.hayCatalogos())
        // Refrescar catálogos es "mejor si se puede", nunca un requisito: si no
        // hay señal se sigue trabajando con la copia local.
        this.refrescarCatalogos().catch(() => {})
        this.arrancarSincronizacion()
        // arrancarSincronizacion() solo dispara un intento inmediato la
        // PRIMERA vez que se entra al módulo en toda la sesión (después de
        // eso, solo el intervalo de fondo lo vuelve a intentar). Pero cada
        // vez que el supervisor vuelve a esta lista es, precisamente,
        // porque quiere ver si ya llegó lo que se editó en otro
        // dispositivo — no tiene sentido hacerlo esperar hasta el próximo
        // tic del intervalo para eso.
        this.sincronizarAhora().catch(() => {})
      } finally {
        this.cargando = false
      }
    },

    /** Deja corriendo el envío en segundo plano por el resto de la sesión: al
     * recuperar señal, al volver a la pestaña y cada tanto. Se arranca una sola
     * vez, la primera que se entra al módulo. */
    arrancarSincronizacion() {
      if (detenerSincronizacion) return
      detenerSincronizacion = iniciarSincronizacionAutomatica(() => this.catalogos, { intervaloMinutos: 2 })
    },

    async refrescarCatalogos() {
      if (!navigator.onLine) return
      const catalogos = await descargarCatalogos()
      await repo.guardarCatalogos(catalogos)
      this.catalogos = await repo.leerCatalogos()
      this.sinCatalogos = false
    },

    /**
     * IndexedDB es local al navegador, no a la sesión: si dos cuentas
     * entraron alguna vez en el mismo dispositivo (dos supervisores, o un
     * supervisor y quien lo esté probando), sin este filtro cualquiera de
     * las dos veía los borradores y reportes de la otra. El historial de
     * cada quien es solo lo que ESA cuenta creó — ver los de todos es
     * rdc.ver_todos, servido aparte por cargarHistorico() contra Supabase,
     * que si filtra por RLS.
     */
    async listar() {
      const auth = useAuthStore()
      const todos = await repo.listar()
      this.reportes = todos.filter((r) => r.creadoPor === auth.perfil?.id)
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

    /** Crea un reporte nuevo. Arrastra sector, frente, supervisor, capataz,
     * cuadrilla de personal y equipo del último reporte: el supervisor
     * trabaja en el mismo frente días seguidos, con la misma gente y las
     * mismas máquinas, y volver a tipear todo eso cada mañana es fricción
     * pura. Así funcionaba el RDC original y hay que conservarlo. Lo que el
     * supervisor edite en el reporte de hoy (cambia de frente, falta un
     * peón, llega una máquina nueva) es lo que se le va a ofrecer mañana:
     * `ultimo` siempre es el reporte local más reciente, así que el arrastre
     * se actualiza solo, reporte a reporte.
     *
     * Si la cuenta tiene `rdc_heredar_reporte_completo` (pedido puntual de
     * un usuario cuya rutina diaria se repite casi entera), el arrastre no
     * se limita a eso: se clona el reporte anterior completo, incluido el
     * trabajo del día (metrados, elementos, bitácora, stand by,
     * programación, observaciones...) — ver crearBorradorDesde() para por
     * qué esto NO es el comportamiento por defecto de todos los demás. */
    async nuevo() {
      const auth = useAuthStore()
      const ultimo = this.reportes[0]

      const reporte =
        auth.perfil?.rdc_heredar_reporte_completo && ultimo
          ? repo.crearBorradorDesde(ultimo, { creadoPor: auth.perfil?.id })
          : repo.crearBorrador({
              creadoPor: auth.perfil?.id,
              supervisorId: this.supervisorPropio?.id ?? ultimo?.supervisorId ?? null,
              sectorId: ultimo?.sectorId ?? null,
              frenteId: ultimo?.frenteId ?? null,
              capatazId: ultimo?.capatazId ?? null,
              personalPrevio: ultimo?.personal,
              maquinariaPrevia: ultimo?.maquinaria,
            })

      this.actual = await repo.guardar(reporte)
      await this.listar()
      return this.actual
    },

    /** Trae un borrador que se quedó a medio llenar en OTRO dispositivo (el
     * historial remoto lo encuentra porque ahora los borradores también se
     * sincronizan en segundo plano, ver rdcSync.js) y lo adopta en este
     * dispositivo como si fuera propio, para poder seguir editándolo acá.
     * Si el supervisor sigue tocando el original en el otro dispositivo
     * después de esto, gana el que sincronice último — es el trade-off
     * aceptado de que esto sea automático y no pida confirmación. */
    async adoptarRemoto(id) {
      const completo = await obtenerReporteCompleto(id)
      if (!completo) return null
      // adoptar(), no guardar(): actualizadoEn tiene que seguir siendo
      // cuándo se editó de verdad el contenido (lo que ya trae calculado
      // obtenerReporteCompleto desde el servidor), no el instante en que
      // este dispositivo lo adoptó — si no, el sincronizador de fondo
      // pensaría que este dispositivo lo editó recién y lo volvería a
      // subir sin necesidad en el próximo ciclo.
      this.actual = await repo.adoptar(completo)
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
      //
      // Los dos `.catch()` son imprescindibles y no cosméticos: sin ellos,
      // si UN SOLO guardado fallaba alguna vez (una escritura rechazada,
      // una cuota de almacenamiento llena, lo que sea), `colaGuardado`
      // quedaba rechazada PARA SIEMPRE — cualquier `.then()` que se le
      // encadene después hereda ese rechazo sin ejecutarse. Como `abrir()`
      // ahora espera esta misma cola antes de leer un borrador, esa única
      // falla bastaba para que la app se quedara colgada en "Cargando…"
      // para siempre, en cualquier borrador, no solo el que falló. El
      // primer `.catch()` ignora si el guardado ANTERIOR falló (para poder
      // intentar este de todas formas); el segundo evita que ESTE intento,
      // si falla, vuelva a romper la cola para el que venga después.
      colaGuardado = colaGuardado
        .catch(() => {})
        .then(() => (this.actual ? repo.guardar(this.actual) : null))
        .catch((error) => console.error('No se pudo guardar el reporte RDC', error))
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

    /** Borra un borrador tanto de este dispositivo como del servidor.
     *
     * Antes solo borraba local, y eso alcanzaba mientras los borradores no
     * se sincronizaban. Ahora que sí lo hacen (para poder seguir un reporte
     * en otro dispositivo), borrar solo acá dejaba la copia que ya había
     * subido a la nube viva para siempre: reaparecía en el historial (de
     * este dispositivo y de cualquier otro) como un borrador "zombie" que
     * nadie podía volver a tocar, porque nunca existió un botón para
     * borrar algo que no fuera local.
     *
     * `id` puede ser de un borrador que solo existe local (todavía no
     * sincronizó), solo remoto (se creó o se adoptó en otro dispositivo y
     * nunca llegó a este), o ambos — de ahí que cada mitad se intente por
     * separado y no una dependa de que la otra haya encontrado algo. */
    async eliminarBorrador(id) {
      const local = await repo.obtener(id)
      if (local) {
        if (local.estado !== ESTADO.BORRADOR) throw new Error('Solo se pueden borrar reportes que todavía son borrador.')
        await repo.eliminarBorrador(id)
      }

      try {
        await eliminarReporteRemoto(id)
      } catch (e) {
        // Sin conexión no es un error real: no hay nada que este
        // dispositivo pueda hacer ahora mismo, y no existe (todavía) una
        // cola de "borrados pendientes" para reintentar solo. Con
        // conexión sí es un fallo real (por ejemplo, RLS lo rechazó porque
        // ya no es Borrador) y hay que avisarlo.
        if (navigator.onLine) throw e
      }

      if (this.actual?.id === id) this.actual = null
      await this.listar()
      await this.cargarHistorico()
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

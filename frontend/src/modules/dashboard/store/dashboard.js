import { defineStore } from 'pinia'
import {
  listarFrentesEnCampo,
  listarFrentesProximos,
  listarFrentesParalizados,
  listarMapaActividad,
} from '../services/dashboardService'

const hoy = new Date()

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    frentesEnCampo: [],
    frentesProximos: [],
    frentesParalizados: [],
    cargando: false,
    actualizadoEn: null,
    // null = viendo "ahora" (ayer/hoy); con fecha, la tarjeta de Frentes en
    // campo quedó anclada a un día pasado que el usuario eligió.
    fechaFrentesCampo: null,
    cargandoFrentesCampo: false,

    // Mapa de actividad: mes que se está mirando (1-12), arranca en el mes
    // actual — { frentes, reportes } tal como lo arma fn_dashboard_mapa_actividad.
    mapaActividadAnio: hoy.getFullYear(),
    mapaActividadMes: hoy.getMonth() + 1,
    mapaActividad: { frentes: [], reportes: [] },
    cargandoMapaActividad: false,
    // Número de la última consulta del mapa: si el usuario cambia de mes
    // varias veces seguidas, solo cuenta la respuesta de la ÚLTIMA — una
    // respuesta vieja que llega tarde ya no pisa el mes que se está mirando.
    solicitudMapaActividad: 0,
    solicitudFrentesCampo: 0,
  }),

  actions: {
    /**
     * Cada panel solo se pide si el usuario tiene el permiso del módulo que
     * lo alimenta, y cada uno se atrapa por separado: si uno falla (o el rol
     * no tiene acceso a esa tabla) el resto del dashboard igual se pinta.
     */
    async cargar(permisos) {
      this.cargando = true
      const tareas = []

      if (permisos.rdcCampo) {
        tareas.push(
          listarFrentesEnCampo()
            .then((v) => (this.frentesEnCampo = v))
            .catch(() => {}),
          this.pedirMapaActividad().catch(() => {})
        )
      }
      if (permisos.frentes) {
        tareas.push(
          listarFrentesProximos()
            .then((v) => (this.frentesProximos = v))
            .catch(() => {}),
          listarFrentesParalizados()
            .then((v) => (this.frentesParalizados = v))
            .catch(() => {})
        )
      }
      await Promise.all(tareas)
      this.actualizadoEn = new Date()
      this.cargando = false
    },

    /** Re-pide solo la tarjeta de Frentes en campo, para otra fecha (o
     * `null` para volver a "ahora") — sin recargar el resto del dashboard. */
    async cargarFrentesEnCampo(fecha) {
      // Igual que el mapa: si se cambia la fecha varias veces seguidas, solo
      // vale la respuesta de la última consulta.
      const solicitud = ++this.solicitudFrentesCampo
      this.cargandoFrentesCampo = true
      this.fechaFrentesCampo = fecha ?? null
      try {
        const datos = await listarFrentesEnCampo(fecha ?? undefined)
        if (solicitud !== this.solicitudFrentesCampo) return
        this.frentesEnCampo = datos
        this.actualizadoEn = new Date()
      } finally {
        if (solicitud === this.solicitudFrentesCampo) this.cargandoFrentesCampo = false
      }
    },

    /** Navega el mapa de actividad a otro mes (delta: -1 mes anterior, +1
     * mes siguiente) y vuelve a pedir sus datos. */
    async cambiarMesMapaActividad(delta) {
      const base = new Date(this.mapaActividadAnio, this.mapaActividadMes - 1 + delta, 1)
      this.mapaActividadAnio = base.getFullYear()
      this.mapaActividadMes = base.getMonth() + 1
      try {
        await this.pedirMapaActividad()
      } catch (e) {
        console.error('No se pudo cargar el mapa de actividad', e)
      }
    },

    /** Pide los datos del mes que se está mirando. Solo aplica la respuesta si
     * sigue siendo la consulta más reciente (si no, el mapa mostraba reportes
     * de un mes con las columnas de otro: todas las celdas quedaban vacías). */
    async pedirMapaActividad() {
      const solicitud = ++this.solicitudMapaActividad
      this.cargandoMapaActividad = true
      try {
        const datos = await listarMapaActividad(this.mapaActividadAnio, this.mapaActividadMes)
        if (solicitud !== this.solicitudMapaActividad) return
        this.mapaActividad = datos
        this.actualizadoEn = new Date()
      } finally {
        if (solicitud === this.solicitudMapaActividad) this.cargandoMapaActividad = false
      }
    },
  },
})

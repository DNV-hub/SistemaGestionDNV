import { defineStore } from 'pinia'
import { supabase } from '../services/supabaseClient'
import { conTiempoLimite } from '../utils/conTiempoLimite'

// El perfil y los permisos se guardan en el navegador para que la aplicación
// se pueda usar sin red. Los supervisores del RDC trabajan en mina sin señal:
// si al abrir la app no se puede consultar la base, quedarse sin permisos
// equivale a quedarse sin aplicación, y eso sería una regresión respecto del
// RDC de hoy, que funciona offline.
//
// El riesgo asumido es que un permiso revocado siga viéndose hasta la próxima
// carga con conexión. Es aceptable porque el menú no es la barrera real: cada
// consulta y cada escritura vuelven a pasar por RLS en la base de datos, que
// no usa esta caché.
const CLAVE_CACHE = 'dnv_perfil_v1'

function leerCache() {
  try {
    const crudo = localStorage.getItem(CLAVE_CACHE)
    if (!crudo) return null
    const cache = JSON.parse(crudo)
    return cache?.perfil ? cache : null
  } catch {
    return null
  }
}

function guardarCache(perfil, permisos) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify({ perfil, permisos }))
  } catch {
    // Sin espacio o en modo privado: se sigue funcionando, solo que la próxima
    // apertura sin red pedirá conexión.
  }
}

function borrarCache() {
  try {
    localStorage.removeItem(CLAVE_CACHE)
  } catch {
    /* nada que hacer */
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null,
    perfil: null, // fila de public.usuarios (incluye rol_id, frente_id, estado)
    permisos: [], // códigos de permisos del rol actual
    cargando: true,
  }),

  getters: {
    // No es solo "hay sesión viva": también cuenta tener un perfil en
    // caché sin haber confirmado un cierre de sesión real. `perfil` se
    // limpia a `null` en los dos únicos lugares donde SÍ hay un cierre de
    // sesión de verdad (signOut() y el SIGNED_OUT de onAuthStateChange con
    // conexión) — nunca por un fallo de red. Ver el comentario de init()
    // para el caso concreto que esto resuelve. La seguridad real no
    // depende de esto: cada consulta a Supabase se valida con RLS, que no
    // usa esta caché.
    estaAutenticado: (state) => !!state.session || !!state.perfil,
    nombreRol: (state) => state.perfil?.roles?.nombre ?? null,
  },

  actions: {
    tienePermiso(codigo) {
      return this.permisos.includes(codigo)
    },

    async init() {
      // main.js espera a que init() termine ANTES de montar la app entera
      // (ver el comentario de ahí) — así que si getSession() se cuelga
      // (típico al volver de un rato largo sin señal: el token ya venció y
      // el intento de renovarlo se queda esperando una red que recién está
      // volviendo), la pantalla se queda en negro de verdad, sin ni
      // siquiera el "Cargando…" de App.vue, porque App.vue todavía no
      // existe. `conTiempoLimite` corta esa espera a los 8s en vez de
      // dejarla colgada el minuto entero que reportó un usuario en iPhone.
      let sesion = null
      let seConsulto = false
      try {
        const { data } = await conTiempoLimite(supabase.auth.getSession(), 8000)
        sesion = data.session
        seConsulto = true
      } catch {
        // No se pudo confirmar a tiempo — se sigue como en el caso de
        // "sin conexión" de abajo, con lo último que se sabía.
      }
      this.session = sesion

      if (this.session) {
        // Primero la copia local, para que la interfaz esté utilizable de
        // inmediato aunque no haya red; después se intenta refrescar.
        this.aplicarCache()
        await this.cargarPerfil()
      } else if (!seConsulto || !navigator.onLine) {
        // Esto es lo que resuelve "en Android, cada vez que vuelvo a la
        // app me manda al login": init() corre una sola vez, al cargar la
        // página — pero un navegador móvil descarta de memoria una pestaña
        // en segundo plano (pantalla apagada, cambio de app) y la recrea
        // de cero al volver, así que en la práctica init() se repite en
        // cada regreso. Si en ESE instante todavía no hay señal (típico
        // recién despertando el teléfono) o la consulta se cortó por
        // tardanza, no se puede confirmar si el token vencido se puede
        // renovar y "sesión nula" no significa que la sesión haya muerto
        // de verdad, solo que todavía no se pudo preguntar. Sin este
        // `else if`, esa duda se trataba como cierre de sesión real y
        // mandaba al supervisor al login sin haber cerrado sesión nunca.
        // Se entra con lo último que se sabía (el perfil en caché); en
        // cuanto vuelva la señal, el listener de abajo corrige solo si la
        // sesión sí venció de verdad.
        this.aplicarCache()
      }
      this.cargando = false

      supabase.auth.onAuthStateChange(async (_evento, session) => {
        // Un fallo de renovación del token sin conexión no puede cerrar la
        // sesión: el supervisor se quedaría fuera de la app en pleno frente,
        // sin forma de volver a entrar hasta recuperar señal. Solo se acepta
        // el cierre de sesión cuando hay red para confirmarlo.
        if (!session && !navigator.onLine) return

        this.session = session
        if (session) {
          await this.cargarPerfil()
        } else {
          this.perfil = null
          this.permisos = []
          borrarCache()
        }
      })
    },

    aplicarCache() {
      const cache = leerCache()
      if (!cache) return false
      this.perfil = cache.perfil
      this.permisos = cache.permisos ?? []
      return true
    },

    async cargarPerfil() {
      // Misma protección que en init(): esta consulta también puede
      // colgarse con la red recién recuperándose, y también la espera
      // main.js antes de montar la app.
      let usuario, error
      try {
        const resultado = await conTiempoLimite(
          supabase.from('usuarios').select('*, roles(id, nombre)').eq('id', this.session.user.id).single(),
          8000
        )
        usuario = resultado.data
        error = resultado.error
      } catch (e) {
        // Se corta por tardanza: se trata igual que un fallo de red (sin
        // código de PostgREST), nunca como "el perfil no existe".
        usuario = null
        error = { message: e?.message }
      }

      if (error || !usuario) {
        // Distinguir "no se pudo preguntar" de "la respuesta fue que no
        // existe". Un error de red no trae código de PostgREST; ante eso se
        // conserva lo que haya en caché en vez de dejar al usuario sin
        // permisos. Si el servidor sí respondió, el perfil realmente no está
        // y hay que limpiarlo.
        const esFalloDeRed = !error?.code
        if (esFalloDeRed && this.aplicarCache()) return

        console.error('No se pudo cargar el perfil del usuario', error)
        this.perfil = null
        this.permisos = []
        borrarCache()
        return
      }

      this.perfil = usuario

      let permisos, errorPermisos
      try {
        const resultado = await conTiempoLimite(
          supabase.from('rol_permisos').select('permisos(codigo)').eq('rol_id', usuario.rol_id),
          8000
        )
        permisos = resultado.data
        errorPermisos = resultado.error
      } catch (e) {
        permisos = null
        errorPermisos = { message: e?.message }
      }

      // Mismo criterio: si los permisos no llegaron por falta de red (o por
      // tardanza), se mantienen los de la copia local en vez de dejar el
      // menú vacío.
      if (errorPermisos && !errorPermisos.code) {
        const cache = leerCache()
        if (cache?.permisos?.length) {
          this.permisos = cache.permisos
          return
        }
      }

      this.permisos = (permisos ?? []).map((rp) => rp.permisos.codigo)
      guardarCache(this.perfil, this.permisos)
    },

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await this.cargarPerfil()
    },

    async signOut() {
      await supabase.auth.signOut()
      this.perfil = null
      this.permisos = []
      borrarCache()
    },
  },
})

import { defineStore } from 'pinia'
import { supabase } from '../services/supabaseClient'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null,
    perfil: null, // fila de public.usuarios (incluye rol_id, frente_id, estado)
    permisos: [], // códigos de permisos del rol actual
    cargando: true,
  }),

  getters: {
    estaAutenticado: (state) => !!state.session,
    nombreRol: (state) => state.perfil?.roles?.nombre ?? null,
  },

  actions: {
    tienePermiso(codigo) {
      return this.permisos.includes(codigo)
    },

    async init() {
      const { data } = await supabase.auth.getSession()
      this.session = data.session
      if (this.session) await this.cargarPerfil()
      this.cargando = false

      supabase.auth.onAuthStateChange(async (_event, session) => {
        this.session = session
        if (session) {
          await this.cargarPerfil()
        } else {
          this.perfil = null
          this.permisos = []
        }
      })
    },

    async cargarPerfil() {
      const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('*, roles(id, nombre)')
        .eq('id', this.session.user.id)
        .single()

      if (error || !usuario) {
        console.error('No se pudo cargar el perfil del usuario', error)
        this.perfil = null
        this.permisos = []
        return
      }

      this.perfil = usuario

      const { data: permisos } = await supabase
        .from('rol_permisos')
        .select('permisos(codigo)')
        .eq('rol_id', usuario.rol_id)

      this.permisos = (permisos ?? []).map((rp) => rp.permisos.codigo)
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
    },
  },
})

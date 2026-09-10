import { defineStore } from 'pinia'
import {
  listarUsuarios,
  listarRoles,
  listarFrentes,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  desvincularSupervisorPrueba,
  restablecerPassword,
} from '../services/usuariosService'

export const useUsuariosStore = defineStore('usuarios', {
  state: () => ({
    usuarios: [],
    roles: [],
    frentes: [],
    cargando: false,
    error: '',
  }),

  actions: {
    async cargar() {
      this.cargando = true
      this.error = ''
      try {
        const [usuarios, roles, frentes] = await Promise.all([listarUsuarios(), listarRoles(), listarFrentes()])
        this.usuarios = usuarios
        this.roles = roles
        this.frentes = frentes
      } catch (e) {
        this.error = 'No se pudo cargar los usuarios.'
        console.error(e)
      } finally {
        this.cargando = false
      }
    },

    async crear(payload) {
      const { usuario, passwordTemporal } = await crearUsuario(payload)
      this.usuarios.push(usuario)
      this.usuarios.sort((a, b) => a.nombre.localeCompare(b.nombre))
      return { usuario, passwordTemporal }
    },

    async actualizar(id, payload) {
      const usuario = await actualizarUsuario(id, payload)
      const idx = this.usuarios.findIndex((u) => u.id === id)
      if (idx !== -1) this.usuarios[idx] = usuario
      return usuario
    },

    async restablecerPassword(id, password) {
      return restablecerPassword(id, password)
    },

    async eliminar(id) {
      const resultado = await eliminarUsuario(id)
      if (resultado.eliminado) {
        this.usuarios = this.usuarios.filter((u) => u.id !== id)
      } else {
        const idx = this.usuarios.findIndex((u) => u.id === id)
        if (idx !== -1) this.usuarios[idx] = { ...this.usuarios[idx], estado: 'inactivo' }
      }
      return resultado
    },

    /** Solo Developer: cuando eliminar() cae a "desactivar" porque el
     * usuario está vinculado al catálogo de supervisores del RDC, esto
     * rompe ese vínculo puntual y reintenta el borrado real. */
    async forzarEliminacion(id) {
      await desvincularSupervisorPrueba(id)
      return this.eliminar(id)
    },
  },
})

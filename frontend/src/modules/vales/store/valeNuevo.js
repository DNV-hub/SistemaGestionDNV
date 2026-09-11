import { defineStore } from 'pinia'

// Estado del vale que se está armando en la hoja a pantalla completa
// (docs/mockups/04-vale-nuevo.html + 05-selector-material.html) — vive en
// un store aparte porque son DOS rutas distintas (el vale, y el selector de
// material a pantalla completa) que necesitan compartir esto sin pasarlo
// por query params.
export const useValeNuevoStore = defineStore('valeNuevo', {
  state: () => ({
    frenteId: '',
    lineas: [], // [{ material_id, codigo, descripcion, unidad, cantidad, disponible }]
    observaciones: '',
  }),

  actions: {
    reiniciar() {
      this.frenteId = ''
      this.lineas = []
      this.observaciones = ''
    },

    /** `material` viene de `vales.stockPorMaterial` — solo se puede agregar
     * lo que realmente hay, y `disponible` es el tope que va a respetar el
     * campo de cantidad en la pantalla del vale. */
    agregarMaterial(material) {
      if (this.lineas.some((l) => l.material_id === material.id)) return
      this.lineas.push({
        material_id: material.id,
        codigo: material.codigo,
        descripcion: material.descripcion,
        unidad: material.unidad,
        cantidad: 1,
        disponible: material.disponible,
      })
    },

    quitarMaterial(materialId) {
      this.lineas = this.lineas.filter((l) => l.material_id !== materialId)
    },
  },
})

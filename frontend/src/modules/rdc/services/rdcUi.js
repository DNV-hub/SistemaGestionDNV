import { reactive } from 'vue'

// Estado de pantalla compartido entre los pasos Metrado y Bitácora del
// formulario móvil. No se guarda ni se sincroniza: solo coordina las dos
// pantallas mientras el supervisor llena el reporte.
export const rdcUi = reactive({
  // id del reporte para el que se marcó "Hoy no hubo avance de partidas".
  sinAvanceId: null,
  // Sección de Metrado que debe abrirse al volver ("pre" | "cri" | "com").
  seccionPedida: null,
  // Paso al que reabrir el formulario tras salir (p. ej. a «Ver avance»).
  pasoVolver: null,
})

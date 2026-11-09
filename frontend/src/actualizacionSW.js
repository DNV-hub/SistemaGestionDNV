import { ref } from 'vue'

// El Service Worker (PWA) se actualiza solo en segundo plano cada vez que
// hay un deploy nuevo, pero la pestaña que ya estaba abierta se queda
// sirviendo la versión vieja hasta que alguien la recarga. Sin avisar nada,
// eso se sentía como "recargué y no aparecen los reportes, tuve que
// recargar de nuevo" — el primer F5 caía justo en la ventana en la que el
// Service Worker nuevo ya había tomado el control pero la página todavía
// tenía en memoria recursos de la versión vieja a medio mezclar con la
// nueva; el segundo F5 arrancaba limpio.
//
// No se recarga sola: un reload sorpresivo en medio de un formulario con
// cambios sin guardar (un ingreso, un vale) sería peor que el problema que
// resuelve. En vez de eso, se avisa con un banner y el usuario decide
// cuándo — igual que hacen Gmail, Slack, etc.
export const hayActualizacionSW = ref(false)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    hayActualizacionSW.value = true
  })

  // El navegador solo compara el Service Worker contra el servidor cuando la
  // página se recarga por completo — alguien que deja la app abierta sin
  // cerrarla ni recargarla (el caso típico de un usuario de escritorio, como
  // Planeamiento) puede tardar horas en enterarse de que hay un deploy
  // nuevo, aunque ya esté listo desde hace rato. Revisar cada pocos minutos
  // mientras la app sigue abierta hace que el banner de "Hay una versión
  // nueva" aparezca solo, sin depender de que alguien recargue a mano.
  navigator.serviceWorker.ready.then((registration) => {
    setInterval(() => registration.update(), 2 * 60 * 1000)
  })
}

export function aplicarActualizacionSW() {
  window.location.reload()
}

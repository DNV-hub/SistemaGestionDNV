// Evita que una pantalla se quede "Cargando…" para siempre si una consulta
// se cuelga (una conexión inestable en el celular, un token que tarda en
// refrescarse) sin llegar nunca a resolver ni a rechazar. Sin esto, el único
// escape que tiene el usuario es adivinar que hay que recargar la página.
export function conTiempoLimite(promesa, ms = 20000, mensaje = 'La operación tardó demasiado. Revisa tu conexión e intenta de nuevo.') {
  return Promise.race([
    promesa,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ])
}

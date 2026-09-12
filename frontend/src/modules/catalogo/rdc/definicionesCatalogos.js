// Definición declarativa de los catálogos del RDC que se administran desde
// aquí (todos menos Materiales, que ya tenía su propia pantalla, y Capataces,
// que el usuario pidió aparte por ser el que más se toca). Una sola tabla
// genérica (TablaCatalogo.vue) sabe leer esto y dibujar cualquiera de los
// nueve catálogos — así, agregar un décimo el día de mañana es escribir un
// objeto más acá, no una pantalla nueva de cero.
//
// `opciones` en una columna de tipo 'seleccion' es una CLAVE, no la lista en
// sí: la lista real depende de datos que se cargan en tiempo de ejecución
// (los sectores para elegir en Frentes, las cuentas de usuarios para
// vincular en Supervisores) y vive en CatalogosRdcView.vue, no aquí — este
// archivo es solo forma, no datos.
export const CATALOGOS_RDC = [
  {
    clave: 'sectores',
    etiqueta: 'Sectores',
    tabla: 'rdc_sectores',
    campoActivo: 'activo',
    columnas: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'frentes',
    etiqueta: 'Frentes',
    tabla: 'rdc_frentes',
    campoActivo: 'activo',
    columnas: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'sector_id', etiqueta: 'Sector', tipo: 'seleccion', opciones: 'sectores', requerido: true },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'supervisores',
    etiqueta: 'Supervisores',
    tabla: 'rdc_supervisores',
    campoActivo: 'activo',
    // Catálogo aparte de Usuarios a propósito: un supervisor de campo existe
    // en este catálogo desde antes de tener cuenta en el Sistema (así nació
    // el RDC), y algunos nunca llegan a tenerla. `usuario_id` es el puente
    // hacia Usuarios cuando sí existe, no un reemplazo de ese catálogo.
    columnas: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'usuario_id', etiqueta: 'Cuenta vinculada', tipo: 'seleccion', opciones: 'usuarios', permiteVacio: true },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'redline',
    etiqueta: 'Redline (contratista)',
    tabla: 'rdc_redline_supervisores',
    campoActivo: 'activo',
    columnas: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'maquinarias',
    etiqueta: 'Maquinaria',
    tabla: 'rdc_maquinarias',
    campoActivo: 'activo',
    columnas: [
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'texto', requerido: true },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'seleccion', opciones: 'categoriaMaquinaria', requerido: true },
      { clave: 'modelo', etiqueta: 'Modelo', tipo: 'texto' },
      { clave: 'placa', etiqueta: 'Placa', tipo: 'texto' },
      { clave: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto' },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'partidasEstandar',
    etiqueta: 'Partidas estándar',
    tabla: 'rdc_partidas_estandar',
    campoActivo: 'activo',
    columnas: [
      { clave: 'bloque', etiqueta: 'Bloque', tipo: 'seleccion', opciones: 'bloquePartida', requerido: true },
      { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true },
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto', requerido: true },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  // Los tres de abajo dependen de un frente (docs/MODELO_RDC.md): antes de
  // mostrar la tabla, la pantalla pide elegir uno. `porFrente: true` es lo
  // que le dice a CatalogosRdcView.vue que muestre ese selector y filtre.
  {
    clave: 'prefijos',
    etiqueta: 'Prefijos',
    tabla: 'rdc_prefijos',
    campoActivo: 'activo',
    porFrente: true,
    columnas: [
      { clave: 'zona', etiqueta: 'Zona', tipo: 'texto', requerido: true },
      { clave: 'sostenimiento', etiqueta: 'Sostenimiento', tipo: 'texto', requerido: true },
      { clave: 'prefijo', etiqueta: 'Prefijo(s)', tipo: 'texto' },
      { clave: 'plano', etiqueta: 'Plano', tipo: 'texto' },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'partidasEdt',
    etiqueta: 'Partidas EDT',
    tabla: 'rdc_partidas_edt',
    campoActivo: 'activo',
    porFrente: true,
    columnas: [
      { clave: 'codigo_edt', etiqueta: 'Código EDT', tipo: 'texto', requerido: true },
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto', requerido: true },
      { clave: 'seccion', etiqueta: 'Sección', tipo: 'texto' },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'pernos',
    etiqueta: 'Biblioteca de pernos',
    tabla: 'rdc_pernos_biblioteca',
    // Sin columna `activo` en la tabla (a diferencia de los demás catálogos):
    // acá borrar es borrar de verdad. Si un perno estuviera referenciado por
    // algo real, la propia base rechaza el borrado con una violación de
    // llave foránea antes de que se pierda nada.
    campoActivo: null,
    porFrente: true,
    columnas: [
      { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true },
      { clave: 'zona', etiqueta: 'Zona', tipo: 'texto' },
      { clave: 'sistema', etiqueta: 'Sistema', tipo: 'texto' },
      { clave: 'ubicacion', etiqueta: 'Ubicación', tipo: 'texto' },
      { clave: 'diametro', etiqueta: 'Diámetro', tipo: 'numero' },
      { clave: 'longitud', etiqueta: 'Longitud', tipo: 'numero' },
      { clave: 'angulo', etiqueta: 'Ángulo', tipo: 'texto' },
      { clave: 'plano', etiqueta: 'Plano', tipo: 'texto' },
    ],
  },
]

export const OPCIONES_FIJAS = {
  categoriaMaquinaria: [
    { value: 'perforacion', label: 'Perforación' },
    { value: 'soporte', label: 'Soporte' },
  ],
  bloquePartida: [
    { value: 1, label: '1 — Preliminares' },
    { value: 3, label: '3 — Complementarias' },
  ],
}

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
  // Sectores y Frentes NO son catálogos propios del RDC (a diferencia de los
  // siete de abajo): son las mismas tablas `sectores`/`frentes` que ya usa
  // el resto del Sistema (Vales, Kardex, Procura, Almacén) desde la
  // migración 20260911170000 — una sola fuente. Sectores no tiene pantalla
  // propia en ningún otro lado, así que se administra desde acá. Frentes SÍ
  // la tiene (el módulo Frentes, para Planeamiento) — a propósito de que el
  // usuario pidió no tener dos pantallas que editen lo mismo, acá queda
  // `soloLectura` (ver TablaCatalogo.vue): se ve para poder elegir un
  // frente al administrar Prefijos/Partidas EDT/Pernos, pero cualquier alta,
  // baja o cambio se hace en /frentes.
  {
    clave: 'sectores',
    etiqueta: 'Sectores',
    tabla: 'sectores',
    campoActivo: 'activo',
    columnas: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'orden', etiqueta: 'Orden', tipo: 'numero' },
    ],
  },
  {
    clave: 'frentes',
    etiqueta: 'Frentes',
    tabla: 'frentes',
    campoActivo: null,
    ordenarPor: 'nombre',
    soloLectura: true,
    columnas: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'sector_id', etiqueta: 'Sector', tipo: 'seleccion', opciones: 'sectores', requerido: true },
      { clave: 'codigo', etiqueta: 'Código', tipo: 'texto' },
      { clave: 'area', etiqueta: 'Área', tipo: 'texto', requerido: true },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'seleccion', opciones: 'estadoFrente', requerido: true },
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
      { clave: 'seccion', etiqueta: 'Grupo', tipo: 'texto' },
      { clave: 'unidad', etiqueta: 'U.M.', tipo: 'texto', requerido: true },
      { clave: 'metrado_previsto', etiqueta: 'Previsto', tipo: 'numero' },
      // Cómo se calcula el acumulado de esta partida (Fase 3/4): digitado =
      // el supervisor tipea la cantidad de hoy; los otros tres se derivan
      // solos de lo que ya reporta el bloque de pernos/malla/cable del RDC.
      { clave: 'tipo_medicion', etiqueta: 'Medición', tipo: 'seleccion', opciones: 'tipoMedicion', requerido: true },
      // Solo hacen falta cuando Medición es "Suma de paños"/"Suma de tramos"
      // (la base lo exige con un check) — para "Conteo de pernos" no se
      // necesita tipo_filtro porque un perno no tiene "tipos" distintos como
      // sí los tiene la malla o el cable.
      { clave: 'zona_filtro', etiqueta: 'Zona (opcional)', tipo: 'texto' },
      { clave: 'tipo_filtro', etiqueta: 'Tipo (malla/cable)', tipo: 'texto' },
      // Solo para "Suma de ML de pernos" (la base lo exige con un check):
      // ubicación de rdc_reporte_elementos a sumar — admite varias
      // separadas por coma (ej. "Pie,Pie de banqueta"), mismo criterio que
      // rdc_prefijos.prefijo. Los factores ponderan Perforación/Inyección —
      // 1/0 por defecto da el ML completo para una partida de solo
      // perforación, sin que haga falta configurar nada.
      { clave: 'ubicacion_filtro', etiqueta: 'Ubicación (pernos)', tipo: 'texto' },
      { clave: 'factor_perforacion', etiqueta: 'Factor perforación', tipo: 'numero' },
      { clave: 'factor_inyeccion', etiqueta: 'Factor inyección', tipo: 'numero' },
      { clave: 'rendimiento_cantidad', etiqueta: 'Rend. ref. (cant./persona-día)', tipo: 'numero' },
      { clave: 'rendimiento_minimo', etiqueta: 'Rend. mínimo', tipo: 'numero' },
      { clave: 'rendimiento_maximo', etiqueta: 'Rend. máximo', tipo: 'numero' },
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
    // Tampoco tiene columna `orden` (a diferencia de los demás catálogos):
    // se ordena por código, que es su llave de negocio real.
    ordenarPor: 'codigo',
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
  // 'digitado' ya no se ofrece acá a propósito: quedó obsoleto (ver
  // DICCIONARIO_DATOS.md) — el bloque del RDC que lo hacía funcionar se
  // quitó, y las partidas que todavía lo tenían se reclasificaron. El valor
  // sigue siendo válido en la base (constraint sin tocar) por si queda
  // alguna fila histórica, pero nadie debería poder elegirlo de nuevo.
  tipoMedicion: [
    { value: 'solo_seguimiento', label: 'Solo seguimiento (no sale en el RDC)' },
    { value: 'conteo_pernos', label: 'Conteo de pernos' },
    { value: 'suma_ml_pernos', label: 'Suma de ML de pernos (por ubicación)' },
    { value: 'suma_panos_malla', label: 'Suma de paños de malla' },
    { value: 'suma_tramos_cable', label: 'Suma de tramos de cable' },
  ],
  estadoFrente: [
    { value: 'planificado', label: 'Planificado' },
    { value: 'proximo', label: 'Próximo' },
    { value: 'activo', label: 'Activo' },
    { value: 'paralizado', label: 'Paralizado' },
    { value: 'cerrado', label: 'Cerrado' },
  ],
}

# Modelo de datos del RDC — ingeniería inversa (Fase A.1)

Estado: **entregable para revisión**. Este documento describe cómo funciona HOY la
aplicación RDC en producción. No propone tablas todavía (eso es A.2): documenta lo
que existe, para que el diseño del esquema se derive del código real y no de
suposiciones (restricción 7 del plan).

Fuente: copia de solo lectura en `_referencia-rdc/` (el original en OneDrive no se
tocó). Archivos leídos: `js/rdc.js` (3316 líneas), `js/config.js` (449),
`js/admin.js` (550), `js/supabase.js` (127), `js/navegacion.js` (121),
`js/fotos.js` (234), `index.html` (945). Las referencias de línea apuntan a esa copia.

---

## 0. Resumen ejecutivo — lo que hay que leer sí o sí

Tres hallazgos cambian supuestos del plan de migración. Están desarrollados más
abajo, pero conviene tenerlos presentes desde el inicio:

1. **El payload al webhook NO contiene los datos del reporte.** Contiene un archivo
   **Excel completo codificado en base64**. El contrato real con Power Automate /
   SharePoint no es un JSON de campos: es la **estructura del workbook** (8 hojas,
   con columnas y orden específicos). Ver §3.
2. **El personal no es nominal: son conteos por categoría.** El reporte no sabe
   *quiénes* fueron, solo *cuántos* de cada tipo. Y la maquinaria no tiene
   horómetros, solo cantidad de equipos presentes. Las tablas `rdc_personal` y
   `rdc_maquinaria` esbozadas en el plan (§A.2) no corresponden al dato real. Ver §5.
3. **La clave de negocio hoy es `frente + fecha`, y no existe el concepto de turno.**
   El nombre del archivo que se sube a SharePoint es literalmente
   `{frente}_{fecha}.xlsx`. La constraint propuesta en el plan
   (supervisor + frente + fecha + turno) es más fina que la realidad y cambiaría el
   comportamiento actual. Ver §7.1.

---

## 1. Arquitectura actual en una frase

El RDC es un formulario de una sola página que vive **íntegramente en el
navegador**: todo el estado está en variables globales de JS, se persiste en
`localStorage`, y al terminar se convierte en un Excel que se manda por HTTP POST a
un flujo de Power Automate. Supabase solo entrega catálogos de lectura; **ningún
dato del reporte se guarda en Supabase**.

```
Formulario (DOM)  →  variables globales  →  localStorage (borrador + respaldos)
                                              ↓ "Terminado y Enviar"
                              SheetJS → workbook → base64 → POST Power Automate → SharePoint
```

---

## 2. Campos capturados, por pestaña

La identidad de cada campo es su `id` en el DOM. Los tipos son los del control HTML.

### 2.1 Pestaña `datos` — identificación, personal y equipos

| Campo | id | Tipo | Origen / notas |
|---|---|---|---|
| Supervisor | `f-supervisor` | hidden | Se elige en un modal, se persiste en `localStorage['rdc_supervisor_v1']`. Ver §6 |
| Fecha | `f-fecha` | date | Se valida contra hoy al enviar, pero se permite otra fecha con confirmación (`_confirmarFechaNoHoy`, rdc.js:2750) |
| Sector | `f-sector` | select | Catálogo `sectores` de Supabase |
| Frente | `f-frente` | select | Catálogo `frentes`, filtrado por sector |
| Capataz | `f-capataz` | select | Catálogo `capataces`. **Un solo capataz nominal por reporte** |
| N° Capataz | `f-capataces` | number | Conteo, entero |
| N° Operarios | `f-operarios` | number | Conteo, entero |
| N° Oficiales | `f-oficiales` | number | Conteo, entero |
| N° Peones | `f-peones` | number | Conteo, entero |
| N° Vigías | `f-vigias` | number | Conteo, entero. Se considera mano de obra **directa** |

**Personal Sala Eléctrica** — bloque condicional: solo aparece, y solo se exporta,
cuando `sector === "A: 4000 - SALA ELECTRICA"` (comparación por **string exacto**,
rdc.js:2147 y 2261).

| Campo | id |
|---|---|
| Ingeniero residente | `f-ing-residente` |
| Supervisor de campo | `f-sup-campo` |
| Ingenieros de seguridad | `f-ing-seguridad` |
| Ingeniero de calidad | `f-ing-calidad` |
| Topógrafo | `f-topografo` |

**Equipos en frente** — array `equiposLista = [{id, nombre, cantidad}]`
(rdc.js:1151). Se alimenta de dos formas:
- 10 equipos de catálogo fijo, con stepper de cantidad:
  `EQUIPOS_PERFORACION_FIJOS` (Compresora, Perforador sobre patín, Estación
  Hidráulica, Inyectora, Martillo de mano) y `EQUIPOS_SOPORTE_FIJOS`
  (Retroexcavadora, Camión grúa, Camión Baranda, Camioneta, Minibús).
- Equipos libres ("Equipo no listado"), nombre escrito a mano + cantidad.

**No hay horómetro ni horas por equipo.** Las "Horas" que aparecen en la hoja
RECURSOS son el tiempo efectivo de jornada calculado (`_tiempoEfectivoMin()`),
idéntico para todas las filas.

### 2.2 Pestaña `jornada` — restricciones, hitos y línea de tiempo

**Restricción de acceso** (bloque condicional por checkbox):

| Campo | id |
|---|---|
| ¿Tuvo restricción? | `f-truckshop` (checkbox) |
| Descripción | `f-restriccion-desc` (textarea) |
| Hora inicio / fin | `f-restriccion-inicio` / `f-restriccion-fin` (time) |

**Hitos de jornada** — 8 hitos fijos de `HITOS_BASE` (config.js:409), cada uno con
una hora (`hito-0` … `hito-7`). El array es constante: `currentHitos` siempre vale
`HITOS_BASE` (rdc.js:9, 1069, 1570), nunca se personaliza por frente.

1. Llegada a frente de trabajo · 2. Inicio de charla de seguridad · 3. Término de
charla de seguridad · 4. Término de llenado de documentos · 5. Firma de PETAR ·
6. Inicio de actividades en piso · 7. Inicio de actividades en talud · 8. Término
de jornada

Más dos horas sueltas: `f-almuerzo-salida` y `f-almuerzo-retorno`.

> Los hitos 1 y 4 tienen una segunda función: el lapso entre "Llegada a frente" y
> "Término de llenado de documentos" se exporta automáticamente como un Stand By de
> causa "Registro documentario" (rdc.js:2431-2438).

**Línea de tiempo** — dos colecciones distintas que se muestran fusionadas:

- `bitacoraActiv = [{id, hora, horaFin, actividad}]` (rdc.js:1188) — actividades
  escritas a mano.
- `standbyRows = [{id, actividad, desde, hasta, causa, causaOtro, comentario, responsable, totalHoras, totalMinutos}]`
  (rdc.js:1441) — paradas. `causa` sale de `CAUSAS_STANDBY` (6 opciones) u `OTRO`
  (texto libre en `causaOtro`). La causa `CIERRE DE VÍAS POR ENCAPSULADOS` es
  especial: en vez de rango horario se captura un tiempo total en horas/minutos
  (`CAUSA_TIEMPO_TOTAL`, config.js:417).

### 2.3 Pestaña `metrados` — tres bloques + partidas libres

**Bloque 1 — Preliminares** (8 partidas fijas de `PARTIDAS_PRELIMINARES`):
- `blq1Valores = { índice: cantidad }`
- `blq1Horarios = { índice: {inicio, fin} }`

**Bloque 3 — Complementarias** (7 partidas fijas de `PARTIDAS_COMPLEMENTARIAS`):
- `blq3Valores`, `blq3Horarios`, misma forma.

> ⚠️ **La clave de ambos diccionarios es el índice posicional del array de
> configuración.** Si mañana se inserta una partida en medio de la lista, todos los
> borradores guardados quedan desalineados. Ya hubo una migración por esta causa
> (`_migrarBlq3TrasQuitarPullTest`, rdc.js:136, y la bandera `blq3Migrado`). En el
> modelo nuevo esto debe guardarse por **código estable de partida**, nunca por
> posición.

**Bloque 2 — Críticas**: la colección más rica del sistema.
`controlItems = [...]` (rdc.js:444, 465, 482, 505), un objeto **por cada elemento
individual** (un perno = una fila):

```js
{ id, fecha, frente, sistema, zona, elemento, tipo, actividad, codigo, ubicacion,
  cantidad, unidad, ancho, largo, diametro, plano, tipoPerforadora,
  horaInicio, horaFin, partidaCodigo, partidaNombre }
```

| Sub-formulario | elemento | actividad | unidad | Campos propios |
|---|---|---|---|---|
| Perforación | `Perno` | `Perforación` | ML | tipo (BAHE/Autoperforante), diámetro, ubicación, tipo de perforadora, letra + rango N°→N° |
| Inyección | `Perno` | `Inyección` | ML | ubicación, rango N°→N° |
| Malla | `Malla` | `Instalación` | M2 | tipo de malla, ancho × largo (área calculada) |
| Cable | `Cable` | `Instalación` | ML | tipo de cable, rango N°→N°, longitud |
| Pull Test | `Perno` | `Pull Test` | UND | rango N°→N°, cantidad = 1 por ensayo |

Los rangos generan **una fila por número** (tope de 200 por lote, rdc.js:479/504).
El código de cada elemento se arma como `prefijo + [letra] + número`, donde el
prefijo viene de la tabla `prefijos` según frente + zona + sostenimiento
(`_getPrefijosInfo`, rdc.js:51). Si no hay prefijo configurado, cae a modo manual.

**Partidas libres**: `metradosManuales = [{id, nombre, um, met}]` (rdc.js:1084).

### 2.4 Pestaña `obs` — programación, observaciones y redline

| Campo | Variable / id | Forma |
|---|---|---|
| Programación día siguiente | `progRows = [{id, label, desc}]` | N filas; `label` se elige de las partidas registradas hoy |
| Actividades no programadas | `progAdicRows = [{id, desc, nota}]` | N filas |
| Observaciones | `f-comentarios` | textarea |
| Requerimientos | `f-requerimientos` | textarea |
| Restricciones | `f-restricciones` | textarea (distinto de la restricción de acceso de §2.2) |
| ¿Hubo redline? | `redlineEstado` | chip sí/no |
| Supervisor del redline | `f-redline-supervisor` | select, catálogo `redline_supervisores` |
| Descripción del redline | `f-redline` | textarea |

### 2.5 Pestaña `resumen` — solo lectura

No captura nada. Deriva todo de lo anterior: métricas del día, tabla de metrados
ejecutados (`getPartidasEjecutadas`, rdc.js:1498), resumen de control de
sostenimiento, y el texto para WhatsApp (`buildTextoWsp`, rdc.js:1795). Contiene
los tres botones de cierre: *Terminado y Enviar*, *Descargar mi copia* y
*Modo sin señal*.

---

## 3. El payload al webhook de Power Automate ⚠️

**Este es el punto crítico de toda la migración.**

### 3.1 Lo que se manda

`terminarYEnviar()` (rdc.js:2792) hace un único POST:

```js
POST https://…powerplatform.com/…/workflows/2e23dd0cd2934ec9931530f581697367/…
Content-Type: application/json

{
  "nombreArchivo":    "{frente}_{fecha}.xlsx",   // "(C)" al final si es corrección
  "contenidoArchivo": "<workbook XLSX en base64>",
  "frente":           "OPB",
  "fecha":            "2026-09-09"
}
```

- Se considera éxito **únicamente `HTTP 202`** (rdc.js:2821). Cualquier otro código
  se trata como error.
- `contenidoArchivo` sale de
  `XLSX.write(wb, { bookType:'xlsx', type:'base64', cellStyles:true })` (rdc.js:2681).
- La URL del flujo está **hardcodeada** en `config.js:415`, firma `sig=` incluida.

**Consecuencia para la Fase C:** replicar "el payload idéntico" significa replicar
**el archivo Excel**, no un JSON de campos. El flujo de Power Automate recibe un
binario opaco y lo deposita en SharePoint; lo que sea que lea después (Power BI, un
consolidado, una plantilla) depende de las hojas y columnas de ese workbook. Por eso
la sección siguiente es, en la práctica, el contrato de integración.

### 3.2 Estructura del workbook (`_construirWorkbookRDC`, rdc.js:2500)

Ocho hojas, **en este orden**:

| # | Hoja | Filas | Columnas | Color de cabecera |
|---|---|---|---|---|
| 1 | `RDC` | 1 sola fila de datos | 38 (43 en Sala Eléctrica) | `1D4ED8` azul |
| 2 | `METRADOS` | N | 12 | `0F766E` verde azulado |
| 3 | `RECURSOS` | N | 4 | `7C3AED` violeta |
| 4 | `BITACORA` | N + tabla anexa | 5 | `374151` gris |
| 5 | `CONTROL_SOSTENIMIENTO` | N | 22 | `15803D` verde |
| 6 | `STAND_BY` | N | 18 | `DC2626` rojo |
| 7 | `REPORTE_WSP` | N | 1 | — |
| 8 | `TELEMETRIA` | N | 5 | oculta; solo si hubo navegación |

**Hoja `RDC`** (`_buildRdcRow`, rdc.js:2102) — una fila horizontal, en este orden:

1. `Fecha` (texto `DD/MM/YYYY`, ver §3.3), `Sector`, `Frente`, `Capataz`, `Supervisor`
2. `N° Capataz`, `N° Operarios`, `N° Oficiales`, `N° Peones`, `N° Vigías` (numéricos)
3. Los 8 hitos, cada uno con su nombre completo como encabezado
4. `Salida refrigerio`, `Retorno refrigerio`
5. Los 10 equipos fijos, cada uno con su nombre como encabezado
6. `Otro`, `Otro` — **dos columnas con el mismo nombre**: la primera es el texto
   `"nombre (cantidad); …"` de los equipos libres, la segunda su suma
7. `Observaciones`, `Requerimientos`, `Restricciones`, `Redline - Supervisor Hegatrux`, `Redline - Descripción`
8. **Solo si el sector es Sala Eléctrica**: `Ingeniero residente`, `Supervisor de campo`, `Ingenieros de seguridad`, `Ingeniero de calidad`, `Topógrafo`
9. `Total Standby (hh:mm)`

> ⚠️ **El número de columnas varía según el sector.** `Total Standby` está en la
> columna 38 para un reporte normal y en la 43 para Sala Eléctrica. Si el flujo de
> Power Automate lee por posición de columna y no por encabezado, este
> comportamiento hay que preservarlo exactamente. **Requiere verificación con el
> flujo real** (ver §8, punto 2).

**Hoja `METRADOS`** (rdc.js:2167) — 12 columnas fijas:
`Fecha | Frente | Bloque | Partida | Unidad | Metrado | Hora Inicio | Hora Fin | Duración (h) | Rendimiento | N° Pernos | Pernos/h`

Los bloques se escriben con las etiquetas literales `1. Preliminares`,
`2. Críticas`, `3. Complementarias` y `Libre`. El bloque 2 se emite **agregado**
(un renglón por tipo de actividad: Perforaciones, Inyecciones, Instalación de
mallas, Instalación de cable, Ensayos Pull Test), no elemento por elemento.
El bloque 1 y el 3 emiten **todas** sus partidas, incluso las que quedaron en 0.

**Hoja `RECURSOS`** (rdc.js:2226) — 4 columnas
(`Item | Descripción | Cantidad | Horas`) en formato vertical, con filas de
encabezado de sección (Item vacío, título en Descripción):
`MANO DE OBRA DIRECTA` (siempre, aunque esté en 0), `MANO DE OBRA INDIRECTA`
(solo Sala Eléctrica), `EQUIPOS`, `MAQUINARIA` (estas tres solo si tienen datos).

**Hoja `BITACORA`** (rdc.js:2335) — 5 columnas
(`Fecha | Frente | Hora Inicio | Hora Fin | Actividad`), ordenadas por hora,
mezclando hitos + actividades manuales + actividades autogeneradas desde metrados
(frases del tipo *"Se realizaron perforaciones con un total de 42 ML — Pernos: …"*,
rdc.js:2302-2306).
Debajo, separada por **2 filas en blanco** (offset `filas + 3`, rdc.js:2591), una
segunda tabla con la restricción de acceso:
`Fecha | Frente | Descripción | Hora inicio | Hora fin`.

**Hoja `CONTROL_SOSTENIMIENTO`** (rdc.js:2376) — 22 columnas, una fila por elemento:
`Fecha | Frente | Sistema | Zona de Sistema | Elemento | Tipo | Actividad | Código |
Ubicación | Longitud | Ancho | Largo | Área (M2) | Unidad | Diámetro (mm) | Ángulo |
Plano | Perforadora | Hora Inicio | Hora Fin | Capataz | Supervisor`

`Ángulo` y, como respaldo, `Diámetro` y `Plano` se completan desde
`BIBLIOTECA_PERNOS` buscando por la clave `"{frente}|{código}"`.

**Hoja `STAND_BY`** (rdc.js:2420) — 18 columnas:
`Item | Fecha | Frente | Actividad afectada | Desde | Hasta | Total (hh:mm) |
Total (decimal) | Total (min) | Causa | Responsable de la liberación | Capataz |
Operarios | Oficiales | Peones | Vigías | Total cuadrilla afectada | Comentarios`

Incluye dos filas sintéticas al inicio, antes de los stand by reales: la restricción
de acceso (si la hubo) y el registro documentario derivado de los hitos.

**Hoja `REPORTE_WSP`** (rdc.js:2469) — una sola columna: el texto de WhatsApp línea
por línea, luego `--- RESUMEN DE JORNADA ---` con los hitos, y al final el texto
completo repetido en **una sola celda**.

**Hoja `TELEMETRIA`** — oculta (`Hidden=1`). Tiempo que el supervisor pasó en cada
pestaña, total, y la versión de la app hardcodeada en `_appVer = 'v39'` (rdc.js:2659,
desactualizada respecto a `STORAGE_KEY = 'rdc_v40'`).

### 3.3 Detalles de formato que hay que respetar

- **Fechas como texto `DD/MM/YYYY`**, no como celda de fecha: `_parseDate`
  (rdc.js:2092) lo hace a propósito para evitar el desfase de zona horaria de
  SheetJS. El mismo criterio aplica a `_fechaHoyLocal()` (rdc.js:2742), que evita
  `toISOString()` porque en Perú cambiaría el día cerca de medianoche.
- **Horas como texto `HH:MM`**.
- Los conteos de personal se escriben como **números**, no strings.
- `Total Standby` va como texto `hh:mm`; en la hoja STAND_BY además se repite en
  decimal y en minutos.

### 3.4 Otros dos webhooks (fuera del alcance de A.1, para Fase D)

- **Fotos** (`fotos.js:18`, flujo `2a1230eb…`):
  `{ fecha, frente, rol, nombre, categoria, fotos }`. También espera HTTP 202.
- **Sketches** (`rdc.js:770`, flujo `9af000fd…`): `{ frente, pagina }`, es de
  lectura (lista sketches previos desde SharePoint, paginado).

---

## 4. Qué hay en `config.js` (96 KB): catálogo vs. configuración

### 4.1 Catálogo — debería vivir en tablas

| Constante | Volumen | Forma | Comentario |
|---|---|---|---|
| `PARTIDAS` | **18 frentes / 343 filas** | `{ "FRENTE": [{n, u, s, e}] }` — nombre, unidad, sección EDT, código EDT | Es el presupuesto/EDT por frente. Indexado por **nombre de frente** (texto). Se usa en el resumen y el texto de WhatsApp (rdc.js:1622, 1798) y para poblar el selector de frentes de Sketch's (navegacion.js:72) |
| `BIBLIOTECA_PERNOS` | **339 entradas** | clave `"{frente}\|{código}"` → `{z, s, u, d, l, a, p}` (zona, sistema, ubicación, diámetro, longitud, ángulo, plano) | Solo cubre el frente `PLATAFORMA SALA ELECTRICA`. Es el "plano digitalizado": permite autocompletar y alertar si el ML digitado difiere del de diseño (rdc.js:507) |
| `PARTIDAS_PRELIMINARES` | 8 | `{n, u}` | Bloque 1 de metrados. Ver la advertencia del índice posicional en §2.3 |
| `PARTIDAS_COMPLEMENTARIAS` | 7 | `{n, u}` | Bloque 3 de metrados. Misma advertencia |
| `CAUSAS_STANDBY` | 6 | texto | Debería ser administrable |
| `EQUIPOS_PERFORACION_FIJOS` / `EQUIPOS_SOPORTE_FIJOS` | 5 + 5 | texto | Definen columnas del Excel: agregar uno cambia el ancho de la hoja RDC |
| `HITOS_BASE` | 8 | texto | Igual: son 8 columnas del Excel |
| `TIPOS_PERNO_CRITICO`, `DIAMETROS_PERNO_CRITICO`, `UBICACIONES_PERNO`, `UBICACIONES_CRITICAS`, `TIPOS_MALLA_STD`, `TIPOS_CABLE_STD` | 2–7 c/u | texto | Catálogos chicos de formulario |

### 4.2 Configuración estática — puede quedar como constante

`HORAS`, `UNITS`, `_MEDIAS_HORAS` (rdc.js:1182, grilla de medias horas 05:00–22:30),
`CAUSA_TIEMPO_TOTAL`, `RESPALDO_MAX`, `RESPALDO_INTERVALO_MS`, y las claves de
`localStorage`: `STORAGE_KEY = 'rdc_v40'`, `SUPERVISOR_KEY`, `COLA_PENDIENTES_KEY`,
`STICKY_KEY`, `RESPALDO_KEY`.

### 4.3 Lo que NO debe portarse tal cual

- `POWER_AUTOMATE_URL` (config.js:415) y las otras dos URLs de flujo: llevan la
  firma `sig=` embebida en el código. En el Sistema deben salir a variables de
  entorno (`VITE_…`), igual que ya se hace con las credenciales de Supabase.
- `ADMIN_PASSWORD = 'admin123'` (admin.js:2). El propio código admite que es "un
  candado suave, no seguridad real". Desaparece: en el Sistema el panel admin queda
  detrás de roles + RLS.

---

## 5. Cardinalidades reales

| Relación | Cardinalidad | Detalle |
|---|---|---|
| Reporte : supervisor | **1 : 1** | Un nombre de texto, no una persona identificada |
| Reporte : capataz nominal | **1 : 1** | Un solo `f-capataz` del catálogo |
| Reporte : personal | **1 : 5 conteos** | ⚠️ **No hay lista nominal de trabajadores.** Solo cinco enteros: capataces, operarios, oficiales, peones, vigías. Más otros cinco en Sala Eléctrica |
| Reporte : equipos | **1 : N** | 10 de catálogo con cantidad + N libres. ⚠️ **Sin horómetro ni horas propias** |
| Reporte : hitos | **1 : 8 fijos** | Más 2 horas de refrigerio |
| Reporte : metrados bloque 1 | **1 : 8 fijos** | Cantidad + hora inicio/fin |
| Reporte : metrados bloque 3 | **1 : 7 fijos** | Cantidad + hora inicio/fin |
| Reporte : elementos de sostenimiento | **1 : N** (grande) | Una fila por perno / paño / cable / ensayo. Lotes de hasta 200 |
| Reporte : partidas libres | **1 : N** | Nombre + unidad + metrado |
| Reporte : actividades de bitácora | **1 : N** | |
| Reporte : stand by | **1 : N** | |
| Reporte : programación | **1 : N** + **1 : N** | Programadas y no programadas, listas separadas |
| Reporte : redline | **1 : 0..1** | Un supervisor + una descripción |
| Frente : partidas EDT | **1 : N** | 343 filas repartidas en 18 frentes |
| Frente : prefijos | **1 : N** | 30 filas por combinación frente + zona + sostenimiento |

---

## 6. Cómo se identifica hoy al autor

No hay autenticación. El mecanismo completo es:

1. Al abrir la app, `_initSupervisor()` (rdc.js:3008) lee
   `localStorage['rdc_supervisor_v1']`. Si está vacío, a los 600 ms abre un modal.
2. El modal lista los `SUPERVISORES` activos traídos de Supabase y el usuario toca
   un nombre (`_seleccionarSup`, rdc.js:3032).
3. Ese nombre se guarda en `localStorage` y se copia al input oculto
   `f-supervisor`. **Se puede cambiar en cualquier momento** con el botón "Cambiar".
4. En el Excel viaja como texto en la columna `Supervisor` de la hoja RDC y en cada
   fila de `CONTROL_SOSTENIMIENTO`.

**No hay ninguna verificación**: cualquiera puede emitir un reporte a nombre de
cualquier supervisor del catálogo. Esto es exactamente lo que la Fase B viene a
corregir. El campo `supervisor` es hoy un **string suelto**, no una FK — la
migración de reportes históricos, si se hace, tendrá que casar por nombre.

Datos "pegajosos": `STICKY_KEY` (rdc.js:2716) conserva **sector, frente, supervisor
y capataz** entre reportes, para que el supervisor no los reescriba cada día. Un
detalle pequeño pero que define la experiencia diaria y conviene preservar.

---

## 7. Estado, persistencia y modo sin señal (insumo para la Fase C)

### 7.1 Identidad del reporte

**No existe un id de reporte.** La identidad es el nombre del archivo:
`{frente}_{fecha}.xlsx`, y las correcciones generan `{frente}_{fecha}(C).xlsx`
(rdc.js:2813). Implicaciones:

- La clave de negocio real hoy es **frente + fecha**. No hay turno en ninguna parte
  del RDC — ni campo, ni catálogo, ni columna en el Excel.
- Dos supervisores que reporten el mismo frente el mismo día se pisan en SharePoint.
- El botón "corregir y reenviar" existe justamente porque no hay update: manda un
  **archivo nuevo** con sufijo `(C)`, y el comentario del código (rdc.js:2769-2772)
  advierte que el original se conserva aparte.

### 7.2 Borrador y respaldos

- `saveDraft()` (rdc.js:3053) serializa **todo el estado** a
  `localStorage['rdc_v40']` en cada cambio de campo. La estructura guardada es la
  referencia más completa del modelo: `meta`, `personal`, restricción, hitos,
  `bitacoraActiv`, `blq1/blq3` valores y horarios, `controlItems`, `equiposLista`,
  textos, `progRows`, `metradosManuales`, `standbyRows` y las tres banderas de
  estado.
- Además guarda hasta **5 respaldos rotativos** (`rdc_respaldo_v1`, máximo uno cada
  20 s) con un botón de "Recuperar información", pensados para cuando el borrador
  vivo se corrompe o alguien toca "Nuevo" por error (rdc.js:3095-3130).

### 7.3 Cola de pendientes (el offline actual)

- `marcarSinSenal()` (rdc.js:2883) **genera el Excel en ese momento** y encola
  `{id, nombreArchivo, contenidoArchivo, frente, fecha, creado}` en
  `localStorage['rdc_cola_pendientes_v1']`. El `id` es
  `` `${frente}_${fecha}_${Date.now()}` ``.
- El reintento (`_reintentarColaPendientes`, rdc.js:2937) se dispara al evento
  `online` del navegador y al abrir la app. Solo saca de la cola lo que responde 202.
- Antes de encolar, descarga el Excel automáticamente como respaldo y le advierte al
  supervisor que es su responsabilidad conservarlo.

**Tres cosas a mejorar, no a copiar, en la Fase C:**
1. La cola guarda el **archivo ya generado en base64** dentro de `localStorage`
   (cuota típica ~5 MB): varios reportes pendientes pueden llenarla. La cola nueva
   debe guardar los **datos** en IndexedDB y generar el archivo al enviar.
2. El botón "sin señal" es **manual**: el supervisor tiene que acordarse de
   presionarlo. En el Sistema el guardado debe ser automático.
3. No hay reintento con backoff ni deduplicación por id de negocio; la
   idempotencia depende de que SharePoint sobrescriba por nombre de archivo.

---

## 8. Hallazgos que requieren decisión del usuario

1. **El contrato con SharePoint es un Excel, no un JSON.** Replicarlo obliga a
   reimplementar `_construirWorkbookRDC()` con SheetJS dentro del módulo Vue. La app
   actual usa `xlsx 0.18.5` por CDN; el Sistema tiene `xlsx 0.20.3` de
   `cdn.sheetjs.com` en su `package.json`. **Riesgo:** dos versiones distintas pueden
   producir archivos distintos. Recomendación: generar el mismo reporte con ambas y
   comparar hoja por hoja antes de dar por buena la Fase C.
2. **¿El flujo de Power Automate lee por nombre de encabezado o por posición de
   columna?** De esto depende cuánto margen hay. La hoja RDC cambia de 38 a 43
   columnas según el sector, y tiene dos columnas llamadas `Otro`. Si lee por
   posición, hay que replicar el orden exactamente; si lee por encabezado, las dos
   columnas `Otro` son ambiguas. **No puedo determinarlo leyendo el RDC: hay que
   abrir el flujo en Power Automate.**
3. **`frentes` en ambos sistemas.** Pude leer el lado RDC (consulta de solo lectura
   con la misma llave pública que usa la app):
   - RDC: 21 frentes, tabla con `id` **serial**, `nombre`, `sector_id` → `sectores`
     (10 filas), `estado` booleano, `orden`.
   - Sistema: `id` uuid, `codigo` (opcional), `nombre`, `area` (obligatoria),
     `sector` como **texto libre**, `estado` con tres valores
     (activo/paralizado/cerrado), `fecha_inicio`, `fecha_cierre`.
   - **No pude comparar el contenido**: la lectura anónima de `frentes` en el
     Sistema devuelve vacío porque RLS exige sesión autenticada. Necesito que me
     confirmes los frentes cargados ahí, o credenciales de una cuenta de lectura,
     para decidir si son el mismo concepto de negocio.
   - Dato relevante para esa decisión: los frentes del RDC son unidades físicas de
     talud (`VM-08`, `ZCM09`, `PLATAFORMA SALA ELECTRICA`), y los sectores son zonas
     de mina (`A: 2000 - OPB MINA`, `A: 4000 - SALA ELECTRICA`). Se parecen mucho al
     `frentes` del Sistema, pero ahí `sector` es texto y aquí es una tabla propia.
4. **`PARTIDAS` no cubre todos los frentes.** Tiene 18 claves; la tabla `frentes`
   tiene 21. Sin partidas EDT quedan `Frente A`, `TAJO F4N - LADO ESTE` y
   `TAJO FASE 2`. ¿Es un pendiente de carga o esos frentes no llevan EDT?
5. **El personal es agregado, no nominal** (§5). La tabla `rdc_personal` del plan
   (`capataz_id, categoría, cantidad`) debe redefinirse: o cinco columnas en la
   cabecera, o una tabla de conteos por categoría sin FK a personas. ¿Quieres
   aprovechar la migración para pasar a personal nominal, o se conserva el conteo?
   (Conservarlo es lo que no rompe el Excel.)
6. **La maquinaria no tiene horómetros** (§2.1). La tabla `rdc_maquinaria` del plan
   pide horómetro inicial/final: ese dato **hoy no se captura**. ¿Se agrega como
   funcionalidad nueva, o el modelo refleja lo que existe (equipo + cantidad)?
7. **No existe el concepto de turno** (§7.1). La constraint de unicidad propuesta
   (supervisor + frente + fecha + turno) no se puede construir con el dato actual.
   Opciones: (a) unicidad por frente + fecha, igual que SharePoint hoy; (b) agregar
   turno como campo nuevo. Recomiendo (a) para no cambiar la operación en la misma
   entrega en que se cambia la app.
8. **Sector "Sala Eléctrica" está acoplado por string exacto** (`"A: 4000 - SALA
   ELECTRICA"`). Renombrar ese sector en el catálogo rompe silenciosamente el bloque
   de personal indirecto. En el modelo nuevo debería ser una bandera del sector
   (p. ej. `requiere_personal_indirecto`), no una comparación de texto.
9. **Los metrados de bloque 1 y 3 se guardan por índice de array** (§2.3). El
   esquema nuevo debe usar un código estable por partida.
10. **La telemetría existe y viaja en el archivo.** ¿Se conserva en el módulo nuevo?
    Hoy mide el tiempo por pestaña; en Vue sería más fácil y más completo, pero es
    dato de comportamiento de personas y conviene decidirlo explícitamente.

---

## 9. Lo que este documento NO cubre

- Diseño de tablas, migraciones SQL y RLS: es la Fase A.2/A.3, y varias decisiones
  dependen de las respuestas de §8.
- El módulo `vales.js` del RDC: el plan (§2) lo descarta explícitamente.
- Detalle interno de `fotos.js` y del visor de sketches: Fase D. Solo se documentó
  la forma de sus payloads (§3.4) para no perderla.
- Contenido de la tabla `frentes` del Sistema: bloqueado por RLS (§8.3).

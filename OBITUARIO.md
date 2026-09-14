# Obituario — Reporte Diario de Campo (app legacy)

> Registro histórico de la aplicación "Reporte Diario de Campo" (RDC), la app de campo que Quellaveco Marco usó antes de migrar al **Sistema de Gestión DNV** (este repositorio). Se escribe el día en que se decide reemplazarla, antes de tocar nada de su código, para dejar constancia de cómo estaba armada.

**Cierre:** 14 de setiembre de 2026.
**Ubicación original:** `OneDrive - grupodesnivel.com/Obras DNV PERU 3-9042 Quellaveco Marco - 08 APLICATIVO RDC/` (producción, fuera de este repo). Una copia de referencia de su código vive en `_referencia-rdc/` dentro de este repositorio, usada para escribir este documento.

---

## 1. Por qué se reemplazó

La app RDC nació como una PWA independiente, standalone, construida para un solo propósito: el reporte diario de campo del contrato de Sostenimiento y Mantenimiento de Talud. Con el tiempo fue absorbiendo módulos vecinos (Fotos, Vales de Requerimiento, Sketch's) que en realidad pertenecen a un problema más grande — gestión de materiales, stock, almacén, procura — que esta app nunca modeló: no tenía tablas de stock, ni control de inventario, ni relación real entre lo que un supervisor pedía en un "Vale" (que ni siquiera llegaba a un backend — ver §5) y lo que Almacén tenía físicamente disponible.

El **Sistema de Gestión DNV** (este repositorio) nace para cubrir ese problema completo: Catálogo, Almacén (stock real con RLS y kardex), Vales conectados a reservas y entregas físicas, Procura, Reportes, y el mismo Reporte Diario de Campo, todo sobre un único modelo de datos y un único login por rol. La migración no es un cambio de "look": es pasarle a un sistema con backend real de inventario un módulo que antes vivía aislado, con su propio Supabase y sin relación con stock.

## 2. Stack técnico

- **Sin framework de frontend.** HTML estático + JavaScript vanilla (funciones globales, sin módulos ES, sin bundler, sin build step) + CSS plano. Todo el árbol de archivos se sirve tal cual — abrir `index.html` en un servidor estático alcanza.
- **Backend: Supabase** (Postgres + PostgREST + Auth no se usaba — sin login de usuarios, ver §6) como única fuente de catálogos (supervisores, capataces, sectores/frentes, prefijos de código de perno, materiales de Vales). Cliente cargado desde CDN (`@supabase/supabase-js@2.43.0`) e inicializado a mano con `SUPABASE_URL` + `SUPABASE_ANON_KEY` embebidos en `js/supabase.js`.
- **Entrega del reporte: Power Automate**, no Supabase. El Excel armado en el navegador (vía SheetJS/`xlsx` desde CDN) se manda en base64 por `fetch` a un webhook de Power Automate (uno para el RDC, otro separado para fotos), que lo deposita en SharePoint. Supabase en esta app **nunca** guardó el contenido del reporte — solo los catálogos de apoyo.
- **Persistencia local: `localStorage` únicamente.** No había IndexedDB ni ningún backend propio para el borrador — el formulario completo (todas las pestañas) se serializaba a JSON en una sola clave (`STORAGE_KEY = 'rdc_v40'`, el `v40` delata cuántas veces cambió el esquema del borrador a lo largo de la vida de la app).
- **PWA**: `manifest.json` + `sw.js` con Service Worker manual (sin Workbox ni ningún generador) — caché versionada a mano (`rdc-cache-v7`), estrategia *network-first* para el documento principal y *cache-first con refresco en segundo plano* para el resto de assets.
- **Iconos: Tabler Icons** (`assets/tabler-icons/`, fuente `.woff2`/`.woff`/`.ttf` + hoja de clases `ti ti-*`), empaquetados localmente, no por CDN.
- **Tipografía: Google Fonts**, cargada por `<link>` (no local).
- **Excel: SheetJS (`xlsx@0.18.5`)** desde CDN, usado tanto para exportar la copia local del supervisor como para construir el archivo que se manda a Power Automate.
- **Sin proceso de build, sin control de versiones de dependencias, sin tests.** Un `.claude/` con configuración de Claude Code en la carpeta sugiere que buena parte de este código también se escribió con asistencia de IA.

### Estructura de carpetas

```
index.html              # las 5 "pantallas raíz" completas, todas en un solo HTML
manifest.json, sw.js     # PWA
css/
  variables.css          # design tokens (colores, radios, sombras)
  reset.css               # reset + tipografía base del <body>
  layout.css              # app shell, bottom nav, grids
  components.css          # tarjetas, botones, inputs, steppers, chips…
js/
  config.js               # catálogos ESTÁTICOS embebidos: PARTIDAS por frente, BIBLIOTECA_PERNOS,
                           # listas de horas/unidades/hitos/causas de standby/equipos fijos…
  supabase.js              # conexión + carga de catálogos DINÁMICOS (supervisores, sectores, prefijos…)
  utils.js                 # una sola función (showToast) — sí, todo el archivo
  main.js                  # arranque: init, registro del Service Worker
  navegacion.js            # bottom nav + swipe entre tabs + router de "pantallas raíz"
  rdc.js                   # el módulo grande — ~3300 líneas, ver §5
  vales.js                 # Vales de Requerimiento (100% local, sin backend de envío)
  fotos.js                 # Registro Fotográfico (envío directo a Power Automate)
  admin.js                 # panel de administración de catálogos (auth de mentira, ver §6)
assets/
  icons/                   # íconos PWA
  tabler-icons/             # fuente de íconos empaquetada
```

No existía separación por rutas ni componentes reutilizables en el sentido moderno (Vue/React): las "pantallas" son `<div>` con `id` fijo que se muestran/ocultan por JS (ver §3), y cada "tarjeta" o fila se genera como un string de HTML armado a mano (template literals) e inyectado con `innerHTML`.

## 3. Módulos / pantallas

La app tenía una única "pantalla de inicio" (`#pantalla-inicio`) con 4 botones que mostraban/ocultaban divs raíz (`mostrarPantallaRaiz()` en `navegacion.js`) — no había enrutamiento por URL, todo vivía en `index.html`.

| Pantalla | Qué hacía |
|---|---|
| **Reporte Diario de Campo** (`#pantalla-rdc`) | El módulo principal — ver §5. 5 pestañas: Datos, Jornada, Metrados, Obs/Prog, Resumen. |
| **Registro Fotográfico** (`#pantalla-fotos`) | Fotos diarias (obligatoria al menos una), Redline y Sketch de avance (perforación/inyección/malla), comprimidas en el navegador y enviadas a un webhook de Power Automate dedicado. |
| **Vales de Requerimiento** (`#pantalla-vales`) | Pedido de materiales a Almacén. **Sin backend real**: guardaba en `localStorage`, generaba un texto de WhatsApp para copiar/compartir y permitía exportar a Excel — no había ninguna conexión con stock ni con lo que Almacén tenía disponible. Dos pestañas: Requerimiento y Retorno (devolución de material no usado), más Historial. |
| **Sketch's** (`#pantalla-sketches`) | Galería de sketches anteriores por frente, consultados directo a SharePoint (con lightbox con zoom/pan táctil). Se independizó del arranque de la app para no pegarle a SharePoint cada vez que alguien abría el RDC. |
| **Panel de administración** (modal, no una pantalla propia) | Alta/edición de supervisores, supervisores de Redline, capataces, sectores y frentes, prefijos de código de perno, y catálogo de materiales de Vales — todo contra las tablas de Supabase. Protegido por una contraseña fija en el cliente (ver §6). |

## 4. Componentes / patrones reutilizables clave

No hubo componentización real (no era un framework de componentes), pero sí patrones repetidos a mano, todos dentro de `rdc.js` salvo que se indique lo contrario:

- **Acordeones** (`_toggleBloque`, `_toggleEquiposAcordeon`, `_togHitosAcordeon`, `_togFotoBloque` en `fotos.js`, `_toggleAdminAccordion` en `admin.js`) — mismo patrón visual de cabecera clickeable + chevron rotando, reimplementado por separado en cada módulo.
- **Steppers numéricos** (`_personStep`, `_equipoCatStep`, `_blqStep`) — botones +/- con input numérico al centro, para cantidades de personal y equipos.
- **Buscador de materiales con resultados en vivo** (`valBuscarMaterial`/`valElegirMaterial` en `vales.js`) — el antecedente directo de `BuscadorMaterial.vue` en el sistema nuevo.
- **Timeline / Bitácora de Campo** (`_renderBitacora`, `_timelineActividadHTML`, `_timelineStandbyHTML`) — línea de tiempo fusionada de actividades y paradas (Stand By), con cálculo de minutos efectivos vs. parados.
- **Generador de código de perno automático** (`_buildCodigo`, `_getPrefijosInfo`, `BIBLIOTECA_PERNOS` en `config.js`) — arma códigos tipo `Z09/A-1` a partir de Frente + Zona + Sostenimiento, contra una tabla de más de 400 entradas pre-cargadas por posición.
- **Builder del reporte de WhatsApp** (`buildTextoWsp`) — arma el texto plano formateado que el supervisor copia/comparte, con el mismo espíritu (emoji + secciones) que se replicó en el Sistema nuevo para el mensaje de stock de Almacén.
- **Builder del Excel** (`_construirWorkbookRDC`, con sus `_build*Rows` satélite: metrados, recursos, bitácora, restricciones, control de sostenimiento, standby) — arma el workbook completo con SheetJS antes de cada envío o descarga.
- **Cola de pendientes offline** (`_leerColaPendientes`/`_guardarColaPendientes`/`_reintentarColaPendientes`) — ver §5.
- **Sistema de respaldos anti-pérdida** (`_guardarRespaldo`/`_leerRespaldos`/`_mostrarModalRespaldo`) — copias periódicas del borrador completo, independientes del borrador "vivo", para recuperar datos si algo lo corrompía.

## 5. Sistema de diseño

Tema **"Steel & Slate"**: acento azul pizarra oscuro sobre fondos muy claros. Definido íntegro en `css/variables.css` como custom properties de CSS.

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#FBF8FA` | Fondo de página |
| `--surface` | `#FFFFFF` | Tarjetas |
| `--surface2` | `#F4F1F2` | Fondos secundarios (inputs, filas alternas) |
| `--border` | `#E8E3E6` | Bordes suaves |
| `--border-md` | `#D7D1D4` | Bordes de inputs |
| `--text` | `#1E293B` | Texto principal |
| `--text2` | `#64748B` | Texto secundario |
| `--text3` | `#94A3B8` | Texto terciario / placeholders |
| `--blue` (acento de marca) | `#1E293B` | Igual al texto principal — el "azul" histórico del nombre de la variable pasó a valer slate oscuro |
| `--blue-bg` / `--blue-text` | `#E9ECF1` / `#334155` | Variante suave del acento |
| `--green` | `#10B981` | Éxito |
| `--green-bg` / `--green-text` | `#ECFDF5` / `#047857` | Variante suave |
| `--amber` | `#D97706` | Advertencia / admin |
| `--amber-bg` / `--amber-text` | `#FFFBEB` / `#92400E` | Variante suave |
| `--red` | `#DC2626` | Error / crítico |
| `--red-bg` / `--red-text` | `#FEF2F2` / `#991B1B` | Variante suave |
| `--neutral` | `#787778` | Gris neutro |
| Verde de Excel (`.export-btn`) | `#1D6F42` | Botón "Descargar copia (Excel)" — el mismo tono institucional de Excel que se retomó para el botón de exportar de Almacén en el Sistema nuevo |

- **Radios**: `--r-sm: 6px`, `--r-md: 8px`, `--r-lg: 8px` — esquinas discretas, nada muy redondeado.
- **Sombras**: dos niveles (`--shadow`, `--shadow-md`), sutiles, con el mismo tinte slate que el texto (`rgba(30,41,59,…)`) en vez de negro puro.
- **Tipografía**: **Plus Jakarta Sans** (Google Fonts), pesos 400/500/600/700/800. Único font-family en toda la app — cuerpo, inputs, botones.
- **Iconos**: **Tabler Icons** (`ti ti-*`), empaquetados localmente vía `@font-face`. Complementados con emoji sueltos en textos y botones (📦 📅 🚨 ⛔ 📷 📐 etc.), un recurso visual que el Sistema nuevo retomó explícitamente en el mensaje de WhatsApp de stock de Almacén.
- **Layout**: mobile-first estricto, `max-width: 720px` centrado incluso en desktop, bottom nav fija de 5 pestañas con swipe horizontal para cambiar de tab, sin sidebar ni vista de escritorio real.

## 6. Flujo principal — crear y enviar un Reporte Diario de Campo

1. **Datos**: el supervisor se identifica (banner con su nombre, guardado en `localStorage['rdc_supervisor_v1']` — sin login, solo un nombre elegido de una lista), elige Fecha, Sector → Frente (`onSectorChange`/`onFrenteChange`, filtrando `SECTORES` cargado de Supabase) y Capataz. Registra personal presente (steppers por categoría) y equipos en frente (acordeón con catálogo fijo + entradas manuales).
2. **Jornada**: declara si hubo restricción de acceso (con descripción y horario), completa los Hitos de inicio de jornada (charla de seguridad, PETAR, etc., de una lista fija `HITOS_BASE`), y arma la **Bitácora de Campo** — una línea de tiempo única que mezcla Actividades y períodos de **Stand By** (parada), cada uno con su causa tomada de una lista fija (`CAUSAS_STANDBY`) cuando aplica.
3. **Metrados**: registra avance por partida, agrupado en 3 bloques según el frente elegido (Preliminares / Críticas / Complementarias, sacados de `PARTIDAS[frente]` en `config.js`) más "Partidas libres" para lo que no está en el catálogo. Las actividades marcadas como críticas (`c: 'perf-iny'`, `'malla'`, `'cable'`, `'Pull test'`) abren un formulario extendido que, para pernos, arma el código automático (`_buildCodigo`) contra `BIBLIOTECA_PERNOS`.
4. **Obs/Prog**: programación del día siguiente (partidas planeadas + actividades no programadas), comentarios libres, requerimientos, restricciones, y **Modificaciones/Redline** (si hubo cambios respecto al plano, con su propio supervisor Hegatrux responsable).
5. **Resumen**: se arma en vivo (`buildResumen`) un tablero con métricas del día, tabla de metrados ejecutados, control de sostenimiento, equipos, Stand By, y el **texto de WhatsApp** completo (`buildTextoWsp`) listo para copiar o compartir.
6. **Envío** (`terminarYEnviar`): valida Fecha/Frente, confirma si la fecha no es la de hoy (para atrapar errores de digitación), arma el Excel completo (`_construirWorkbookRDC` → SheetJS), lo convierte a base64 y lo `POST`ea a un webhook de Power Automate. Un `202` marca el reporte como enviado (`reporteEnviado = true`, persistido en el borrador) y habilita "Corregir y reenviar" (que no borra nada — reenvía como archivo nuevo con sufijo `(C)`, dejando el original intacto en SharePoint).
7. **Sin señal**: si no hay conexión, `marcarSinSenal()` descarga una copia local de respaldo, encola el reporte completo (Excel en base64 incluido) en `localStorage['rdc_cola_pendientes_v1']`, y lo intenta reenviar solo — al recuperar conexión (`window.addEventListener('online', …)`), al reabrir la app, o a mano con "Reintentar ahora".
8. Volver a la pestaña "Datos" después de enviar/finalizar un reporte inicia uno **nuevo** (con confirmación), conservando datos "sticky" (sector, frente, supervisor, capataz) para no tener que volver a elegirlos cada día.

Todo el borrador se autoguarda en `localStorage` en cada cambio (`saveDraft`), con un sistema de respaldos periódicos independientes por si el borrador "vivo" se corrompía.

## 7. Notas honestas sobre el diseño original

- **Sin autenticación real de usuarios.** "Elegir supervisor" era seleccionar un nombre de una lista — cualquiera podía enviar un reporte a nombre de cualquier supervisor.
- **El panel de administración usaba una contraseña fija embebida en el JavaScript del cliente** (visible para cualquiera con las herramientas de desarrollador del navegador) — el propio código lo documentaba como "candado suave, no seguridad real".
- **Vales de Requerimiento nunca tuvo backend de envío ni conexión con stock real** — era, en los hechos, un generador de mensajes de WhatsApp con memoria local.
- **Credenciales de servicio (URL/clave de Supabase, webhooks de Power Automate) embebidas directamente en el código fuente** servido al cliente — funcional porque Supabase usa RLS y la clave era la pública ("anon"), pero sin ningún control de acceso más allá de eso.
- Un "Modo Gran Maestro" (easter egg): seleccionar un nombre de supervisor específico pedía la contraseña de admin y cambiaba el tema visual a uno de fuego, solo por diversión.

Estas mismas carencias (sin login real, Vales desconectado del stock) son, en buena parte, la razón de negocio detrás de construir el Sistema de Gestión DNV desde cero en vez de seguir extendiendo esta app.

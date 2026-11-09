# Manual completo — Sistema de Gestión de Materiales DNV

**Versión del manual:** 28 de octubre de 2026.

Este manual explica **cómo usar y administrar la aplicación** tal como está en funcionamiento. Todo lo que
se describe se hace desde la propia app; no hace falta ningún programa adicional.

- **Quien usa la app** (supervisores, residencia, almacén, planeamiento, calidad): partes 1 a 4.
- **Quien administra la app** (altas de usuarios, permisos, configuración): partes 5 y 6.

---

## Índice

1. [Qué es el sistema y cómo entrar](#1-qué-es-el-sistema-y-cómo-entrar)
2. [Roles: qué ve y qué hace cada uno](#2-roles-qué-ve-y-qué-hace-cada-uno)
3. [Guía de uso, pantalla por pantalla](#3-guía-de-uso-pantalla-por-pantalla)
4. [Flujos completos y reglas que conviene saber](#4-flujos-completos-y-reglas-que-conviene-saber)
5. [Administración desde la app](#5-administración-desde-la-app)
6. [Problemas frecuentes y su solución](#6-problemas-frecuentes-y-su-solución)
7. [Funciones previstas que aún no existen](#7-funciones-previstas-que-aún-no-existen)
8. [Anexo: matriz completa de permisos](#8-anexo-matriz-completa-de-permisos)

---

## 1. Qué es el sistema y cómo entrar

### 1.1 Qué es

Es una **aplicación web instalable (PWA)** de Grupo Desnivel para el contrato de Sostenimiento y
Mantenimiento de Talud (Quellaveco). Reúne en un solo lugar, con un solo usuario por persona:

| Módulo | Para qué sirve |
|---|---|
| **Dashboard** | Ver quién está en campo, el mapa de actividad por frente y los frentes paralizados o próximos. |
| **RDC (Reporte Diario de Campo)** | El supervisor reporta cada día lo avanzado: personal, equipos, bitácora, metrados, pernos, malla, cable. Funciona **sin señal**. |
| **Fotos y sketch** | Subir fotos del avance y consultar sketches (croquis) del frente. |
| **Vales** | El supervisor pide material. Almacén aprueba, reserva y entrega. |
| **Almacén** | Stock, ingresos, salidas, ajustes, devoluciones, transferencias, kardex. |
| **Planeamiento** | Frentes (con su ficha), catálogo de materiales y catálogos del RDC. |
| **Calidad** | Control de perforación, inyección (con bolsas de cemento), malla, cable y pull test por frente. |
| **Alertas** | Avisos automáticos (stock bajo, sobreconsumo, reserva prolongada, RDC sin enviar…). |
| **Reportes** | Excel de procura vs consumo y consumo para EDP. |
| **Usuarios y roles** | Altas, bajas y permisos. |

### 1.2 Cómo entrar

1. Abre la dirección de la app: `https://rdc-test--sistemadnv.netlify.app`.
2. Escribe tu **correo** y **contraseña** y toca **Ingresar al sistema**. Las cuentas las crea un administrador (ver 3.11).
3. Si olvidaste la contraseña, pide a un administrador que te la **restablezca**: no se puede leer la anterior.

### 1.3 Instalarla como app (recomendado en celular)

- **Android (Chrome):** menú ⋮ → *Instalar app* / *Agregar a pantalla de inicio*.
- **iPhone (Safari):** botón Compartir → *Agregar a inicio*.
- Queda con el icono **D** ámbar sobre negro y abre a pantalla completa, sin barra del navegador.

### 1.4 Sin señal

El **RDC** y las **fotos** se guardan primero en el celular y se envían solos cuando vuelve la señal
(reintenta a los 0, 1, 5, 15 y 60 minutos). Un vale, en cambio, **necesita conexión** para enviarse.

### 1.5 Actualizaciones

Cuando hay una versión nueva aparece un aviso **"Hay una versión nueva de la aplicación — Actualizar"**.
Toca **Actualizar** apenas puedas: así tienes las correcciones más recientes.

### 1.6 El menú de tu usuario

Abajo a la izquierda (escritorio) o en el botón del avatar (celular) está tu menú:

- **Modo claro / Modo oscuro** (la app arranca en oscuro; se recuerda por dispositivo).
- **Usuarios y roles**, **Roles y permisos**, **Developer** (solo si tu rol lo permite).
- **Soporte**: abre un video de ayuda en otra pestaña.
- **Cerrar sesión**.

Pasa el mouse sobre el avatar para ver tu nombre y rol.

### 1.7 Colores y símbolos que verás

- **Ámbar** `#F5A800`: color de marca y de lo activo (botón principal, pestaña activa).
- **Verde**: bien / completo / entregado. **Ámbar suave**: atención. **Rojo**: error, falta o urgente. **Azul**: informativo.
- **Pastillas** (cápsulas pequeñas) indican estado: *Aprobado*, *Parcial*, *Cancelado*, *Atendido*…
- Un **punto rojo** sobre un icono del menú indica algo pendiente (alertas, vales por responder, reportes fallidos).

---

## 2. Roles: qué ve y qué hace cada uno

Hay **9 roles**. Cada usuario tiene exactamente uno. Lo que ve en el menú sale de sus permisos.

| Rol | Para quién | Qué hace principalmente |
|---|---|---|
| **Supervisor** | Supervisores de campo | Reporta el RDC, sube fotos, pide vales, pide devoluciones y transferencias. **No** ve Frentes, Catálogo ni Almacén de oficina. Entra directo a *Reporte diario*. |
| **Residencia** | Residentes de obra | Como Supervisor, pero además ve módulos de oficina (vales de todos, Almacén en lectura, catálogo, reportes) y puede cargar un vale **en nombre de otro**. |
| **Almacen** | Almaceneros | Ingresos, ajustes, **aprobar/rechazar vales**, **entregas**, devoluciones, transferencias, kardex. No ve Frentes ni Catálogo. |
| **Planeamiento** | Planificación y procura | Frentes y su ficha, catálogo, procura, confirmar metrados, crear usuarios, ver todos los reportes RDC. |
| **Coordinador** | Coordinación | Casi todo (54 permisos): operación + gestión, sin las herramientas de prueba. |
| **Administrador** | Administración | Control total (53 permisos), incluye usuarios y roles. |
| **Calidad** | Control de calidad | **Solo lectura**: Calidad, Dashboard, reportes RDC de todos, stock y vales para consulta. |
| **Consulta** | Lectura | Solo lectura y exportación de reportes. |
| **Developer** | Soporte técnico | Todo lo del Administrador más herramientas de prueba (borrar pruebas, ver el sistema como otra cuenta). |

La matriz exacta de permisos por rol está en el [Anexo 8](#8-anexo-matriz-completa-de-permisos).

> Regla importante: **ocultar un botón no es seguridad.** La base de datos vuelve a verificar cada permiso
> (RLS). Si alguien fuerza una URL que no le corresponde, la app lo devuelve a su pantalla de inicio y
> la base rechaza el dato.

---

## 3. Guía de uso, pantalla por pantalla

### 3.1 Inicio de sesión

Correo + contraseña. Debajo del botón dice *"Acceso restringido — solo personal autorizado"*. Quien inicia
sesión cae en su pantalla de inicio: el **Supervisor** en *Reporte diario*, el resto en el **Dashboard**.

### 3.2 Dashboard (`/`)

Lo ven todos los roles con permiso `dashboard.ver`. Muestra, según el permiso `rdc.ver_resumen_campo`:

- **Personal y Maquinaria**: totales del día según los reportes.
- **Frentes en campo**: cada frente con su supervisor, capataz, personal y equipos, y las **restricciones de acceso** si las hubo. Se puede elegir otra **fecha** para ver qué frentes estaban activos ese día.
- **Mapa de actividad**: calendario del mes, una fila por frente, un cuadro por día. El color indica el **supervisor** que reportó; el cuadro vacío es "sin reporte". Tocar un cuadro abre el detalle del día. Se agrupa por **contrato**.
- **Frentes paralizados** y **próximos a iniciar** (con su fecha).

Si un rol ve el Dashboard casi vacío, falta el permiso `rdc.ver_resumen_campo` (ver [6](#6-problemas-frecuentes-y-su-solución)).

### 3.3 RDC — Reporte Diario de Campo

**Quién:** Supervisor y Residencia (crean y editan los suyos); Planeamiento/Coordinador/Administrador ven y corrigen los de todos.

**Dónde:** en celular, botón *Reporte* de la barra inferior; en escritorio, *Planeamiento → RDC*.

**Crear un reporte** (botón de nuevo reporte). El formulario tiene **5 pasos**:

1. **Datos** — fecha, frente, supervisor, capataz, restricciones de acceso, redline. El sector sale del frente. Se **arrastra** lo del último reporte (frente, cuadrilla, equipos) para no escribir todo cada mañana. Si ya existe un reporte tuyo para ese frente y fecha, la app te avisa **antes** de que pierdas tiempo.
2. **Jornada** — personal (directo e indirecto), maquinaria, horas, refrigerio, paradas (*stand by*) y sus causas.
3. **Metrados** — lo ejecutado, en bloques:
   - **1. Actividades preliminares** y **3. Actividades complementarias**: partidas fijas del catálogo, con su cantidad.
   - **2. Actividades críticas** (un registro por elemento): **Perno** (perforación, inyección, pull test), **Malla** (paño) y **Cable** (tramo). Para pernos se escribe un rango ("P1 al P10") y el sistema crea uno por perno. Es el bloque que abre expandido.
   - **Partidas libres**: lo que no está en las partidas fijas.
4. **Obs/Prog** — observaciones y programación de mañana.
5. **Resumen** — revisión y **Enviar**.

**Reglas del control de pernos** (frentes con el interruptor *Control de pernos* activo):

- Un **código ya perforado no se puede volver a perforar**. Pasa lo mismo con un paño de malla ya reportado.
- La app compara contra lo que ya está en el servidor **y** contra otros reportes de tu dispositivo.
- Si un código **no está en la lista de pendientes** (llegó por otro medio), usa **Regularizar**: pide longitud y un motivo.
- Con la biblioteca de pernos cargada, solo se ofrecen los **perforados y aún sin inyectar** para inyectar.

**Inyección y cemento:** cuando hubo inyección, el campo **Bolsas de cemento** es **obligatorio** para poder enviar. Es el total de bolsas **del reporte**, no de cada perno.

**Pull test:** se registra como ensayo de un perno ya inyectado. El sistema guarda **que se hizo**; no guarda carga ni resultado.

**Enviar:** al finalizar, el reporte pasa a **Enviado**. Va a dos destinos independientes: **el sistema** (los datos, para Calidad, Control de sostenimiento y demás pantallas) y **SharePoint** (el Excel, que es el entregable de la obra). Si uno falla, el otro no se repite.

**Estados que verás en la lista:** *Borrador* (aún editable), *Enviado*, y marcas de **envío fallido** (punto rojo) cuando algo no llegó. Un borrador se puede **borrar**; un reporte enviado **no** (es registro histórico).

**Continuar en otro dispositivo:** los borradores se respaldan en la nube; puedes empezar en el celular y seguir en la laptop. Cuidado: **no edites el mismo borrador en dos dispositivos a la vez**.

**Corregir un reporte enviado:** quien tenga `rdc.editar_todos` (Planeamiento, Coordinador, Administrador) puede editarlo dentro del plazo configurado.

**Excel y WhatsApp:** el resumen genera el Excel del RDC y un texto para WhatsApp. En las partidas nuevas el texto ya **no** dice "(nueva)".

### 3.4 Fotos y sketch (`/fotos`)

Quien tiene `rdc.crear`. Permite elegir frente, adjuntar fotos (se **comprimen** a 1600 px y calidad 70 % para ahorrar datos) y enviarlas; si no hay señal quedan en cola. *Sketch* muestra los croquis previos del frente (solo lectura, vienen de SharePoint).

### 3.5 Vales — lo que hace el supervisor (`/vales`)

**Pedir material** (botón *Nuevo vale*):

1. Elige el **frente** (solo frentes activos).
2. **Agregar material**: solo aparecen los que **tienen stock** en ese momento. Escribe la cantidad.
3. Si pides cable, puedes indicar en qué **secciones cortarlo** (ej. 22 ML · 32 ML).
4. Escribe la **actividad** y toca **Enviar vale**. Si pides más de lo previsto en Procura, la app te **avisa** (no te bloquea).
5. Opcional: **Generar mensaje para WhatsApp** para avisar al grupo.

**Seguimiento:** cada vale muestra su estado:

| Estado del vale | Significa |
|---|---|
| Borrador | Aún no enviado. |
| Enviado / En revisión | Esperando respuesta de Almacén o Planeamiento. |
| Aprobado | Se aprobó al menos un material y el stock quedó **reservado** para tu frente. |
| Parcialmente atendido | Ya se entregó parte. |
| Atendido | Todo lo aprobado se entregó (o se cerró). |
| Rechazado / Cancelado | No procede. |

Cada **material** también tiene su estado: *Pendiente, Aprobado, Rechazado, Reservado, Parcialmente entregado, Entregado, Cancelado*. Verás el **motivo** cuando Almacén lo rechaza o cancela.

**Novedades:** un punto/contador en *Almacén* (supervisor) o *Vales* avisa que algún vale tuvo respuesta. Se apaga al abrirlo.

**Devolver o transferir material** (botón del vale o *Nueva devolución/transferencia* en Almacén):

- **Devolución:** material que vuelve del frente al almacén. Almacén la **recibe** y evalúa el estado en que llega (puede dejarlo como bueno o darlo de **baja**).
- **Transferencia:** pasa material de un frente a otro; se **confirma sola** y mueve el consumo de cada frente.

> El supervisor **no** decide cancelar o rebajar un material: eso lo hace Almacén (ver 3.6).

### 3.6 Almacén (`/almacen`)

**Quién:** Almacen, Planeamiento, Coordinador, Administrador (y lectura para otros roles con `stock.ver`).

Pestañas: **Stock · Ingresos · Salidas · Vales · Reservas · Ajustes · Devoluciones · Bajas · Transferencias**. El botón principal de arriba cambia según la pestaña (*Nuevo ingreso*, *Nuevo vale*, *Nuevo ajuste*…). El menú **···** da acceso al **Kardex** y a las exportaciones.

#### Stock
Por material y almacén: **físico, reservado, disponible**. **Disponible = físico − reservado.** Una etiqueta indica *Disponible*, *Bajo mínimo* o *Agotado*. El mínimo es el **20 %** del último ingreso (configurable por material). Se puede filtrar por contrato y exportar a Excel.

#### Ingresos — registrar lo que llega
1. **Nuevo ingreso**. Elige el **contrato** y anota el **N° de guía** y el **proveedor** (los datos salen de la guía de remisión).
2. Busca el **material** como lo dice la guía. Si no existe, **créalo ahí mismo** como material nuevo: unidad, y si es malla, **ancho y largo del rollo**; si el nombre dice `L=4.5` el largo se completa solo.
3. Elige su **nombre EDP** (ver 4.3). El sistema sugiere uno según el nombre.
4. Pon la **cantidad** (en malla el sistema calcula los m²). Puedes **agregar más materiales** a la misma guía.
5. **Registrar**. Quedan guardados con su guía. También hay **ingreso masivo por Excel**.
6. Si te equivocaste: en la fila toca **Corregir** (datos de la guía y/o cantidad; la cantidad se corrige con un ajuste).

#### Vales — la bandeja del almacenero (aquí se decide todo)
Izquierda: lista de vales con buscador y filtros **Todos · Por resolver · Enviado · Aprobado · Parcial · Atendido · Rechazado · Cancelado**. La lista tiene **su propio scroll** (con la rueda, sin barra). Derecha: el detalle del vale.

En cada material verás cápsulas de **Stock** y de **Procura** (*Dentro de Procura · queda X*, *Excede Procura en X*, *No contemplado en Procura*, *Sin stock*, *Stock … · no alcanza*).

**a) Responder el vale**
- Cada material pendiente trae su cantidad: puedes **bajarla** (✓ aprueba esa cantidad) o **rechazarlo** (✕).
- **Ajustar a X** aparece cuando lo pedido excede stock o Procura.
- Un material que **excede Procura** no lo aprueba el almacenero solo: **consulta con Planeamiento**, que abre el mismo vale y lo responde.
- Al tocar **Responder vale**, lo aprobado queda **Reservado** (el stock se aparta para ese frente).
- Si dos personas intentan responder la misma línea a la vez, la segunda recibe un aviso: *otra persona ya respondió; vuelve a abrir el vale*.

**b) Entregar**
- En cada material reservado: escribe la **cantidad que sale hoy** y toca **Entregar**. Puede ser **parcial**: lo que falta **sigue reservado**.
- Materiales por rollo (malla, cable) piden **de qué lote sale**; se puede repartir entre varios lotes.
- Al entregar aparece junto a la cantidad un **icono de copiar**: copia el **aviso de entrega para WhatsApp**. Arriba, el botón **WhatsApp** copia el aviso del requerimiento.

**c) Cuando no se entrega todo (la parte clave)**
Debajo de **Entregar** hay un segundo botón del mismo ancho:

| Situación | Botón | Resultado |
|---|---|---|
| No se entregó **nada** y ya no se va a entregar | **No entregar** | La línea queda **Cancelado**. Lo reservado **vuelve al stock disponible**. |
| Se entregó **una parte** y no saldrá más | **Cerrar con lo entregado** | La línea queda **Entregado** con lo que salió. Lo que faltaba **vuelve al stock** automáticamente. |

Ambos piden un **motivo obligatorio** y muestran antes qué pasará con el stock. Cuando todas las líneas quedan resueltas, el **vale pasa solo** a *Atendido* (o *Cancelado* si no salió nada).

> **No uses "Cancelar vale" para esto.** *Cancelar vale* solo aparece si **todavía no se entregó nada**; cancela todo y libera las reservas.

**d) Historial del vale** (desplegable al final): quién creó, aprobó, reservó, entregó, canceló o cerró cada material, **cuándo y con qué motivo**.

**e) Por resolver:** el filtro marca los vales con **reservas de más de 15 días** sin entregar (el plazo se configura). Resuélvelos: entrega, cierra con lo entregado o no entregues.

#### Reservas
**Solo consulta.** Lista lo apartado por vale, frente y antigüedad. Para actuar sobre una reserva toca **Abrir vale**: la decisión se toma **en el vale** para que nada quede a medias.

#### Salidas
Todo lo entregado, con vale, frente, supervisor y fecha. El botón **Consolidado** resume entregado y consumo por material y frente, entre dos fechas, y **descarga Excel** (hoja 1: consolidado; hoja 2: detalle).

#### Ajustes
Para corregir el inventario (positivo o negativo) con motivo. Un ajuste positivo genera su propio lote.

#### Devoluciones y Bajas
**Devoluciones:** lista lo que vuelve de los frentes; **Recibir** (evaluando el estado) o **Rechazar**. **Bajas:** lo que se dio de baja; se puede **revertir** y reevaluar.

#### Transferencias
Material que pasa de un frente a otro; se confirma automáticamente y deja ambos consumos correctos.

#### Kardex (menú ···)
Elige un material y verás **cada ingreso y salida con su saldo**. **Exportar Excel** disponible. El kardex se genera **solo** por triggers; nadie lo escribe a mano.

### 3.7 Planeamiento (`/planeamiento`)

Tres pestañas: **Frentes · RDC · Catálogo** (en celular abre en RDC).

#### Frentes
Tarjetas con filtros por **estado** (*Planificado, Próximo, Activo, Paralizado, Cerrado*), buscador y datos clave (sector, área, tipo de RD). Tocar una tarjeta abre su **ficha**.

#### Ficha del frente — 6 pestañas

1. **Resumen**: KPIs, datos del frente, alertas abiertas, avance por partida y últimos reportes.
2. **Procura** (con permiso `procura.ver`): metrados previstos por frente, con **versiones** (cada importación crea una nueva; nunca se pisa lo anterior), **comparación contra consumo** y desglose por zona.
3. **Control de sostenimiento**: avance de **Pernos, Malla y Cable**.
   - KPI: perforados, inyectados, falta perforar, falta inyectar (sobre el total de la biblioteca del plano).
   - **Por zona** y **Por ubicación** (cabecera, cuerpo, pie…) con barras de avance.
   - Tabla con **búsqueda** y filtros desde el embudito de cada columna. **Días pendiente** se pinta en **ámbar/rojo** según los días configurados **para ese frente** (o los globales si no puso).
   - **Exportar** (botón de arriba a la derecha de la ficha): un Excel con 3 hojas — *Pernos, Malla, Cable* — del frente completo, sin los filtros de pantalla.
   - Quien puede editar reportes ve un lápiz ✎ para **cambiar el código de un perno** ya reportado (cuando cambia la numeración del plano).
4. **Semanal**: semana de lunes a domingo con una tarjeta por día (resumen automático de la bitácora, metrados, estado *Enviado/Borrador/Sin reporte*). Vista **Por día** o **Por partida**, **Copiar resumen** (texto para WhatsApp/informe) y selector de semana.
5. **Reportes**: lista de los RDC del frente.
6. **Configuración** (solo con `frentes.editar`):
   - **General**: tipo de RD (S o P), RD padre, residente, estado.
   - **Control**: interruptor *Control de pernos* y **días de alerta ámbar/rojo propios** del frente.
   - **Zonas y prefijos** y **Partidas EDT** (con importación por Excel).
   - **Biblioteca de pernos** (el plano: código, zona, ubicación, diámetro, longitud) con importación por Excel.
   - **Archivos**: mapa del sector, firma del residente, carpeta de fotos *(datos preparados para la futura función "Emitir RD")*.

> **Control de pernos es por frente y se activa a propósito.** Un frente sin el interruptor funciona como siempre.

#### Catálogo
- **Catálogo de materiales** (código opcional, unidad, categoría, **nombre EDP**, conversión de unidades, stock mínimo). Importar/exportar por Excel. Desactivar en vez de borrar.
- **Catálogos del RDC** (`rdc.catalogos_gestionar`): Sectores, Frentes, Supervisores (con **cuenta vinculada**), Capataces, Redline, Maquinaria, Partidas estándar, Prefijos y Partidas EDT.

### 3.8 Calidad (`/calidad`)

**Solo lectura.** Lo ven quienes pueden leer todos los reportes (`rdc.ver_todos`): Calidad, Planeamiento, Coordinador, Administrador y Developer.

- Arriba: **Un frente | Comparar frentes**, y el **periodo** (7 días · 30 días · Todo).
- **Selector de frente**: escribe para buscar; recuerda el último usado.
- **Cinco controles**, cada tarjeta resume y abre su detalle:
  1. **Perforación**: `N / total` anclajes y ML. Botón **Reporte por mes**. **Avance por zona**: toca una ubicación para ver cada código (*perforado con fecha y longitud* / *falta*). Avisa de **códigos perforados que no están en la biblioteca**.
  2. **Inyección**: **bolsas de cemento según el reporte del supervisor**, ml inyectados, anclajes y **rendimiento ml/bolsa**. Tabla **por día** con su **fuente** (*Reporte*, *Bitácora*, *Sin dato*): un día que inyectó sin registrar bolsas se **avisa**. Toca un día para ver los anclajes inyectados. También lista los **perforados por inyectar**.
  3. **Malla**: paños instalados, m², tipo y zona. El área sale **siempre de los reportes** (ancho × largo que escribió el supervisor).
  4. **Cable**: ML por diámetro y tramos.
  5. **Pull test**: ensayos **ejecutados** y % ensayado sobre lo inyectado. *(El reporte no guarda carga ni resultado.)*
- **Comparar frentes**: una fila por frente con perforados, inyectados, bolsas, malla, cable y pull test (acumulado). Tocar una fila abre ese frente.
- **Exportar**: Excel del frente y periodo, una hoja por control.
- Solo cuentan **reportes enviados**; los borradores no.

### 3.9 Alertas (`/alertas`)

Las genera el sistema **cada hora**. Tipos: **Stock bajo**, **Stock agotado**, **Vale pendiente**, **Material no previsto**, **Riesgo de sobreconsumo**, **Sobreconsumo**, **Reserva prolongada**, **Inconsistencia de stock** y **RDC sin enviar a SharePoint**. Filtra por estado, tipo, nivel o frente. Quien tiene `alertas.resolver` puede **marcarlas resueltas**; quien tiene `alertas.configurar_umbrales` ajusta los umbrales.

### 3.10 Reportes (`/reportes`)

Para quien tiene `reportes.exportar`: **Procura vs consumo** (por frente, a Excel) y **consumo por periodo para el EDP** (entre dos fechas).

### 3.11 Usuarios y roles

**Usuarios y roles** (`/usuarios`):

- Lista con buscador y filtros por rol y estado.
- **Nuevo usuario**: nombre, correo, rol, contrato y (si es de campo) frente. La contraseña inicial se **genera sola** o la escribes (mínimo 8); se muestra **una sola vez** para entregársela.
- **Editar**: rol, contrato, frente, estado. *Heredar reporte completo* (solo Supervisor) clona el reporte anterior entero al crear uno nuevo.
- **Restablecer contraseña**, **desactivar** (deja de entrar, no se borra nada) o **eliminar** (si no tiene historial; si lo tiene, solo se desactiva).
- Un supervisor necesita además su fila en **Catálogo RDC → Supervisores** con la **cuenta vinculada** para que sus reportes salgan a su nombre.
- No puedes cambiar tu **propio** rol ni estado.

**Roles y permisos** (`/configuracion/roles`, solo `roles.gestionar`): crear roles y marcar qué permisos tiene cada uno. El cambio se aplica al **volver a iniciar sesión**.

### 3.12 Developer (`/developer`)

Solo rol Developer. **Herramientas de prueba**: *Ver como otra cuenta* (abre sesión real como otro usuario; aparece un banner para volver), *Heredar reporte RDC completo*, *Reiniciar ingresos / devoluciones*, *Vaciar el catálogo*, borrar vales y reportes de prueba. **Son destructivas.** No usar en datos reales.

### 3.13 Pantallas sin botón en el menú

- **Confirmación** (`/confirmacion`, `rdc.confirmar_metrados`): bandeja para **confirmar, corregir o ignorar** metrados reportados contra el previsto (partidas EDT). Funciona, pero se retiró del menú por no servirle al equipo tal como estaba.
- **Procura** (`/procura`): lista de procura por contrato y frente; hoy se usa desde la pestaña *Procura* de la ficha.
- **Avance de sostenimiento** (`/avance-sostenimiento`): redirige a *Control de sostenimiento* del primer frente.

---

## 4. Flujos completos y reglas que conviene saber

### 4.1 Del pedido a la entrega (vale)

```
Supervisor pide  →  Enviado  →  Almacén revisa stock y Procura
      ↓
¿Excede Procura?  → sí: Planeamiento autoriza     → no: Almacén responde
      ↓
Aprobado → stock RESERVADO para el frente
      ↓
Llega la movilidad → Entregar (todo o parte) → la salida descuenta stock físico + kardex
      ↓
¿Falta algo que ya no saldrá? → "Cerrar con lo entregado" / "No entregar" (motivo)
      ↓
Todas las líneas resueltas → Vale ATENDIDO (cierre automático)
```

### 4.2 Del RDC a la procura

```
Supervisor reporta pernos, malla, cable y metrados
      ↓
El sistema guarda cada elemento (código, zona, ubicación, medidas)
      ↓
Control de sostenimiento / Calidad / Semanal calculan avance contra la biblioteca y las partidas
      ↓
(Confirmación) Planeamiento confirma lo reportado contra lo previsto
```

### 4.3 Glosario

- **EDP / nombre EDP:** el nombre con el que el cliente **paga**. Varios materiales físicos pueden agruparse bajo un mismo nombre EDP (ej. barras de distintos largos). La procura y los reportes de consumo se miden **por nombre EDP**. Los nombres los define **Planeamiento** en *Catálogo → Nombres EDP*.
- **Procura:** lo **previsto** por frente (metrado). Se compara contra lo **consumido** (reservado + entregado).
- **Reserva:** stock apartado para un vale aprobado. No baja el físico; baja el **disponible**.
- **Contrato vs frente:** el **contrato** de una persona es estable; el **frente** rota. Nunca se deriva uno del otro.
- **El código de catálogo NO es identidad:** es solo una etiqueta visual. Lo que agrupa es el nombre EDP.
- **Biblioteca de pernos:** el plano de un frente (cada código con zona, ubicación, diámetro, longitud). Es el **total esperado**.
- **Lote:** cada ingreso es un lote; las entregas de materiales por rollo salen de un lote concreto.
- **RD tipo S / P:** un RD principal (P) puede agrupar varios RD secundarios (S).

### 4.4 Estados

- **Frente:** Planificado → Próximo → Activo → Paralizado / Cerrado. Un frente *próximo* se **activa solo** al llegar su fecha de inicio (lo revisa una tarea diaria). No se pueden pedir vales a un frente cerrado.
- **Reserva:** Activa → Parcial → Convertida / Liberada / Cancelada.
- **Devolución:** *Solicitada* → *Recibida* (el material llega *bueno* o *dañado*, y el dañado pasa a **Bajas**) o *Rechazada*.

### 4.5 Reglas que evitan errores

- Una **línea de vale** solo se puede reservar **una vez**.
- Liberar una reserva **cierra la línea** (Cancelado o Entregado con lo entregado); no queda colgada.
- Un **borrador borrado** desde otro dispositivo se **limpia solo** del tuyo al sincronizar.
- Un **reporte enviado no se borra**; solo se corrige.
- **Pernos y paños no se reportan dos veces** (en frentes con control de pernos).

---

## 5. Administración desde la app

### 5.1 Qué hace el sistema por su cuenta

No necesitas hacer nada para que esto ocurra:

| Proceso automático | Cuándo | Qué hace |
|---|---|---|
| **Alertas** | Cada hora | Revisa stock, vales, reservas, procura y reportes, y crea o actualiza las alertas. |
| **Activar frentes próximos** | Una vez al día | Pasa a *Activo* los frentes cuya fecha de inicio ya llegó. |
| **Kardex** | En cada movimiento | Se actualiza solo con cada ingreso, salida o ajuste. |
| **Estado del vale** | En cada cambio de una línea | Pasa solo a *Parcialmente atendido*, *Atendido* o *Cancelado*. |
| **Actualización de la app** | Al haber una versión nueva | Muestra el aviso **Actualizar**. |
| **Envío del RDC y de las fotos** | Al volver la señal | Reintenta solo (a los 0, 1, 5, 15 y 60 minutos). |

### 5.2 Permisos y seguridad

- Los permisos se administran en **Roles y permisos**: cada rol es una lista de permisos que se marcan o desmarcan. Un cambio se aplica a la persona **cuando vuelve a iniciar sesión**.
- Un permiso **nunca se "salta"**: aunque alguien escriba una dirección que no le corresponde, la app lo devuelve a su pantalla de inicio y el sistema rechaza el dato.
- Cada vale guarda su **Historial** (quién, cuándo y por qué). Hay además una bitácora de auditoría para quien tiene el permiso `auditoria.ver`.
- Lo que se **desactiva no se borra**: materiales, usuarios con historial y reportes enviados quedan como registro.

### 5.3 Tareas comunes de administración

| Quiero… | Hago… |
|---|---|
| **Crear un usuario** | *Usuarios y roles → Nuevo usuario*. Si es supervisor, vincularlo en *Planeamiento → Catálogo → Supervisores* (campo *Cuenta vinculada*) para que sus reportes salgan a su nombre. |
| **Restablecer una contraseña** | Abrir al usuario → *Restablecer contraseña*. Se muestra una sola vez para entregársela. |
| **Dar de baja a un usuario** | Abrirlo → *Desactivar* (deja de entrar, no se borra nada). |
| **Cambiar el rol de alguien** | Abrirlo → elegir el rol → guardar. La persona debe cerrar sesión y volver a entrar. |
| **Darle un permiso a un rol** | *Roles y permisos* → marcar el permiso. |
| **Crear un rol nuevo** | *Roles y permisos* → crear el rol y marcar sus permisos. |
| **Crear un frente** | *Planeamiento → Frentes → Nuevo frente*, luego completar su ficha y subir su **biblioteca de pernos** (Excel). |
| **Activar el control de pernos** | Ficha del frente → *Configuración → Control*. |
| **Cambiar los días de alerta ámbar/rojo de un frente** | Ficha del frente → *Configuración → Control*. Vacío = usa los valores generales. |
| **Pasar un frente a paralizado o cerrado** | Ficha del frente → *Configuración → General → Estado*. |
| **Dar de baja un material** | *Planeamiento → Catálogo* → desactivar (no se borra). |
| **Cargar o corregir un ingreso** | *Almacén → Ingresos* → *Nuevo ingreso* o *Corregir*. |
| **Soltar material de un vale** | En el vale: *No entregar* o *Cerrar con lo entregado* (con motivo). |
| **Ajustar el inventario** | *Almacén → Ajustes → Nuevo ajuste* (positivo o negativo, con motivo). |
| **Corregir el código de un perno ya reportado** | Ficha del frente → *Control de sostenimiento* → lápiz ✎ junto al código (requiere `rdc.editar_todos`). |
| **Resolver una alerta** | *Alertas* → marcar como resuelta (requiere `alertas.resolver`). |
| **Exportar datos** | Botones *Exportar* / *Descargar Excel* de cada pantalla (Stock, Salidas, Kardex, Control de sostenimiento, Calidad, Reportes). |
| **Ver quién hizo qué en un vale** | Abrir el vale → desplegable **Historial del vale**. |

### 5.4 Buenas prácticas

- **Una persona, una cuenta.** No compartas usuarios: el historial de cada vale y reporte depende de ello.
- **Desactiva, no borres.** Es lo que conserva la trazabilidad.
- **Antes de cambiar el rol o los permisos de alguien**, revisa la matriz del [Anexo 8](#8-anexo-matriz-completa-de-permisos).
- **Revisa cada semana** el filtro **Por resolver** de los vales y la lista de **Alertas**.
- **No uses *Developer* con datos reales.** Sus herramientas (reiniciar ingresos, vaciar el catálogo, borrar pruebas) **son destructivas**.

---

## 6. Problemas frecuentes y su solución

| Síntoma | Causa | Solución |
|---|---|---|
| **"Perno XXX ya está perforado en otro reporte sin sincronizar"** pero no veo ese reporte | Un borrador borrado desde otro dispositivo seguía guardado en el tuyo | Actualiza la app (**Actualizar**) y con internet vuelve a intentarlo: se limpia solo. |
| **El Dashboard abre casi vacío** | El rol no tiene el permiso `rdc.ver_resumen_campo` | En *Roles y permisos* dárselo al rol; la persona cierra sesión y vuelve a entrar. |
| **Un vale queda "Parcialmente atendido" para siempre** | Una línea reservada que ya no se entregará | En el vale usar **No entregar** o **Cerrar con lo entregado**. |
| **"La línea ya se respondió"** al aprobar | Otra persona respondió el vale | Vuelve a abrir el vale y revisa cómo quedó. |
| **No aparece el frente al crear un vale** | Solo se ofrecen frentes **activos** | Revisar el estado del frente en Planeamiento. |
| **No me deja enviar el reporte** | Falta un dato obligatorio (p. ej. **bolsas de cemento** con inyección) | Completar el campo que indica el Resumen. |
| **El reporte no llegó a SharePoint** | Falló el envío del Excel | Reintenta solo; si persiste aparece la alerta *RDC sin enviar a SharePoint* y hay que avisar a soporte. |
| **No veo la última versión** | La PWA aún no se actualizó | Toca **Actualizar**; si no aparece, cierra y vuelve a abrir la app. |
| **No puedo borrar un reporte** | Ya fue enviado | Los enviados no se borran; se corrigen (`rdc.editar_todos`). |
| **No me deja entrar a Frentes/Catálogo** | Tu rol está excluido a propósito (Supervisor, Almacén) | Es lo esperado; esas pantallas no son de tu rol. |
| **Un usuario no puede entrar tras cambiar su rol** | El rol se aplica al volver a iniciar sesión | Que cierre sesión y entre de nuevo. |
| **No se puede eliminar un usuario** | Tiene historial (vales, reportes) | Se **desactiva**; no se borra. |
| **Sin señal en el frente** | Normal | Reporta igual; el RDC y las fotos se envían solos al volver la señal. |

---

## 7. Funciones previstas que aún no existen

Hoy la app **no** hace lo siguiente. Si lo necesitas, ten presente que no está disponible:

- **Emitir RD** (el botón existe pero está deshabilitado: *"Disponible próximamente"*).
- **Resultado del pull test:** hoy solo se registra que el ensayo **se hizo**; no guarda carga aplicada, desplazamiento ni si fue conforme.
- **Bolsas de cemento por perno:** hoy se registran **por reporte**, no por perno; en Calidad se ven por día y como rendimiento (ml por bolsa).
- **Avisos en la pestaña Semanal** de la ficha del frente.
- **Logo oficial** en el icono de la app: hoy es una "D" ámbar sobre negro.

## 8. Anexo: matriz completa de permisos

Cada fila es un permiso (`codigo`) y los roles que lo tienen. Total: 59 permisos.

Leyenda de columnas: **Adm** = Administrador · **Alm** = Almacen · **Cal** = Calidad · **Con** = Consulta · **Coo** = Coordinador · **Dev** = Developer · **Pla** = Planeamiento · **Res** = Residencia · **Sup** = Supervisor. **✓** = lo tiene.


**Alertas**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `alertas.configurar_umbrales` | Editar parámetros de configuración | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| `alertas.resolver` | Marcar alertas como resueltas | ✓ | ✓ |  |  | ✓ | ✓ | ✓ |  |  |
| `alertas.ver` | Ver alertas | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Almacen**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `almacenes.gestionar` | Crear/editar almacenes | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| `salidas.registrar_entrega` | Registrar entrega física (parcial o total) | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |
| `stock.registrar_ajuste` | Registrar ajustes de inventario | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |
| `stock.registrar_ingreso` | Registrar ingresos de material | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |
| `stock.ver` | Ver stock físico/reservado/disponible | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Auditoria**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `auditoria.ver` | Ver bitácora de auditoría | ✓ |  |  |  | ✓ | ✓ |  |  |  |

**Catalogo**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `catalogo.crear` | Crear materiales | ✓ | ✓ |  |  | ✓ | ✓ | ✓ |  |  |
| `catalogo.desactivar` | Desactivar materiales | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `catalogo.editar` | Editar materiales | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `catalogo.importar_exportar` | Importar/exportar catálogo desde Excel | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `catalogo.ver` | Ver catálogo de materiales | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Dashboard**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `dashboard.ver` | Ver dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Devoluciones**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `devoluciones.crear` | Solicitar devolución de material |  | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `devoluciones.recibir_rechazar` | Recibir o rechazar una devolución | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |
| `devoluciones.ver_propias` | Ver las devoluciones propias |  | ✓ |  |  | ✓ | ✓ |  | ✓ | ✓ |
| `devoluciones.ver_todas` | Ver todas las devoluciones | ✓ | ✓ |  |  | ✓ | ✓ | ✓ |  |  |

**Frentes**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `frentes.cerrar` | Cerrar frentes | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `frentes.crear` | Crear frentes | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `frentes.editar` | Editar frentes | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `frentes.ver` | Ver frentes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Kardex**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `kardex.exportar` | Exportar Kardex | ✓ | ✓ |  |  | ✓ | ✓ | ✓ |  |  |
| `kardex.ver` | Ver Kardex | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Procura**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `procura.crear_version` | Crear nueva versión de un metrado | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `procura.ver` | Ver metrados Procura | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `procura.ver_comparacion` | Ver comparación Procura vs consumo | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Rdc**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `rdc.catalogos_gestionar` | Administrar los catálogos del RDC (frentes, supervisores, prefijos, maquinaria, partidas) | ✓ |  |  | ✓ | ✓ | ✓ | ✓ |  |  |
| `rdc.confirmar_metrados` | Confirmar, corregir o ignorar metrados reportados en el RDC | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `rdc.crear` | Crear reportes diarios de campo | ✓ |  |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `rdc.editar_propio` | Editar el reporte propio mientras sigue abierto | ✓ |  |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `rdc.editar_todos` | Editar cualquier reporte diario, sin importar quién lo creó | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `rdc.exportar` | Exportar reportes diarios a Excel | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `rdc.ver_propios` | Ver los reportes propios | ✓ |  |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `rdc.ver_resumen_campo` | Ver el resumen de "quién está en campo hoy" en el Dashboard (frente, supervisor, capataz, personal/equipos) — sin poder abrir el reporte completo de otro | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `rdc.ver_todos` | Ver todos los reportes diarios | ✓ |  | ✓ |  | ✓ | ✓ | ✓ |  |  |

**Reportes**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `reportes.exportar` | Exportar reportes generales | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |

**Reservas**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `reservas.liberar_manual` | Liberar una reserva manualmente | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |
| `reservas.ver` | Ver reservas | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Sistema**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `sistema.borrar_pruebas` | Borrar vales y reportes del RDC (limpieza de pruebas) |  |  |  |  |  | ✓ |  |  |  |
| `sistema.suplantar_usuario` | Abrir una sesión real como otra cuenta, para ver el sistema desde su punto de vista |  |  |  |  |  | ✓ |  |  |  |

**Transferencias**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `transferencias.confirmar_rechazar` | Confirmar o rechazar una transferencia | ✓ | ✓ |  |  | ✓ | ✓ |  |  |  |
| `transferencias.crear` | Solicitar transferencia de material entre frentes |  | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `transferencias.ver_propias` | Ver las transferencias propias |  | ✓ |  |  | ✓ |  |  | ✓ | ✓ |
| `transferencias.ver_todas` | Ver todas las transferencias | ✓ | ✓ |  |  | ✓ | ✓ | ✓ |  |  |

**Usuarios**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `roles.gestionar` | Crear roles y asignar permisos | ✓ |  |  |  |  | ✓ |  |  |  |
| `usuarios.crear` | Crear usuarios | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `usuarios.desactivar` | Desactivar usuarios | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `usuarios.editar` | Editar usuarios | ✓ |  |  |  | ✓ | ✓ | ✓ |  |  |
| `usuarios.ver` | Ver listado de usuarios | ✓ |  |  |  |  | ✓ | ✓ |  |  |

**Vales**

| Permiso | Qué permite | Adm | Alm | Cal | Con | Coo | Dev | Pla | Res | Sup |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `vales.aprobar_rechazar` | Aprobar o rechazar líneas de un vale | ✓ | ✓ |  |  | ✓ | ✓ | ✓ |  |  |
| `vales.cancelar` | Cancelar un vale | ✓ | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `vales.crear` | Crear vales | ✓ | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `vales.crear_para_otro` | Crear un vale en nombre de otro supervisor (carga manual, ej. por WhatsApp) | ✓ | ✓ |  |  | ✓ | ✓ | ✓ | ✓ |  |
| `vales.editar_propio` | Editar vale propio en borrador | ✓ | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `vales.enviar` | Enviar vale para revisión | ✓ | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `vales.ver_propios` | Ver vales propios | ✓ | ✓ |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `vales.ver_todos` | Ver todos los vales | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |

*Manual elaborado el 28/10/2026 a partir del sistema en funcionamiento.*

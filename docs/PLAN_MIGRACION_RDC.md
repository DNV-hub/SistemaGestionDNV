# Plan de fusión: RDC + SistemaGestionDNV → aplicación única

Documento de trabajo para el agente de desarrollo. Léelo completo antes de escribir código.

---

## 1. Contexto

Existen dos aplicaciones independientes en Grupo Desnivel:

**A. RDC (Reporte Diario de Campo)** — `OneDrive\...\08 APLICATIVO RDC`
- HTML/CSS/JS vanilla, sin framework ni build step. Un solo `index.html`.
- PWA instalable (`manifest.json` + `sw.js`). Funciona sin señal.
- **Sin autenticación.** El usuario elige su nombre de un desplegable de supervisores.
- Supabase vía CDN, usado **solo para catálogos**: `supervisores`, `capataces`, `redline_supervisores`, `sectores`, `frentes`, `prefijos`, `vales_materiales`.
- Los reportes diarios y las fotos **no** van a Supabase: salen por webhook de Power Automate hacia SharePoint.
- Pantallas: Inicio, RDC (sub-tabs `datos`, `jornada`, `metrados`, `obs`, `resumen`), Fotos, Vales, Sketch's, panel Admin.
- Archivos clave: `rdc.js` (174 KB), `config.js` (96 KB), `admin.js` (29 KB), `vales.js` (28 KB), `fotos.js`, `navegacion.js`, `supabase.js`.

**B. SistemaGestionDNV** — `D:\Sistema-Gestion-Materiales\SistemaGestionDNV`
- Vue 3 Composition API + Vite (Rolldown) + vue-router + Pinia.
- Supabase completo: 24 tablas, RLS, Auth, Realtime, 3 Edge Functions, 27 migraciones aplicadas.
- 13 módulos con patrón uniforme: `views/`, `services/`, `store/`, `routes.js`.
- Autenticación con roles y permisos aplicados por RLS en base de datos.
- Netlify + `netlify.toml`.

---

## 2. Qué significa "una sola app"

Esto no es integrar dos aplicaciones que conviven. Es **fusionarlas en un único producto**. Al terminar debe existir una sola aplicación, con una sola URL, un solo login y una sola identidad visual, donde RDC es un módulo más del menú, indistinguible en apariencia de Almacén, Vales o Kardex.

Concretamente:

- **Una sola shell.** Un solo sidebar, un solo header, un solo sistema de rutas. El usuario no percibe que alguna vez fueron dos apps.
- **Un solo login.** El usuario entra una vez y accede a todos los módulos según sus permisos. Un supervisor verá RDC, Fotos y Vales; un almacenero verá Almacén, Kardex y Reservas. Es el mismo login, cambia lo que se muestra.
- **Una sola identidad visual.** El RDC adopta el sistema de diseño del Sistema. No se portan sus estilos ni su iconografía Tabler: se reconstruye con los componentes compartidos que ya existen.
- **Una sola base de datos.** Las tablas del RDC viven en el mismo proyecto Supabase que las del Almacén.
- **El RDC vanilla desaparece** al final del proceso. No se mantienen dos aplicaciones.

Lo que **no** se fusiona es el flujo de vales: el módulo `vales.js` del RDC solo tenía catálogo y exportación a texto de WhatsApp. Se descarta. Los supervisores usarán el módulo `vales` del Sistema, que ya tiene el flujo completo hasta el almacén.

---

## 3. Restricciones duras

Estas no son sugerencias. Violar cualquiera de ellas rompe operación real.

1. **La app RDC está EN PRODUCCIÓN y en uso diario por supervisores en campo. NO se modifica ni un archivo de ese proyecto.** Se usa exclusivamente como fuente de lectura para entender el modelo de datos y la lógica.

2. **Todo el trabajo ocurre en `SistemaGestionDNV`, en la rama `feat/modulo-rdc`.** Nunca commits directos a `main`.

3. **Minutos de build de Netlify limitados (~133 restantes).** No configurar deploys automáticos de rama ni deploy previews. Ver sección 10.

4. **Los metrados del RDC (avance de obra) NO se relacionan con `metrados_procura` (materiales).** Son dimensiones distintas. No crear FKs, joins ni vistas que los mezclen. Si en el futuro se cruzan, será una decisión explícita del usuario.

5. **Las fotos siguen yendo por Power Automate → SharePoint.** No se almacenan en Supabase Storage.

6. **Migraciones SQL:** numeración correlativa continuando desde la última aplicada (la #27). Nunca editar una migración ya aplicada; siempre crear una nueva.

7. **No inventar campos.** El esquema se deriva leyendo el código real del RDC, no suponiendo.

8. **El módulo RDC debe funcionar sin señal.** Confirmado por el usuario: el RDC actual permite llenar el reporte offline y lo envía al recuperar conexión. Los supervisores trabajan en mina. Esto condiciona el esquema (A.2), la autenticación (Fase B) y la capa de servicios (Fase C). Un módulo RDC que exija conexión es una regresión respecto a lo que ya tienen hoy.

9. **La sesión no debe expirar en campo.** El usuario pidió explícitamente que el login "no pida a cada rato". Ver Fase B.

10. **Unidad visual obligatoria.** Ningún módulo nuevo introduce estilos, fuentes, paletas ni librerías de iconos propias. Ver sección 9.

---

## 4. Preparación

Copiar el proyecto RDC dentro del repo del Sistema como **material de referencia de solo lectura**:

```
SistemaGestionDNV/
  _referencia-rdc/     <- copia del proyecto RDC (agregar a .gitignore)
```

Es una copia. La original en OneDrive no se toca. Sirve para leer `rdc.js`, `config.js` y `fotos.js` sin salir del workspace.

Crear la rama:

```bash
git checkout -b feat/modulo-rdc
```

---

## 5. Fase A — Modelo de datos

**Esta fase es solo análisis y SQL. Cero código Vue.**

### A.1 Ingeniería inversa del RDC

Leer `_referencia-rdc/js/rdc.js`, `config.js` y `admin.js` y producir `docs/MODELO_RDC.md` que responda:

- Qué campos captura cada sub-tab (`datos`, `jornada`, `metrados`, `obs`, `resumen`).
- Qué estructura exacta tiene el payload JSON enviado al webhook de Power Automate (buscar en `rdc.js` la sección "ENVÍO DEL REPORTE", ~línea 2705). **Este payload debe replicarse idéntico**, porque el flujo de Power Automate que genera el entregable en SharePoint depende de su forma.
- Qué hay en `config.js` (96 KB): qué es catálogo que debería vivir en tablas y qué es configuración estática que puede quedar como constante.
- Cardinalidades reales: ¿un reporte tiene N capataces? ¿N equipos? ¿N partidas de metrado?
- Cómo se identifica hoy al autor del reporte (qué campo guarda el supervisor elegido en el desplegable).

**No avanzar a A.2 sin que el usuario revise este documento.**

### A.2 Diseño de tablas

Esqueleto propuesto, a ajustar según lo que arroje A.1:

| Tabla | Contenido |
|---|---|
| `rdc_reportes` | Cabecera: fecha, turno, supervisor_id, frente_id, sector_id, estado, creado_por, creado_en |
| `rdc_personal` | Detalle N:1 con reporte: capataz_id, categoría, cantidad |
| `rdc_maquinaria` | Detalle N:1: equipo, horómetro inicial/final, horas trabajadas |
| `rdc_metrados` | Detalle N:1: partida, cantidad ejecutada, prefijo_id / ubicación |
| `rdc_observaciones` | Detalle N:1: tipo, descripción, clima, incidencias |

Catálogos que se migran desde el proyecto Supabase del RDC: `supervisores`, `capataces`, `redline_supervisores`, `sectores`, `prefijos`.

**Punto crítico a resolver antes de escribir el SQL:** la tabla `frentes` existe en AMBOS sistemas. Comparar estructura y contenido real de las dos. Determinar si son el mismo concepto de negocio. Si lo son, se unifica en la tabla existente del Sistema. Si no, renombrar la del RDC a `rdc_frentes`. **Reportar el hallazgo al usuario antes de decidir.**

**Autoría del reporte — dos campos, no uno:**

- `creado_por` → FK a `usuarios`. Quién estaba autenticado al llenarlo. Lo llena el sistema, no el formulario.
- `supervisor_id` → FK a `supervisores`. Quién es el responsable del frente ese día.

Normalmente son la misma persona, pero separarlos permite que un asistente llene el reporte de un supervisor sin falsear la autoría. Es el requisito que el usuario planteó: *"que se sepa quién lo envía o quién lo realiza"*.

Agregar a `supervisores` una FK opcional `usuario_id` hacia `usuarios`, para vincular cada supervisor con su cuenta de acceso.

**Requisitos de esquema impuestos por el modo offline (restricción 8):**

- La PK de `rdc_reportes` y de todas sus tablas de detalle es un **UUID generado en el cliente**, no `serial` ni `identity`. El reporte nace con identidad en el celular antes de existir en el servidor. Esto hace la sincronización idempotente: si la conexión se corta a mitad del envío y el cliente reintenta, el `upsert` reconoce el mismo UUID y no duplica.
- `rdc_reportes` lleva metadata de sincronización: `creado_en_dispositivo` (timestamp local del llenado, distinto de `creado_en` del servidor) y `sincronizado_en`.
- Estados de envío separados por destino: puede haberse guardado en Supabase y haber fallado el webhook, o al revés. Modelar `estado_supabase` y `estado_sharepoint` independientes, no un solo campo `enviado`.
- Constraint de unicidad de negocio (supervisor + frente + fecha + turno) para evitar reportes duplicados del mismo día desde dos dispositivos.

### A.3 RLS y permisos

Seguir el patrón existente: permisos en base de datos, no solo en frontend. Registrar los permisos nuevos en `permisos` y `rol_permisos`. Crear el rol `supervisor` si no existe.

Un supervisor debe poder crear reportes, editar los propios del día en curso, y leer el histórico de su frente. No debe poder modificar reportes de otros ni acceder a los módulos de almacén.

### A.4 Entregable de la fase

- `docs/MODELO_RDC.md`
- Migraciones `028_*.sql` en adelante en `backend/supabase/migrations/`
- Script de migración de catálogos desde el proyecto Supabase del RDC, en `backend/scripts/`
- Resumen en chat: tablas creadas, decisión sobre `frentes`, permisos y rol agregados

---

## 6. Fase B — Identidad y sesión

El Sistema ya tiene autenticación. Esta fase no la construye: la **adapta al uso en campo**, que es radicalmente distinto al de oficina.

### B.1 Cuentas para supervisores

Hoy el RDC no tiene login: el supervisor se elige de un desplegable, lo que significa que cualquiera puede emitir un reporte a nombre de cualquiera. Al fusionar, cada supervisor necesita cuenta propia.

- Usar las Edge Functions existentes (`crear-usuario`) para dar de alta a los supervisores.
- Vincular cada registro de `supervisores` con su `usuario_id`.
- Asignarles el rol `supervisor`.
- Entregar al usuario una lista de las cuentas creadas para que distribuya credenciales.

### B.2 Sesión larga y tolerante a la falta de red

Requisito del usuario: que no pida login a cada rato. En campo esto no es comodidad, es funcionalidad — un supervisor sin señal que sea deslogueado no puede trabajar.

- Configurar el cliente Supabase con `persistSession: true` y `autoRefreshToken: true`, almacenando la sesión en `localStorage`.
- Ampliar la vigencia del refresh token en la configuración de Auth del proyecto Supabase (el JWT de acceso dura 1 hora por defecto y se renueva solo; el refresh token es el que define cuánto puede pasar un dispositivo sin conectarse antes de exigir login de nuevo). Coordinar el valor con el usuario según la rotación 14×7 del personal.
- **Regla crítica:** un fallo de renovación del token estando sin red **no debe cerrar la sesión ni bloquear la app**. La aplicación debe seguir permitiendo llenar reportes offline y reintentar la autenticación al recuperar conexión. Solo se fuerza el login si el refresh token está genuinamente vencido y hay red para comprobarlo.
- La identidad del autor (`creado_por`) se captura **al momento de llenar el reporte**, no al momento de sincronizar. Si el reporte se envía tres días después, debe conservar quién lo llenó y cuándo.

### B.3 Menú según permisos

El sidebar es uno solo, pero muestra únicamente los módulos que el rol del usuario permite. Un supervisor no debería ver Kardex ni Procura. Usar el sistema de permisos que ya existe, sin duplicar lógica.

---

## 7. Fase C — Módulo RDC en Vue

Solo empezar cuando las fases A y B estén aprobadas.

Estructura siguiendo el patrón existente del repo:

```
frontend/src/modules/rdc/
  views/
    RdcListaView.vue        # histórico de reportes, filtros por fecha/frente/supervisor
    RdcFormularioView.vue   # contenedor con los 5 pasos
    RdcDetalleView.vue      # vista de solo lectura de un reporte enviado
  components/
    PasoDatos.vue
    PasoJornada.vue
    PasoMetrados.vue
    PasoObservaciones.vue
    PasoResumen.vue
  services/rdcService.js
  store/rdcStore.js
  routes.js
```

Reglas de implementación:

- Reutilizar los componentes compartidos existentes (`BotonIcono`, `BuscadorMaterial`, `IconoNav`, `GraficoArea`, `GraficoDona`). No crear duplicados.
- El formulario debe funcionar bien en pantalla de celular. Es el caso de uso principal.
- Guardado progresivo: el borrador se persiste conforme el supervisor avanza entre pasos, no solo al final.
- La pantalla "Inicio" del RDC vanilla no se porta. El dashboard del Sistema es la única pantalla de entrada.

### Capa de datos: NO copiar el patrón de los otros módulos

Los 13 módulos existentes llaman a Supabase directamente desde sus `services/`. Correcto para back-office con conexión estable, **inservible para el RDC**.

El módulo RDC escribe siempre contra un repositorio local, nunca contra la red directamente:

```
Vista  →  rdcStore (Pinia)  →  rdcRepository (IndexedDB)  →  syncService  →  Supabase + Power Automate
```

- `rdcRepository` es la única fuente de verdad para las vistas. Guarda borradores y reportes terminados en IndexedDB (usar `dexie` o `idb`; no escribir un wrapper propio).
- Los catálogos (`supervisores`, `capataces`, `frentes`, `sectores`, `prefijos`) se cachean en IndexedDB al iniciar sesión con conexión, para que el formulario pueda renderizarse offline. Refrescar cuando haya red.
- `syncService` corre en background: detecta conexión (`navigator.onLine` + reintento con backoff), toma los pendientes de la cola y los envía. Dos destinos independientes, marcando `estado_supabase` y `estado_sharepoint` por separado, reintentando solo el que falló.
- La UI muestra siempre el estado de cada reporte: borrador, pendiente de envío, enviado, o error. El supervisor debe ver que su reporte quedó guardado aunque no haya señal.
- Al enviar, **escritura doble**: Supabase Y el webhook de Power Automate con el payload idéntico al actual, para que el entregable en SharePoint no cambie.

Esta capa se construye **junto con las vistas**, no después. Agregarla al final implicaría reescribir todos los servicios.

### Dashboard

Extender el módulo `dashboard` existente con: personal por frente, horas de maquinaria, acumulado de metrados de avance por partida y por frente. Chart.js, como el resto del sistema.

---

## 8. Fase D — Fotos, Sketch's y PWA

**Fotos:** portar `fotos.js` a `modules/fotos/`. Mantiene el envío por Power Automate hacia SharePoint sin cambios. Solo cambia el envoltorio de UI. Debe respetar la misma lógica de cola offline que el RDC.

**Sketch's:** portar manteniendo la carga bajo demanda contra SharePoint. **No hacerla automática al abrir la app** — fue una decisión de diseño explícita para no saturar SharePoint.

**PWA:**
- Configurar `vite-plugin-pwa` con manifest e íconos propios (reutilizar los del RDC actual, están en `_referencia-rdc/`).
- Cache del app shell para que la aplicación abra sin red. Cuidado: el Sistema es SPA con `vue-router` en history mode y `netlify.toml` con redirects; verificar que el service worker no rompa rutas profundas.
- Revisar `_referencia-rdc/sw.js` para no regresar en capacidad respecto a lo que ya hace hoy.

### Pruebas obligatorias antes de dar por cerrada la fusión

En celular real, no solo en DevTools:

1. Abrir la app con señal, cerrarla, activar modo avión, reabrirla → debe cargar.
2. Llenar un reporte completo en modo avión → debe guardarse como pendiente.
3. Cerrar la app por completo y reabrirla en modo avión → el pendiente debe seguir ahí.
4. Restaurar señal → debe sincronizar solo, sin intervención.
5. Cortar la señal a mitad de un envío y restaurarla → debe reintentar sin duplicar.
6. Verificar que el reporte llegó a Supabase Y a SharePoint.
7. Pasar varios días sin abrir la app y volver a abrirla sin señal → **no debe pedir login**.

---

## 9. Unidad de interfaz (transversal a todas las fases)

El objetivo es que nadie distinga qué módulo vino de qué aplicación.

- **Paleta:** ámbar `#F5A800` como color de marca. Sidebar siempre oscuro, en todos los temas.
- **Tipografía:** Outfit. Una sola familia en toda la aplicación.
- **Iconografía:** la del Sistema. **No portar Tabler Icons desde el RDC.** Los iconos se reconstruyen con el componente `IconoNav` / SVG inline existente.
- **Componentes:** antes de crear cualquier control nuevo, revisar si ya existe en `components/` compartidos. Si un módulo necesita una variante, se extiende el componente compartido, no se clona.
- **Densidad y espaciado:** los mismos del resto del sistema. El módulo RDC no puede "verse distinto" por haber sido portado.
- **Móvil:** el RDC es el módulo con más uso en celular. Si algún componente compartido no responde bien en pantalla chica, se mejora el compartido para todos, no se crea uno paralelo para RDC.

Antes de dar por cerrada la Fase C, poner lado a lado una captura del módulo Almacén y una del módulo RDC. Si se ven como dos aplicaciones distintas, la fase no está terminada.

---

## 10. Cómo revisar sin gastar minutos de Netlify

Regla: **el build se hace en la máquina local, no en Netlify.**

Desarrollo diario:
```bash
npm run dev
```

Prueba en celular sin gastar minutos de build — se sube el resultado ya compilado:
```bash
npm run build
netlify deploy --dir=dist --alias=rdc-test
```
Netlify no compila nada, solo recibe `dist/`. **No consume minutos de build.** Devuelve una URL tipo `rdc-test--tuapp.netlify.app`.

Además, en el panel de Netlify: desactivar *Branch deploys* y *Deploy Previews* para que ningún push a `feat/modulo-rdc` dispare un build automático.

Revisión de código:
```bash
git diff main..feat/modulo-rdc
```

---

## 11. Qué NO hacer

- No tocar el proyecto RDC en producción.
- No hacer merge a `main` sin aprobación explícita del usuario.
- No editar migraciones ya aplicadas.
- No conectar metrados de avance (RDC) con `metrados_procura` (materiales).
- No mover fotos a Supabase Storage.
- No insertar en `kardex` manualmente — se genera por triggers.
- No hacer que las vistas del RDC llamen a Supabase directamente. Siempre pasan por el repositorio local.
- No usar PKs autoincrementales en las tablas RDC. Rompen la sincronización offline.
- No portar los estilos, la fuente ni los iconos del RDC vanilla.
- No cerrar sesión automáticamente cuando falla la renovación del token sin red.
- No dejar que el supervisor elija su identidad de un desplegable. La autoría sale de la sesión autenticada.
- No refactorizar módulos existentes del Sistema "de paso". El scope es fusionar el RDC, no reescribir lo que funciona.
- No avanzar de fase sin entregar el resumen y esperar aprobación.

---

## 12. Protocolo de reporte

Al terminar cada fase, entregar en chat:

1. Qué se creó o modificó (lista de archivos).
2. Decisiones tomadas que no estaban en este plan y por qué.
3. Bloqueos o ambigüedades que requieren decisión del usuario.
4. Qué falta para cerrar la fase.

Luego detenerse y esperar.

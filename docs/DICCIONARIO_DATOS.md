# Diccionario de datos — Sistema de Gestión DNV

> **Última actualización: 2026-10-06 (tarde)**
> Generado por introspección directa del esquema `public` del único proyecto Supabase
> (producción — no hay entorno de desarrollo separado). Pensado para que un agente de
> IA entienda el modelo de datos real sin tener que leer migración por migración.
> Complementa (no reemplaza) a [`ARQUITECTURA.md`](./ARQUITECTURA.md) y
> [`MODELO_RDC.md`](./MODELO_RDC.md) — aquellos explican decisiones de diseño;
> este documento es el estado actual, literal, de las tablas.
>
> `docs/MODELO_DATOS_Y_FLUJOS.md` es una propuesta de una fase temprana (anterior a
> `contrato_id`, a todo el módulo RDC y a Confirmación de metrados) — histórico, no
> confiable como fuente del esquema actual.

## Registro de cambios

- **2026-10-05** — Creación inicial. Relevadas 44 tablas del esquema `public`
  (columnas, foreign keys, primary keys, checks, índices únicos) + ~45 funciones
  de negocio (`fn_*`, `has_permission`, `rdc_puede_*`). Excluye tablas internas de
  Supabase (`auth.*`, `storage.*`, `realtime.*`, etc.) y funciones de la extensión
  `pg_trgm`.
- **2026-10-05** — Aclaraciones pedidas tras una revisión de otro agente: estado
  real de `tipo_medicion='digitado'` (343 filas huérfanas, sin UI activa),
  semántica exacta de `origen IN ('libre','estandar')`, y un caso real de doble
  conteo encontrado y corregido (ver notas de `rdc_reporte_metrados_edt` y
  `rdc_metrados_confirmacion`).
- **2026-10-05** — Causa raíz del doble conteo corregida en
  `fn_rdc_sincronizar_confirmaciones` (ya no genera `digitado_edt` si la
  partida dejó de ser `digitado`) y en el `select` offline de
  `rdcService.js` (ahora sí trae `tipo_medicion`). `tipo_medicion='digitado'`
  declarado obsoleto: quitado del selector de Configuración, y las 343 filas
  que lo tenían se resolvieron (187 archivadas, 156 reclasificadas a
  `solo_seguimiento` — ver nota de `rdc_partidas_edt`).
- **2026-10-06** — Se agregó el panel de solo lectura "Avance de partidas" en
  el RDC del supervisor (Previsto/Acumulado/Hoy/Saldo, sin ningún campo para
  digitar) para no perder visibilidad tras quitar el bloque de `digitado`. Se
  creó la cuenta técnica "Mantenimiento del Sistema" para atribuir
  correcciones manuales en la base (ver nota de `rdc_metrados_confirmacion`).
- **2026-10-06** — Auditoría de la `sb_secret_...` usada para crear esa
  cuenta: no quedó en ningún commit ni archivo del repo (verificado con `git
  status`/`git log --all`), pero sí pasó por la transcripción de esta sesión
  de Claude Code (inevitable: leer/escribir el archivo temporal con la clave
  la vuelve visible en el propio historial de la sesión, aunque el archivo
  en disco ya se borró) — rotación recomendada si se quiere cerrar ese
  margen del todo. Se identificaron las 4 Edge Functions que sí dependen de
  `SUPABASE_SERVICE_ROLE_KEY` en producción (`crear-usuario`,
  `eliminar-usuario`, `restablecer-password`, `suplantar-usuario` — todas
  `ACTIVE`, usadas por Usuarios y roles / Developer) más 3 scripts locales de
  mantenimiento (`backend/scripts/*.mjs`) que la leen del entorno al
  ejecutarse a mano. Se corrigió además el email/estado de la cuenta técnica:
  pasó de `mantenimiento@dnv.com` (dominio real, con correo activo — no
  apto) a `mantenimiento@invalid.local`, y se bloqueó el login
  (`banned_until`) en vez de confiar solo en que nadie supiera la
  contraseña.
- **2026-10-06** — Nuevo `tipo_medicion='suma_ml_pernos'` (pernos en ML por
  ubicación en el talud, Perforación/Inyección ponderadas por factores
  configurables por partida — ver nota de `rdc_partidas_edt`). Aplicado en
  Barrera 5: partidas 2.01/2.04/2.05 reclasificadas, `SOST-01` (partida de
  prueba) archivada. De paso se corrigió que el `select` de
  `fn_rdc_sincronizar_confirmaciones` para `digitado_edt` no validaba el
  `tipo_medicion` actual de la partida — mismo bug de fondo que el doble
  conteo anterior, ahora cerrado también para este camino.
- **2026-10-06** — Bug real encontrado en Barrera 5: al inyectar pernos desde
  la lista de pendientes (`PasoMetrados.vue`, flujo con `rdc_control_pernos`
  activo), el código guardaba `ubicacion` del selector compartido del
  formulario (oculto en ese camino, valor por defecto "Cabecera") en vez de
  la ubicación real de cada perno — toda inyección por ese camino quedaba
  mal clasificada. Corregido en el frontend (ahora usa la ubicación propia
  de cada fila) y en los datos históricos: 7 filas de
  `rdc_reporte_elementos` (pernos E-B5/P47, P48, P49, P66, P69, P70, P71)
  corregidas de "Cabecera" a su ubicación real (Cuerpo/Lateral), y las
  confirmaciones `suma_ml_pernos` de 2.01/2.04 del 04 y 05/10 recalculadas
  (todas seguían en `por_confirmar`, sin necesidad de corrección manual
  aparte).
- **2026-10-06** — Segunda pasada sobre el mismo frente: además del bug de
  código, varios pernos (E-B5/P46, P67-P78, P69, P70) tenían la ubicación
  mal tipeada por el supervisor desde la Perforación misma (error humano,
  no del código) — el catálogo `rdc_pernos_biblioteca.ubicacion` sirvió
  como pista para encontrarlos, pero **no es fuente de verdad**: es solo
  una ayuda para no re-tipear la ubicación en el formulario, y puede estar
  mal cargado igual que cualquier dato — el metrado real siempre sale de lo
  reportado (`rdc_reporte_elementos`), nunca del catálogo. Las 24 filas se
  corrigieron tras confirmación explícita del usuario, y las confirmaciones
  `suma_ml_pernos` del 03, 04 y 05/10 quedaron recalculadas (6.30/23.70/
  18.00/3.00 para 2.01 y -/13.50/17.30/11.20 para 2.04, del 02 al 05/10),
  verificadas contra el cronograma real de Planeamiento.
- **2026-10-06** — Cierre estructural del mismo problema (`PasoMetrados.vue`):
  la ubicación de un perno ahora solo se fija al reportar la **Perforación**
  (desde el catálogo `rdc_pernos_biblioteca`, o el selector si el perno no
  está catalogado) — la **Inyección** ya nunca permite elegir una ubicación
  distinta: `confirmarRegularizar()` (código que no aparece en pendientes)
  también resuelve del catálogo en vez del selector compartido, y la tabla
  de elementos ya agregados deja de mostrar un `<select>` editable de
  Ubicación para filas de Inyección (queda de solo lectura, reflejando
  siempre la de su Perforación). Si la ubicación está mal, se corrige en la
  Perforación de ese código o en el catálogo — nunca aparte en la
  Inyección, para que no se puedan volver a desincronizar.

---

## Cómo usar este documento

Cada tabla tiene: **propósito** (una línea), **tipo** (`configuración` = cambia
poco, lo mantiene Planeamiento/Admin; `movimiento` = se inserta todos los días,
operacional), **columnas** (formato compacto: `nombre tipo` + `!` si es `NOT
NULL` + `=valor` si tiene default), **relaciones** (FKs salientes) y **notas**
(reglas de negocio que no se ven mirando solo la columna — constraints `CHECK`,
índices únicos parciales, quirks conocidos).

Antes de confiar en algo de aquí para una tarea real (escribir una migración,
una query, un informe), verifica contra el esquema vivo si hay dudas —
`npx supabase db query --linked "<sql>"` desde `backend/` — este documento puede
quedar desactualizado si alguien migra sin seguir la regla de `CLAUDE.md`.

## Convenciones generales

- **PK**: `id uuid default gen_random_uuid()` en casi todas las tablas. Excepciones
  con PK compuesta: `rol_permisos (rol_id, permiso_id)`, `stock (almacen_id,
  material_id, contrato_id)`. `configuracion` usa `clave text` como PK (no tiene `id`).
- **Multi-contrato**: casi todo movimiento de Almacén lleva `contrato_id` (ingresos,
  salidas, ajustes, kardex, stock, reservas, devoluciones, transferencias) — el
  mismo material/almacén puede tener saldos distintos por contrato. Vales y RDC
  cuelgan de `frentes`, que a su vez tiene `contrato_id`.
- **Timestamps**: `created_at`/`updated_at timestamptz default now()` por
  convención; varias tablas RDC detalle (`rdc_reporte_*`) NO tienen estos
  campos — ver nota en esa sección.
- **Soft delete**: solo `rdc_reportes` lo usa (`eliminado_at`/`eliminado_por`,
  "la papelera") — todo lo demás se borra de verdad o se desactiva con una
  columna `estado`/`activo`.
- **Seguridad**: RLS activo en todas las tablas de negocio, casi siempre vía
  `has_permission('codigo.permiso')` (`select 1 from usuarios u join
  rol_permisos rp on rp.rol_id=u.rol_id join permisos p on
  p.id=rp.permiso_id where u.id=auth.uid() and p.codigo=p_codigo`). Las
  operaciones con reglas de negocio no triviales (mover stock, confirmar un
  metrado, entregar un vale) pasan por funciones `SECURITY DEFINER` (`fn_*`)
  en vez de `insert`/`update` directos desde el cliente — la política de RLS
  de la tabla suele ser más permisiva de lo que parece porque la función ya
  validó el permiso real.
- **Prefijo `rdc_`**: todo lo que pertenece al módulo "Reporte Diario de
  Campo" (antes una app aparte, ver `OBITUARIO.md`). El resto de tablas (sin
  prefijo) es el núcleo de Catálogo/Almacén/Vales/Procura.
- **`codigo` no es identidad**: en `materiales` (y en general en el
  catálogo), `codigo` es clasificación para el reporte EDP, no la llave real
  del material — la llave es `id`. No asumir que dos filas con el mismo
  `codigo` son "el mismo material", ni que dos materiales no pueden compartir
  prefijo de código.

## Mapa de módulos

| Módulo | Tablas | Tipo dominante |
|---|---|---|
| Catálogo y configuración maestra | `roles`, `permisos`, `rol_permisos`, `usuarios`, `contratos`, `almacenes`, `categorias`, `materiales`, `nombres_edp`, `sectores`, `frentes`, `configuracion` | configuración |
| Almacén / Inventario | `stock`, `ingresos`, `salidas`, `ajustes`, `kardex`, `transferencias`, `devoluciones` | movimiento |
| Vales y Reservas | `vales`, `vale_detalle`, `reservas`, `reservas_historial` | movimiento |
| Procura | `metrados_procura` | configuración (versionado) |
| Alertas y auditoría | `alertas`, `auditoria` | derivado/movimiento |
| RDC — catálogos | `rdc_supervisores`, `rdc_capataces`, `rdc_maquinarias`, `rdc_partidas_estandar`, `rdc_partidas_edt`, `rdc_pernos_biblioteca`, `rdc_prefijos`, `rdc_redline_supervisores` | configuración |
| RDC — reporte diario | `rdc_reportes` + 9 tablas `rdc_reporte_*` | movimiento |
| RDC — confirmación de metrados | `rdc_metrados_confirmacion` | movimiento (derivado) |

---

## 1. Catálogo y configuración maestra

### `roles`
**Propósito**: los roles del sistema (Administrador, Planeamiento, Almacen, Supervisor, Developer, etc.).
**Tipo**: configuración.
**Columnas**: `id uuid!`, `nombre text!` *(único)*, `descripcion text`, `created_at!`, `updated_at!`.
**Relaciones**: `usuarios.rol_id → roles.id`; `rol_permisos.rol_id → roles.id`.

### `permisos`
**Propósito**: catálogo de códigos de permiso (`frentes.ver`, `rdc.confirmar_metrados`, etc.) — son datos, nunca hardcodeados en el backend (`has_permission()` siempre consulta esta tabla).
**Tipo**: configuración.
**Columnas**: `id uuid!`, `codigo text!` *(único)*, `modulo text!`, `descripcion text`, `created_at!`.
**Relaciones**: `rol_permisos.permiso_id → permisos.id`.

### `rol_permisos`
**Propósito**: tabla puente rol↔permiso — qué puede hacer cada rol.
**Tipo**: configuración. **PK compuesta**: `(rol_id, permiso_id)`.
**Columnas**: `rol_id uuid!`, `permiso_id uuid!`, `created_at!`.
**Relaciones**: `rol_id → roles.id`, `permiso_id → permisos.id`.

### `usuarios`
**Propósito**: cuentas de la app — espejo de `auth.users` (mismo `id`) con los campos de negocio.
**Tipo**: configuración.
**Columnas**: `id uuid!` *(= auth.users.id, no tiene default propio)*, `email text!`, `nombre text!`, `rol_id uuid!`, `frente_id uuid`, `estado text!='activo'` *(activo/inactivo)*, `created_at!`, `updated_at!`, `contrato_id uuid`, `rdc_heredar_reporte_completo boolean!=false`.
**Relaciones**: `rol_id → roles.id`, `frente_id → frentes.id`, `contrato_id → contratos.id`.
**Notas**: `email` es único. `frente_id` nullable: solo lo usan cuentas de campo restringidas a un frente (rol `Supervisor` u otro con `SOLO_CAMPO`) — **no confundir con el contrato de un RDC**: el contrato de un usuario (su frente asignado) es estable, el frente que aparece en un reporte puntual puede rotar; nunca derivar uno del otro. `rdc_heredar_reporte_completo`: si está activo, `crearBorradorDesde()` clona el reporte anterior COMPLETO (metrados, elementos, bitácora…) al crear uno nuevo — comportamiento especial, no el default.

### `contratos`
**Propósito**: los contratos de obra (ej. "Sostenimiento y Mantenimiento de Talud") — unidad de aislamiento para stock/vales/RDC.
**Tipo**: configuración.
**Columnas**: `id uuid!`, `codigo text!` *(único)*, `nombre text!`, `estado text!='activo'`, `created_at!`, `updated_at!`.
**Relaciones**: referenciado por `ajustes`, `devoluciones`, `frentes`, `ingresos`, `kardex`, `reservas`, `salidas`, `stock`, `transferencias`, `usuarios`.

### `almacenes`
**Propósito**: almacenes físicos.
**Tipo**: configuración.
**Columnas**: `id uuid!`, `codigo text!` *(único)*, `nombre text!`, `ubicacion text`, `estado text!='activo'` *(activo/inactivo)*, `created_at!`, `updated_at!`.
**Relaciones**: referenciado por `ajustes`, `alertas`, `ingresos`, `kardex`, `reservas`, `salidas`, `stock`, `transferencias` (vía `fn_registrar_movimiento_stock`).

### `categorias`
**Propósito**: árbol de categorías de materiales (auto-referencial).
**Tipo**: configuración.
**Columnas**: `id uuid!`, `nombre text!`, `categoria_padre_id uuid`, `created_at!`.
**Relaciones**: `categoria_padre_id → categorias.id` (self); `materiales.categoria_id → categorias.id`.

### `materiales`
**Propósito**: catálogo maestro de materiales.
**Tipo**: configuración.
**Columnas**: `id uuid!`, `codigo text!`, `descripcion text!`, `unidad text!`, `categoria_id uuid`, `estado text!='activo'`, `observaciones text`, `stock_minimo_default numeric`, `created_at!`, `updated_at!`, `descripcion_edp_id uuid`, `unidad_edp text`, `tipo_conversion text!='ninguna'` *(ninguna/area/longitud)*, `stock_minimo_pct numeric!=0.2`.
**Relaciones**: `categoria_id → categorias.id`, `descripcion_edp_id → nombres_edp.id`.
**Notas**: **`codigo` NO es la identidad del material** — es solo clasificación para el reporte EDP (ver convención general arriba); no tiene constraint único. `tipo_conversion` activa lógica de `ancho`/`largo` → cantidad en `ingresos` (ver esa tabla).

### `nombres_edp`
**Propósito**: nombres oficiales para el reporte EDP (Estado de Pago) — un material o una partida de Procura se puede "alias" a un nombre EDP distinto al descriptivo interno.
**Tipo**: configuración.
**Columnas**: `id uuid!`, `nombre text!`, `created_at!`.
**Relaciones**: referenciado por `alertas`, `materiales`, `metrados_procura`.

### `sectores`
**Propósito**: sectores de obra (agrupación geográfica/organizativa de frentes).
**Tipo**: configuración.
**Columnas**: `id uuid!`, `nombre text!` *(único)*, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`.
**Relaciones**: `frentes.sector_id → sectores.id`.

### `frentes`
**Propósito**: los frentes de obra — entidad central del sistema (todo el RDC, Vales, Almacén por frente cuelga de aquí).
**Tipo**: configuración (cambia poco una vez creado, pero su `estado` sí se actualiza seguido).
**Columnas**: `id uuid!`, `codigo text` *(único, nullable)*, `nombre text!`, `area text!`, `estado text!='planificado'` *(planificado/proximo/activo/paralizado/cerrado)*, `fecha_inicio date`, `fecha_cierre date`, `created_at!`, `updated_at!`, `contrato_id uuid!`, `sector text!`, `sector_id uuid`, `fecha_paralizacion date`, `rdc_control_pernos boolean!=false`, `tipo_rd text!='S'` *(S/P)*, `rd_padre_id uuid`, `residente_id uuid`, `rdc_dias_ambar integer`, `rdc_dias_rojo integer`, `carpeta_fotos text`, `mapa_sector_url text`, `firma_residente_url text`.
**Relaciones**: `contrato_id → contratos.id`, `sector_id → sectores.id`, `rd_padre_id → frentes.id` (self, agrupa varios RD "S" bajo un RD "P"), `residente_id → usuarios.id`.
**Notas**:
- **`sector` (texto) vs `sector_id` (FK)**: campo duplicado histórico — `sector_id` es la fuente real, `sector` (texto) quedó de antes de que existiera la FK. Un frente creado sin `sector_id` (bug conocido, ya corregido en UI) rompe pantallas que esperan el FK poblado.
- `rdc_control_pernos`: interruptor opcional por frente — activa duplicado-check de pernos y las pantallas de Control de sostenimiento/Metrados. Un frente sin esto activo sigue funcionando exactamente igual que antes de esa feature.
- `tipo_rd`/`rd_padre_id`: jerarquía RD "P" (padre, agrupador) / RD "S" (hijo) — un RD "S" puede colgar de un RD "P"; validado por trigger (`fn_frentes_validar_rd_padre`), no por CHECK simple (necesita subconsultas).
- `rdc_dias_ambar`/`rdc_dias_rojo`: umbrales de antigüedad de pendientes por frente; si son `null`, se usa el global de `configuracion` (ver `fn_rdc_umbrales`). Constraint: `rdc_dias_rojo > rdc_dias_ambar`.
- `mapa_sector_url`/`firma_residente_url`: **rutas** dentro del bucket privado `frentes-archivos` de Supabase Storage, no URLs públicas — se resuelven con `createSignedUrl` al mostrarlas.

### `configuracion`
**Propósito**: pares clave/valor globales (umbrales por defecto, flags del sistema).
**Tipo**: configuración. **PK**: `clave` (no tiene `id`).
**Columnas**: `clave text!`, `valor jsonb!`, `descripcion text`, `updated_at!`, `actualizado_por uuid`.
**Relaciones**: `actualizado_por → usuarios.id`.
**Notas**: `valor` es `jsonb` aunque guarde un número o string simple — leer con `(valor #>> '{}')::tipo`. Claves conocidas: `rdc_avance_dias_ambar`, `rdc_avance_dias_rojo`.

---

## 2. Almacén / Inventario (movimiento diario)

### `stock`
**Propósito**: saldo vigente por almacén+material+contrato — la tabla que todo el módulo de Almacén lee para "cuánto hay".
**Tipo**: movimiento (se actualiza con cada ingreso/salida/ajuste). **PK compuesta**: `(almacen_id, material_id, contrato_id)`.
**Columnas**: `almacen_id uuid!`, `material_id uuid!`, `cantidad_fisica numeric!=0`, `cantidad_reservada numeric!=0`, `cantidad_disponible numeric` *(columna generada = física − reservada)*, `stock_minimo numeric`, `updated_at!`, `contrato_id uuid!`.
**Relaciones**: `almacen_id → almacenes.id`, `material_id → materiales.id`, `contrato_id → contratos.id`.
**Notas**: nunca se actualiza con `UPDATE` directo desde el cliente — siempre vía `fn_registrar_movimiento_stock(...)` (trigger-friendly, mantiene `cantidad_reservada` como caché de `reservas` activas). `cantidad_reservada <= cantidad_fisica` (CHECK).

### `ingresos`
**Propósito**: entradas físicas de material a un almacén.
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `fecha date!=CURRENT_DATE`, `material_id uuid!`, `almacen_id uuid!`, `cantidad numeric!`, `documento_referencia text`, `proveedor text`, `usuario_id uuid!`, `observacion text`, `created_at!`, `contrato_id uuid!`, `ancho numeric`, `largo numeric`, `factor_conversion numeric`, `cantidad_restante numeric`.
**Relaciones**: `material_id → materiales.id`, `almacen_id → almacenes.id`, `contrato_id → contratos.id`, `usuario_id → usuarios.id`.
**Notas**: `ancho`/`largo`/`factor_conversion`/`cantidad_restante` solo aplican si el material tiene `tipo_conversion` ≠ `ninguna` (ej. un rollo de malla que se mide en m² pero se consume por tramo) — trigger `fn_trg_ingreso_recalcular_factor` arma el factor.

### `salidas`
**Propósito**: despachos de material hacia un frente — el movimiento real que descuenta `cantidad_fisica`.
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `fecha date!=CURRENT_DATE`, `material_id uuid!`, `almacen_id uuid!`, `cantidad numeric!`, `frente_id uuid!`, `vale_detalle_id uuid`, `reserva_id uuid`, `usuario_id uuid!`, `documento_referencia text`, `observacion text`, `created_at!`, `contrato_id uuid!`, `ingreso_id uuid`, `cantidad_edp numeric`.
**Relaciones**: `material_id → materiales.id`, `almacen_id → almacenes.id`, `frente_id → frentes.id`, `vale_detalle_id → vale_detalle.id`, `reserva_id → reservas.id`, `usuario_id → usuarios.id`, `contrato_id → contratos.id`, `ingreso_id → ingresos.id`.
**Notas**: **`vale_detalle_id` y `reserva_id` van siempre juntos o ninguno** (CHECK `chk_salida_vale_reserva_consistentes`) — una salida es libre (sin vale) o es la entrega de una reserva concreta, nunca una mezcla. `fn_registrar_entrega_multilote` arma varias salidas de una vez (una reserva repartida en N lotes/ingresos distintos) — es el RPC a usar, no inserts manuales.

### `ajustes`
**Propósito**: correcciones manuales de inventario (positivo/negativo) fuera de ingreso/salida normal.
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `fecha date!=CURRENT_DATE`, `material_id uuid!`, `almacen_id uuid!`, `tipo text!` *(positivo/negativo)*, `cantidad numeric!` *(siempre > 0, el signo lo da `tipo`)*, `motivo text!`, `usuario_id uuid!`, `created_at!`, `contrato_id uuid!`.
**Relaciones**: `material_id → materiales.id`, `almacen_id → almacenes.id`, `usuario_id → usuarios.id`, `contrato_id → contratos.id`.

### `kardex`
**Propósito**: libro de movimientos reales de almacén (ingreso/salida/ajuste) — es el historial append-only, nunca se edita una fila ya escrita.
**Tipo**: movimiento (derivado — lo escribe `fn_registrar_movimiento_stock`, no se inserta a mano).
**Columnas**: `id uuid!`, `fecha_hora timestamptz!=now()`, `tipo_movimiento text!` *(ingreso/salida/ajuste_positivo/ajuste_negativo)*, `material_id uuid!`, `almacen_id uuid!`, `cantidad numeric!`, `saldo_resultante numeric!`, `usuario_id uuid!`, `referencia_tabla text!`, `referencia_id uuid!`, `vale_id uuid`, `observacion text`, `contrato_id uuid!`.
**Relaciones**: `material_id → materiales.id`, `almacen_id → almacenes.id`, `usuario_id → usuarios.id`, `vale_id → vales.id`, `contrato_id → contratos.id`.
**Notas**: `referencia_tabla`/`referencia_id` apuntan a la fila origen (`ingresos.id`, `salidas.id` o `ajustes.id`) — no es una FK real (puede apuntar a 3 tablas distintas), es polimórfico por convención de nombres.

### `transferencias`
**Propósito**: mover material de un frente a otro (vía almacén), sin pasar por Vales.
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `fecha date!=CURRENT_DATE`, `material_id uuid!`, `frente_origen_id uuid!`, `frente_destino_id uuid!`, `contrato_id uuid`, `cantidad numeric!`, `estado text!='Solicitada'` *(Solicitada/Confirmada/Rechazada)*, `supervisor_id uuid!`, `observacion text`, `confirmada_por uuid`, `confirmada_at timestamptz`, `motivo_rechazo text`, `created_at!`, `updated_at!`.
**Relaciones**: `material_id → materiales.id`, `frente_origen_id`/`frente_destino_id → frentes.id`, `supervisor_id`/`confirmada_por → usuarios.id`, `contrato_id → contratos.id`.
**Notas**: `frente_origen_id ≠ frente_destino_id` (CHECK). Tabla chica (1 fila a la fecha) — feature poco usada todavía.

### `devoluciones`
**Propósito**: material que un frente devuelve a almacén (bueno o dañado), con flujo de evaluación.
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `fecha date!=CURRENT_DATE`, `material_id uuid!`, `frente_id uuid!`, `contrato_id uuid`, `cantidad numeric!`, `estado_material text!` *(bueno/danado)*, `estado text!='Solicitada'` *(Solicitada/Recibida/Rechazada)*, `supervisor_id uuid!`, `observacion text`, `almacen_id uuid`, `recibida_por uuid`, `recibida_at timestamptz`, `motivo_rechazo text`, `created_at!`, `updated_at!`, `numero text` *(único, autogenerado por trigger)*, `cantidad_reutilizable numeric`, `cantidad_baja numeric`.
**Relaciones**: `material_id → materiales.id`, `frente_id → frentes.id`, `almacen_id → almacenes.id`, `supervisor_id`/`recibida_por → usuarios.id`, `contrato_id → contratos.id`.
**Notas**: `cantidad_reutilizable + cantidad_baja = cantidad` cuando ambos están evaluados (CHECK `chk_devoluciones_evaluacion_completa`) — o ambos null (todavía no evaluada).

---

## 3. Vales y Reservas

### `vales`
**Propósito**: solicitud de materiales de un supervisor para su frente — cabecera.
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `numero text!` *(único, autogenerado)*, `fecha date!=CURRENT_DATE`, `supervisor_id uuid!`, `frente_id uuid!`, `estado text!='Borrador'` *(Borrador/Enviado/En revision/Aprobado/Rechazado/Reservado/Parcialmente atendido/Atendido/Cancelado/Cerrado)*, `observaciones text`, `created_at!`, `updated_at!`, `fecha_envio timestamptz`, `creado_por uuid`, `visto_supervisor_en timestamptz`, `actividad text`.
**Relaciones**: `supervisor_id`/`creado_por → usuarios.id`, `frente_id → frentes.id`.
**Notas**: `estado` tiene 10 valores — es una máquina de estados bastante más rica que Reservas/Devoluciones; `fn_actualizar_estado_vale` la recalcula a partir de los estados de sus `vale_detalle`. `visto_supervisor_en` es para el badge "novedades" del supervisor (ver `App.vue`), no para RLS.

### `vale_detalle`
**Propósito**: líneas de un vale — un material + cantidad por línea.
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `vale_id uuid!`, `material_id uuid!`, `cantidad_solicitada numeric!`, `cantidad_aprobada numeric`, `cantidad_entregada numeric!=0`, `estado text!='Pendiente'` *(Pendiente/Aprobado/Rechazado/Reservado/Parcialmente entregado/Entregado/Cancelado)*, `created_at!`, `updated_at!`, `motivo_cierre text`, `cerrado_por uuid`, `cerrado_en timestamptz`.
**Relaciones**: `vale_id → vales.id`, `material_id → materiales.id`, `cerrado_por → usuarios.id`.
**Notas**: `cantidad_entregada <= cantidad_aprobada` (si hay aprobada). Al aprobar, `fn_crear_reserva` genera la fila en `reservas` correspondiente (bloquea la línea y falla si ya no está `Pendiente`: dos personas no pueden aprobar la misma línea). Cerrar una línea que ya no se entrega es una sola acción, `fn_vale_cerrar_linea(linea, motivo)` (motivo obligatorio): libera la reserva y deja la línea `Cancelado` (nada entregado) o `Entregado` con lo entregado; `motivo_cierre`/`cerrado_por`/`cerrado_en` guardan quién y por qué. Un trigger (`trg_vale_detalle_estado`) recalcula el estado del vale cada vez que cambia el de una línea. `fn_vale_historial(vale)` arma la línea de tiempo del vale desde `auditoria`, `salidas` y `reservas_historial`.

### `reservas`
**Propósito**: compromiso de stock para un `vale_detalle` — no es una salida física (no toca `cantidad_fisica`, solo `cantidad_reservada` en `stock`).
**Tipo**: movimiento.
**Columnas**: `id uuid!`, `vale_detalle_id uuid!`, `material_id uuid!`, `almacen_id uuid!`, `frente_id uuid!`, `cantidad numeric!`, `cantidad_entregada numeric!=0`, `estado text!='Activa'` *(Activa/Parcial/Liberada/Convertida/Cancelada)*, `usuario_id uuid!`, `created_at!`, `updated_at!`, `contrato_id uuid!`.
**Relaciones**: `vale_detalle_id → vale_detalle.id`, `material_id → materiales.id`, `almacen_id → almacenes.id`, `frente_id → frentes.id`, `usuario_id → usuarios.id`, `contrato_id → contratos.id`.
**Notas**: `cantidad_entregada <= cantidad` (CHECK). Índice único parcial `uq_reservas_vigente_por_linea` (`vale_detalle_id` donde `estado` ∈ Activa/Parcial): una línea tiene a lo sumo una reserva vigente. Las entregas parciales son múltiples `salidas` contra la misma reserva, hasta agotarla (`fn_avanzar_reserva`). Liberar/cancelar: `fn_liberar_reserva`.

### `reservas_historial`
**Propósito**: bitácora de cambios de estado/cantidad de una reserva — separado del Kardex a propósito (el Kardex es solo movimiento físico real).
**Tipo**: movimiento (append-only).
**Columnas**: `id uuid!`, `reserva_id uuid!`, `estado_anterior text`, `estado_nuevo text!`, `cantidad_anterior numeric`, `cantidad_nueva numeric`, `motivo text`, `usuario_id uuid`, `fecha_hora!=now()`.
**Relaciones**: `reserva_id → reservas.id`, `usuario_id → usuarios.id`.

---

## 4. Procura

### `metrados_procura`
**Propósito**: metrado contractual previsto por frente+material, para comparar contra lo que ya se entregó de Almacén (control de sobreconsumo).
**Tipo**: configuración versionada (no se sobrescribe: cada corrección es una fila nueva con `version` incrementada, `vigente=false` en la anterior).
**Columnas**: `id uuid!`, `frente_id uuid!`, `unidad text!`, `cantidad_contractual numeric!`, `version integer!=1`, `vigente boolean!=true`, `responsable_id uuid!`, `observaciones text`, `created_at!`, `cantidad_procura numeric!=0`, `descripcion_edp_id uuid!`.
**Relaciones**: `frente_id → frentes.id`, `responsable_id → usuarios.id`, `descripcion_edp_id → nombres_edp.id`.
**Notas**: trigger `fn_versionar_metrado` es quien arma el versionado — no actualizar `cantidad_contractual` con `UPDATE` directo, insertar una fila nueva.

---

## 5. Alertas y auditoría

### `alertas`
**Propósito**: notificaciones del sistema (stock bajo, vale pendiente, sobreconsumo, etc.), generadas por `fn_evaluar_alertas` y triggers puntuales.
**Tipo**: derivado/movimiento.
**Columnas**: `id uuid!`, `tipo text!` *(stock_bajo/stock_agotado/vale_pendiente/material_no_previsto/riesgo_sobreconsumo/sobreconsumo/reserva_prolongada/inconsistencia_stock)*, `nivel text!='advertencia'` *(info/advertencia/critica)*, `material_id uuid`, `frente_id uuid`, `almacen_id uuid`, `vale_id uuid`, `mensaje text!`, `estado text!='activa'` *(activa/resuelta)*, `created_at!`, `resuelta_at timestamptz`, `resuelta_por uuid`, `descripcion_edp_id uuid`.
**Relaciones**: `material_id → materiales.id`, `frente_id → frentes.id`, `almacen_id → almacenes.id`, `vale_id → vales.id`, `resuelta_por → usuarios.id`, `descripcion_edp_id → nombres_edp.id`.

### `auditoria`
**Propósito**: historial genérico de INSERT/UPDATE/DELETE sobre tablas críticas, vía trigger `fn_audit`.
**Tipo**: movimiento (append-only, la tabla más grande del sistema — ~5700 filas).
**Columnas**: `id uuid!`, `tabla text!`, `registro_id uuid`, `accion text!` *(INSERT/UPDATE/DELETE)*, `usuario_id uuid`, `fecha_hora!=now()`, `valor_anterior jsonb`, `valor_nuevo jsonb`.
**Relaciones**: `usuario_id → usuarios.id`.
**Notas**: `tabla`+`registro_id` es polimórfico (no FK real) — igual que `kardex.referencia_tabla`.

---

## 6. RDC — Reporte Diario de Campo

El RDC es el módulo más grande del sistema. Un reporte de un día = 1 fila en
`rdc_reportes` (cabecera) + N filas repartidas en 9 tablas de detalle, todas
con `reporte_id → rdc_reportes.id`. Es **offline-first**: el supervisor llena
todo en IndexedDB local y sincroniza en segundo plano (ver `ARQUITECTURA.md`
para el detalle del mecanismo) — las tablas reflejan el estado ya
sincronizado al servidor, no necesariamente lo último que el supervisor tiene
en el celular.

### 6.1 Catálogos RDC (configuración)

#### `rdc_supervisores`
**Columnas**: `id uuid!`, `nombre text!` *(único)*, `usuario_id uuid` *(único, nullable)*, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`, `color text`.
**Relaciones**: `usuario_id → usuarios.id`.
**Notas**: un supervisor RDC puede existir sin cuenta de usuario vinculada (`usuario_id null`) — catálogo histórico de nombres que no necesariamente loguean.

#### `rdc_capataces`
**Columnas**: `id uuid!`, `nombre text!` *(único)*, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`.

#### `rdc_maquinarias`
**Columnas**: `id uuid!`, `tipo text!`, `categoria text!` *(perforacion/soporte)*, `modelo text`, `placa text` *(único)*, `observaciones text`, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`.

#### `rdc_partidas_estandar`
**Propósito**: las ~15 partidas fijas y simples que el supervisor llena directo en el RDC (Bloque 1/3) — a propósito más simples que el cronograma real, para evitar que el supervisor se confunda con el detalle de Planeamiento.
**Columnas**: `id uuid!`, `bloque smallint!` *(1 o 3)*, `codigo text!` *(único)*, `nombre text!`, `unidad text!`, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`.
**Relaciones**: referenciada por `rdc_reporte_metrados.partida_codigo` (por **código**, no por `id`).

#### `rdc_partidas_edt`
**Propósito**: el cronograma REAL de cada frente, el que Planeamiento sube/mantiene — las partidas que de verdad van a salir en el RD (documento de reporte oficial). Completamente aparte de `rdc_partidas_estandar`.
**Columnas**: `id uuid!`, `frente_id uuid!`, `codigo_edt text!`, `nombre text!`, `unidad text!`, `seccion text`, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`, `metrado_previsto numeric`, `tipo_medicion text!='digitado'` *(solo_seguimiento/digitado/conteo_pernos/suma_panos_malla/suma_tramos_cable/suma_ml_pernos)*, `zona_filtro text`, `tipo_filtro text`, `ubicacion_filtro text`, `factor_perforacion numeric!=1`, `factor_inyeccion numeric!=0`, `rendimiento_cantidad numeric`, `rendimiento_minimo numeric`, `rendimiento_maximo numeric`.
**Relaciones**: `frente_id → frentes.id`. Único: `(frente_id, codigo_edt)`.
**Notas** — `tipo_medicion` decide cómo se llena el acumulado de cada partida:
- `solo_seguimiento`: **nunca aparece como campo en el RDC del supervisor**. Su acumulado se llena solo cuando Planeamiento confirma un metrado "libre" o "estándar" y lo enlaza acá (ver `rdc_metrados_confirmacion`). Es el tipo por defecto al importar el cronograma real desde Excel.
- `digitado`: **obsoleto, por decisión explícita (2026-10-05)** — el bloque de UI que lo hacía funcionar ("Partidas EDT" en el RDC) se quitó a pedido del usuario, y ya no se ofrece como opción al crear/editar una partida en Configuración (`definicionesCatalogos.js`). El valor sigue siendo válido para el `CHECK` de la columna (no se tocó la constraint, por si queda alguna fila histórica), pero no debería usarse en ninguna fila nueva. El mecanismo de captura (`rdc_reporte_metrados_edt`) y la función que lo sincroniza (`fn_rdc_sincronizar_confirmaciones`) siguen existiendo por compatibilidad, con un resguardo agregado (ver nota de esa tabla, más abajo) para que una fila vieja de captura no genere un doble conteo si la partida detrás ya cambió de tipo. Las 343 filas que estaban en `digitado` (el catálogo previo a esta funcionalidad, de 18 frentes, nunca reclasificado) se resolvieron así, **aplicado el 2026-10-05**: las de frentes `cerrado` (187, de 9 frentes) se archivaron (`activo=false` — siguen existiendo, solo inactivas); el resto (`activo`/`paralizado`/`planificado`, 156, de otros 9 frentes) se reclasificó a `solo_seguimiento`. Estado final verificado: 0 filas activas con `tipo_medicion='digitado'`.
- `conteo_pernos`/`suma_panos_malla`/`suma_tramos_cable`: se derivan solas sumando `rdc_reporte_elementos` del día, filtrado por `zona_filtro`/`tipo_filtro` — nunca se digitan aparte, nunca aparecen como campo.
- `suma_ml_pernos` *(agregado 2026-10-06)*: igual que las anteriores (se deriva sola, nunca es un campo), pero para pernos medidos en ML por ubicación en el talud, no por unidad. Suma `rdc_reporte_elementos.cantidad` de `elemento='Perno'` filtrado por `ubicacion_filtro` (admite varias separadas por coma, ej. `"Pie,Pie de banqueta"` — mismo criterio que `rdc_prefijos.prefijo`), separando Perforación e Inyección y ponderando cada una por `factor_perforacion`/`factor_inyeccion`: `avance = Σ(ML perforado) × factor_perforacion + Σ(ML inyectado) × factor_inyeccion`. Con los defaults (1/0) una partida de solo-perforación da el ML completo sin configurar nada — los factores existen para partidas donde Perforación e Inyección son la MISMA longitud física medida dos veces (ej. 0.7/0.3: un perno perforado-e-inyectado cuenta su ML una sola vez, no dos). Caso real en Barrera 5: partidas 2.01/2.04/2.05 (Pasivo Cabecera/Pasivo/Pasivo Pie), 0.7/0.3, reemplazando a una partida de prueba (`SOST-01`, `conteo_pernos`, previsto 50 — creada a mano el 2026-10-04 para probar la Fase 4, nunca fue parte del cronograma real; se archivó, no se borró).
- `tipo_filtro` es obligatorio si `tipo_medicion` es `suma_panos_malla`/`suma_tramos_cable`; `ubicacion_filtro` es obligatorio si es `suma_ml_pernos` (ambos por CHECK: `rdc_partidas_edt_filtro_obligatorio`).

#### `rdc_pernos_biblioteca`
**Propósito**: catálogo de pernos del plano de un frente (specs reales: ubicación, diámetro, ángulo) — sube Planeamiento, por frente.
**Columnas**: `id uuid!`, `frente_id uuid!`, `codigo text!`, `zona text`, `sistema text`, `ubicacion text`, `diametro numeric`, `longitud numeric`, `angulo text`, `plano text`, `created_at!`, `updated_at!`.
**Relaciones**: `frente_id → frentes.id`. Único: `(frente_id, codigo)`.
**Notas**: alimenta dos cosas: (1) autocompleta Ubicación/Diámetro cuando el supervisor perfora un código que coincide (y los oculta del formulario si el frente tiene catálogo), (2) el Excel enviado a SharePoint usa esta tabla como respaldo de Ángulo/Diámetro/Plano. También es la base para saber "cuántos pernos del plano faltan perforar" (comparando contra lo reportado).

#### `rdc_prefijos`
**Propósito**: prefijo de código por zona+sistema de sostenimiento de un frente (para armar códigos de perno/malla/cable automáticamente).
**Columnas**: `id uuid!`, `frente_id uuid!`, `zona text!`, `sostenimiento text!`, `prefijo text`, `plano text`, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`.
**Relaciones**: `frente_id → frentes.id`. Único: `(frente_id, zona, sostenimiento)`.

#### `rdc_redline_supervisores`
**Propósito**: catálogo de supervisores a los que se les puede asignar una "Redline" (observación de seguridad/calidad) en un reporte.
**Columnas**: `id uuid!`, `nombre text!` *(único)*, `activo!=true`, `orden!=0`, `created_at!`, `updated_at!`.

### 6.2 Reporte diario — cabecera y detalle (movimiento)

> Ninguna de las 9 tablas `rdc_reporte_*` tiene `created_at`/`updated_at` propios
> (a diferencia de la convención general) — su única marca de tiempo es la de la
> cabecera (`rdc_reportes.created_at`/`updated_at`/`creado_en_dispositivo`).

#### `rdc_reportes`
**Propósito**: cabecera de un reporte diario — 1 fila por supervisor+frente+fecha.
**Columnas**: `id uuid!`, `fecha date!`, `sector_id uuid!`, `frente_id uuid!`, `supervisor_id uuid!`, `creado_por uuid!`, `capataz_id uuid`, `estado text!='Borrador'` *(Borrador/Finalizado)*, `restriccion_acceso boolean!=false`, `restriccion_descripcion text`, `restriccion_inicio time`, `restriccion_fin time`, `refrigerio_salida time`, `refrigerio_retorno time`, `observaciones text`, `requerimientos text`, `restricciones text`, `redline boolean!=false`, `redline_supervisor_id uuid`, `redline_descripcion text`, `es_correccion boolean!=false`, `estado_sharepoint text!='pendiente'` *(pendiente/enviado/error)*, `sharepoint_nombre_archivo text`, `sharepoint_enviado_at timestamptz`, `sharepoint_intentos integer!=0`, `sharepoint_error text`, `creado_en_dispositivo timestamptz!`, `created_at!`, `updated_at!`, `eliminado_at timestamptz`, `eliminado_por uuid`.
**Relaciones**: `sector_id → sectores.id`, `frente_id → frentes.id`, `supervisor_id → rdc_supervisores.id`, `creado_por`/`eliminado_por → usuarios.id`, `capataz_id → rdc_capataces.id`, `redline_supervisor_id → rdc_redline_supervisores.id`.
**Notas — las más importantes de todo el módulo**:
- **Índice único parcial**: `UNIQUE (supervisor_id, frente_id, fecha) WHERE eliminado_at IS NULL` — un supervisor no puede tener dos reportes activos del mismo frente el mismo día. Un reporte archivado (`eliminado_at` no nulo) no cuenta para esta unicidad, así que si dos borradores locales distintos (mismo supervisor+frente+fecha) intentan sincronizar, el segundo falla con "ya existe un reporte" hasta que el primero se archive o se resuelva el conflicto — causa real de incidentes ya diagnosticados en este proyecto.
- **Dos máquinas de estado independientes**: `estado` (Borrador/Finalizado, el reporte en sí) y `estado_sharepoint` (si ya llegó al Excel/SharePoint) — un reporte puede estar `Finalizado` y `estado_sharepoint='error'` a la vez (el envío a SharePoint es un paso posterior, puede fallar sin afectar que el reporte ya esté guardado en Supabase).
- `eliminado_at`/`eliminado_por`: "borrar" un reporte en realidad lo archiva (papelera) — nunca se hace `DELETE` real desde la app.
- `creado_en_dispositivo`: timestamp que pone el CLIENTE (no el servidor) al crear el borrador — usado para resolución de conflictos entre dispositivos, distinto de `created_at` (que lo pone el servidor al llegar la fila).
- `restriccion_acceso`/`redline`: cuando son `false`, sus campos descriptivos asociados deben ser `null` (CHECK de coherencia) — no se puede tener una descripción de restricción sin marcar que hubo restricción.

#### `rdc_reporte_bitacora`
**Propósito**: bitácora de actividades del día (hora inicio/fin + descripción libre).
**Columnas**: `id uuid!`, `reporte_id uuid!`, `hora_inicio time`, `hora_fin time`, `actividad text!`, `orden!=0`.
**Relaciones**: `reporte_id → rdc_reportes.id`.

#### `rdc_reporte_elementos`
**Propósito**: **Bloque 2** — un elemento físico de sostenimiento por fila (un perno, un paño de malla, un tramo de cable), con su actividad.
**Columnas**: `id uuid!`, `reporte_id uuid!`, `elemento text!` *(Perno/Malla/Cable)*, `actividad text!` *(Perforación/Inyección/Instalación/Pull Test)*, `tipo text`, `sistema text`, `zona text`, `codigo text`, `ubicacion text`, `cantidad numeric!`, `unidad text!` *(ML/M2/UND)*, `ancho numeric`, `largo numeric`, `area_m2 numeric`, `diametro text`, `plano text`, `tipo_perforadora text`, `hora_inicio time`, `hora_fin time`, `orden!=0`, `regularizado boolean!=false`, `motivo_regularizacion text`.
**Relaciones**: `reporte_id → rdc_reportes.id`.
**Notas**:
- `cantidad` es el valor directo que usan las funciones agregadas (`fn_rdc_malla_estado`/`fn_rdc_cable_estado`/derivados de EDT) — **no `area_m2`**, aunque ambas columnas existan.
- Combinaciones válidas (CHECK `rdc_reporte_elementos_combinacion`): `Perno` solo con `Perforación`/`Inyección`/`Pull Test`; `Malla`/`Cable` solo con `Instalación`.
- `regularizado`: un perno inyectado sin perforación propia reportada antes (se "regulariza" la perforación retroactivamente) — exige `motivo_regularizacion` no vacío.
- `codigo` se compara siempre normalizado (`upper(trim(...))`) contra otras filas/catálogos — nunca exacto sin normalizar (fuente de bugs ya corregidos).

#### `rdc_reporte_hitos`
**Propósito**: hitos/eventos puntuales del día con hora (ej. "Llega camión grúa").
**Columnas**: `id uuid!`, `reporte_id uuid!`, `orden!`, `nombre text!`, `hora time`.
**Relaciones**: `reporte_id → rdc_reportes.id`. Único: `(reporte_id, orden)`.

#### `rdc_reporte_maquinaria`
**Propósito**: maquinaria usada ese día (una fila por tipo/categoría, con cantidad).
**Columnas**: `id uuid!`, `reporte_id uuid!`, `maquinaria_id uuid`, `tipo text!`, `categoria text!` *(perforacion/soporte/otro)*, `cantidad integer!`, `orden!=0`.
**Relaciones**: `reporte_id → rdc_reportes.id`, `maquinaria_id → rdc_maquinarias.id`.
**Notas**: si `maquinaria_id` está poblado (viene del catálogo, no texto libre), `cantidad` debe ser `1` (CHECK) — una máquina específica del catálogo se cuenta de a una, no en lote.

#### `rdc_reporte_metrados`
**Propósito**: **Bloque 1/3 y "libre"** — metrados contra las 15 partidas estándar, o texto suelto cuando no encaja en ninguna.
**Columnas**: `id uuid!`, `reporte_id uuid!`, `bloque text!` *(`'1'`/`'3'`/`'libre'`, texto no numérico)*, `partida_codigo text`, `partida_nombre text!`, `unidad text!`, `cantidad numeric!`, `hora_inicio time`, `hora_fin time`, `orden!=0`.
**Relaciones**: `reporte_id → rdc_reportes.id`, `partida_codigo → rdc_partidas_estandar.codigo` *(por código, no por id — único FK del esquema que referencia una columna no-PK de otra tabla)*.
**Notas**: `bloque='libre'` exige `partida_codigo IS NULL`; `bloque IN ('1','3')` exige `partida_codigo IS NOT NULL` (CHECK). `partida_nombre` se guarda SIEMPRE (incluso para bloque 1/3, copiado del catálogo al momento de reportar) — es lo que usa `fn_rdc_sincronizar_confirmaciones` para el match por similitud de texto contra `rdc_partidas_edt`, tanto para libres como para estándar.

#### `rdc_reporte_metrados_edt`
**Propósito**: captura directa contra una Partida EDT `tipo_medicion='digitado'` — mecanismo construido en la Fase 3, sin UI activa hoy (ver nota en `rdc_partidas_edt`).
**Columnas**: `id uuid!`, `reporte_id uuid!`, `partida_edt_id uuid!`, `cantidad numeric!`, `orden integer`.
**Relaciones**: `reporte_id → rdc_reportes.id`, `partida_edt_id → rdc_partidas_edt.id`. Único: `(reporte_id, partida_edt_id)`.
**Notas — tabla prácticamente vestigial, verificado en vivo (2026-10-05)**: tiene **1 sola fila en todo el sistema** (vs. 208 en `rdc_reporte_metrados`), de un reporte de Barrera 5 del 4 de octubre, contra una partida que mientras tanto pasó a ser `conteo_pernos` (ya no `digitado`). Como `fn_rdc_sincronizar_confirmaciones` lee esta tabla sin fijarse en el `tipo_medicion` *actual* de la partida, esa fila generó una confirmación `origen='digitado_edt'` **en paralelo** a la `conteo_pernos` que generó el bloque 2 para la misma partida+reporte — dos filas distintas (`origen` es parte de la clave única) con la MISMA cantidad, ambas sumando al acumulado si ambas se confirman. Se encontró y se ignoró manualmente la fila `digitado_edt` duplicada (ver changelog). **Si esta tabla vuelve a recibir filas** (alguien reactiva el bloque de UI, o una partida vuelve a `tipo_medicion='digitado'` después de haber tenido otro tipo), revisar si coexiste con una fila `conteo_pernos`/`suma_*` para el mismo `reporte_id`+`partida_edt_id` antes de confirmar cualquiera de las dos.

#### `rdc_reporte_personal`
**Propósito**: conteo de personal por categoría (directa/indirecta) y tipo (Capataz, Operario, Peón…).
**Columnas**: `id uuid!`, `reporte_id uuid!`, `categoria text!` *(directa/indirecta)*, `tipo text!`, `cantidad integer!=0`, `orden!=0`.
**Relaciones**: `reporte_id → rdc_reportes.id`. Único: `(reporte_id, categoria)` — **ojo**: el único real es por `categoria`, no por `(categoria, tipo)`; en la práctica cada fila ya es un tipo distinto dentro de la categoría, la unicidad del par categoria+tipo la garantiza la app, no la base.

#### `rdc_reporte_programacion`
**Propósito**: "Programar mañana" — lo programado vs. no programado para el día siguiente.
**Columnas**: `id uuid!`, `reporte_id uuid!`, `tipo text!` *(programada/no_programada)*, `etiqueta text`, `descripcion text`, `orden!=0`.
**Relaciones**: `reporte_id → rdc_reportes.id`.

#### `rdc_reporte_standby`
**Propósito**: tiempos muertos/standby del día con causa.
**Columnas**: `id uuid!`, `reporte_id uuid!`, `actividad text`, `desde time`, `hasta time`, `causa text!`, `causa_otro text`, `responsable text`, `comentario text`, `total_horas integer`, `total_minutos integer`, `orden!=0`.
**Relaciones**: `reporte_id → rdc_reportes.id`.
**Notas**: o hay `desde`+`hasta`, o hay `total_horas`/`total_minutos` > 0 (CHECK `rdc_reporte_standby_duracion`) — no puede quedar sin ninguna forma de duración.

### 6.3 Confirmación de metrados (Fase 4)

#### `rdc_metrados_confirmacion`
**Propósito**: la pieza que conecta lo que el supervisor reporta en el RDC con el cronograma real de Planeamiento (`rdc_partidas_edt`), con un flujo de revisión humana en el medio. Es la tabla detrás del calendario de "Metrados" de la ficha de cada frente y de la Bandeja de Confirmación.
**Tipo**: movimiento (derivado — la llena `fn_rdc_sincronizar_confirmaciones`, nunca el cliente con `insert` directo).
**Columnas**: `id uuid!`, `reporte_id uuid!`, `frente_id uuid!`, `fecha date!`, `partida_edt_id uuid`, `metrado_origen_id uuid`, `origen text!`, `texto_reportado text`, `cantidad numeric!`, `sugerida_partida_edt_id uuid`, `coincidencia_pct numeric`, `estado text!='por_confirmar'` *(por_confirmar/confirmado/corregido/ignorado)*, `cantidad_original numeric`, `cantidad_corregida numeric`, `motivo text`, `resuelto_por uuid`, `resuelto_en timestamptz`, `created_at!`.
**Relaciones**: `reporte_id → rdc_reportes.id`, `frente_id → frentes.id`, `partida_edt_id`/`sugerida_partida_edt_id → rdc_partidas_edt.id` *(dos FKs distintas a la misma tabla — en cualquier `select` de Supabase hay que nombrar la relación explícita: `partida:rdc_partidas_edt!rdc_metrados_confirmacion_partida_edt_id_fkey(...)`)*, `resuelto_por → usuarios.id`.
**Notas — la tabla con más reglas de negocio no evidentes de todo el sistema**:
- **Corrección manual directa en la base** (fuera del flujo normal de la app, ej. un agente arreglando un dato a pedido de Planeamiento): atribuir a la cuenta técnica **"Mantenimiento del Sistema"** (`mantenimiento@invalid.local` — `.invalid` es el dominio reservado por RFC 2606 para direcciones que a propósito no entregan correo; se usó en vez de `@dnv.com` porque ese dominio sí tiene correo real activo — rol `Consulta`, `usuarios.id = df593288-7eb1-4afe-ae83-7ceac361bc04`, creada el 2026-10-06) en vez de dejar `resuelto_por` vacío. La cuenta está además **bloqueada para iniciar sesión** (`auth.users.banned_until = 2126-01-01`) — solo existe para que una corrección administrativa quede con autor, nunca para loguearse de verdad.
- **Índice único parcial con expresiones** (no un `UNIQUE` de tabla simple, Postgres no lo permite con `coalesce()`): `rdc_metrados_confirmacion_unico` sobre `(reporte_id, origen, coalesce(partida_edt_id, '000...'), coalesce(metrado_origen_id, '000...'))`. `metrado_origen_id` existe específicamente para no colisionar entre varios metrados "libres"/"estándar" del mismo reporte (todos compartirían `partida_edt_id=null` si no fuera por esto).
- **`origen`** (7 valores) — define cómo llegó la fila y qué tan "confiable" es el enlace a `partida_edt_id`:
  - `digitado_edt`: viene de `rdc_reporte_metrados_edt`, **solo si la partida sigue siendo `tipo_medicion='digitado'` en ese instante** (join agregado 2026-10-05 para evitar doble conteo — ver nota de `rdc_reporte_metrados_edt`) — enlace directo y correcto de origen.
  - `conteo_pernos`/`suma_panos_malla`/`suma_tramos_cable`/`suma_ml_pernos`: derivado de `rdc_reporte_elementos` agregando por partida — enlace directo y correcto de origen.
  - `libre`: viene de `rdc_reporte_metrados` con `bloque='libre'` (texto suelto) — **sin enlace real**, solo `sugerida_partida_edt_id` + `coincidencia_pct` (similitud de texto, `pg_trgm`). Confirmar/corregir esta fila es la única forma de que `partida_edt_id` se llene de verdad.
  - `estandar`: viene de `rdc_reporte_metrados` con `bloque IN ('1','3')` (una de las 15 partidas fijas) — mismo tratamiento que `libre`: solo sugerencia, requiere confirmación humana para enlazar.
  - Para `libre`/`estandar`, `fn_rdc_confirmar_metrado`/`fn_rdc_corregir_metrado` aceptan un `p_partida_edt_id` opcional que sobreescribe `partida_edt_id` al resolver — para el resto de orígenes ese parámetro se ignora (la partida ya es la correcta).
- **`estado`**: `por_confirmar` es el único estado donde `fn_rdc_sincronizar_confirmaciones` puede volver a tocar la fila (`cantidad`) al re-sincronizar un reporte — nunca reabre ni pisa algo ya `confirmado`/`corregido`/`ignorado`. Desde `confirmado`/`corregido` SÍ se puede volver a corregir manualmente (Planeamiento, vía `fn_rdc_corregir_metrado`) — `ignorado` es terminal, hoy sin camino de vuelta.
- **El acumulado "oficial" de una partida** (lo que ve Planeamiento como avance real) es `fn_rdc_acumulado_edt(frente_id, hasta_fecha)`: suma `cantidad` de filas con `estado IN ('confirmado','corregido')`, agrupado por `partida_edt_id`, contra `rdc_partidas_edt.metrado_previsto`. Una fila `por_confirmar` o `ignorado` **no cuenta** para este acumulado.
- `cantidad_original`/`cantidad_corregida`: `cantidad_original` se fija la PRIMERA vez que se corrige (`coalesce(cantidad_original, cantidad)`) y no se vuelve a pisar en correcciones posteriores — conserva el valor que el supervisor realmente reportó, no la corrección anterior.
- `motivo` es obligatorio si `estado IN ('corregido','ignorado')` (CHECK).

---

## Funciones RPC relevantes (capa de negocio)

No es un listado exhaustivo de las ~45 funciones `fn_*` del esquema — son las
que un agente necesita más seguido para construir queries/features sin
reinventar lógica ya resuelta. Todas son `SECURITY DEFINER`, validan permiso
adentro (no confiar solo en RLS de la tabla para estas rutas).

| Función | Para qué |
|---|---|
| `has_permission(p_codigo text) → boolean` | Chequeo base de permiso del usuario autenticado — la building block de toda RLS. |
| `rdc_puede_ver_reporte` / `rdc_puede_editar_reporte(p_reporte_id)` | Si el usuario actual puede ver/editar ESE reporte puntual (dueño, o `rdc.ver_todos`/`rdc.editar_todos`). |
| `fn_registrar_movimiento_stock(...)` | Única vía para tocar `stock` + escribir `kardex` a la vez, consistente. |
| `fn_registrar_entrega_multilote(...)` | Entrega de una reserva repartida en varios lotes/ingresos. |
| `fn_crear_reserva` / `fn_avanzar_reserva` / `fn_liberar_reserva` | Ciclo de vida de una reserva. |
| `fn_confirmar_transferencia` / `fn_rechazar_transferencia` | Resolver una transferencia entre frentes. |
| `fn_recibir_devolucion` / `fn_rechazar_devolucion` | Resolver una devolución. |
| `fn_actualizar_estado_vale(p_vale_id)` | Recalcula `vales.estado` a partir de sus `vale_detalle`. |
| `fn_dashboard_frentes_en_campo` / `fn_dashboard_mapa_actividad` | Datos agregados del Dashboard (jsonb). |
| `fn_rdc_frentes_disponibles()` | Frentes que el usuario actual puede elegir en el RDC. |
| `fn_rdc_pernos_estado` / `fn_rdc_malla_estado` / `fn_rdc_cable_estado(p_frente_id)` | Estado agregado de cada elemento de sostenimiento, derivado de `rdc_reporte_elementos` (no hay tabla propia — siempre se calcula). |
| `fn_rdc_avance_conteo(p_frente_id)` | Perforados/inyectados/pendientes por zona. |
| `fn_rdc_codigo_orden(p_codigo)` | Clave de orden natural para códigos tipo `P4, P5…P10, P46` (evita el orden alfabético que pondría P10 antes que P5). |
| `fn_rdc_umbrales(p_frente_id)` | Umbrales ámbar/rojo efectivos (del frente o el global). |
| `fn_rdc_sincronizar_confirmaciones(p_reporte_id)` | Genera/actualiza `rdc_metrados_confirmacion` a partir de un reporte recién subido — se llama al final de `subirReporte()`. |
| `fn_rdc_confirmar_metrado` / `fn_rdc_corregir_metrado` / `fn_rdc_ignorar_metrado` | Resolver una fila de `rdc_metrados_confirmacion`. |
| `fn_rdc_acumulado_edt(p_frente_id, p_hasta)` | Previsto/acumulado oficial/saldo por partida EDT. |
| `fn_rdc_metrados_alertas(p_frente_id)` | Alertas en vivo (supera previsto, GLB cerrada, coincidencia baja) — no persistidas, se calculan al vuelo. |

---

## Consultas típicas

### 1. RDC de un día por frente

```sql
select r.*, f.nombre as frente, s.nombre as supervisor, c.nombre as capataz
from rdc_reportes r
join frentes f on f.id = r.frente_id
join rdc_supervisores s on s.id = r.supervisor_id
left join rdc_capataces c on c.id = r.capataz_id
where r.frente_id = :frente_id
  and r.fecha = :fecha
  and r.eliminado_at is null;
```

Para traer el detalle completo de ESE reporte (metrados, elementos, personal…),
unir cada tabla `rdc_reporte_*` por `reporte_id = r.id` por separado — no hay
una vista única que los junte (son cardinalidades distintas por bloque). El
patrón real de la app es `obtenerReporteCompleto()` en `rdcService.js`, que
hace un solo `select` con todos los embeds de una vez.

### 2. Salidas de almacén por frente y fecha

```sql
select s.fecha, m.codigo, m.descripcion, s.cantidad, a.nombre as almacen,
       u.nombre as usuario, s.documento_referencia
from salidas s
join materiales m on m.id = s.material_id
join almacenes a on a.id = s.almacen_id
join usuarios u on u.id = s.usuario_id
where s.frente_id = :frente_id
  and s.fecha = :fecha
order by s.created_at;
```

### 3. Historial de supervisores por frente

```sql
select sup.nombre as supervisor, min(r.fecha) as primer_reporte,
       max(r.fecha) as ultimo_reporte, count(*) as total_reportes
from rdc_reportes r
join rdc_supervisores sup on sup.id = r.supervisor_id
where r.frente_id = :frente_id
  and r.eliminado_at is null
group by sup.nombre
order by ultimo_reporte desc;
```

### 4. Acumulado confirmado por partida (preferir el RPC, no reimplementar)

```sql
-- Forma correcta: usar la función ya probada.
select * from fn_rdc_acumulado_edt(p_frente_id := :frente_id, p_hasta := current_date - 1);

-- Equivalente en SQL crudo, por si hace falta entender qué calcula:
select p.id as partida_edt_id, p.codigo_edt, p.nombre, p.metrado_previsto,
       coalesce(sum(c.cantidad) filter (
         where c.estado in ('confirmado', 'corregido') and c.fecha <= current_date - 1
       ), 0) as acumulado
from rdc_partidas_edt p
left join rdc_metrados_confirmacion c on c.partida_edt_id = p.id
where p.frente_id = :frente_id and p.activo
group by p.id, p.codigo_edt, p.nombre, p.metrado_previsto;
```

### 5. Extra — stock disponible de un material por frente (vía su contrato)

```sql
select a.nombre as almacen, st.cantidad_fisica, st.cantidad_reservada, st.cantidad_disponible
from stock st
join almacenes a on a.id = st.almacen_id
join frentes f on f.contrato_id = st.contrato_id
where st.material_id = :material_id
  and f.id = :frente_id;
```

### 6. Extra — vales pendientes de aprobar de un frente

```sql
select v.numero, v.fecha, vd.material_id, m.descripcion, vd.cantidad_solicitada, vd.estado
from vales v
join vale_detalle vd on vd.vale_id = v.id
join materiales m on m.id = vd.material_id
where v.frente_id = :frente_id
  and vd.estado = 'Pendiente'
order by v.fecha;
```

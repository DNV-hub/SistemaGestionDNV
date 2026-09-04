# Backend — Supabase

Migraciones SQL definitivas del esquema (tablas, RLS, triggers, funciones de
negocio y seed de roles/permisos/configuración), correspondientes al modelo
aprobado en [`docs/MODELO_DATOS_Y_FLUJOS.md`](../../docs/MODELO_DATOS_Y_FLUJOS.md).

**Estado:** código versionado, todavía no aplicado a ningún proyecto Supabase
(no existe un proyecto de desarrollo creado aún). Nada de esto afecta datos
reales hasta que se ejecute contra un proyecto.

## Cómo aplicarlas cuando exista un proyecto Supabase

1. Crear el proyecto en [supabase.com](https://supabase.com) (plan gratuito
   alcanza para desarrollo). Guardar el `project ref`, la URL y las API keys.
2. Instalar Supabase CLI (`npm install -g supabase` o el binario nativo).
3. Desde `backend/supabase/`:
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```
   Esto aplica las 15 migraciones en orden (por su prefijo de timestamp).
4. Crear el primer usuario Administrador:
   - Crear el usuario en Supabase Auth (Dashboard → Authentication, o
     `supabase.auth.admin.createUser` desde un script con la service role key).
   - Insertar su fila en `public.usuarios` con `rol_id` = el id del rol
     `'Administrador'` (ya sembrado por la migración `20260822100100`).
5. Repetir el proceso con un segundo proyecto Supabase para **producción**,
   separado del de desarrollo (§8 de `docs/ARQUITECTURA.md`).

## Orden y contenido de las migraciones

| Archivo | Contenido |
|---|---|
| `20260822100000_extensions_and_helpers.sql` | Extensiones, `set_updated_at()` |
| `20260822100100_roles_permisos.sql` | `roles`, `permisos`, `rol_permisos` + seed completo |
| `20260822100200_frentes_usuarios.sql` | `frentes`, `usuarios`, helpers `has_permission()` / `current_frente_id()` / `es_supervisor()` / `es_administrador()` |
| `20260822100300_catalogo.sql` | `categorias`, `materiales` |
| `20260822100400_almacenes_stock.sql` | `almacenes`, `stock` (física/reservada/disponible) |
| `20260822100500_configuracion.sql` | `configuracion` + seed de umbrales |
| `20260822100600_vales.sql` | `vales`, `vale_detalle` |
| `20260822100700_reservas.sql` | `reservas`, `reservas_historial` |
| `20260822100800_movimientos_fisicos_tablas.sql` | `ingresos`, `ajustes`, `salidas`, `kardex` (solo esquema) |
| `20260822100900_funciones_reservas.sql` | `fn_crear_reserva`, `fn_avanzar_reserva`, `fn_liberar_reserva`, `fn_actualizar_estado_vale` |
| `20260822101000_triggers_movimientos_fisicos.sql` | Conecta ingresos/ajustes/salidas con `stock.cantidad_fisica` y `kardex` |
| `20260822101100_metrados_procura.sql` | `metrados_procura` + versionado + vista `procura_vs_consumo` |
| `20260822101200_alertas.sql` | `alertas` + `fn_evaluar_alertas()` |
| `20260822101300_auditoria.sql` | `auditoria` + `fn_audit()` en tablas críticas |
| `20260822101400_rls_policies.sql` | RLS de todas las tablas, alineada a la matriz de permisos |

## Cómo escribir la app contra este esquema

- **Crear un vale**: `insert` en `vales` + `vale_detalle` directamente (RLS
  ya exige `vales.crear` y que `supervisor_id = auth.uid()`).
- **Aprobar una línea**: llamar `select fn_crear_reserva(vale_detalle_id,
  almacen_id, cantidad_aprobada, auth.uid())` vía RPC — no se inserta en
  `reservas` a mano.
- **Registrar una entrega (parcial o total)**: `insert` en `salidas` con
  `vale_detalle_id` y `reserva_id`. El trigger hace el resto (descuenta
  física, genera kardex, avanza la reserva y el vale).
- **Liberar/cancelar una reserva**: RPC a `fn_liberar_reserva(reserva_id,
  motivo, auth.uid(), cancelar)`.
- **Job de alertas**: RPC a `fn_evaluar_alertas()` desde un cron (Supabase
  scheduled Edge Function o `pg_cron`) — no se llama desde el frontend en
  cada carga de página.

## Pendiente, fuera de esta entrega

- `backend/supabase/functions/` (Edge Functions) — hoy la lógica vive como
  funciones SQL `security definer`, invocables directamente por RPC desde
  `@supabase/supabase-js`. Se evaluará mover algo a Edge Functions si se
  necesita lógica que no pueda vivir en SQL (por ejemplo, llamadas a APIs
  externas).
- `backend/supabase/seed/` — datos de prueba (materiales, frentes, usuarios
  de ejemplo) para desarrollo. No se generan todavía.
- Importación/exportación de Excel — diferido según spec §17.

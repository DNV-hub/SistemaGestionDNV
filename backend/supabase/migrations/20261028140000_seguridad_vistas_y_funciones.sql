-- Endurecimiento de seguridad (revisión de cierre).
--
-- 1. stock_con_minimo y procura_vs_consumo son vistas SECURITY DEFINER (corren
--    con los permisos de su dueño, a propósito: juntan tablas que algunos roles
--    no pueden leer por separado, p. ej. Almacén no lee las tablas de Procura).
--    El problema: el rol `anon` (la clave pública que viaja dentro de la app)
--    tenía SELECT, y sin iniciar sesión se podía leer todo el stock (147 filas)
--    por la API. Se le quita el acceso a anon, y stock_con_minimo aplica la
--    misma regla que la tabla stock (quien ve stock; el supervisor, solo el de
--    su contrato), en vez de abrirse a cualquiera con sesión.
-- 2. Ninguna función de public debe poder ejecutarse sin sesión: se quita
--    EXECUTE a PUBLIC/anon y se deja a authenticated y service_role. (Las
--    funciones ya validan permisos adentro, esto es una segunda barrera.)
-- 3. Funciones con search_path mutable: se fija a public.
-- 4. fn_dashboard_frentes_en_campo(date): sobrecarga vieja, sin filtro de
--    reportes eliminados y sin uso (la app llama a la de dos fechas).
--
-- Rollback manual: grant select on stock_con_minimo, procura_vs_consumo to anon;
-- grant execute on all functions in schema public to public; y volver a crear
-- stock_con_minimo sin la cláusula WHERE final (ver 20261020… / git de la vista).

-- 1. Vistas
revoke all on public.stock_con_minimo from anon;
revoke all on public.procura_vs_consumo from anon;

create or replace view public.stock_con_minimo as
 SELECT s.almacen_id,
    a.codigo AS almacen_codigo,
    a.nombre AS almacen_nombre,
    s.material_id,
    m.codigo AS material_codigo,
    m.descripcion AS material_descripcion,
    m.unidad AS material_unidad,
    s.contrato_id,
    s.cantidad_fisica,
    s.cantidad_reservada,
    s.cantidad_disponible,
    m.stock_minimo_pct,
    ui.cantidad AS ultimo_ingreso_cantidad,
    ui.fecha AS ultimo_ingreso_fecha,
        CASE
            WHEN (ui.cantidad IS NOT NULL) THEN round((m.stock_minimo_pct * ui.cantidad), 3)
            ELSE NULL::numeric
        END AS stock_minimo_efectivo
   FROM (((stock s
     JOIN materiales m ON ((m.id = s.material_id)))
     JOIN almacenes a ON ((a.id = s.almacen_id)))
     LEFT JOIN LATERAL ( SELECT i.cantidad,
            i.fecha
           FROM ingresos i
          WHERE ((i.material_id = s.material_id) AND (i.almacen_id = s.almacen_id) AND (i.contrato_id = s.contrato_id))
          ORDER BY i.fecha DESC, i.created_at DESC
         LIMIT 1) ui ON (true))
  WHERE public.has_permission('stock.ver') AND (NOT public.es_supervisor() OR s.contrato_id = public.current_contrato_id());

-- 4. Sobrecarga vieja (antes del revoke: así no hay que repetirlo)
drop function if exists public.fn_dashboard_frentes_en_campo(date);

-- 2. Funciones solo con sesión
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- Las que se creen después tampoco quedan abiertas.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- 3. search_path fijo
alter function public.fn_vales_generar_numero() set search_path = public;
alter function public.fn_trg_salidas_set_contrato() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.fn_trg_materiales_mayusculas() set search_path = public;
alter function public.fn_devoluciones_generar_numero() set search_path = public;
alter function public.fn_frentes_estado_por_fecha() set search_path = public;
alter function public.fn_rdc_bloquear_reversion_indebida() set search_path = public;
alter function public.fn_rdc_reportes_marcar_archivado() set search_path = public;
alter function public.fn_rdc_codigo_orden(text) set search_path = public;
alter function public.fn_frentes_validar_rd_padre() set search_path = public;
alter function public.fn_trg_transferencias_auto_confirmar() set search_path = public;
alter function public.fn_rdc_bloquear_cambio_fecha_en_correccion() set search_path = public;

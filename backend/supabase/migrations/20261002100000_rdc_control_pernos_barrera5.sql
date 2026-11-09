-- Control de pernos en el RDC — piloto Barrera 5. Ver diagnóstico y plan
-- aprobados en el chat del 2026-10-02: el estado (perforado/inyectado) se
-- DERIVA de rdc_reporte_elementos, sin tablas nuevas de elementos/eventos —
-- ese dato crudo ya tiene todo lo necesario (código, zona, cantidad, fecha
-- vía rdc_reportes.fecha). El interruptor por frente deja que el resto del
-- sistema (todos los demás frentes, Excel, SharePoint, dashboard) siga
-- funcionando exactamente igual que hoy.

-- ---------------------------------------------------------------------------
-- 1. Interruptor por frente: solo Barrera 5 usa el flujo nuevo de pernos.
-- ---------------------------------------------------------------------------
alter table frentes add column rdc_control_pernos boolean not null default false;
update frentes set rdc_control_pernos = true where id = '806dfaf1-9681-4b8f-a13f-55cfeb71f3bd';

-- ---------------------------------------------------------------------------
-- 2. Regularización: permite cargar en Inyección un código que no está en la
--    lista de pendientes, dejando constancia del motivo. El check obliga a
--    que todo regularizado traiga su motivo — no puede quedar "regularizado"
--    sin explicar por qué.
-- ---------------------------------------------------------------------------
alter table rdc_reporte_elementos add column regularizado boolean not null default false;
alter table rdc_reporte_elementos add column motivo_regularizacion text;
alter table rdc_reporte_elementos add constraint rdc_reporte_elementos_regularizado_coherente
  check (not regularizado or (motivo_regularizacion is not null and length(trim(motivo_regularizacion)) > 0));

-- ---------------------------------------------------------------------------
-- 3. Estado por perno — security definer, no una vista ni una consulta
--    directa a la tabla: la RLS de rdc_reporte_elementos limita a un
--    Supervisor a sus propios reportes (rdc_puede_ver_reporte), así que un
--    supervisor que hereda un frente no vería, con RLS normal, los pernos
--    que perforó el supervisor anterior. El chequeo de permiso adentro de
--    la función reemplaza esa restricción por una más ancha y correcta para
--    este caso: "puede llenar un reporte de RDC" (rdc.crear), mismo patrón
--    que ya usa fn_dashboard_frentes_en_campo.
--
--    Código normalizado = upper(btrim(codigo)), como se pidió — dos
--    espacios de más o una minúscula no deben verse como pernos distintos.
--    Toma la perforación/inyección MÁS RECIENTE de cada código con
--    row_number(), por si hay duplicados (hoy no se valida nada, ver A.4
--    del diagnóstico) — nunca debería haber más de una fila por código una
--    vez que la validación de Perforación esté activa, pero la función no
--    debe reventar si igual la hay.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rdc_pernos_estado(p_frente_id uuid default null)
returns table (
  frente_id uuid,
  zona text,
  codigo text,
  codigo_norm text,
  perforacion_fecha date,
  perforacion_ml numeric,
  perforacion_reporte_id uuid,
  inyeccion_fecha date,
  inyeccion_ml numeric,
  inyeccion_reporte_id uuid,
  estado text,
  dias_pendiente int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.crear') then
    raise exception 'No tiene permiso para ver el estado de pernos (rdc.crear)';
  end if;

  return query
  with perf as (
    select
      r.frente_id, e.zona, e.codigo, upper(btrim(e.codigo)) as codigo_norm,
      r.fecha, e.cantidad, e.reporte_id,
      row_number() over (partition by r.frente_id, upper(btrim(e.codigo)) order by r.fecha desc, r.created_at desc) as rn
    from rdc_reporte_elementos e
    join rdc_reportes r on r.id = e.reporte_id
    where e.elemento = 'Perno' and e.actividad = 'Perforación' and r.eliminado_at is null
      and (p_frente_id is null or r.frente_id = p_frente_id)
  ), iny as (
    select
      r.frente_id, upper(btrim(e.codigo)) as codigo_norm,
      r.fecha, e.cantidad, e.reporte_id,
      row_number() over (partition by r.frente_id, upper(btrim(e.codigo)) order by r.fecha desc, r.created_at desc) as rn
    from rdc_reporte_elementos e
    join rdc_reportes r on r.id = e.reporte_id
    where e.elemento = 'Perno' and e.actividad = 'Inyección' and r.eliminado_at is null
      and (p_frente_id is null or r.frente_id = p_frente_id)
  )
  select
    p.frente_id, p.zona, p.codigo, p.codigo_norm,
    p.fecha, p.cantidad, p.reporte_id,
    i.fecha, i.cantidad, i.reporte_id,
    case when i.codigo_norm is null then 'perforado' else 'inyectado' end,
    case when i.codigo_norm is null then (current_date - p.fecha) else null end
  from perf p
  left join iny i on i.frente_id = p.frente_id and i.codigo_norm = p.codigo_norm and i.rn = 1
  join frentes f on f.id = p.frente_id and f.rdc_control_pernos
  where p.rn = 1;
end;
$$;
grant execute on function public.fn_rdc_pernos_estado(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Conteo por frente y zona (perforados/inyectados/pendientes/antigüedad),
--    para el contador del paso Metrados — reutiliza fn_rdc_pernos_estado en
--    vez de repetir la lógica.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rdc_pernos_conteo(p_frente_id uuid)
returns table (
  zona text,
  perforados int,
  inyectados int,
  pendientes int,
  pendiente_mas_antiguo date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.crear') then
    raise exception 'No tiene permiso para ver el conteo de pernos (rdc.crear)';
  end if;

  return query
  select
    e.zona,
    count(*)::int as perforados,
    count(*) filter (where e.estado = 'inyectado')::int as inyectados,
    count(*) filter (where e.estado = 'perforado')::int as pendientes,
    min(e.perforacion_fecha) filter (where e.estado = 'perforado') as pendiente_mas_antiguo
  from public.fn_rdc_pernos_estado(p_frente_id) e
  group by e.zona
  order by e.zona;
end;
$$;
grant execute on function public.fn_rdc_pernos_conteo(uuid) to authenticated;

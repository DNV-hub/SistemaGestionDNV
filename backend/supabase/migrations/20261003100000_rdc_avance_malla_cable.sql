-- Extensión del control de pernos (Barrera 5): Malla y Cable, y el nuevo
-- módulo de solo lectura "Avance de sostenimiento". Ver plan aprobado en el
-- chat del 2026-10-03.

-- ---------------------------------------------------------------------------
-- 1. Homogeneizar el permiso de fn_rdc_pernos_estado: de rdc.crear (que
--    significa "puede llenar un reporte") a rdc.ver_resumen_campo (que
--    significa "puede ver el resumen de campo del RDC") — mismo chequeo que
--    van a usar las funciones nuevas de abajo, y amplía correctamente quién
--    puede consultar esto (Almacén/Residencia no llenan reportes, pero sí
--    deberían poder ver el avance). Mismo cuerpo, sin cambios de firma.
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
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el estado de pernos (rdc.ver_resumen_campo)';
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

-- ---------------------------------------------------------------------------
-- 2. Estado de Malla y Cable — mismo patrón que pernos (security definer,
--    código normalizado), pero sin perforado/inyectado: acá solo existe
--    "ya instalado", así que son listas planas, no un cruce de dos CTEs.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rdc_malla_estado(p_frente_id uuid default null)
returns table (
  frente_id uuid,
  zona text,
  codigo text,
  codigo_norm text,
  area_m2 numeric,
  fecha date,
  reporte_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  return query
  select r.frente_id, e.zona, e.codigo, upper(btrim(e.codigo)), e.cantidad, r.fecha, e.reporte_id
  from rdc_reporte_elementos e
  join rdc_reportes r on r.id = e.reporte_id
  where e.elemento = 'Malla' and e.actividad = 'Instalación' and r.eliminado_at is null
    and e.codigo is not null
    and (p_frente_id is null or r.frente_id = p_frente_id)
    and exists (select 1 from frentes f where f.id = r.frente_id and f.rdc_control_pernos);
end;
$$;
grant execute on function public.fn_rdc_malla_estado(uuid) to authenticated;

create or replace function public.fn_rdc_cable_estado(p_frente_id uuid default null)
returns table (
  frente_id uuid,
  zona text,
  codigo text,
  longitud_ml numeric,
  fecha date,
  reporte_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  return query
  select r.frente_id, e.zona, e.codigo, e.cantidad, r.fecha, e.reporte_id
  from rdc_reporte_elementos e
  join rdc_reportes r on r.id = e.reporte_id
  where e.elemento = 'Cable' and e.actividad = 'Instalación' and r.eliminado_at is null
    and (p_frente_id is null or r.frente_id = p_frente_id)
    and exists (select 1 from frentes f where f.id = r.frente_id and f.rdc_control_pernos);
end;
$$;
grant execute on function public.fn_rdc_cable_estado(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Conteo por zona ampliado: reemplaza a fn_rdc_pernos_conteo (mismo rol,
--    ahora con malla_m2/cable_ml) — todavía no tiene usuarios reales, se
--    puede reemplazar limpio en vez de mantener las dos funciones.
-- ---------------------------------------------------------------------------
drop function if exists public.fn_rdc_pernos_conteo(uuid);

create or replace function public.fn_rdc_avance_conteo(p_frente_id uuid)
returns table (
  zona text,
  perforados int,
  inyectados int,
  pendientes int,
  pendiente_mas_antiguo date,
  malla_m2 numeric,
  cable_ml numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  return query
  with pernos as (
    select
      e.zona,
      count(*)::int as perforados,
      count(*) filter (where e.estado = 'inyectado')::int as inyectados,
      count(*) filter (where e.estado = 'perforado')::int as pendientes,
      min(e.perforacion_fecha) filter (where e.estado = 'perforado') as pendiente_mas_antiguo
    from public.fn_rdc_pernos_estado(p_frente_id) e
    group by e.zona
  ), malla as (
    select zona, sum(area_m2) as malla_m2 from public.fn_rdc_malla_estado(p_frente_id) group by zona
  ), cable as (
    select zona, sum(longitud_ml) as cable_ml from public.fn_rdc_cable_estado(p_frente_id) group by zona
  )
  select
    coalesce(p.zona, m.zona, c.zona),
    coalesce(p.perforados, 0), coalesce(p.inyectados, 0), coalesce(p.pendientes, 0), p.pendiente_mas_antiguo,
    coalesce(m.malla_m2, 0), coalesce(c.cable_ml, 0)
  from pernos p
  full outer join malla m on m.zona = p.zona
  full outer join cable c on c.zona = p.zona
  order by 1;
end;
$$;
grant execute on function public.fn_rdc_avance_conteo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Frentes disponibles para el selector del módulo Avance: todos los que
--    tienen el interruptor activo si quien pregunta tiene rdc.ver_todos
--    (Planeamiento y similares); si no (un Supervisor), solo donde es su
--    frente actual o ya tiene algún reporte — mismo criterio de "propio" que
--    ya usan las políticas RLS de rdc_reportes (creado_por / supervisor_id),
--    para no inventar un concepto de "asignado" nuevo que no existe en
--    ningún otro lado del sistema.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rdc_frentes_disponibles()
returns table (id uuid, codigo text, nombre text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  if public.has_permission('rdc.ver_todos') then
    return query select f.id, f.codigo, f.nombre from frentes f where f.rdc_control_pernos order by f.nombre;
  end if;

  return query
  select distinct f.id, f.codigo, f.nombre
  from frentes f
  where f.rdc_control_pernos
    and (
      f.id = (select frente_id from usuarios where id = auth.uid())
      or exists (
        select 1 from rdc_reportes r
        where r.frente_id = f.id and r.eliminado_at is null
          and (r.creado_por = auth.uid() or r.supervisor_id = public.rdc_supervisor_id())
      )
    )
  order by f.nombre;
end;
$$;
grant execute on function public.fn_rdc_frentes_disponibles() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Umbrales de antigüedad del perno pendiente, configurables sin
--    migración (mismo patrón que rdc_dias_correccion).
-- ---------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion) values
  ('rdc_avance_dias_ambar', '3', 'Avance de sostenimiento: días pendiente desde los que un perno se resalta en ámbar.'),
  ('rdc_avance_dias_rojo', '7', 'Avance de sostenimiento: días pendiente desde los que un perno se resalta en rojo.')
on conflict (clave) do nothing;

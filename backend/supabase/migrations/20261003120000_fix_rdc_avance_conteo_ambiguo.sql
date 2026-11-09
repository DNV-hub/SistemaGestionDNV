-- Mismo tipo de bug que 20261003110000, ahora en fn_rdc_avance_conteo: las
-- CTEs `malla`/`cable` leían `zona` sin calificar desde
-- fn_rdc_malla_estado()/fn_rdc_cable_estado(), y esa columna de salida choca
-- con el `zona` de salida de la propia fn_rdc_avance_conteo (RETURNS TABLE).
-- La CTE `pernos` ya lo hacía bien (e.zona, con alias) — se iguala el criterio
-- en las otras dos.
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
    select m.zona, sum(m.area_m2) as malla_m2 from public.fn_rdc_malla_estado(p_frente_id) m group by m.zona
  ), cable as (
    select c.zona, sum(c.longitud_ml) as cable_ml from public.fn_rdc_cable_estado(p_frente_id) c group by c.zona
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

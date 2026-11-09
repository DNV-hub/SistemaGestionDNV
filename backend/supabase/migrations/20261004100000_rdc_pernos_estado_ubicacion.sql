-- Pedido en vivo: en "Avance de sostenimiento" hace falta saber dónde está
-- cada perno (ubicación) y su longitud — la longitud ya salía como
-- perforacion_ml, pero la vista todavía no la mostraba; la ubicación ni
-- siquiera estaba expuesta por la función (el dato ya existe en
-- rdc_reporte_elementos.ubicacion desde siempre, solo faltaba traerlo acá).
-- Cambia la forma de RETURNS TABLE, así que hay que borrar antes de recrear
-- (CREATE OR REPLACE no admite cambiar las columnas de salida). Ningún otro
-- objeto depende de esta función por FK/vista — fn_rdc_avance_conteo la
-- llama desde su cuerpo en tiempo de ejecución, no por una dependencia dura,
-- así que no hace falta tocarla.
drop function if exists public.fn_rdc_pernos_estado(uuid);

create function public.fn_rdc_pernos_estado(p_frente_id uuid default null)
returns table (
  frente_id uuid,
  zona text,
  codigo text,
  codigo_norm text,
  ubicacion text,
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
      r.frente_id, e.zona, e.codigo, upper(btrim(e.codigo)) as codigo_norm, e.ubicacion,
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
    p.frente_id, p.zona, p.codigo, p.codigo_norm, p.ubicacion,
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

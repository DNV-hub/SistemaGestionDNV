-- PRUEBA · Avance por código desde el RDC (perforación, inyección, pull test,
-- malla por tipo) sin depender de frentes.rdc_control_pernos.
-- Solo lectura; security definer con chequeo de permiso.
create or replace function public.ctl_avance_elementos(p_frente_id uuid)
returns table(elemento text, actividad text, tipo text, codigo_norm text, primera_fecha date, ultima_fecha date, cantidad numeric, area_m2 numeric, registros int)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_permission('frentes.ver') or public.has_permission('rdc.ver_resumen_campo')) then
    raise exception 'Sin permiso para ver el avance del frente';
  end if;
  return query
  select e.elemento, e.actividad, e.tipo, upper(btrim(e.codigo)),
         min(r.fecha), max(r.fecha), sum(e.cantidad), sum(e.area_m2), count(*)::int
    from public.rdc_reporte_elementos e
    join public.rdc_reportes r on r.id = e.reporte_id
   where r.frente_id = p_frente_id and r.eliminado_at is null
   group by e.elemento, e.actividad, e.tipo, upper(btrim(e.codigo));
end;
$$;
revoke all on function public.ctl_avance_elementos(uuid) from public, anon;
grant execute on function public.ctl_avance_elementos(uuid) to authenticated;

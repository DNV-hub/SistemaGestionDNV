-- Fix: round(double precision, integer) no existe en Postgres — solo
-- round(numeric, integer). similarity() de pg_trgm devuelve real, así que
-- hacía fallar fn_rdc_sincronizar_confirmaciones() con error 42883 en
-- cualquier reporte con metrados "libres" (bloque sin partida EDT), es
-- decir, en la mayoría de los reportes reales. Reemplaza la función
-- (20261007100000_rdc_metrados_confirmacion.sql) con la misma firma,
-- casteando a numeric antes de redondear.
-- Reversible: no aplica (vuelve a dejar el bug si se revierte el cuerpo).
create or replace function public.fn_rdc_sincronizar_confirmaciones(p_reporte_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_frente_id uuid; v_fecha date;
begin
  if not public.rdc_puede_editar_reporte(p_reporte_id) and not public.has_permission('rdc.editar_todos') then
    raise exception 'No tiene permiso para sincronizar este reporte';
  end if;
  select frente_id, fecha into v_frente_id, v_fecha from rdc_reportes where id = p_reporte_id;

  insert into rdc_metrados_confirmacion (reporte_id, frente_id, fecha, partida_edt_id, metrado_origen_id, origen, cantidad)
  select p_reporte_id, v_frente_id, v_fecha, m.partida_edt_id, m.id, 'digitado_edt', m.cantidad
  from rdc_reporte_metrados_edt m where m.reporte_id = p_reporte_id
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';

  insert into rdc_metrados_confirmacion (reporte_id, frente_id, fecha, partida_edt_id, origen, cantidad)
  select p_reporte_id, v_frente_id, v_fecha, p.id, p.tipo_medicion,
         sum(case when p.tipo_medicion = 'conteo_pernos' then 1 else e.cantidad end)
  from rdc_partidas_edt p
  join rdc_reporte_elementos e on e.reporte_id = p_reporte_id
    and ((p.tipo_medicion = 'conteo_pernos' and e.elemento = 'Perno' and e.actividad = 'Perforación')
      or (p.tipo_medicion = 'suma_panos_malla' and e.elemento = 'Malla' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro)))
      or (p.tipo_medicion = 'suma_tramos_cable' and e.elemento = 'Cable' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro))))
    and (p.zona_filtro is null or e.zona = p.zona_filtro)
  where p.frente_id = v_frente_id and p.tipo_medicion <> 'digitado'
  group by p.id, p.tipo_medicion
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';

  insert into rdc_metrados_confirmacion (reporte_id, frente_id, fecha, metrado_origen_id, origen,
                                          texto_reportado, cantidad, sugerida_partida_edt_id, coincidencia_pct)
  select p_reporte_id, v_frente_id, v_fecha, m.id, 'libre', m.partida_nombre, m.cantidad, mejor.id, mejor.pct
  from rdc_reporte_metrados m
  left join lateral (
    select p.id, round((similarity(m.partida_nombre, p.nombre) * 100)::numeric, 2) as pct
    from rdc_partidas_edt p where p.frente_id = v_frente_id and p.activo
    order by similarity(m.partida_nombre, p.nombre) desc limit 1
  ) mejor on true
  where m.reporte_id = p_reporte_id and m.bloque = 'libre'
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';
end;
$$;
grant execute on function public.fn_rdc_sincronizar_confirmaciones(uuid) to authenticated;

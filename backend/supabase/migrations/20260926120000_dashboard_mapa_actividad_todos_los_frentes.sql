-- El mapa de actividad solo traía frentes con estado = 'activo' — pero
-- para responder "¿qué frentes estaban en tal fecha?" (el propósito mismo
-- del mapa) hace falta poder ver también los paralizados y cerrados de ese
-- mes: un frente que hoy está cerrado igual reportó actividad real en
-- setiembre. El filtro de qué mostrar (activos / todos / paralizados /
-- cerrados) ahora vive en el frontend — acá se manda el estado de cada
-- frente para que pueda filtrar.
create or replace function public.fn_dashboard_mapa_actividad(p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_resultado jsonb;
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el mapa de actividad (rdc.ver_resumen_campo)';
  end if;

  select jsonb_build_object(
    'frentes', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'estado', f.estado)
        order by coalesce(f.codigo, f.nombre)
      )
      from frentes f
    ), '[]'::jsonb),
    'reportes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'frente_id', r.frente_id,
        'fecha', r.fecha,
        'supervisor_id', r.supervisor_id,
        'supervisor', coalesce(s.nombre, '—'),
        'supervisor_color', s.color,
        'capataz', c.nombre,
        'observaciones', r.observaciones
      ))
      from rdc_reportes r
      left join rdc_supervisores s on s.id = r.supervisor_id
      left join rdc_capataces c on c.id = r.capataz_id
      where r.fecha between p_desde and p_hasta
    ), '[]'::jsonb)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

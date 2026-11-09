-- Permite fijar a mano el color de un supervisor en el mapa de actividad
-- del Dashboard: el color automático (hash del id, con corrimiento para no
-- repetir dentro del mismo mes) es suficiente la mayoría de las veces, pero
-- el usuario quiere poder elegir un color memorable para algunos
-- supervisores puntuales en vez de aceptar el que le tocó por hash.
-- Null = sigue usando el color automático (comportamiento de siempre).
alter table rdc_supervisores add column color text;

comment on column rdc_supervisores.color is
  'Color fijo (hex, ej. #3B82F6) para el mapa de actividad del Dashboard. Null = color automático por hash.';

-- Ya tiene RLS de escritura gateada por rdc.catalogos_gestionar
-- (20260909100200_rdc_permisos_rls), así que un UPDATE directo desde el
-- frontend alcanza sin política nueva.

-- El mapa de actividad necesita el color guardado, no solo nombre/capataz.
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
        jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nombre', f.nombre)
        order by coalesce(f.codigo, f.nombre)
      )
      from frentes f
      where f.estado = 'activo'
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

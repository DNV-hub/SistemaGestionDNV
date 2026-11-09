-- El mapa de actividad ahora agrupa visualmente los frentes por contrato
-- (Marco / Sala Eléctrica) — para eso necesita saber a qué contrato
-- pertenece cada frente, no solo su nombre/estado.
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
        jsonb_build_object(
          'id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'estado', f.estado,
          'contrato_id', f.contrato_id, 'contrato_nombre', c.nombre
        )
        order by coalesce(f.codigo, f.nombre)
      )
      from frentes f
      left join contratos c on c.id = f.contrato_id
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

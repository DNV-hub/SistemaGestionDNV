-- El usuario (Almacén) pidió poder ver qué frentes estaban activos en una
-- fecha PASADA, no solo "hoy/ayer" — un compañero le preguntó por una fecha
-- anterior y no había forma de responder sin ir a revisar reporte por
-- reporte. Se agrega `p_hasta` (opcional) a la misma función: sin tocarlo,
-- el comportamiento es idéntico al de antes (nadie más que el Dashboard la
-- llama, y lo sigue haciendo sin este parámetro). Con `p_hasta`, el
-- frontend puede pedir "el más reciente reporte de cada frente entre
-- p_desde y p_hasta" para cualquier fecha elegida, reusando exactamente la
-- misma lógica de "el más reciente por frente" que ya tenía.
create or replace function public.fn_dashboard_frentes_en_campo(p_desde date, p_hasta date default null)
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
    raise exception 'No tiene permiso para ver el resumen de campo (rdc.ver_resumen_campo)';
  end if;

  with vigentes as (
    select distinct on (r.frente_id)
      r.id, r.fecha, r.frente_id, r.supervisor_id, r.capataz_id,
      r.restriccion_acceso, r.restriccion_descripcion, r.restriccion_inicio, r.restriccion_fin
    from rdc_reportes r
    where r.fecha >= p_desde
      and (p_hasta is null or r.fecha <= p_hasta)
    order by r.frente_id, r.fecha desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'frente', jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nombre', f.nombre),
        'fecha', v.fecha,
        'supervisor', coalesce(s.nombre, '—'),
        'capataz', c.nombre,
        'personal', coalesce(pj.personal, '[]'::jsonb),
        'maquinaria', coalesce(mj.maquinaria, '[]'::jsonb),
        'restriccion', case
          when v.restriccion_acceso then
            jsonb_build_object('descripcion', v.restriccion_descripcion, 'inicio', v.restriccion_inicio, 'fin', v.restriccion_fin)
          else null
        end
      )
      order by coalesce(f.codigo, f.nombre)
    ),
    '[]'::jsonb
  )
  into v_resultado
  from vigentes v
  join frentes f on f.id = v.frente_id
  left join rdc_supervisores s on s.id = v.supervisor_id
  left join rdc_capataces c on c.id = v.capataz_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('categoria', p.categoria, 'tipo', p.tipo, 'cantidad', p.cantidad)) as personal
    from rdc_reporte_personal p
    where p.reporte_id = v.id
  ) pj on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'categoria', m.categoria, 'cantidad', m.cantidad)) as maquinaria
    from rdc_reporte_maquinaria m
    where m.reporte_id = v.id
  ) mj on true;

  return v_resultado;
end;
$$;

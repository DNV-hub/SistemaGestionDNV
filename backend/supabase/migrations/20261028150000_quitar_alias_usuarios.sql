-- Se quita el alias de usuarios (no se mostraba en ninguna pantalla útil).
-- Vuelve el Dashboard a mostrar el nombre del catálogo de supervisores y se
-- elimina la columna usuarios.alias.
--
-- Rollback manual: ver 20261028120000_usuarios_alias.sql.

CREATE OR REPLACE FUNCTION public.fn_dashboard_frentes_en_campo(p_desde date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and r.eliminado_at is null
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_dashboard_mapa_actividad(p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        and r.eliminado_at is null
    ), '[]'::jsonb)
  )
  into v_resultado;

  return v_resultado;
end;
$function$;

alter table usuarios drop column if exists alias;

-- Mapa de actividad mensual del Dashboard: un heatmap por frente/día que
-- identifica QUIÉN reportó (color = supervisor), no si el frente "está
-- activo" — hoy ese check no distingue un frente que de verdad se paralizó
-- de uno que solo cambió de supervisor. Un salto de color en la misma fila
-- sin ningún día gris de por medio es solo relevo; un día gris es un hueco
-- real que hay que revisar.
--
-- Dato ya resuelto de antes (20260911170000_unificar_frentes_rdc_sistema):
-- rdc_reportes.frente_id YA es una FK real a `frentes` (la tabla que usa
-- todo el Sistema), no texto libre — no hace falta ninguna migración de
-- datos para esto, la base para calcular saltos de frente_id por código ya
-- existe.
--
-- Misma familia de permiso que "Frentes en campo" (rdc.ver_resumen_campo):
-- es el mismo tipo de resumen (quién está dónde), solo que para un mes
-- completo en vez de hoy/ayer, y trae además la observación de texto libre
-- del reporte — sigue sin exponer el reporte completo (bitácora, metrados,
-- standby, redline, etc.), por eso no hace falta rdc.ver_todos para verlo.
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

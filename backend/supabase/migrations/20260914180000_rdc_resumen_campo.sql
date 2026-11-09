-- El usuario reportó una fuga real: le dimos rdc.ver_todos a Almacén y a
-- Supervisor SOLO para que la tarjeta "Frentes en campo" del dashboard
-- funcionara, pero ese permiso es un OR crudo en la política RLS de
-- rdc_reportes (ver rdc_reportes_select, 20260909100200) — no distingue
-- "dashboard" de "abrir el reporte completo de un colega". Con eso, un
-- supervisor entraba a /rdc y veía los reportes de CUALQUIER otro
-- supervisor, no solo el suyo — exactamente lo que "rdc.ver_propios" existe
-- para evitar.
--
-- La solución correcta no es un permiso más amplio con más condiciones: es
-- una función security definer que devuelve SOLO lo que el dashboard
-- necesita (frente, supervisor, capataz, personal/equipos, restricción) —
-- nunca bitácora, observaciones, metrados, standby, redline ni el resto del
-- contenido real de un reporte — sin pasar por la política de la tabla.
-- rdc.ver_todos vuelve a ser lo que era antes: para quien de verdad
-- necesita abrir y corregir cualquier reporte (Administrador, Developer,
-- Planeamiento), no un permiso "de paso" para alimentar una tarjeta.

insert into permisos (codigo, modulo, descripcion)
values (
  'rdc.ver_resumen_campo',
  'rdc',
  'Ver el resumen de "quién está en campo hoy" en el Dashboard (frente, supervisor, capataz, personal/equipos) — sin poder abrir el reporte completo de otro'
)
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo = 'rdc.ver_resumen_campo'
where r.nombre in ('Administrador', 'Developer', 'Planeamiento', 'Almacen', 'Supervisor')
on conflict (rol_id, permiso_id) do nothing;

-- Se les había dado rdc.ver_todos (20260914160000 a Almacén, 20260914170000
-- a Supervisor) solo para esto — ya cubierto por rdc.ver_resumen_campo, así
-- que se retira el acceso amplio que de paso abría cualquier reporte ajeno.
delete from rol_permisos
where permiso_id in (select id from permisos where codigo = 'rdc.ver_todos')
  and rol_id in (select id from roles where nombre in ('Almacen', 'Supervisor'));

create or replace function public.fn_dashboard_frentes_en_campo(p_desde date)
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
    -- Un frente puede tener reporte de ayer Y de hoy en la ventana — se
    -- queda con el más reciente por frente, igual que hacía el cliente
    -- antes de esta función.
    select distinct on (r.frente_id)
      r.id, r.fecha, r.frente_id, r.supervisor_id, r.capataz_id,
      r.restriccion_acceso, r.restriccion_descripcion, r.restriccion_inicio, r.restriccion_fin
    from rdc_reportes r
    where r.fecha >= p_desde
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

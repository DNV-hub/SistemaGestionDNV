-- Causa raíz encontrada (2026-10-05): fn_rdc_sincronizar_confirmaciones
-- insertaba una fila 'digitado_edt' por CADA fila de rdc_reporte_metrados_edt
-- sin fijarse si la partida detrás seguía siendo tipo_medicion='digitado' —
-- si una partida se reclasifica a conteo_pernos/malla/cable/solo_seguimiento
-- DESPUÉS de que algún reporte viejo (o un cliente con catálogo desactualizado,
-- ver fix en rdcService.js) ya le escribió una fila en esa tabla, al
-- resincronizar ese reporte se generaba una confirmación 'digitado_edt' en
-- paralelo a la derivada/'solo_seguimiento' real — doble conteo si ambas se
-- confirman (caso real: SOST-01 en Barrera 5, resuelto a mano, ver
-- DICCIONARIO_DATOS.md).
--
-- Fix de raíz: el insert de 'digitado_edt' ahora exige que la partida siga
-- siendo 'digitado' en este mismo instante. No se agrega una restricción
-- general de "una sola confirmación activa por partida+reporte" a propósito:
-- un metrado 'libre'/'estandar' SÍ puede enlazarse válidamente a una partida
-- que también tiene una derivada (ej. pernos contados por el bloque 2 +
-- pernos reportados aparte en texto libre que Planeamiento decide sumar
-- igual) — esa coexistencia es intencional, no un bug.
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
  from rdc_reporte_metrados_edt m
  join rdc_partidas_edt p on p.id = m.partida_edt_id and p.tipo_medicion = 'digitado'
  where m.reporte_id = p_reporte_id
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
  where p.frente_id = v_frente_id
    and p.tipo_medicion in ('conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable')
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

  insert into rdc_metrados_confirmacion (reporte_id, frente_id, fecha, metrado_origen_id, origen,
                                          texto_reportado, cantidad, sugerida_partida_edt_id, coincidencia_pct)
  select p_reporte_id, v_frente_id, v_fecha, m.id, 'estandar', m.partida_nombre, m.cantidad, mejor.id, mejor.pct
  from rdc_reporte_metrados m
  left join lateral (
    select p.id, round((similarity(m.partida_nombre, p.nombre) * 100)::numeric, 2) as pct
    from rdc_partidas_edt p where p.frente_id = v_frente_id and p.activo
    order by similarity(m.partida_nombre, p.nombre) desc limit 1
  ) mejor on true
  where m.reporte_id = p_reporte_id and m.bloque in ('1', '3')
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';
end;
$$;
grant execute on function public.fn_rdc_sincronizar_confirmaciones(uuid) to authenticated;

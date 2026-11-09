-- Pedido del usuario: el Bloque 1/3 (las 15 partidas estándar que ya llena
-- el supervisor a diario) no alimentaba nada de esto — solo 'libre' se
-- comparaba contra el catálogo de Partidas EDT. Esta migración agrega un
-- cuarto origen, 'estandar', con el mismo tratamiento que 'libre': se
-- sugiere la partida real de cronograma más parecida por texto
-- (rdc_partidas_estandar.nombre, guardado en rdc_reporte_metrados.
-- partida_nombre para TODO bloque, no solo libre — verificado en
-- rdcService.js), y Planeamiento confirma/corrige el enlace en la Bandeja,
-- igual que ya hace con los libres. No cambia nada del RDC del supervisor:
-- sigue llenando sus 15 partidas de siempre, tal cual.
-- Reversible: volver el check a los 4 valores anteriores (falla si ya hay
-- filas 'estandar' sin reclasificar) y restaurar el cuerpo anterior de las
-- 3 funciones reemplazadas.

alter table rdc_metrados_confirmacion drop constraint rdc_metrados_confirmacion_origen_check;
alter table rdc_metrados_confirmacion add constraint rdc_metrados_confirmacion_origen_check
  check (origen in ('digitado_edt', 'conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable', 'libre', 'estandar'));

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
  where p.frente_id = v_frente_id
    and p.tipo_medicion in ('conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable')
  group by p.id, p.tipo_medicion
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';

  -- Libre: sugerencia por similaridad de texto contra TODAS las partidas
  -- activas del frente (sin filtrar por tipo_medicion).
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

  -- Estándar (Bloque 1/3): mismo trato que libre — sugerencia por
  -- similaridad de texto entre el nombre de la partida ESTÁNDAR que llenó
  -- el supervisor (ej. "Perforación de pernos") y el nombre de cada
  -- Partida EDT real. El supervisor no cambia nada de lo que ya hace.
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

-- 'estandar' necesita el mismo permiso de reasignar partida_edt_id que ya
-- tiene 'libre' al confirmar/corregir.
create or replace function public.fn_rdc_confirmar_metrado(p_id uuid, p_partida_edt_id uuid default null)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion
  set estado = 'confirmado',
      partida_edt_id = case when origen in ('libre', 'estandar') then coalesce(p_partida_edt_id, partida_edt_id) else partida_edt_id end,
      resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado = 'por_confirmar';
$$;
grant execute on function public.fn_rdc_confirmar_metrado(uuid, uuid) to authenticated;

create or replace function public.fn_rdc_corregir_metrado(p_id uuid, p_cantidad numeric, p_motivo text, p_partida_edt_id uuid default null)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion
  set estado = 'corregido', cantidad_original = cantidad, cantidad_corregida = p_cantidad,
      cantidad = p_cantidad, motivo = p_motivo,
      partida_edt_id = case when origen in ('libre', 'estandar') then coalesce(p_partida_edt_id, partida_edt_id) else partida_edt_id end,
      resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado = 'por_confirmar';
$$;
grant execute on function public.fn_rdc_corregir_metrado(uuid, numeric, text, uuid) to authenticated;

-- Pedido de Planeamiento: las partidas de pernos por ubicación en el talud
-- (Pasivo Cabecera / Pasivo / Pasivo Pie) necesitan sumar ML, no contar
-- unidades, combinando Perforación e Inyección con un factor configurable
-- cada una — 0.7/0.3 por defecto en Barrera 5, pero puede variar por
-- partida (una que solo capture perforación usa 1/0, el default de columna).
--
-- Reversible: `alter table rdc_partidas_edt drop column ubicacion_filtro,
-- drop column factor_perforacion, drop column factor_inyeccion` + volver el
-- check de tipo_medicion y el cuerpo de la función a la versión anterior.

alter table rdc_partidas_edt
  add column ubicacion_filtro text,
  add column factor_perforacion numeric(5,2) not null default 1,
  add column factor_inyeccion numeric(5,2) not null default 0;

alter table rdc_partidas_edt drop constraint rdc_partidas_edt_tipo_medicion_check;
alter table rdc_partidas_edt add constraint rdc_partidas_edt_tipo_medicion_check
  check (tipo_medicion in ('solo_seguimiento', 'digitado', 'conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable', 'suma_ml_pernos'));

alter table rdc_partidas_edt drop constraint rdc_partidas_edt_filtro_obligatorio;
alter table rdc_partidas_edt add constraint rdc_partidas_edt_filtro_obligatorio check (
  (tipo_medicion not in ('suma_panos_malla', 'suma_tramos_cable') or tipo_filtro is not null)
  and (tipo_medicion <> 'suma_ml_pernos' or ubicacion_filtro is not null)
);

-- Reclasificación acordada con Planeamiento (2026-10-06): las 3 partidas
-- reales de Barrera 5 que ya estaban en el cronograma importado, ahora con
-- su filtro de ubicación. 'Pie' y 'Pie de banqueta' van juntas a la misma
-- partida (lista separada por comas, mismo truco que rdc_prefijos.prefijo).
update rdc_partidas_edt
set tipo_medicion = 'suma_ml_pernos', ubicacion_filtro = 'Cabecera', factor_perforacion = 0.7, factor_inyeccion = 0.3
where frente_id = '806dfaf1-9681-4b8f-a13f-55cfeb71f3bd' and codigo_edt = '2.01';

update rdc_partidas_edt
set tipo_medicion = 'suma_ml_pernos', ubicacion_filtro = 'Lateral,Viento,Cuerpo', factor_perforacion = 0.7, factor_inyeccion = 0.3
where frente_id = '806dfaf1-9681-4b8f-a13f-55cfeb71f3bd' and codigo_edt = '2.04';

update rdc_partidas_edt
set tipo_medicion = 'suma_ml_pernos', ubicacion_filtro = 'Pie,Pie de banqueta', factor_perforacion = 0.7, factor_inyeccion = 0.3
where frente_id = '806dfaf1-9681-4b8f-a13f-55cfeb71f3bd' and codigo_edt = '2.05';

-- SOST-01 era una partida de PRUEBA (creada a mano el 2026-10-04 para
-- demostrar la Fase 4, nunca formó parte del cronograma real) — se archiva,
-- no se borra, queda como registro histórico.
update rdc_partidas_edt set activo = false
where frente_id = '806dfaf1-9681-4b8f-a13f-55cfeb71f3bd' and codigo_edt = 'SOST-01';

-- fn_rdc_sincronizar_confirmaciones: agrega el cálculo de 'suma_ml_pernos'
-- al bloque de derivadas (perforación/inyección ya reportadas, por
-- ubicación, ponderadas por factor). El resto de la función queda igual.
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
         sum(
           case
             when p.tipo_medicion = 'conteo_pernos' then 1
             when p.tipo_medicion = 'suma_ml_pernos' and e.actividad = 'Perforación' then e.cantidad * p.factor_perforacion
             when p.tipo_medicion = 'suma_ml_pernos' and e.actividad = 'Inyección' then e.cantidad * p.factor_inyeccion
             else e.cantidad
           end
         )
  from rdc_partidas_edt p
  join rdc_reporte_elementos e on e.reporte_id = p_reporte_id
    and ((p.tipo_medicion = 'conteo_pernos' and e.elemento = 'Perno' and e.actividad = 'Perforación')
      or (p.tipo_medicion = 'suma_panos_malla' and e.elemento = 'Malla' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro)))
      or (p.tipo_medicion = 'suma_tramos_cable' and e.elemento = 'Cable' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro)))
      or (p.tipo_medicion = 'suma_ml_pernos' and e.elemento = 'Perno' and e.actividad in ('Perforación', 'Inyección')
          and upper(btrim(e.ubicacion)) = any(string_to_array(upper(btrim(p.ubicacion_filtro)), ','))))
    and (p.zona_filtro is null or e.zona = p.zona_filtro)
  where p.frente_id = v_frente_id
    and p.tipo_medicion in ('conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable', 'suma_ml_pernos')
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

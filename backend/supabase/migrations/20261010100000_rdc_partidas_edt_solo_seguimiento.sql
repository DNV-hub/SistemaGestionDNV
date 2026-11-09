-- Quinto tipo_medicion: 'solo_seguimiento'. Pedido explícito del usuario:
-- "el RDC no debe cambiar nada, todo sigue igual" — quiere poder importar
-- su cronograma real completo (muchas más partidas que las 'estándar' que
-- ya usan los supervisores) sin que eso le agregue ni un solo campo nuevo
-- al formulario del RDC. Esas partidas quedan sin captura propia: su
-- acumulado se llena únicamente cuando Planeamiento confirma un metrado
-- "libre" (texto suelto del supervisor) y lo enlaza acá por parecido de
-- texto, en la Bandeja de Confirmación (fn_rdc_confirmar_metrado /
-- fn_rdc_corregir_metrado, ya reciben p_partida_edt_id desde la migración
-- anterior). El frontend (PasoMetrados.vue) ya filtra este tipo para que
-- nunca aparezca en el RDC del supervisor.
-- Reversible: volver el check a los 4 valores anteriores (fallaría si ya
-- hay filas con 'solo_seguimiento' sin reclasificar antes).

alter table rdc_partidas_edt drop constraint rdc_partidas_edt_tipo_medicion_check;
alter table rdc_partidas_edt add constraint rdc_partidas_edt_tipo_medicion_check
  check (tipo_medicion in ('solo_seguimiento', 'digitado', 'conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable'));

-- Antes el filtro era "tipo_medicion <> 'digitado'": funcionaba sin bug
-- porque el join exige que alguna de las 3 condiciones de
-- conteo_pernos/malla/cable sea cierta (una fila 'solo_seguimiento' nunca
-- la cumple, así que el join no producía nada para ella) — pero ya no es
-- una descripción correcta de la intención con el quinto tipo en juego, así
-- que queda explícito.
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
  -- activas del frente (sin filtrar por tipo_medicion) — incluye a propósito
  -- las 'solo_seguimiento', que es justamente el cronograma real que se
  -- resuelve solo por acá.
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
end;
$$;
grant execute on function public.fn_rdc_sincronizar_confirmaciones(uuid) to authenticated;

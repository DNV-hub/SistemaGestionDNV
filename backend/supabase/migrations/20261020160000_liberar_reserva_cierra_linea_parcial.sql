-- Cuando una línea de vale se entregó solo en parte y luego se LIBERA el saldo
-- que sobraba, la línea ya no tiene nada más que entregar: pasa a "Entregado"
-- (lo aprobado se ajusta a lo realmente entregado) y el vale se recalcula, de
-- modo que si era la última pendiente el vale queda "Atendido" en vez de
-- quedarse en "Parcialmente atendido" para siempre.
--
-- Cancelar (p_cancelar) sigue igual: la línea queda "Cancelado".
-- Reversible: volver a la versión anterior de fn_liberar_reserva (migración
-- 20261019100000 o anterior) y devolver a 'Parcialmente entregado' las líneas
-- que corrige el repaso del final.

create or replace function public.fn_liberar_reserva(
  p_reserva_id uuid,
  p_motivo text,
  p_usuario_id uuid,
  p_cancelar boolean default false
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reserva reservas%rowtype;
  v_saldo_pendiente numeric(14,3);
  v_nuevo_estado text;
  v_vale_id uuid;
begin
  if not (public.has_permission('reservas.liberar_manual') or public.has_permission('vales.cancelar')) then
    raise exception 'No tiene permiso para liberar/cancelar reservas';
  end if;

  select * into v_reserva from reservas where id = p_reserva_id for update;
  if v_reserva.id is null then
    raise exception 'reserva % no existe', p_reserva_id;
  end if;
  if v_reserva.estado in ('Convertida', 'Liberada', 'Cancelada') then
    raise exception 'La reserva % ya está en estado %, no se puede liberar', p_reserva_id, v_reserva.estado;
  end if;

  v_saldo_pendiente := v_reserva.cantidad - v_reserva.cantidad_entregada;
  v_nuevo_estado := case when p_cancelar then 'Cancelada' else 'Liberada' end;

  update reservas set estado = v_nuevo_estado where id = p_reserva_id;

  update stock
    set cantidad_reservada = cantidad_reservada - v_saldo_pendiente
  where almacen_id = v_reserva.almacen_id and material_id = v_reserva.material_id and contrato_id = v_reserva.contrato_id;

  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (p_reserva_id, v_reserva.estado, v_nuevo_estado, v_reserva.cantidad_entregada, v_reserva.cantidad_entregada, p_motivo, p_usuario_id);

  if p_cancelar then
    update vale_detalle set estado = 'Cancelado' where id = v_reserva.vale_detalle_id;
  elsif v_reserva.cantidad_entregada > 0 then
    -- Entregó parte y el resto se soltó: la línea queda cerrada con lo entregado.
    update vale_detalle
       set estado = 'Entregado',
           cantidad_aprobada = v_reserva.cantidad_entregada
     where id = v_reserva.vale_detalle_id
     returning vale_id into v_vale_id;
    if v_vale_id is not null then
      perform public.fn_actualizar_estado_vale(v_vale_id);
    end if;
  end if;
end;
$function$;

-- Repaso de lo que ya estaba así (VR-0086 y VR-0112): líneas parcialmente
-- entregadas cuya reserva ya fue liberada.
do $$
declare
  r record;
begin
  for r in
    select d.id as detalle_id, d.vale_id, res.cantidad_entregada
    from vale_detalle d
    join reservas res on res.vale_detalle_id = d.id
    where res.estado = 'Liberada'
      and d.estado = 'Parcialmente entregado'
      and res.cantidad_entregada > 0
  loop
    update vale_detalle
       set estado = 'Entregado', cantidad_aprobada = r.cantidad_entregada
     where id = r.detalle_id;
    perform public.fn_actualizar_estado_vale(r.vale_id);
  end loop;
end $$;

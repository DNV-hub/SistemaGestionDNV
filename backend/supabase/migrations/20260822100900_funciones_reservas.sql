-- Funciones de negocio para el ciclo de vida de una reserva. Son
-- security definer porque mutan `stock` directamente (los usuarios nunca
-- escriben esa tabla por RLS, ver 20260822101400_rls_policies.sql) — por
-- eso cada una valida el permiso del llamante al entrar, en vez de confiar
-- en RLS.

-- Aprueba una línea de vale y reserva stock disponible. Usa SELECT ... FOR
-- UPDATE sobre la fila de stock para que dos aprobaciones concurrentes no
-- puedan comprometer más material del que hay disponible (§7 / §3.3 del
-- modelo de datos).
create or replace function public.fn_crear_reserva(
  p_vale_detalle_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_usuario_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material_id uuid;
  v_frente_id uuid;
  v_disponible numeric(14,3);
  v_reserva_id uuid;
begin
  if not (public.has_permission('vales.aprobar_rechazar')) then
    raise exception 'No tiene permiso para aprobar líneas de vale (vales.aprobar_rechazar)';
  end if;

  select vd.material_id, v.frente_id
    into v_material_id, v_frente_id
  from vale_detalle vd
  join vales v on v.id = vd.vale_id
  where vd.id = p_vale_detalle_id;

  if v_material_id is null then
    raise exception 'vale_detalle % no existe', p_vale_detalle_id;
  end if;

  -- Garantiza que exista la fila de stock, luego la bloquea. El
  -- ON CONFLICT DO NOTHING + lock evita la carrera de dos transacciones
  -- insertando la misma fila al mismo tiempo.
  insert into stock (almacen_id, material_id)
  values (p_almacen_id, v_material_id)
  on conflict (almacen_id, material_id) do nothing;

  select cantidad_disponible into v_disponible
  from stock
  where almacen_id = p_almacen_id and material_id = v_material_id
  for update;

  if p_cantidad > v_disponible then
    raise exception
      'Cantidad a reservar (%) excede el disponible (%) para el material % en el almacén %',
      p_cantidad, v_disponible, v_material_id, p_almacen_id;
  end if;

  insert into reservas (vale_detalle_id, material_id, almacen_id, frente_id, cantidad, usuario_id)
  values (p_vale_detalle_id, v_material_id, p_almacen_id, v_frente_id, p_cantidad, p_usuario_id)
  returning id into v_reserva_id;

  update stock
    set cantidad_reservada = cantidad_reservada + p_cantidad
  where almacen_id = p_almacen_id and material_id = v_material_id;

  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (v_reserva_id, null, 'Activa', null, p_cantidad, 'Creación al aprobar vale', p_usuario_id);

  update vale_detalle
    set estado = 'Reservado', cantidad_aprobada = coalesce(cantidad_aprobada, p_cantidad)
  where id = p_vale_detalle_id;

  return v_reserva_id;
end;
$$;

-- Recalcula el estado del vale a partir de sus líneas. Se llama después de
-- cada avance de reserva.
create or replace function public.fn_actualizar_estado_vale(p_vale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_entregadas int;
begin
  select count(*), count(*) filter (where estado = 'Entregado')
    into v_total, v_entregadas
  from vale_detalle
  where vale_id = p_vale_id and estado <> 'Cancelado';

  if v_total = 0 then
    return;
  end if;

  if v_entregadas = v_total then
    update vales set estado = 'Atendido' where id = p_vale_id and estado <> 'Cerrado';
  elsif v_entregadas > 0 then
    update vales set estado = 'Parcialmente atendido' where id = p_vale_id and estado <> 'Cerrado';
  end if;
end;
$$;

-- Aplica una entrega física (parcial o total) a una reserva. Es invocada
-- únicamente por el trigger de `salidas` (ver
-- 20260822101000_triggers_movimientos_fisicos.sql) — el permiso real se
-- valida en la política RLS de INSERT sobre `salidas`
-- (salidas.registrar_entrega), no aquí.
create or replace function public.fn_avanzar_reserva(
  p_reserva_id uuid,
  p_cantidad_entregada numeric,
  p_usuario_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva reservas%rowtype;
  v_nueva_entregada numeric(14,3);
  v_nuevo_estado text;
begin
  select * into v_reserva from reservas where id = p_reserva_id for update;

  if v_reserva.id is null then
    raise exception 'reserva % no existe', p_reserva_id;
  end if;

  if v_reserva.estado not in ('Activa', 'Parcial') then
    raise exception 'La reserva % está en estado %, no admite más entregas', p_reserva_id, v_reserva.estado;
  end if;

  v_nueva_entregada := v_reserva.cantidad_entregada + p_cantidad_entregada;

  if v_nueva_entregada > v_reserva.cantidad then
    raise exception
      'La entrega (%) excede el saldo pendiente de la reserva % (saldo %)',
      p_cantidad_entregada, p_reserva_id, (v_reserva.cantidad - v_reserva.cantidad_entregada);
  end if;

  v_nuevo_estado := case when v_nueva_entregada = v_reserva.cantidad then 'Convertida' else 'Parcial' end;

  update reservas
    set cantidad_entregada = v_nueva_entregada,
        estado = v_nuevo_estado
  where id = p_reserva_id;

  -- Libera del "reservado" exactamente lo que se acaba de entregar
  -- físicamente. cantidad_fisica se descuenta aparte, en
  -- fn_registrar_movimiento_stock.
  update stock
    set cantidad_reservada = cantidad_reservada - p_cantidad_entregada
  where almacen_id = v_reserva.almacen_id and material_id = v_reserva.material_id;

  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (
    p_reserva_id, v_reserva.estado, v_nuevo_estado, v_reserva.cantidad_entregada, v_nueva_entregada,
    case when v_nuevo_estado = 'Convertida' then 'Entrega total' else 'Entrega parcial' end,
    p_usuario_id
  );

  update vale_detalle
    set cantidad_entregada = cantidad_entregada + p_cantidad_entregada,
        estado = case when v_nuevo_estado = 'Convertida' then 'Entregado' else 'Parcialmente entregado' end
  where id = v_reserva.vale_detalle_id;

  perform public.fn_actualizar_estado_vale(
    (select vale_id from vale_detalle where id = v_reserva.vale_detalle_id)
  );
end;
$$;

-- Libera (sin entrega) o cancela una reserva que todavía tiene saldo
-- pendiente. No toca cantidad_fisica — solo revierte el compromiso.
create or replace function public.fn_liberar_reserva(
  p_reserva_id uuid,
  p_motivo text,
  p_usuario_id uuid,
  p_cancelar boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva reservas%rowtype;
  v_saldo_pendiente numeric(14,3);
  v_nuevo_estado text;
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
  where almacen_id = v_reserva.almacen_id and material_id = v_reserva.material_id;

  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (p_reserva_id, v_reserva.estado, v_nuevo_estado, v_reserva.cantidad_entregada, v_reserva.cantidad_entregada, p_motivo, p_usuario_id);

  if p_cancelar then
    update vale_detalle set estado = 'Cancelado' where id = v_reserva.vale_detalle_id;
  end if;
end;
$$;

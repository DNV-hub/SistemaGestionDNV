-- Aprobar una línea de vale cuando el stock del material está en OTRO contrato.
-- Decisión de la empresa: se puede tomar material del otro contrato.
--
-- Antes: fn_crear_reserva solo miraba el stock del contrato del frente del
-- vale; si ahí había 0 aunque otro contrato tuviera de sobra, fallaba con
-- "excede el disponible (0.000)" (y con los ids en el mensaje).
-- Ahora: primero usa el stock del contrato del frente (como siempre); solo si
-- ese no alcanza, reserva del stock de otro contrato del MISMO almacén que sí
-- cubra la cantidad completa. La reserva queda registrada con el contrato del
-- que salió el stock, y la entrega (fn_trg_salidas_set_contrato) descuenta de
-- ese mismo contrato. Los mensajes de error usan nombres, no ids.
--
-- Rollback manual: volver a crear ambas funciones con su versión anterior
-- (fn_crear_reserva solo con el stock del contrato del frente;
-- fn_trg_salidas_set_contrato: select contrato_id into new.contrato_id
-- from frentes where id = new.frente_id).

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
  v_contrato_propio uuid;
  v_contrato_reserva uuid;
  v_nombre_contrato_reserva text;
  v_disponible numeric(14,3);
  v_reserva_id uuid;
  v_descripcion text;
  v_almacen text;
  v_motivo text := 'Creación al aprobar vale';
begin
  if not (public.has_permission('vales.aprobar_rechazar')) then
    raise exception 'No tiene permiso para aprobar líneas de vale (vales.aprobar_rechazar)';
  end if;

  select vd.material_id, v.frente_id, f.contrato_id
    into v_material_id, v_frente_id, v_contrato_propio
  from vale_detalle vd
  join vales v on v.id = vd.vale_id
  join frentes f on f.id = v.frente_id
  where vd.id = p_vale_detalle_id;

  if v_material_id is null then
    raise exception 'Esta línea del vale ya no existe.';
  end if;

  select descripcion into v_descripcion from materiales where id = v_material_id;
  select nombre into v_almacen from almacenes where id = p_almacen_id;

  insert into stock (almacen_id, material_id, contrato_id)
  values (p_almacen_id, v_material_id, v_contrato_propio)
  on conflict (almacen_id, material_id, contrato_id) do nothing;

  select cantidad_disponible into v_disponible
  from stock
  where almacen_id = p_almacen_id and material_id = v_material_id and contrato_id = v_contrato_propio
  for update;

  v_contrato_reserva := v_contrato_propio;

  if p_cantidad > v_disponible then
    -- El contrato del frente no alcanza: se busca otro contrato del mismo
    -- almacén con stock suficiente para toda la cantidad.
    select s.contrato_id, c.nombre
      into v_contrato_reserva, v_nombre_contrato_reserva
    from stock s
    join contratos c on c.id = s.contrato_id
    where s.almacen_id = p_almacen_id
      and s.material_id = v_material_id
      and s.contrato_id <> v_contrato_propio
      and s.cantidad_disponible >= p_cantidad
    order by s.cantidad_disponible desc
    limit 1
    for update of s;

    if v_contrato_reserva is null then
      raise exception
        'No hay stock suficiente de % en el almacén %: se necesitan % y solo hay % disponibles (ni en este contrato ni en otro).',
        v_descripcion, v_almacen, trim_scale(p_cantidad), trim_scale(v_disponible);
    end if;

    v_motivo := v_motivo || ' (el stock salió del contrato ' || v_nombre_contrato_reserva || ')';
  end if;

  insert into reservas (vale_detalle_id, material_id, almacen_id, frente_id, contrato_id, cantidad, usuario_id)
  values (p_vale_detalle_id, v_material_id, p_almacen_id, v_frente_id, v_contrato_reserva, p_cantidad, p_usuario_id)
  returning id into v_reserva_id;

  update stock
    set cantidad_reservada = cantidad_reservada + p_cantidad
  where almacen_id = p_almacen_id and material_id = v_material_id and contrato_id = v_contrato_reserva;

  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (v_reserva_id, null, 'Activa', null, p_cantidad, v_motivo, p_usuario_id);

  update vale_detalle
    set estado = 'Reservado', cantidad_aprobada = coalesce(cantidad_aprobada, p_cantidad)
  where id = p_vale_detalle_id;

  return v_reserva_id;
end;
$$;

-- La entrega descuenta del contrato de la RESERVA (que puede ser distinto al
-- del frente cuando el stock salió de otro contrato). Sin reserva: contrato
-- del frente, como siempre.
create or replace function public.fn_trg_salidas_set_contrato()
returns trigger
language plpgsql
as $$
begin
  if new.reserva_id is not null then
    select contrato_id into new.contrato_id from reservas where id = new.reserva_id;
  end if;
  if new.contrato_id is null then
    select contrato_id into new.contrato_id from frentes where id = new.frente_id;
  end if;
  return new;
end;
$$;

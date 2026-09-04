-- Conecta ingresos/ajustes/salidas con stock.cantidad_fisica y con kardex.
-- Esta es la única vía por la que cantidad_fisica cambia — nunca por altas
-- o bajas de reservas (§1.1 y §1.4 del modelo de datos).

create or replace function public.fn_registrar_movimiento_stock(
  p_almacen_id uuid,
  p_material_id uuid,
  p_delta numeric,
  p_tipo_movimiento text,
  p_cantidad numeric,
  p_usuario_id uuid,
  p_referencia_tabla text,
  p_referencia_id uuid,
  p_vale_id uuid,
  p_observacion text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo_saldo numeric(14,3);
  v_existe boolean;
begin
  -- Bloquea la fila si ya existe. No se usa un INSERT ... ON CONFLICT
  -- genérico para el caso de delta negativo: si el material nunca tuvo un
  -- ingreso en este almacén, una salida/ajuste negativo debe fallar
  -- explícitamente en vez de "crear" silenciosamente una fila en cero.
  select true into v_existe
  from stock
  where almacen_id = p_almacen_id and material_id = p_material_id
  for update;

  if v_existe is null then
    if p_delta < 0 then
      raise exception
        'No hay stock físico registrado para el material % en el almacén % — no se puede aplicar un movimiento negativo',
        p_material_id, p_almacen_id;
    end if;
    insert into stock (almacen_id, material_id, cantidad_fisica)
    values (p_almacen_id, p_material_id, p_delta)
    returning cantidad_fisica into v_nuevo_saldo;
  else
    update stock
      set cantidad_fisica = cantidad_fisica + p_delta
    where almacen_id = p_almacen_id and material_id = p_material_id
    returning cantidad_fisica into v_nuevo_saldo;
  end if;

  -- Red de seguridad adicional: el check (cantidad_fisica >= 0) de la tabla
  -- ya lo impediría, pero se valida aquí también para dar un mensaje claro.
  if v_nuevo_saldo < 0 then
    raise exception
      'Movimiento inválido: dejaría stock físico negativo (almacén %, material %)',
      p_almacen_id, p_material_id;
  end if;

  insert into kardex (
    tipo_movimiento, material_id, almacen_id, cantidad, saldo_resultante,
    usuario_id, referencia_tabla, referencia_id, vale_id, observacion
  ) values (
    p_tipo_movimiento, p_material_id, p_almacen_id, p_cantidad, v_nuevo_saldo,
    p_usuario_id, p_referencia_tabla, p_referencia_id, p_vale_id, p_observacion
  );
end;
$$;

create or replace function public.fn_trg_ingreso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_registrar_movimiento_stock(
    new.almacen_id, new.material_id, new.cantidad, 'ingreso', new.cantidad,
    new.usuario_id, 'ingresos', new.id, null,
    coalesce(new.observacion, new.documento_referencia)
  );
  return new;
end;
$$;

create trigger trg_ingresos_movimiento
  after insert on ingresos
  for each row execute function public.fn_trg_ingreso();

create or replace function public.fn_trg_ajuste()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric(14,3);
  v_tipo text;
begin
  if new.tipo = 'positivo' then
    v_delta := new.cantidad;
    v_tipo := 'ajuste_positivo';
  else
    v_delta := -new.cantidad;
    v_tipo := 'ajuste_negativo';
  end if;

  perform public.fn_registrar_movimiento_stock(
    new.almacen_id, new.material_id, v_delta, v_tipo, new.cantidad,
    new.usuario_id, 'ajustes', new.id, null, new.motivo
  );
  return new;
end;
$$;

create trigger trg_ajustes_movimiento
  after insert on ajustes
  for each row execute function public.fn_trg_ajuste();

create or replace function public.fn_trg_salida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vale_id uuid;
begin
  if new.vale_detalle_id is not null then
    select vale_id into v_vale_id from vale_detalle where id = new.vale_detalle_id;
  end if;

  perform public.fn_registrar_movimiento_stock(
    new.almacen_id, new.material_id, -new.cantidad, 'salida', new.cantidad,
    new.usuario_id, 'salidas', new.id, v_vale_id,
    coalesce(new.observacion, new.documento_referencia)
  );

  -- Si la salida entrega una reserva (vale de por medio), avanza su
  -- progreso — esto es lo que permite entregas parciales múltiples contra
  -- la misma reserva hasta agotarla.
  if new.reserva_id is not null then
    perform public.fn_avanzar_reserva(new.reserva_id, new.cantidad, new.usuario_id);
  end if;

  return new;
end;
$$;

create trigger trg_salidas_movimiento
  after insert on salidas
  for each row execute function public.fn_trg_salida();

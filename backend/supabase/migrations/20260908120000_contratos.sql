-- Segrega el stock físico por contrato. La empresa opera bajo dos
-- contratos (Contrato Marco, con varios frentes, y Sala Eléctrica, con uno
-- solo); el material que llega al almacén de obra pertenece a uno u otro,
-- y un Supervisor solo debe ver el disponible de su propio contrato.
--
-- Los datos de prueba existentes son mínimos (1 frente, 2 filas de stock).
-- Por decisión explícita: el stock de prueba se descarta (arranca en cero
-- bajo el nuevo modelo); el resto de la data (frentes, ingresos, salidas,
-- reservas, kardex) se conserva y se retro-completa vía el frente único
-- existente, que queda asignado a Contrato Marco por defecto.

create table contratos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_contratos_updated_at
  before update on contratos
  for each row execute function public.set_updated_at();

insert into contratos (codigo, nombre) values
  ('MARCO', 'Contrato Marco'),
  ('SALA-ELEC', 'Sala Eléctrica');

-- ---------------------------------------------------------------------------
-- frentes: cada frente pertenece a exactamente un contrato.
-- ---------------------------------------------------------------------------
alter table frentes add column contrato_id uuid references contratos(id);
update frentes set contrato_id = (select id from contratos where codigo = 'MARCO') where contrato_id is null;
alter table frentes alter column contrato_id set not null;
create index idx_frentes_contrato on frentes(contrato_id);

-- ---------------------------------------------------------------------------
-- ingresos / ajustes: el contrato se elige explícitamente al registrar el
-- movimiento (es la fuente de verdad de a qué contrato entra/se corrige el
-- material — no se puede inferir de otra tabla).
-- ---------------------------------------------------------------------------
alter table ingresos add column contrato_id uuid references contratos(id);
update ingresos set contrato_id = (select id from contratos where codigo = 'MARCO') where contrato_id is null;
alter table ingresos alter column contrato_id set not null;

alter table ajustes add column contrato_id uuid references contratos(id);
alter table ajustes alter column contrato_id set not null;

-- ---------------------------------------------------------------------------
-- salidas / reservas: el contrato se deriva del frente que solicita (ya
-- referenciado en ambas tablas), nunca se elige a mano — así no puede haber
-- una salida cuyo contrato no coincida con el de su frente.
-- ---------------------------------------------------------------------------
alter table salidas add column contrato_id uuid references contratos(id);
update salidas s set contrato_id = f.contrato_id from frentes f where f.id = s.frente_id and s.contrato_id is null;
alter table salidas alter column contrato_id set not null;

alter table reservas add column contrato_id uuid references contratos(id);
update reservas r set contrato_id = f.contrato_id from frentes f where f.id = r.frente_id and r.contrato_id is null;
alter table reservas alter column contrato_id set not null;

-- ---------------------------------------------------------------------------
-- kardex: se completa desde la tabla de origen de cada movimiento, para
-- poder filtrar/reportar el libro también por contrato.
-- ---------------------------------------------------------------------------
alter table kardex add column contrato_id uuid references contratos(id);
update kardex k set contrato_id = (
  case k.referencia_tabla
    when 'ingresos' then (select contrato_id from ingresos where id = k.referencia_id)
    when 'ajustes' then (select contrato_id from ajustes where id = k.referencia_id)
    when 'salidas' then (select contrato_id from salidas where id = k.referencia_id)
  end
) where contrato_id is null;
alter table kardex alter column contrato_id set not null;
create index idx_kardex_contrato on kardex(contrato_id);

-- ---------------------------------------------------------------------------
-- stock: se descarta el stock de prueba (decisión explícita) y se
-- reconstruye la clave primaria para separar existencias por contrato.
-- ---------------------------------------------------------------------------
truncate table stock;
alter table stock add column contrato_id uuid references contratos(id) not null;
alter table stock drop constraint stock_pkey;
alter table stock add primary key (almacen_id, material_id, contrato_id);
create index idx_stock_contrato on stock(contrato_id);

-- ---------------------------------------------------------------------------
-- Helper de autorización: contrato del usuario autenticado (vía su frente).
-- ---------------------------------------------------------------------------
create or replace function public.current_contrato_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select f.contrato_id
  from usuarios u
  join frentes f on f.id = u.frente_id
  where u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- fn_registrar_movimiento_stock ahora recibe el contrato y lo usa para
-- ubicar/crear la fila de stock correcta.
-- ---------------------------------------------------------------------------
create or replace function public.fn_registrar_movimiento_stock(
  p_almacen_id uuid,
  p_material_id uuid,
  p_contrato_id uuid,
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
  select true into v_existe
  from stock
  where almacen_id = p_almacen_id and material_id = p_material_id and contrato_id = p_contrato_id
  for update;

  if v_existe is null then
    if p_delta < 0 then
      raise exception
        'No hay stock físico registrado para el material % en el almacén % para este contrato — no se puede aplicar un movimiento negativo',
        p_material_id, p_almacen_id;
    end if;
    insert into stock (almacen_id, material_id, contrato_id, cantidad_fisica)
    values (p_almacen_id, p_material_id, p_contrato_id, p_delta)
    returning cantidad_fisica into v_nuevo_saldo;
  else
    update stock
      set cantidad_fisica = cantidad_fisica + p_delta
    where almacen_id = p_almacen_id and material_id = p_material_id and contrato_id = p_contrato_id
    returning cantidad_fisica into v_nuevo_saldo;
  end if;

  if v_nuevo_saldo < 0 then
    raise exception
      'Movimiento inválido: dejaría stock físico negativo (almacén %, material %)',
      p_almacen_id, p_material_id;
  end if;

  insert into kardex (
    tipo_movimiento, material_id, almacen_id, contrato_id, cantidad, saldo_resultante,
    usuario_id, referencia_tabla, referencia_id, vale_id, observacion
  ) values (
    p_tipo_movimiento, p_material_id, p_almacen_id, p_contrato_id, p_cantidad, v_nuevo_saldo,
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
    new.almacen_id, new.material_id, new.contrato_id, new.cantidad, 'ingreso', new.cantidad,
    new.usuario_id, 'ingresos', new.id, null,
    coalesce(new.observacion, new.documento_referencia)
  );
  return new;
end;
$$;

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
    new.almacen_id, new.material_id, new.contrato_id, v_delta, v_tipo, new.cantidad,
    new.usuario_id, 'ajustes', new.id, null, new.motivo
  );
  return new;
end;
$$;

-- El contrato de una salida nunca lo elige el cliente: siempre se deriva
-- del frente que la origina, para que no pueda desalinearse.
create or replace function public.fn_trg_salidas_set_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select contrato_id into new.contrato_id from frentes where id = new.frente_id;
  return new;
end;
$$;

create trigger trg_salidas_set_contrato
  before insert on salidas
  for each row execute function public.fn_trg_salidas_set_contrato();

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
    new.almacen_id, new.material_id, new.contrato_id, -new.cantidad, 'salida', new.cantidad,
    new.usuario_id, 'salidas', new.id, v_vale_id,
    coalesce(new.observacion, new.documento_referencia)
  );

  if new.reserva_id is not null then
    perform public.fn_avanzar_reserva(new.reserva_id, new.cantidad, new.usuario_id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reservas: el contrato se deriva del frente del vale, igual que salidas.
-- ---------------------------------------------------------------------------
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
  v_contrato_id uuid;
  v_disponible numeric(14,3);
  v_reserva_id uuid;
begin
  if not (public.has_permission('vales.aprobar_rechazar')) then
    raise exception 'No tiene permiso para aprobar líneas de vale (vales.aprobar_rechazar)';
  end if;

  select vd.material_id, v.frente_id, f.contrato_id
    into v_material_id, v_frente_id, v_contrato_id
  from vale_detalle vd
  join vales v on v.id = vd.vale_id
  join frentes f on f.id = v.frente_id
  where vd.id = p_vale_detalle_id;

  if v_material_id is null then
    raise exception 'vale_detalle % no existe', p_vale_detalle_id;
  end if;

  insert into stock (almacen_id, material_id, contrato_id)
  values (p_almacen_id, v_material_id, v_contrato_id)
  on conflict (almacen_id, material_id, contrato_id) do nothing;

  select cantidad_disponible into v_disponible
  from stock
  where almacen_id = p_almacen_id and material_id = v_material_id and contrato_id = v_contrato_id
  for update;

  if p_cantidad > v_disponible then
    raise exception
      'Cantidad a reservar (%) excede el disponible (%) para el material % en el almacén %',
      p_cantidad, v_disponible, v_material_id, p_almacen_id;
  end if;

  insert into reservas (vale_detalle_id, material_id, almacen_id, frente_id, contrato_id, cantidad, usuario_id)
  values (p_vale_detalle_id, v_material_id, p_almacen_id, v_frente_id, v_contrato_id, p_cantidad, p_usuario_id)
  returning id into v_reserva_id;

  update stock
    set cantidad_reservada = cantidad_reservada + p_cantidad
  where almacen_id = p_almacen_id and material_id = v_material_id and contrato_id = v_contrato_id;

  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (v_reserva_id, null, 'Activa', null, p_cantidad, 'Creación al aprobar vale', p_usuario_id);

  update vale_detalle
    set estado = 'Reservado', cantidad_aprobada = coalesce(cantidad_aprobada, p_cantidad)
  where id = p_vale_detalle_id;

  return v_reserva_id;
end;
$$;

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

  update stock
    set cantidad_reservada = cantidad_reservada - p_cantidad_entregada
  where almacen_id = v_reserva.almacen_id and material_id = v_reserva.material_id and contrato_id = v_reserva.contrato_id;

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
  where almacen_id = v_reserva.almacen_id and material_id = v_reserva.material_id and contrato_id = v_reserva.contrato_id;

  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (p_reserva_id, v_reserva.estado, v_nuevo_estado, v_reserva.cantidad_entregada, v_reserva.cantidad_entregada, p_motivo, p_usuario_id);

  if p_cancelar then
    update vale_detalle set estado = 'Cancelado' where id = v_reserva.vale_detalle_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: contratos es data de referencia visible para cualquier usuario
-- autenticado (igual que roles/permisos); stock se restringe por contrato
-- para el rol Supervisor.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on contratos to authenticated;

alter table contratos enable row level security;
create policy contratos_select on contratos for select using (auth.role() = 'authenticated');

drop policy if exists stock_select on stock;
create policy stock_select on stock for select
  using (
    public.has_permission('stock.ver')
    and (not public.es_supervisor() or contrato_id = public.current_contrato_id())
  );

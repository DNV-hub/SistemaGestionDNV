-- Una línea de vale solo puede reservarse una vez.
--
-- Caso real: VR-0158 (cable BOA 6 mm, 150 ML) lo aprobaron dos personas con
-- 20 segundos de diferencia, cada una con el vale abierto en su pantalla, y
-- quedaron dos reservas activas (300 ML apartados en vez de 150).
--
-- Rollback manual: drop index uq_reservas_vigente_por_linea; restaurar
-- fn_crear_reserva sin el bloque "La línea ya se respondió".

-- 1. Cancelar la reserva repetida (la más nueva de cada línea) y devolver su
-- cantidad al stock disponible.
with repetidas as (
  select r.*
    from reservas r
   where r.estado in ('Activa', 'Parcial')
     and r.cantidad_entregada = 0
     and exists (
       select 1 from reservas o
        where o.vale_detalle_id = r.vale_detalle_id
          and o.estado in ('Activa', 'Parcial')
          and o.created_at < r.created_at
     )
), canceladas as (
  update reservas r set estado = 'Cancelada'
    from repetidas x
   where r.id = x.id
  returning r.id, x.almacen_id, x.material_id, x.contrato_id, x.cantidad
), stock_devuelto as (
  update stock s
     set cantidad_reservada = s.cantidad_reservada - c.cantidad
    from canceladas c
   where s.almacen_id = c.almacen_id and s.material_id = c.material_id and s.contrato_id = c.contrato_id
  returning s.material_id
)
insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
select c.id, 'Activa', 'Cancelada', 0, 0, 'Reserva duplicada: la línea se aprobó dos veces', null
  from canceladas c;

-- 2. La base ya no permite dos reservas vigentes para la misma línea.
create unique index if not exists uq_reservas_vigente_por_linea
  on reservas (vale_detalle_id)
  where estado in ('Activa', 'Parcial');

-- 3. Aprobar una línea que otra persona ya respondió da un aviso claro.
create or replace function public.fn_crear_reserva(p_vale_detalle_id uuid, p_almacen_id uuid, p_cantidad numeric, p_usuario_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
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
  v_estado_linea text;
  v_motivo text := 'Creación al aprobar vale';
begin
  if not (public.has_permission('vales.aprobar_rechazar')) then
    raise exception 'No tiene permiso para aprobar líneas de vale (vales.aprobar_rechazar)';
  end if;

  -- Se bloquea la línea: si dos personas aprueban a la vez, la segunda espera
  -- y luego ve que ya no está Pendiente.
  select vd.material_id, v.frente_id, f.contrato_id, vd.estado
    into v_material_id, v_frente_id, v_contrato_propio, v_estado_linea
  from vale_detalle vd
  join vales v on v.id = vd.vale_id
  join frentes f on f.id = v.frente_id
  where vd.id = p_vale_detalle_id
  for update of vd;

  if v_material_id is null then
    raise exception 'Esta línea del vale ya no existe.';
  end if;

  select descripcion into v_descripcion from materiales where id = v_material_id;

  if v_estado_linea <> 'Pendiente' then
    raise exception 'La línea "%" ya se respondió (está %): otra persona respondió este vale. Vuelve a abrirlo para ver cómo quedó.',
      v_descripcion, v_estado_linea;
  end if;

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

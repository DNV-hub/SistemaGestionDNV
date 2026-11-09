-- Vales: una sola forma de cerrar una línea que ya no se entrega, y el estado
-- del vale lo calcula siempre la base.
--
-- Problema que corrige: liberar una reserva desde la pestaña Reservas sin
-- haber entregado nada dejaba la línea en "Reservado" para siempre y el vale
-- nunca llegaba a "Atendido" (VR-0112 y VR-0125).
--
-- Rollback manual: drop trigger trg_vale_detalle_estado on vale_detalle;
-- drop function fn_trg_vale_detalle_estado, fn_vale_cerrar_linea,
-- fn_vale_historial; alter table vale_detalle drop column motivo_cierre,
-- cerrado_por, cerrado_en; y restaurar fn_actualizar_estado_vale y
-- fn_liberar_reserva de 20260909… (versiones anteriores).

-- 1. Por qué y quién cerró una línea.
alter table vale_detalle
  add column if not exists motivo_cierre text,
  add column if not exists cerrado_por uuid references usuarios(id),
  add column if not exists cerrado_en timestamptz;

-- 2. Estado del vale a partir de sus líneas. Solo actúa después de la
-- aprobación: Borrador/Enviado/En revision los resuelve quien responde, y
-- Cancelado/Cerrado/Rechazado ya son finales.
create or replace function public.fn_actualizar_estado_vale(p_vale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_estado text;
  v_total int;
  v_entregadas int;
  v_con_entrega int;
  v_canceladas int;
begin
  select estado into v_estado from vales where id = p_vale_id;
  if v_estado is null or v_estado not in ('Aprobado', 'Reservado', 'Parcialmente atendido', 'Atendido') then
    return;
  end if;

  select count(*) filter (where estado not in ('Cancelado', 'Rechazado')),
         count(*) filter (where estado = 'Entregado'),
         count(*) filter (where cantidad_entregada > 0),
         count(*) filter (where estado = 'Cancelado')
    into v_total, v_entregadas, v_con_entrega, v_canceladas
  from vale_detalle
  where vale_id = p_vale_id;

  if v_total = 0 then
    -- Todo se cerró sin entregar nada.
    update vales set estado = case when v_canceladas > 0 then 'Cancelado' else 'Rechazado' end
     where id = p_vale_id;
  elsif v_entregadas = v_total then
    update vales set estado = 'Atendido' where id = p_vale_id and estado <> 'Atendido';
  elsif v_con_entrega > 0 then
    update vales set estado = 'Parcialmente atendido' where id = p_vale_id and estado <> 'Parcialmente atendido';
  end if;
end;
$$;

-- 3. Cada vez que una línea cambia de estado, el vale se recalcula solo.
create or replace function public.fn_trg_vale_detalle_estado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.fn_actualizar_estado_vale(new.vale_id);
  return null;
end;
$$;

drop trigger if exists trg_vale_detalle_estado on vale_detalle;
create trigger trg_vale_detalle_estado
  after update of estado on vale_detalle
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.fn_trg_vale_detalle_estado();

-- 4. Liberar una reserva ya no deja la línea colgada: si no se entregó nada,
-- la línea queda Cancelada; si se entregó una parte, Entregada con lo
-- entregado. (p_cancelar se mantiene por compatibilidad: Cancelar vale.)
create or replace function public.fn_liberar_reserva(p_reserva_id uuid, p_motivo text, p_usuario_id uuid, p_cancelar boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
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

  update vale_detalle
     set estado = case when v_reserva.cantidad_entregada > 0 and not p_cancelar then 'Entregado' else 'Cancelado' end,
         cantidad_aprobada = case when v_reserva.cantidad_entregada > 0 and not p_cancelar then v_reserva.cantidad_entregada else cantidad_aprobada end,
         motivo_cierre = coalesce(nullif(btrim(p_motivo), ''), motivo_cierre),
         cerrado_por = coalesce(auth.uid(), p_usuario_id),
         cerrado_en = now()
   where id = v_reserva.vale_detalle_id
     and estado not in ('Entregado', 'Cancelado', 'Rechazado');
end;
$$;

-- 5. "No entregar" / "Cerrar con lo entregado": la única acción para soltar
-- material de un vale. Libera la reserva (si hay) y cierra la línea en un
-- solo paso, con motivo obligatorio.
create or replace function public.fn_vale_cerrar_linea(p_linea_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_linea vale_detalle%rowtype;
  v_reserva reservas%rowtype;
  v_saldo numeric(14,3);
  v_estado_reserva text;
begin
  if not (public.has_permission('vales.aprobar_rechazar') or public.has_permission('vales.cancelar')
          or public.has_permission('salidas.registrar_entrega')) then
    raise exception 'No tiene permiso para cerrar líneas de vale';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indica el motivo';
  end if;

  select * into v_linea from vale_detalle where id = p_linea_id for update;
  if v_linea.id is null then
    raise exception 'La línea no existe';
  end if;
  if v_linea.estado in ('Entregado', 'Cancelado', 'Rechazado') then
    raise exception 'Esta línea ya está cerrada (%)', v_linea.estado;
  end if;
  if v_linea.estado = 'Pendiente' then
    raise exception 'La línea todavía no se responde: recházala al responder el vale';
  end if;

  select * into v_reserva from reservas
   where vale_detalle_id = p_linea_id and estado in ('Activa', 'Parcial')
   order by created_at desc limit 1
   for update;

  if v_reserva.id is not null then
    v_saldo := v_reserva.cantidad - v_reserva.cantidad_entregada;
    v_estado_reserva := case when v_reserva.cantidad_entregada > 0 then 'Liberada' else 'Cancelada' end;
    update reservas set estado = v_estado_reserva where id = v_reserva.id;
    update stock
       set cantidad_reservada = cantidad_reservada - v_saldo
     where almacen_id = v_reserva.almacen_id and material_id = v_reserva.material_id and contrato_id = v_reserva.contrato_id;
    insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
    values (v_reserva.id, v_reserva.estado, v_estado_reserva, v_reserva.cantidad_entregada, v_reserva.cantidad_entregada, btrim(p_motivo), auth.uid());
  end if;

  update vale_detalle
     set estado = case when cantidad_entregada > 0 then 'Entregado' else 'Cancelado' end,
         cantidad_aprobada = case when cantidad_entregada > 0 then cantidad_entregada else cantidad_aprobada end,
         motivo_cierre = btrim(p_motivo),
         cerrado_por = auth.uid(),
         cerrado_en = now()
   where id = p_linea_id;
end;
$$;
grant execute on function public.fn_vale_cerrar_linea(uuid, text) to authenticated;

-- 6. Historial del vale: quién aprobó, reservó, entregó o cerró cada línea.
create index if not exists idx_auditoria_tabla_registro on auditoria (tabla, registro_id);

create or replace function public.fn_vale_historial(p_vale_id uuid)
returns table (fecha_hora timestamptz, usuario text, evento text, detalle text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (public.has_permission('vales.ver_todos')
          or exists (select 1 from vales where id = p_vale_id and supervisor_id = auth.uid())) then
    raise exception 'No tiene permiso para ver este vale';
  end if;

  return query
  with lineas as (
    select d.id, d.cerrado_en, m.descripcion, m.unidad
      from vale_detalle d join materiales m on m.id = d.material_id
     where d.vale_id = p_vale_id
  ), eventos as (
    -- Vale: creación y cambios de estado.
    select a.fecha_hora, a.usuario_id,
           case when a.accion = 'INSERT' then 'Vale creado' else 'Vale: ' || (a.valor_nuevo->>'estado') end as evento,
           null::text as detalle
      from auditoria a
     where a.tabla = 'vales' and a.registro_id = p_vale_id
       and (a.accion = 'INSERT' or a.valor_anterior->>'estado' is distinct from a.valor_nuevo->>'estado')
    union all
    -- Líneas: aprobación, rechazo y cierre (las entregas salen de salidas).
    select a.fecha_hora, a.usuario_id,
           l.descripcion || ': ' || case a.valor_nuevo->>'estado'
             when 'Reservado' then 'aprobado y reservado'
             when 'Aprobado' then 'aprobado (sin stock)'
             when 'Rechazado' then 'rechazado'
             when 'Cancelado' then 'cancelado'
             when 'Entregado' then 'cerrado con lo entregado'
             else lower(a.valor_nuevo->>'estado') end,
           case
             when a.valor_nuevo->>'estado' in ('Reservado', 'Aprobado')
               then 'Cantidad: ' || trim(trailing '.' from trim(trailing '0' from (a.valor_nuevo->>'cantidad_aprobada'))) || ' ' || l.unidad
             else a.valor_nuevo->>'motivo_cierre'
           end
      from auditoria a join lineas l on l.id = a.registro_id
     where a.tabla = 'vale_detalle' and a.accion = 'UPDATE'
       and a.valor_anterior->>'estado' is distinct from a.valor_nuevo->>'estado'
       and (a.valor_nuevo->>'estado' not in ('Parcialmente entregado', 'Entregado') or a.valor_nuevo->>'motivo_cierre' is not null)
    union all
    -- Entregas.
    select s.created_at, s.usuario_id, l.descripcion || ': entrega',
           trim(trailing '.' from trim(trailing '0' from s.cantidad::text)) || ' ' || l.unidad
             || coalesce(' · ' || s.documento_referencia, '')
      from salidas s join lineas l on l.id = s.vale_detalle_id
    union all
    -- Liberaciones anteriores a este cambio (las nuevas ya salen arriba con su motivo).
    select h.fecha_hora, h.usuario_id, l.descripcion || ': reserva ' || lower(h.estado_nuevo), h.motivo
      from reservas_historial h
      join reservas r on r.id = h.reserva_id
      join lineas l on l.id = r.vale_detalle_id
     where h.estado_nuevo in ('Liberada', 'Cancelada') and l.cerrado_en is null
  )
  select e.fecha_hora, coalesce(u.nombre, 'Sistema'), e.evento, e.detalle
    from eventos e left join usuarios u on u.id = e.usuario_id
   order by e.fecha_hora;
end;
$$;
grant execute on function public.fn_vale_historial(uuid) to authenticated;

-- 7. Corregir las líneas que quedaron colgadas (reserva ya liberada, línea
-- todavía abierta). El trigger recalcula el estado de cada vale.
update vale_detalle d
   set estado = case when d.cantidad_entregada > 0 then 'Entregado' else 'Cancelado' end,
       cantidad_aprobada = case when d.cantidad_entregada > 0 then d.cantidad_entregada else d.cantidad_aprobada end,
       motivo_cierre = coalesce(
         (select h.motivo from reservas_historial h join reservas r on r.id = h.reserva_id
           where r.vale_detalle_id = d.id and h.estado_nuevo in ('Liberada', 'Cancelada')
           order by h.fecha_hora desc limit 1),
         'Reserva liberada'),
       cerrado_en = (select max(r.updated_at) from reservas r where r.vale_detalle_id = d.id)
 where d.estado in ('Aprobado', 'Reservado', 'Parcialmente entregado')
   and exists (select 1 from reservas r where r.vale_detalle_id = d.id and r.estado in ('Liberada', 'Cancelada'))
   and not exists (select 1 from reservas r where r.vale_detalle_id = d.id and r.estado in ('Activa', 'Parcial'));

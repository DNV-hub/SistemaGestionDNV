-- Pedido de Almacén: VD-0083 y VD-0086 se marcaron como Recibidas y debían
-- rechazarse. Hasta hoy, una devolución Recibida quedaba fija: rechazar solo
-- era posible desde "Solicitada", y la recepción ya había sumado stock (y, en
-- materiales con conversión, un lote en `ingresos`), así que no había forma
-- de deshacerla sin tocar la base a mano.
--
-- fn_anular_recepcion_devolucion pasa una devolución Recibida a Rechazada
-- deshaciendo lo que la recepción metió:
--   · resta del stock la parte reutilizable (movimiento 'ajuste_negativo' en
--     el kardex, referenciando la devolución — el historial queda completo);
--   · cierra a 0 el/los lote(s) que generó (documento 'Devolución VD-xxxx' o
--     'Reevaluación VD-xxxx'), para que no sigan ofreciéndose en "De qué lote
--     sale";
--   · deja la devolución como Rechazada con el motivo y sin evaluación.
--
-- Protecciones: solo si ese material todavía está sin usar — si parte del lote
-- ya se entregó, o el disponible (físico menos reservado) no alcanza, se
-- rechaza la operación con un mensaje claro en vez de dejar stock negativo o
-- reservas sin respaldo. Mismo permiso que recibir/rechazar.
--
-- Reversible: drop function public.fn_anular_recepcion_devolucion(uuid, text, uuid);
-- (los movimientos ya hechos se corrigen con un ajuste positivo / reevaluación).
create or replace function public.fn_anular_recepcion_devolucion(
  p_devolucion_id uuid,
  p_motivo text,
  p_usuario_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev devoluciones%rowtype;
  v_disponible numeric(14,3);
  v_lote record;
begin
  if not public.has_permission('devoluciones.recibir_rechazar') then
    raise exception 'No tiene permiso para rechazar devoluciones (devoluciones.recibir_rechazar)';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indica el motivo del rechazo';
  end if;

  select * into v_dev from devoluciones where id = p_devolucion_id for update;
  if v_dev.id is null then
    raise exception 'devolución % no existe', p_devolucion_id;
  end if;
  if v_dev.estado <> 'Recibida' then
    raise exception 'La devolución % está en estado %, solo se puede anular la recepción de una devolución Recibida', coalesce(v_dev.numero, v_dev.id::text), v_dev.estado;
  end if;

  if coalesce(v_dev.cantidad_reutilizable, 0) > 0 then
    -- Lotes que generó la recepción (o una reevaluación posterior): ninguno puede haberse usado.
    for v_lote in
      select id, cantidad, cantidad_restante
      from ingresos
      where material_id = v_dev.material_id
        and documento_referencia in ('Devolución ' || v_dev.numero, 'Reevaluación ' || v_dev.numero)
      for update
    loop
      if v_lote.cantidad_restante is distinct from v_lote.cantidad then
        raise exception 'No se puede anular: parte del lote de esta devolución ya se entregó (quedan % de %).', v_lote.cantidad_restante, v_lote.cantidad;
      end if;
    end loop;

    select cantidad_disponible into v_disponible
    from stock
    where almacen_id = v_dev.almacen_id and material_id = v_dev.material_id and contrato_id = v_dev.contrato_id;
    if coalesce(v_disponible, 0) < v_dev.cantidad_reutilizable then
      raise exception 'No se puede anular: solo hay % disponibles de este material y la recepción sumó %. Libera o ajusta primero lo reservado.', coalesce(v_disponible, 0), v_dev.cantidad_reutilizable;
    end if;

    update ingresos set cantidad_restante = 0
    where material_id = v_dev.material_id
      and documento_referencia in ('Devolución ' || v_dev.numero, 'Reevaluación ' || v_dev.numero);

    perform public.fn_registrar_movimiento_stock(
      v_dev.almacen_id, v_dev.material_id, v_dev.contrato_id, -v_dev.cantidad_reutilizable, 'ajuste_negativo', v_dev.cantidad_reutilizable,
      p_usuario_id, 'devoluciones', v_dev.id, null,
      'Recepción anulada de ' || coalesce(v_dev.numero, v_dev.id::text) || ': ' || btrim(p_motivo)
    );
  end if;

  update devoluciones
    set estado = 'Rechazada', motivo_rechazo = btrim(p_motivo), recibida_por = p_usuario_id, recibida_at = now(),
        cantidad_reutilizable = null, cantidad_baja = null
  where id = p_devolucion_id;
end;
$$;
grant execute on function public.fn_anular_recepcion_devolucion(uuid, text, uuid) to authenticated;

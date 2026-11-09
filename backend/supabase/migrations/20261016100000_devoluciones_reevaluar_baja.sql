-- Pedido de Almacén: hoy, una vez que una devolución queda "Recibida", la
-- evaluación (cuánto vuelve a stock vs. cuánto se da de baja) queda fija
-- para siempre — si Almacén se equivocó y dio de baja algo que en realidad
-- sí servía (ej. VD-0067: un rollo de malla cortado se registró con la
-- medida completa en vez de la medida real que volvió), no había forma de
-- corregirlo sin que alguien tocara la base a mano.
--
-- fn_reevaluar_devolucion mueve cantidad de "baja" a "reutilizable" sobre
-- una devolución que ya fue recibida — mismo criterio de
-- fn_recibir_devolucion/20260916100000 para generar el lote (ancho/largo
-- si el material necesita conversión), pero sin volver a tocar lo que ya
-- entró a stock la primera vez. Solo admite esa dirección (baja →
-- reutilizable): es el caso real que motivó el pedido; si algo se marcó
-- reutilizable por error, ya existe "Corregir con un ajuste" sobre el lote
-- que generó.
--
-- Reversible: drop function public.fn_reevaluar_devolucion(uuid, numeric, uuid, numeric, numeric, text);
create or replace function public.fn_reevaluar_devolucion(
  p_devolucion_id uuid,
  p_cantidad_a_recuperar numeric,
  p_usuario_id uuid,
  p_ancho numeric default null,
  p_largo numeric default null,
  p_motivo text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev devoluciones%rowtype;
  v_tipo_conversion text;
begin
  if not public.has_permission('devoluciones.recibir_rechazar') then
    raise exception 'No tiene permiso para reevaluar devoluciones (devoluciones.recibir_rechazar)';
  end if;

  select * into v_dev from devoluciones where id = p_devolucion_id for update;
  if v_dev.id is null then
    raise exception 'devolución % no existe', p_devolucion_id;
  end if;
  if v_dev.estado <> 'Recibida' then
    raise exception 'La devolución % está en estado %, solo se puede reevaluar una devolución Recibida', p_devolucion_id, v_dev.estado;
  end if;
  if p_cantidad_a_recuperar is null or p_cantidad_a_recuperar <= 0 then
    raise exception 'La cantidad a recuperar tiene que ser mayor a 0';
  end if;
  if p_cantidad_a_recuperar > coalesce(v_dev.cantidad_baja, 0) then
    raise exception 'La cantidad a recuperar (%) excede lo que sigue dado de baja (%)', p_cantidad_a_recuperar, v_dev.cantidad_baja;
  end if;

  select tipo_conversion into v_tipo_conversion from materiales where id = v_dev.material_id;

  if v_tipo_conversion is not null and v_tipo_conversion <> 'ninguna' then
    if p_largo is null or (v_tipo_conversion = 'area' and p_ancho is null) then
      raise exception 'Este material necesita indicar la medida (ancho×largo) de lo que vuelve a stock, para generar su lote.';
    end if;
    insert into ingresos (almacen_id, material_id, contrato_id, cantidad, documento_referencia, usuario_id, observacion, ancho, largo)
    values (
      v_dev.almacen_id, v_dev.material_id, v_dev.contrato_id, p_cantidad_a_recuperar,
      'Reevaluación ' || coalesce(v_dev.numero, v_dev.id::text), p_usuario_id,
      coalesce(p_motivo, 'Reevaluación de devolución — parte recuperada de baja'), p_ancho, p_largo
    );
  else
    perform public.fn_registrar_movimiento_stock(
      v_dev.almacen_id, v_dev.material_id, v_dev.contrato_id, p_cantidad_a_recuperar, 'ingreso', p_cantidad_a_recuperar,
      p_usuario_id, 'devoluciones', v_dev.id, null,
      coalesce(p_motivo, 'Reevaluación de devolución — parte recuperada de baja')
    );
  end if;

  update devoluciones
    set cantidad_reutilizable = cantidad_reutilizable + p_cantidad_a_recuperar,
        cantidad_baja = cantidad_baja - p_cantidad_a_recuperar
  where id = p_devolucion_id;
end;
$$;
grant execute on function public.fn_reevaluar_devolucion(uuid, numeric, uuid, numeric, numeric, text) to authenticated;

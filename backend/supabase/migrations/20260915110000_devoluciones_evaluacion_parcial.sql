-- Hasta ahora, "recibir" una devolución era todo o nada: si el supervisor la
-- declaró 'bueno' al solicitarla, el 100% de la cantidad volvía a stock; si
-- 'danado', nada volvía. El usuario pidió que Almacén pueda EVALUAR de
-- verdad al recibir físicamente — ej. de 71 cáncamos devueltos, decidir
-- cuántos sí sirven (vuelven a stock) y cuántos no (se dan de baja) — sin
-- depender de lo que el supervisor haya marcado al pedir la devolución
-- (esa declaración es solo su primera impresión, no un peritaje).
--
-- estado_material se queda tal cual: sigue siendo lo que el supervisor
-- reportó al crear la devolución. Lo nuevo es la evaluación real de
-- Almacén, guardada en cantidad_reutilizable/cantidad_baja recién al
-- recibir — información distinta, con dueños distintos.
alter table devoluciones add column cantidad_reutilizable numeric(14,3);
alter table devoluciones add column cantidad_baja numeric(14,3);
alter table devoluciones add constraint chk_devoluciones_evaluacion_completa
  check (
    (cantidad_reutilizable is null and cantidad_baja is null)
    or (cantidad_reutilizable >= 0 and cantidad_baja >= 0 and cantidad_reutilizable + cantidad_baja = cantidad)
  );

create or replace function public.fn_recibir_devolucion(
  p_devolucion_id uuid,
  p_almacen_id uuid,
  p_usuario_id uuid,
  p_cantidad_reutilizable numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev devoluciones%rowtype;
  v_cantidad_baja numeric(14,3);
begin
  if not public.has_permission('devoluciones.recibir_rechazar') then
    raise exception 'No tiene permiso para recibir devoluciones (devoluciones.recibir_rechazar)';
  end if;

  select * into v_dev from devoluciones where id = p_devolucion_id for update;
  if v_dev.id is null then
    raise exception 'devolución % no existe', p_devolucion_id;
  end if;
  if v_dev.estado <> 'Solicitada' then
    raise exception 'La devolución % ya está en estado %, no se puede recibir de nuevo', p_devolucion_id, v_dev.estado;
  end if;
  if p_cantidad_reutilizable is null or p_cantidad_reutilizable < 0 or p_cantidad_reutilizable > v_dev.cantidad then
    raise exception 'La cantidad reutilizable (%) tiene que estar entre 0 y la cantidad devuelta (%)', p_cantidad_reutilizable, v_dev.cantidad;
  end if;

  v_cantidad_baja := v_dev.cantidad - p_cantidad_reutilizable;

  if p_cantidad_reutilizable > 0 then
    perform public.fn_registrar_movimiento_stock(
      p_almacen_id, v_dev.material_id, v_dev.contrato_id, p_cantidad_reutilizable, 'ingreso', p_cantidad_reutilizable,
      p_usuario_id, 'devoluciones', v_dev.id, null,
      coalesce(v_dev.observacion, 'Devolución evaluada — parte reutilizable')
    );
  end if;

  update devoluciones
    set estado = 'Recibida', almacen_id = p_almacen_id, recibida_por = p_usuario_id, recibida_at = now(),
        cantidad_reutilizable = p_cantidad_reutilizable, cantidad_baja = v_cantidad_baja
  where id = p_devolucion_id;
end;
$$;

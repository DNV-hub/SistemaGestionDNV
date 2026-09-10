-- Poner cantidad_fisica en 0 dejaba la fila de `stock` (almacén+material)
-- viva, mostrándose como "0" en vez de desaparecer. El usuario pidió que
-- directamente no quede nada — las filas se vuelven a crear solas
-- (fn_registrar_movimiento_stock hace insert-si-no-existe) en cuanto entre
-- un ingreso nuevo, así que borrarlas del todo es seguro y no rompe nada.
create or replace function public.fn_reiniciar_ingresos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingresos int;
  v_kardex int;
  v_stock int;
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para esta operación (sistema.borrar_pruebas)';
  end if;

  if exists (select 1 from salidas) then
    raise exception 'Ya hay entregas (salidas) registradas — no se puede reiniciar ingresos sin dejarlas huérfanas.';
  end if;

  if exists (select 1 from stock where cantidad_reservada > 0) then
    raise exception 'Hay stock reservado (vales aprobados sin entregar) — liberá o cancelá esas reservas antes de reiniciar.';
  end if;

  delete from kardex where referencia_tabla = 'ingresos';
  get diagnostics v_kardex = row_count;

  delete from ingresos where true;
  get diagnostics v_ingresos = row_count;

  delete from stock where true;
  get diagnostics v_stock = row_count;

  return jsonb_build_object('ingresos_borrados', v_ingresos, 'kardex_borrado', v_kardex, 'stock_borrado', v_stock);
end;
$$;

-- El usuario cargó mal los ingresos iniciales y quiere borrarlos TODOS
-- para reingresar en masa con la plantilla nueva. Confirmó que todavía no
-- hay ninguna entrega (salidas) registrada — por eso esto se niega si
-- encuentra alguna: una salida ya es historial físico real (afectó kardex
-- de verdad), y borrar el ingreso que la originó la dejaría huérfana.
--
-- También se niega si hay stock reservado (`cantidad_reservada > 0`, de
-- vales ya aprobados pero no entregados): poner cantidad_fisica en 0 con
-- algo reservado encima violaría chk_stock_reservada_no_excede_fisica, y
-- conceptualmente no tiene sentido — antes hay que cancelar esas reservas.
--
-- Alcance: solo `ingresos`, su kardex, y el stock físico (vuelve a 0, se
-- recalcula solo con los ingresos nuevos). No toca `ajustes` — el usuario
-- pidió reiniciar ingresos, no ajustes.
create or replace function public.fn_reiniciar_ingresos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingresos int;
  v_kardex int;
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

  delete from ingresos;
  get diagnostics v_ingresos = row_count;

  update stock set cantidad_fisica = 0 where cantidad_fisica > 0;

  return jsonb_build_object('ingresos_borrados', v_ingresos, 'kardex_borrado', v_kardex);
end;
$$;

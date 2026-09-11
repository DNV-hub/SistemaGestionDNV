-- Mismo espíritu que fn_reiniciar_ingresos: herramienta de Developer para
-- limpiar datos de prueba y volver a empezar. kardex.referencia_id no tiene
-- FK (es polimórfico, igual que con ingresos) así que borrar devoluciones
-- no puede dejar nada huérfano con restricción — si alguna ya fue recibida
-- y movió stock, conviene reiniciar ingresos primero (deja todo en 0) para
-- no perder ese movimiento de kardex sin haber limpiado el stock que generó.
create or replace function public.fn_reiniciar_devoluciones()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devoluciones int;
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para esta operación (sistema.borrar_pruebas)';
  end if;

  delete from devoluciones where true;
  get diagnostics v_devoluciones = row_count;

  return jsonb_build_object('devoluciones_borradas', v_devoluciones);
end;
$$;

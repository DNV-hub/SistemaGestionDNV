-- Supabase carga pg-safeupdate en la conexión de la API, que rechaza
-- UPDATE/DELETE sin WHERE aunque la intención sea borrar todas las filas
-- (mismo motivo por el que el editor SQL de Supabase avisa "no WHERE
-- clause"). `delete from ingresos;` no tenía — se agrega `where true`,
-- que sigue borrando todo pero ya trae la cláusula que pide la protección.
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

  delete from ingresos where true;
  get diagnostics v_ingresos = row_count;

  update stock set cantidad_fisica = 0 where cantidad_fisica > 0;

  return jsonb_build_object('ingresos_borrados', v_ingresos, 'kardex_borrado', v_kardex);
end;
$$;

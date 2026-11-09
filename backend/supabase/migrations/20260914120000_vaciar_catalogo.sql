-- Herramienta de Developer para cuando hay que resubir el catálogo entero
-- desde cero por Excel. Un DELETE masivo (`delete from materiales`) no sirve:
-- si UNA sola fila tiene stock/vales/kardex, Postgres aborta la sentencia
-- COMPLETA por la llave foránea y no borra nada. Por eso se recorre
-- material por material: el que no tiene ningún movimiento se borra de
-- verdad, y el que sí tiene historial (la mayoría hoy: stock, ingresos,
-- vale_detalle, reservas, metrados_procura) se desactiva en su lugar, sin
-- perder ese historial real. Mismo permiso que el resto de herramientas de
-- reinicio de Developer (fn_reiniciar_ingresos / fn_reiniciar_devoluciones).
create or replace function public.fn_vaciar_catalogo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material record;
  v_eliminados int := 0;
  v_desactivados int := 0;
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para esta operación (sistema.borrar_pruebas)';
  end if;

  for v_material in select id from materiales where estado = 'activo' loop
    begin
      delete from materiales where id = v_material.id;
      v_eliminados := v_eliminados + 1;
    exception when foreign_key_violation then
      update materiales set estado = 'inactivo' where id = v_material.id;
      v_desactivados := v_desactivados + 1;
    end;
  end loop;

  return jsonb_build_object('eliminados', v_eliminados, 'desactivados', v_desactivados);
end;
$$;

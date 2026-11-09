-- fn_vaciar_catalogo (20260914120000) desactivaba cualquier material con
-- historial en vez de borrarlo. El usuario ya vació a mano stock/ingresos/
-- salidas/ajustes/kardex/vale_detalle/reservas/devoluciones (con "Reiniciar
-- ingresos" y "Borrar vales de prueba") para volver a subir un catálogo
-- corregido sin que cruce con el anterior — lo único que seguía bloqueando
-- el borrado real eran metrados_procura y alertas, que sí quedaban vivos.
-- Ahora se borran también esos dos antes de intentar el DELETE del
-- material, así el catálogo queda realmente vacío (0 filas), no solo
-- "inactivo". El fallback a desactivar sigue como red de seguridad por si
-- en el futuro queda algo más enganchado (stock/kardex nuevos, etc.).
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

  -- Sin filtrar por estado: un material ya "inactivo" (desactivado en una
  -- pasada anterior porque en ese momento todavía tenía historial) es
  -- justamente el que más conviene reintentar ahora que ese historial ya
  -- se vació — si no, se quedaría inactivo para siempre en vez de
  -- desaparecer del todo.
  for v_material in select id from materiales loop
    delete from metrados_procura where material_id = v_material.id;
    delete from alertas where material_id = v_material.id;

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

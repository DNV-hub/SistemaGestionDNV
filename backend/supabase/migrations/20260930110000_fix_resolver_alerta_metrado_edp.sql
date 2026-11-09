-- Se me pasó este trigger en la migración anterior (20260930100000): resuelve
-- la alerta "material_no_previsto" cuando se carga un metrado para ese
-- frente+material — pero esa alerta ahora se guarda por grupo EDP
-- (descripcion_edp_id), no por material_id, así que había que actualizarlo
-- junto con todo lo demás. Error real que tiró en producción al importar:
-- record "new" has no field "material_id" (la columna ya no existe en
-- metrados_procura desde la migración anterior).
create or replace function public.fn_resolver_alerta_material_previsto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update alertas
    set estado = 'resuelta', resuelta_at = now()
  where tipo = 'material_no_previsto'
    and estado = 'activa'
    and frente_id = new.frente_id
    and descripcion_edp_id = new.descripcion_edp_id;
  return new;
end;
$$;

-- Mismo problema en la herramienta de Developer "Vaciar catálogo": borraba
-- de metrados_procura por material_id antes de borrar el material. Ya no
-- hace falta ese paso — metrados_procura no referencia materiales.id para
-- nada (referencia nombres_edp.id, que sobrevive aunque se borre un material
-- puntual, porque el grupo EDP puede cubrir otros materiales todavía vivos).
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

  for v_material in select id from materiales loop
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

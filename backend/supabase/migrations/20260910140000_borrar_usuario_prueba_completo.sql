-- fn_desvincular_supervisor_prueba solo rompía el vínculo con el catálogo
-- de supervisores — no alcanzaba para las cuentas de prueba que además
-- llenaron vales o reportes del RDC de verdad (ambas tablas referencian
-- usuarios(id) sin cascada, igual que el resto del historial), que es
-- justo lo que el usuario venía probando con estas cuentas. El botón
-- "Eliminar" seguía cayendo a "desactivar" sin decir por qué.
--
-- Esta función encadena, en orden, todo lo que Developer ya puede borrar
-- por separado: sus vales (fn_borrar_vale_prueba — se saltea, sin abortar
-- el resto, cualquiera que ya tuvo una entrega física real), los reportes
-- del RDC que llenó o que están a nombre de su fila de supervisor
-- (fn_borrar_reporte_rdc_prueba), y por último el vínculo de catálogo
-- (fn_desvincular_supervisor_prueba). Lo que no se pudo borrar (entregas
-- reales) queda igual que estaba, y por eso el borrado final de la cuenta
-- puede seguir cayendo a "desactivar" — correctamente, esa cuenta ya no es
-- puro dato de prueba.
create or replace function public.fn_borrar_usuario_prueba(p_usuario_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vale record;
  v_reporte record;
  v_omitidos int := 0;
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para esta operación (sistema.borrar_pruebas)';
  end if;

  for v_vale in
    select id from vales where creado_por = p_usuario_id or supervisor_id = p_usuario_id
  loop
    begin
      perform public.fn_borrar_vale_prueba(v_vale.id);
    exception when others then
      v_omitidos := v_omitidos + 1;
    end;
  end loop;

  for v_reporte in
    select id from rdc_reportes where creado_por = p_usuario_id
  loop
    perform public.fn_borrar_reporte_rdc_prueba(v_reporte.id);
  end loop;

  for v_reporte in
    select r.id from rdc_reportes r
    join rdc_supervisores s on s.id = r.supervisor_id
    where s.usuario_id = p_usuario_id
  loop
    perform public.fn_borrar_reporte_rdc_prueba(v_reporte.id);
  end loop;

  perform public.fn_desvincular_supervisor_prueba(p_usuario_id);

  return jsonb_build_object('vales_omitidos', v_omitidos);
end;
$$;

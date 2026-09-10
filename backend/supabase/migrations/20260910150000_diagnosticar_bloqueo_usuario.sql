-- Después de fn_borrar_usuario_prueba seguía sin poder borrarse una cuenta
-- de prueba, y el mensaje ("ya generó movimientos") no decía en cuál de
-- las muchas tablas que referencian usuarios(id) sin cascada estaba el
-- bloqueo real — había que ir a adivinar. Esta función solo LEE (no borra
-- nada) y cuenta, tabla por tabla, cuántas filas quedan atadas a esa
-- cuenta, separando lo que Developer ya puede limpiar de lo que nunca
-- debería poder borrar (auditoría, kardex, ingresos/ajustes/salidas de
-- Almacén, devoluciones recibidas, procura) porque son registro real,
-- aunque la cuenta se haya creado solo para probar.
create or replace function public.fn_diagnosticar_bloqueo_usuario(p_usuario_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para esta operación (sistema.borrar_pruebas)';
  end if;

  return jsonb_build_object(
    'vales', (select count(*) from vales where creado_por = p_usuario_id or supervisor_id = p_usuario_id),
    'rdc_reportes', (
      select count(*) from rdc_reportes r
      left join rdc_supervisores s on s.id = r.supervisor_id
      where r.creado_por = p_usuario_id or s.usuario_id = p_usuario_id
    ),
    'rdc_supervisores_vinculado', exists (select 1 from rdc_supervisores where usuario_id = p_usuario_id),
    'auditoria', (select count(*) from auditoria where usuario_id = p_usuario_id),
    'reservas', (select count(*) from reservas where usuario_id = p_usuario_id),
    'ingresos', (select count(*) from ingresos where usuario_id = p_usuario_id),
    'ajustes', (select count(*) from ajustes where usuario_id = p_usuario_id),
    'salidas', (select count(*) from salidas where usuario_id = p_usuario_id),
    'kardex', (select count(*) from kardex where usuario_id = p_usuario_id),
    'metrados_procura', (select count(*) from metrados_procura where responsable_id = p_usuario_id),
    'alertas_resueltas', (select count(*) from alertas where resuelta_por = p_usuario_id),
    'devoluciones', (
      select count(*) from devoluciones where supervisor_id = p_usuario_id or recibida_por = p_usuario_id
    ),
    'configuracion', (select count(*) from configuracion where actualizado_por = p_usuario_id)
  );
end;
$$;

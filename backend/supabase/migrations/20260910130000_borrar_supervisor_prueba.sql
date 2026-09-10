-- Por qué "Eliminar" en Usuarios no hacía nada visible para un supervisor
-- de prueba: rdc_supervisores.usuario_id referencia a usuarios(id) SIN
-- cascada (a propósito, igual que vales/kardex/etc. — ver comentario en la
-- Edge Function eliminar-usuario). Borrar el auth.user falla por esa
-- referencia, así que eliminar-usuario cae a su plan B (desactivar) y
-- devuelve eliminado:false — la fila se queda ahí, ahora "inactivo", con
-- un mensaje que habla de "movimientos" cuando el bloqueo real es el
-- vínculo con el catálogo de supervisores del RDC, no historial de verdad.
--
-- Esta función rompe ESE vínculo puntual para que el segundo intento de
-- eliminar-usuario (desde el frontend, con permiso sistema.borrar_pruebas)
-- ya no choque contra él. Si el supervisor de prueba ya generó reportes
-- reales, se niega — igual que fn_borrar_vale_prueba con las entregas
-- físicas — porque en ese caso ya no es una prueba, es historial.
create or replace function public.fn_desvincular_supervisor_prueba(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para esta operación (sistema.borrar_pruebas)';
  end if;

  select id into v_supervisor_id from rdc_supervisores where usuario_id = p_usuario_id;
  if v_supervisor_id is null then
    return; -- no estaba vinculado a ningún supervisor del RDC, nada que hacer
  end if;

  if exists (select 1 from rdc_reportes where supervisor_id = v_supervisor_id) then
    raise exception
      'Este supervisor ya tiene reportes del RDC guardados — no es una prueba. Borra esos reportes primero desde Developer si igual querés eliminarlo.';
  end if;

  delete from rdc_supervisores where id = v_supervisor_id;
end;
$$;

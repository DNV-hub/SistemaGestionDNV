-- Aviso al supervisor cuando su vale tiene una novedad (fue aprobado,
-- rechazado, atendido total o parcialmente) sin que él lo haya visto
-- todavía. Hoy el único aviso que existe es el badge de "vales.ver_propios"
-- en el sidebar, y ese cuenta vales Enviado/En revision — es decir, "cuántos
-- de los míos siguen esperando una decisión", no "cuáles ya tuvieron una
-- decisión que todavía no miré". Son dos preguntas distintas.
--
-- POR QUÉ UNA COLUMNA + FUNCIÓN Y NO UN UPDATE DIRECTO DESDE EL FRONTEND:
-- la política vales_update (20260822101400) solo deja al supervisor editar
-- su propio vale mientras sigue en 'Borrador' — una vez enviado, ya no
-- puede hacer UPDATE sobre la fila por RLS, así que "marcar como visto" no
-- puede ser un UPDATE normal. La función de abajo es security definer y
-- valida la autoría ella misma, sin depender de esa política.
alter table vales add column visto_supervisor_en timestamptz;

create or replace function public.fn_marcar_vale_visto(p_vale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update vales
  set visto_supervisor_en = now()
  where id = p_vale_id and supervisor_id = auth.uid();
end;
$$;

grant execute on function public.fn_marcar_vale_visto(uuid) to authenticated;

-- El nombre que muestran los reportes RDC, el dashboard y los Excel sale de
-- rdc_supervisores.nombre (vinculado por usuario_id), una copia aparte del
-- nombre de la cuenta. Al editar el nombre en Usuarios esa copia quedaba
-- vieja (caso real: GLORIA ARROYO -> ANGELA ARROYO). Los reportes apuntan a
-- rdc_supervisores.id, así que actualizar esa fila cambia el nombre en TODOS
-- sus reportes (pasados y futuros).
-- Reversible: drop trigger trg_usuarios_sincroniza_supervisor_rdc on usuarios;
--             drop function fn_usuarios_sincroniza_supervisor_rdc();
create or replace function public.fn_usuarios_sincroniza_supervisor_rdc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nombre is distinct from old.nombre then
    update rdc_supervisores
       set nombre = btrim(regexp_replace(new.nombre, '\s+', ' ', 'g'))
     where usuario_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_sincroniza_supervisor_rdc on usuarios;
create trigger trg_usuarios_sincroniza_supervisor_rdc
  after update of nombre on usuarios
  for each row execute function public.fn_usuarios_sincroniza_supervisor_rdc();

-- Ponerse al día con los que ya estaban desfasados.
update rdc_supervisores s
   set nombre = btrim(regexp_replace(u.nombre, '\s+', ' ', 'g'))
  from usuarios u
 where u.id = s.usuario_id
   and s.nombre is distinct from btrim(regexp_replace(u.nombre, '\s+', ' ', 'g'));

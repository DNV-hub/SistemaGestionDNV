-- El selector "A nombre de" de la carga manual de vales solo listaba usuarios con
-- rol Supervisor, así que Developer / Coordinador / Residencia no podían armar
-- un vale a su propio nombre aunque la política vales_insert sí lo permite
-- (creado_por = auth.uid() con vales.crear_para_otro; supervisor_id puede ser
-- el propio). Además Developer, Administrador, Planeamiento, Residencia, Coordinador
-- y Almacén deben poder armar el vale a nombre de cualquiera, no solo de un
-- Supervisor: la lista trae a todos los usuarios activos (quien consulta primero,
-- rotulado "(yo)", luego los Supervisores, luego el resto con su rol al lado).
-- Reversible: volver a la definición de 20260910100000_vales_mejoras.sql.
create or replace function public.fn_listar_supervisores()
returns table (id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('vales.crear_para_otro') then
    raise exception 'No tiene permiso para listar supervisores (vales.crear_para_otro)';
  end if;

  return query
    select u.id,
           case
             when u.id = auth.uid() then u.nombre || ' (yo)'
             when r.nombre = 'Supervisor' then u.nombre
             else u.nombre || ' · ' || r.nombre
           end
    from usuarios u
    join roles r on r.id = u.rol_id
    where u.estado = 'activo'
    order by (u.id = auth.uid()) desc, (r.nombre = 'Supervisor') desc, u.nombre;
end;
$$;

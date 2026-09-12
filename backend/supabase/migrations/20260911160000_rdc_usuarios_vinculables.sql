-- Función para el desplegable "Cuenta vinculada" del catálogo de
-- Supervisores del RDC.
--
-- POR QUÉ NO ALCANZA CON UN SELECT DIRECTO A `usuarios`: esa tabla exige
-- 'usuarios.ver' para leer filas ajenas (20260822101400), y ese permiso hoy
-- solo lo tiene Administrador. Los roles a los que recién se les dio
-- 'rdc.catalogos_gestionar' (Planeamiento, Responsable de Catálogo,
-- Consulta) NO tienen 'usuarios.ver' — dárselo solo para poder llenar un
-- desplegable les abriría de paso toda la pantalla de Usuarios (nombre,
-- correo, rol, contrato, frente de cada cuenta), que es mucho más de lo que
-- este catálogo necesita mostrar.
--
-- Esta función expone solo lo mínimo (id, nombre, estado y el nombre del
-- rol) y decide el permiso ella misma con `rdc.catalogos_gestionar` — quien
-- puede administrar catálogos del RDC puede ver esta lista acotada, sin que
-- eso implique poder ver ni tocar el resto de Usuarios.
create or replace function public.rdc_usuarios_vinculables()
returns table (id uuid, nombre text, estado text, rol_nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nombre, u.estado, r.nombre
  from usuarios u
  left join roles r on r.id = u.rol_id
  where public.has_permission('rdc.catalogos_gestionar')
  order by u.nombre;
$$;

grant execute on function public.rdc_usuarios_vinculables() to authenticated;

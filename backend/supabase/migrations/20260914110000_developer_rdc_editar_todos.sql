-- rdc.editar_todos (20260913160000) se le dio a 'Planeamiento' y
-- 'Administrador', pero la cuenta real que usa el usuario para probar y
-- administrar el sistema tiene el rol 'Developer' — no 'Administrador' (ese
-- rol no tiene ningún usuario activo hoy). Por eso "Corregir y reenviar" y
-- "borrar un borrador ajeno" (20260914100000) no le aparecían: el permiso
-- nunca llegó al rol que de verdad usa.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo = 'rdc.editar_todos'
where r.nombre = 'Developer'
on conflict (rol_id, permiso_id) do nothing;

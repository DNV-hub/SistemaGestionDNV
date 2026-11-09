-- El usuario pidió que Planeamiento pueda crear usuarios nuevos. La ruta
-- de Usuarios exige usuarios.ver para entrar al módulo, y el botón
-- "+ Nuevo usuario" exige usuarios.crear — sin editar/desactivar/
-- roles.gestionar, que no se pidieron (Planeamiento no queda pudiendo
-- restablecer contraseñas ajenas ni tocar la configuración de roles).
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo in ('usuarios.ver', 'usuarios.crear')
where r.nombre = 'Planeamiento'
on conflict (rol_id, permiso_id) do nothing;

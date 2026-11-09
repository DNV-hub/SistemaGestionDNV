-- El usuario pidió que Vales quede parejo para Developer/Planeamiento/
-- Supervisor/Almacén: los cuatro con el mismo set completo de permisos del
-- módulo (crear, editar propio, enviar, cancelar, aprobar/rechazar, crear
-- a nombre de otro, ver propios, ver todos) — Developer ya los tenía todos;
-- Planeamiento solo tenía ver_todos, Supervisor y Almacén les faltaban
-- varios cada uno.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.modulo = 'vales'
where r.nombre in ('Developer', 'Planeamiento', 'Supervisor', 'Almacen')
on conflict (rol_id, permiso_id) do nothing;

-- Devolver y transferir material salen de la barra de Vales y pasan a "+ Nuevo
-- vale" (Almacén). Para que el menú tenga las tres opciones, Developer,
-- Planeamiento y Almacén deben poder crear devoluciones y transferencias:
--   * Almacén ya tenía las dos.
--   * Developer ya tenía devoluciones.crear; le falta transferencias.crear.
--   * Planeamiento no tenía ninguna de las dos.
-- Solo se agregan filas a rol_permisos; no se quita nada a nadie.
--
-- Rollback manual: delete from rol_permisos donde rol = (Developer,
-- Planeamiento) y permiso = (transferencias.crear / devoluciones.crear
-- agregados aquí).

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo in ('devoluciones.crear', 'transferencias.crear')
where r.nombre in ('Developer', 'Planeamiento', 'Almacen')
  and not exists (
  select 1 from rol_permisos x where x.rol_id = r.id and x.permiso_id = p.id
);

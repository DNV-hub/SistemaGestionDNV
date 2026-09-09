-- Planeamiento y Consulta tienen `rdc.ver_todos` pero no `rdc.ver_propios`, y
-- la ruta del módulo —igual que la de Vales— exige el permiso "propios" como
-- la marca de "este módulo existe para mí". Sin esto el sidebar no les
-- mostraría el RDC aunque por RLS sí puedan leer todos los reportes.
--
-- Concederlo no les abre nada nuevo: la política de `rdc_reportes` acota
-- `ver_propios` a los reportes que uno creó o de los que es responsable, y
-- ninguno de esos dos roles emite reportes. Lo que ven sigue viniendo de
-- `rdc.ver_todos`.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('Planeamiento', 'rdc.ver_propios'),
  ('Consulta', 'rdc.ver_propios')
) as seed(rol_nombre, permiso_codigo)
join roles r on r.nombre = seed.rol_nombre
join permisos p on p.codigo = seed.permiso_codigo
on conflict (rol_id, permiso_id) do nothing;

-- Residencia trabaja los vales igual que Developer en la pestaña Vales de
-- Almacén: ve todos y puede generar un requerimiento a nombre de otro
-- supervisor/frente o para el propio. (Ya tenía vales.ver_todos y vales.crear;
-- aprobar y entregar siguen reservados a Almacén y Planeamiento.)
-- Reversible: delete from rol_permisos del rol Residencia con ese permiso.
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r, public.permisos p
where r.nombre = 'Residencia' and p.codigo = 'vales.crear_para_otro'
  and not exists (
    select 1 from public.rol_permisos rp where rp.rol_id = r.id and rp.permiso_id = p.id
  );

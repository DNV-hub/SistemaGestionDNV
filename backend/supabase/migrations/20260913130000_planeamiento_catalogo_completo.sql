-- Planeamiento ya administra Frentes y Procura completos (todos los permisos
-- de esos dos módulos), pero de Catálogo solo tenía 'catalogo.ver' — no podía
-- crear, editar, desactivar materiales ni importar/exportar el Excel. El
-- usuario pidió que el rol tenga acceso completo a todo el bloque
-- "Planeamiento" del menú (Catálogo, Frentes, Procura), no solo de lectura en
-- una parte de él.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo in (
  'catalogo.crear',
  'catalogo.editar',
  'catalogo.desactivar',
  'catalogo.importar_exportar'
)
where r.nombre = 'Planeamiento'
on conflict (rol_id, permiso_id) do nothing;

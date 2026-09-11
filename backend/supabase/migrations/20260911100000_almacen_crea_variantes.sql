-- El importador de ingresos masivos ahora puede dar de alta un material
-- nuevo cuando el código de una fila todavía no existe en el catálogo (por
-- ejemplo, una variante de largo distinto del mismo producto: "M80.4-B").
-- Eso corre desde el frontend con el rol Almacén, que hasta ahora no tenía
-- catalogo.crear — sin este permiso, la política RLS de materiales
-- (materiales_insert) rechazaría el alta y la importación entera fallaría.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r, permisos p
where r.nombre = 'Almacen' and p.codigo = 'catalogo.crear'
on conflict do nothing;

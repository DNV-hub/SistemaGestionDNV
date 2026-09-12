-- Amplía quién puede administrar los catálogos del RDC (frentes,
-- supervisores, capataces, prefijos, etc.).
--
-- 'rdc.catalogos_gestionar' existe desde 20260909100200 pero solo se le dio
-- a Administrador (Developer lo heredó al copiarse de Administrador en
-- 20260910120000). El usuario pidió que lo tengan todos los roles salvo
-- Almacen y Supervisor — Planeamiento y Responsable de Catálogo por ser
-- quienes de verdad tocan esta información en la operación, y Consulta
-- porque así lo pidió explícitamente, aunque su rol es por lo demás de solo
-- lectura en el resto del Sistema.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('Planeamiento', 'rdc.catalogos_gestionar'),
  ('Responsable de Catalogo', 'rdc.catalogos_gestionar'),
  ('Consulta', 'rdc.catalogos_gestionar')
) as seed(rol_nombre, permiso_codigo)
join roles r on r.nombre = seed.rol_nombre
join permisos p on p.codigo = seed.permiso_codigo
-- Por si esta migración se vuelve a correr, o si alguno ya lo tenía.
where not exists (
  select 1 from rol_permisos rp where rp.rol_id = r.id and rp.permiso_id = p.id
);

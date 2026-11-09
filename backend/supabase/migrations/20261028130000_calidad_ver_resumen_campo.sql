-- El rol Calidad tenía dashboard.ver pero no rdc.ver_resumen_campo: el
-- Dashboard abría casi vacío porque el mapa de actividad y "Frentes en campo"
-- se piden con funciones que exigen ese permiso.
--
-- Rollback manual: delete from rol_permisos where rol_id = (select id from roles
-- where nombre = 'Calidad') and permiso_id = (select id from permisos where
-- codigo = 'rdc.ver_resumen_campo');
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
  from roles r, permisos p
 where r.nombre = 'Calidad' and p.codigo = 'rdc.ver_resumen_campo'
on conflict do nothing;

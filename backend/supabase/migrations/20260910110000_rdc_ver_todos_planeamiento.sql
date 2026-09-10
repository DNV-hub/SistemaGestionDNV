-- El usuario pidió que solo Administrador y Planeamiento puedan ver el RDC
-- (todos los reportes). Consulta tenía rdc.ver_todos y rdc.ver_propios
-- (otorgados en 20260909110000_rdc_visibilidad_modulo.sql junto con
-- Planeamiento, que sí debe conservarlos) sin que se hubiera pedido —
-- se le sacan los dos: sin ver_propios ni siquiera le aparece el ítem
-- "Reporte diario" en el menú, no solo se queda sin nada que ver adentro.
--
-- La fuga que reportó el usuario (cualquier cuenta veía reportes ajenos) es
-- un bug aparte del lado del cliente — la lista local no filtraba por autor
-- — y se corrige en el frontend, no acá.
delete from rol_permisos
where permiso_id in (select id from permisos where codigo in ('rdc.ver_todos', 'rdc.ver_propios'))
  and rol_id = (select id from roles where nombre = 'Consulta');

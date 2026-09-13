-- Planeamiento ya tenía rdc.ver_todos y rdc.ver_propios (ve Reporte diario y
-- Sketch's de todos los supervisores), pero el módulo Fotos reutiliza a
-- propósito el permiso rdc.crear en vez de tener uno propio (ver el
-- comentario de fotosRoutes.js) — sin él, Planeamiento no podía ni entrar a
-- Fotografías. El usuario pidió que Planeamiento tenga el mismo acceso que
-- un supervisor ahí: ver y también poder subir, así que se le da rdc.crear
-- directamente en vez de inventar un permiso nuevo solo para esto.
--
-- Efecto secundario aceptado: rdc.crear también habilita /rdc/nuevo, así que
-- Planeamiento técnicamente podría crear su propio Reporte Diario de Campo
-- (como si fuera supervisor de un frente). No se usa en la práctica, pero se
-- deja constancia por si alguna vez hay que revisarlo.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo = 'rdc.crear'
where r.nombre = 'Planeamiento'
on conflict (rol_id, permiso_id) do nothing;

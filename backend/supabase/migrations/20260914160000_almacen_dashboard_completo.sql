-- El Dashboard nuevo (Frentes en campo, Próximos/Paralizados, Personal/
-- Equipos, stock crítico, alertas) ya lo tenían Planeamiento y Developer.
-- El usuario pidió el mismo dashboard completo para TODOS los roles,
-- empezando por Almacén (hoy se veía "horrible": sin rdc.ver_todos, la
-- tarjeta "Frentes en campo" no se mostraba y el layout de dos columnas
-- quedaba desbalanceado). Almacén ya tenía frentes.ver/stock.ver/
-- alertas.ver — solo le faltaba este permiso para completar las 4
-- condiciones que arma DashboardView.vue (rdcCampo/frentes/stock/alertas).
--
-- rdc.ver_todos NO expone el módulo RDC en sí (el link de navegación usa
-- rdc.ver_propios, que Almacén sigue sin tener) — solo habilita la consulta
-- de "quién está en campo hoy" que usa el dashboard.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo = 'rdc.ver_todos'
where r.nombre = 'Almacen'
on conflict (rol_id, permiso_id) do nothing;

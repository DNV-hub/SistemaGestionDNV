-- El Dashboard completo (Frentes en campo, Próximos/Paralizados, Personal/
-- Equipos, stock crítico, alertas) ahora es la pantalla principal también
-- para Supervisor — reemplaza al viejo SupervisorPanelView, que ya estaba
-- efectivamente muerto en el celular (ningún tab apuntaba a '/', el propio
-- comentario de vales/routes.js decía que "en celular ya no tiene forma de
-- alcanzarse"; la creación de vales y las devoluciones ya viven en
-- /vales/nuevo y /vales/devolucion desde el rediseño móvil).
--
-- Supervisor ya tenía dashboard.ver/frentes.ver/stock.ver/alertas.ver —
-- solo le faltaba rdc.ver_todos para que la tarjeta "Frentes en campo"
-- (quién está en campo hoy, de TODOS los supervisores) se muestre, igual
-- que ya se le dio a Almacén.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo = 'rdc.ver_todos'
where r.nombre = 'Supervisor'
on conflict (rol_id, permiso_id) do nothing;

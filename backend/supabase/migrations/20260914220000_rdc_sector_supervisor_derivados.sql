-- El formulario de RDC deja de pedir Sector y Nombre del Supervisor a mano
-- (frontend/src/modules/rdc/components/PasoDatos.vue): el Sector se deriva
-- del Frente elegido (ya está catalogado en `frentes.sector_id`, pedirlo
-- aparte era redundante) y el Supervisor sale de la cuenta con la que se
-- inició sesión (rdc.supervisorPropio ya hacía esto — el selector manual
-- solo queda para cuando Planeamiento/Developer crea o corrige un reporte a
-- nombre de otro supervisor).
--
-- Para que esto funcione sin dejar a nadie bloqueado, se completan dos
-- huecos de catálogo que ya existían antes de este cambio, pero que el
-- selector manual disimulaba:

-- 1. Carlo Montero (rol Supervisor) no tenía fila en rdc_supervisores, así
--    que rdc.supervisorPropio nunca lo encontraba y le seguía saliendo el
--    selector de Supervisor incluso siendo él mismo quien llenaba su propio
--    reporte — motivo real por el que el usuario reportó "un supervisor sí
--    lo vio".
insert into rdc_supervisores (nombre, usuario_id)
select 'CARLO MONTERO', u.id
from usuarios u
where u.email = 'carlo.montero@dnv.com'
  and not exists (select 1 from rdc_supervisores rs where rs.usuario_id = u.id);

-- 2. Dos frentes activos sin sector_id enlazado (frentes.sector_id es la
--    fuente de la que ahora sale el sectorId del reporte — sin esto, elegir
--    alguno de estos dos frentes hubiera dejado el reporte sin sector y sin
--    forma de corregirlo, porque ya no hay selector manual de respaldo).
--    ZCM05 ya tenía "VIA MAR II" como texto libre y ese sector YA existe en
--    el catálogo — se enlaza directo. VPM-03 decía "VIA PLANTA MINA", que
--    no existía como sector — se crea y se enlaza.
insert into sectores (nombre)
select 'VIA PLANTA MINA'
where not exists (select 1 from sectores where nombre = 'VIA PLANTA MINA');

update frentes
set sector_id = (select id from sectores where nombre = 'VIA MAR II')
where nombre = 'ZCM05' and sector_id is null;

update frentes
set sector_id = (select id from sectores where nombre = 'VIA PLANTA MINA')
where nombre = 'VPM - 03' and sector_id is null;

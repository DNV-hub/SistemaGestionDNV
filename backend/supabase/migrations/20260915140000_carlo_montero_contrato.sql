-- Carlo Montero (rol Supervisor) tenía contrato_id vacío — la política RLS
-- de stock exige que coincida con el contrato del supervisor
-- (contrato_id = current_contrato_id()), así que sin esto no podía ver
-- NINGÚN material al armar un vale. Mismo tipo de hueco de catálogo que ya
-- se encontró antes con su falta de enlace en rdc_supervisores
-- (20260914220000) — parece que su cuenta quedó incompleta al crearse.
update usuarios
set contrato_id = (select id from contratos where codigo = 'MARCO')
where email = 'carlo.montero@dnv.com' and contrato_id is null;

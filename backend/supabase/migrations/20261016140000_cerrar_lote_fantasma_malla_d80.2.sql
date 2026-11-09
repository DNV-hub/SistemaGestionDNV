-- Caso real reportado por el usuario: al registrar la entrega de D80.2
-- (MALLA DELTAX G80/2 3.9X30M) en el vale VR-0098, el selector de lotes
-- ofrecía dos opciones — una real (24 RLL, documento T001-0003094) y otra
-- que decía "994 RLL" que, según confirmó el usuario, no existe en la
-- realidad física del almacén.
--
-- La causa: el ingreso del 2026-09-14 (id f680c1e3-0dab-49da-a7b2-
-- 06330d18519a) se registró por error con 995 RLL y SIN documento de
-- referencia. El 2026-09-24 ya se había corregido el STOCK AGREGADO con un
-- ajuste negativo de 965 (ver tabla `ajustes`) — por eso el stock total
-- hoy (24 RLL) ya es el correcto — pero un ajuste negativo nunca toca el
-- saldo de un lote específico, así que ese lote quedó "congelado" en 994,
-- completamente desconectado de la realidad.
--
-- Esta migración solo cierra ese lote fantasma a 0 — no toca
-- stock.cantidad_fisica (ya está bien) ni el otro lote real (2026-09-26,
-- 24 RLL, que se queda intacto).
--
-- Reversible: update ingresos set cantidad_restante = 994 where id =
-- 'f680c1e3-0dab-49da-a7b2-06330d18519a';
update ingresos
set cantidad_restante = 0
where id = 'f680c1e3-0dab-49da-a7b2-06330d18519a'
  and material_id = 'd854792f-21f5-4b73-9016-783441a98b86'
  and cantidad_restante = 994;

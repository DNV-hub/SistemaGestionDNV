-- Mismo caso que el backfill de pernos de la migración anterior: la
-- instalación de malla Minax 80/3 del 14/10 en ZCM05 ya está reportada en
-- la bitácora como texto ("colocando 4 paños de 25 × 3.5 m y 1 paño de 30 ×
-- 3.5 m, alcanzando un total de 455 m² de malla instalada" — el reporte
-- 3f19edd0-a404-44d0-aba5-e46d7df409df), pero nunca quedó como fila
-- estructurada en rdc_reporte_elementos. El usuario dio el desglose real
-- por paño (M1..M5); la suma de áreas (87.50×4 + 105.00 = 455.00) cuadra
-- exacto con el total de la bitácora. Solo agrega filas a un reporte que ya
-- existe y ya fue enviado — no lo reabre ni reenvía.
--
-- Reversible:
--   delete from rdc_reporte_elementos
--   where reporte_id = '3f19edd0-a404-44d0-aba5-e46d7df409df'
--     and elemento = 'Malla' and codigo in ('M1','M2','M3','M4','M5');

with panos(codigo, ancho, largo) as (
  values
    ('M1', 3.50, 25.00),
    ('M2', 3.50, 25.00),
    ('M3', 3.50, 25.00),
    ('M4', 3.50, 25.00),
    ('M5', 3.50, 30.00)
),
reporte as (
  select id from rdc_reportes where id = '3f19edd0-a404-44d0-aba5-e46d7df409df' and eliminado_at is null
)
insert into rdc_reporte_elementos (id, reporte_id, elemento, actividad, sistema, zona, tipo, codigo, ancho, largo, cantidad, unidad)
select gen_random_uuid(), reporte.id, 'Malla', 'Instalación', 'PASIVO', 'ZCM-05', 'Minax 80/3', p.codigo, p.ancho, p.largo, p.ancho * p.largo, 'M2'
from panos p, reporte
where not exists (
  select 1 from rdc_reporte_elementos e
  where e.reporte_id = reporte.id and e.elemento = 'Malla'
    and upper(btrim(e.codigo)) = upper(btrim(p.codigo))
);

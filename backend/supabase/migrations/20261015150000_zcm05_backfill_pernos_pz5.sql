-- ZCM05 ya tenía perforación/inyección de los pernos PZ5/P1..P62 reportada
-- en el RDC desde el 10/10 al 13/10, pero como texto libre dentro de la
-- bitácora (el catálogo/prefijos recién se cargó después) — nunca quedó
-- como fila estructurada en rdc_reporte_elementos, así que "Control de
-- sostenimiento" los mostraba como "Sin perforar" pese a que el trabajo ya
-- se hizo. El usuario reconstruyó la lista real (código, fecha, tipo) desde
-- su propio registro de campo, verificada cruzando contra el texto de la
-- bitácora de esos mismos reportes (coincide código por código). Esta
-- migración solo agrega las filas faltantes a reportes que YA existen y ya
-- fueron enviados — no reabre ni reenvía nada, nunca pisa un reporte.
--
-- Reversible:
--   delete from rdc_reporte_elementos
--   where reporte_id in (
--     'da8429fd-867a-4e8f-a7b9-7b3e0b600ad5', 'a5dd0098-6edc-4b6e-83e2-5eca218b8436',
--     'ab1c303c-45bc-4605-b9d8-dbe811a34213', '13420656-85c4-4e8b-a091-d0def18fc9a2'
--   ) and elemento = 'Perno' and codigo like 'PZ5/P%'
--   and ubicacion = 'Cabecera de talud' and zona = 'ZCM-05';

with perforaciones(codigo, fecha) as (
  values
    ('PZ5/P1', date '2026-10-10'), ('PZ5/P2', date '2026-10-10'),
    ('PZ5/P29', date '2026-10-10'), ('PZ5/P57', date '2026-10-10'),
    ('PZ5/P3', date '2026-10-11'), ('PZ5/P4', date '2026-10-11'),
    ('PZ5/P5', date '2026-10-11'), ('PZ5/P6', date '2026-10-11'),
    ('PZ5/P22', date '2026-10-11'), ('PZ5/P23', date '2026-10-11'),
    ('PZ5/P24', date '2026-10-11'), ('PZ5/P25', date '2026-10-11'),
    ('PZ5/P26', date '2026-10-11'), ('PZ5/P27', date '2026-10-11'),
    ('PZ5/P28', date '2026-10-11'), ('PZ5/P58', date '2026-10-11'),
    ('PZ5/P7', date '2026-10-12'), ('PZ5/P8', date '2026-10-12'),
    ('PZ5/P9', date '2026-10-12'), ('PZ5/P10', date '2026-10-12'),
    ('PZ5/P15', date '2026-10-12'), ('PZ5/P16', date '2026-10-12'),
    ('PZ5/P17', date '2026-10-12'), ('PZ5/P18', date '2026-10-12'),
    ('PZ5/P19', date '2026-10-12'), ('PZ5/P20', date '2026-10-12'),
    ('PZ5/P21', date '2026-10-12'), ('PZ5/P59', date '2026-10-12'),
    ('PZ5/P11', date '2026-10-13'), ('PZ5/P12', date '2026-10-13'),
    ('PZ5/P13', date '2026-10-13'), ('PZ5/P14', date '2026-10-13'),
    ('PZ5/P60', date '2026-10-13'), ('PZ5/P62', date '2026-10-13')
),
insertadas_perforacion as (
  insert into rdc_reporte_elementos (id, reporte_id, elemento, actividad, zona, codigo, ubicacion, cantidad, unidad)
  select gen_random_uuid(), r.id, 'Perno', 'Perforación', 'ZCM-05', p.codigo, 'Cabecera de talud', 2.00, 'ML'
  from perforaciones p
  join rdc_reportes r on r.frente_id = '342ab759-bf75-46f6-a6cc-8b12a3af20b1' and r.fecha = p.fecha and r.eliminado_at is null
  where not exists (
    select 1 from rdc_reporte_elementos e
    where e.reporte_id = r.id and e.elemento = 'Perno' and e.actividad = 'Perforación'
      and upper(btrim(e.codigo)) = upper(btrim(p.codigo))
  )
  returning 1
)
select 1;

with codigos_inyectados(codigo) as (
  values
    ('PZ5/P1'), ('PZ5/P2'), ('PZ5/P3'), ('PZ5/P4'), ('PZ5/P5'), ('PZ5/P6'),
    ('PZ5/P7'), ('PZ5/P8'), ('PZ5/P9'), ('PZ5/P10'), ('PZ5/P11'), ('PZ5/P12'),
    ('PZ5/P13'), ('PZ5/P14'), ('PZ5/P15'), ('PZ5/P16'), ('PZ5/P17'), ('PZ5/P18'),
    ('PZ5/P19'), ('PZ5/P20'), ('PZ5/P21'), ('PZ5/P22'), ('PZ5/P23'), ('PZ5/P24'),
    ('PZ5/P25'), ('PZ5/P26'), ('PZ5/P27'), ('PZ5/P28'), ('PZ5/P29'), ('PZ5/P57'),
    ('PZ5/P58'), ('PZ5/P59'), ('PZ5/P60'), ('PZ5/P62')
),
reporte_13 as (
  select id from rdc_reportes
  where frente_id = '342ab759-bf75-46f6-a6cc-8b12a3af20b1' and fecha = date '2026-10-13' and eliminado_at is null
),
insertadas_inyeccion as (
  insert into rdc_reporte_elementos (id, reporte_id, elemento, actividad, zona, codigo, ubicacion, cantidad, unidad)
  select gen_random_uuid(), reporte_13.id, 'Perno', 'Inyección', 'ZCM-05', c.codigo, 'Cabecera de talud', 2.00, 'ML'
  from codigos_inyectados c, reporte_13
  where not exists (
    select 1 from rdc_reporte_elementos e
    where e.reporte_id = reporte_13.id and e.elemento = 'Perno' and e.actividad = 'Inyección'
      and upper(btrim(e.codigo)) = upper(btrim(c.codigo))
  )
  returning 1
)
select 1;

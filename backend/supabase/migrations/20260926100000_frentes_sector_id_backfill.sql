-- Bug real reportado por un supervisor: al cerrar su Reporte Diario de un
-- frente nuevo, el sistema le exigía "falta completar: el sector" sin
-- forma de arreglarlo desde el formulario del RDC. Causa: `FrenteFormModal`
-- (módulo Frentes, donde Planeamiento crea frentes) solo pedía el texto
-- libre `sector` — nunca pedía `sector_id`, la columna real que el RDC usa
-- para derivar el sector de cada reporte (rdc.sectorIdDeFrente lee
-- frentes.sector_id). Cualquier frente creado desde que existe esa columna
-- (20260911170000_unificar_frentes_rdc_sistema) quedó con sector_id nulo.
--
-- El formulario ya se corrigió en el frontend (ahora pide sector_id con un
-- selector real). Esta migración es el backfill de los que ya quedaron mal:
-- intenta emparejar por nombre (sin espacios de sobra, sin distinguir
-- mayúsculas) el texto libre `sector` contra `sectores.nombre` — el mismo
-- criterio que usó la migración de unificación para los frentes que sí
-- tenían sector_id desde el principio. Los que no encuentren una
-- coincidencia limpia quedan como estaban (sector_id null): alguien de
-- Planeamiento los revisa a mano desde el formulario, que ahora ya se lo
-- permite.
update frentes f
set sector_id = s.id
from sectores s
where f.sector_id is null
  and lower(trim(f.sector)) = lower(trim(s.nombre));

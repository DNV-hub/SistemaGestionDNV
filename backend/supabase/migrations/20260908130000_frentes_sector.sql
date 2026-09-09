-- Ajusta el formulario de Frentes al dato real de la empresa: además del
-- área, cada frente pertenece a un sector (se usa para agrupar visualmente
-- las tarjetas de Frentes), y el código deja de ser obligatorio — algunos
-- frentes reales no tienen uno asignado todavía.
--
-- La tabla está vacía en este momento (se reinició antes de cargar los
-- frentes reales), así que se puede agregar `sector` y volver `area`
-- obligatorias sin backfill.
alter table frentes add column sector text not null;
alter table frentes alter column area set not null;
alter table frentes alter column codigo drop not null;

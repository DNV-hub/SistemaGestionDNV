-- Orden de las filas del metrado de Procura tal como vienen en el Excel
-- importado (y las zonas en el orden en que aparecen). Nullable: lo anterior
-- sigue ordenándose por nombre. Se hereda en cada versión nueva de la fila.
-- Reversible: alter table metrados_procura drop column orden;
alter table metrados_procura add column orden int;

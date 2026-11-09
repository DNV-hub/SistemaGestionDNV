-- Pedido de campo: en la actividad de Inyección, el supervisor también
-- reporta cuántas bolsas de cemento se usaron ese día — un total de la
-- jornada, no por perno (no se mezcla con rdc_reporte_elementos, que es
-- un registro por cada perno/malla/cable).
alter table rdc_reportes
  add column iny_bolsas_cemento numeric(10,2) check (iny_bolsas_cemento >= 0);

-- Olvido en la migración anterior: el check de `origen` en
-- rdc_metrados_confirmacion es independiente del check de `tipo_medicion`
-- en rdc_partidas_edt — agregar un tipo_medicion nuevo no alcanza, hay que
-- agregarlo acá también. La propia base lo frenó antes de escribir nada mal
-- (constraint violation, transacción revertida).
alter table rdc_metrados_confirmacion drop constraint rdc_metrados_confirmacion_origen_check;
alter table rdc_metrados_confirmacion add constraint rdc_metrados_confirmacion_origen_check
  check (origen in ('digitado_edt', 'conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable', 'suma_ml_pernos', 'libre', 'estandar'));

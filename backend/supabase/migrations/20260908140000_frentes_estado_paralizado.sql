-- Un frente puede quedar temporalmente parado (clima, permisos, falta de
-- personal) sin estar cerrado de forma definitiva: se agrega "paralizado"
-- como tercer estado, entre "activo" y "cerrado".
alter table frentes drop constraint frentes_estado_check;
alter table frentes add constraint frentes_estado_check
  check (estado in ('activo', 'paralizado', 'cerrado'));

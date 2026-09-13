-- fecha_inicio era NOT NULL con default CURRENT_DATE (de la migración
-- original de frentes) — eso significaba que TODO frente nuevo nacía con
-- la fecha de hoy sí o sí, aunque el formulario ya no la mostrara
-- explícita. Con el trigger de fn_frentes_estado_por_fecha() recién
-- agregado (20260913110000), eso era un bug real y no solo un dato de
-- más: un frente "planificado" recién creado tenía fecha_inicio = hoy por
-- default, así que el trigger lo pasaba a 'activo' en el acto — exactamente
-- lo contrario de "planificado" ("todavía no se sabe cuándo arranca").
--
-- Un frente planificado, por definición, no tiene fecha de inicio todavía
-- — eso es justo lo que lo distingue de "próximo". La columna tiene que
-- poder quedar en null de verdad, no defaultear a hoy en silencio.
alter table frentes alter column fecha_inicio drop not null;
alter table frentes alter column fecha_inicio drop default;

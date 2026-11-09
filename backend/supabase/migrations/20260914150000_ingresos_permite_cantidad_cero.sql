-- Un ingreso de cantidad 0 representa "este material existe pero hoy no
-- tiene stock físico" — el usuario lo necesita así, a propósito, para que
-- el material aparezca al buscarlo en la app (con 0 de stock) y para que
-- fn_evaluar_alertas lo marque como stock agotado (necesita al menos un
-- ingreso, aunque sea de 0, para calcular el mínimo efectivo — ver
-- stock_con_minimo en 20260913150000_stock_minimo_porcentaje.sql). Salidas
-- y ajustes NO se tocan: una entrega o un ajuste de 0 no representa nada
-- real, solo un ingreso puede ser legítimamente "cero" (carga inicial de
-- un material sin stock todavía).
alter table ingresos drop constraint ingresos_cantidad_check;
alter table ingresos add constraint ingresos_cantidad_check check (cantidad >= 0);

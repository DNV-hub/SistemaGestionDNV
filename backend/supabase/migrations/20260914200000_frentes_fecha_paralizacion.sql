-- El dashboard usaba updated_at como aproximación de "desde cuándo está
-- parado" un frente (ver comentario en listarFrentesParalizados) — el
-- usuario pidió poder ELEGIR esa fecha a mano al marcarlo paralizado, en
-- vez de depender de cuándo se tocó por última vez la fila (que puede no
-- coincidir con el día real en que se paró el trabajo).
alter table frentes add column fecha_paralizacion date;

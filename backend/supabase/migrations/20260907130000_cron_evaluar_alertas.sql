-- fn_evaluar_alertas ya existía (§9 de la spec) pero nada la llamaba todavía
-- (el módulo de Alertas solo tenía un botón manual). pg_cron la corre cada
-- hora; es security definer e idempotente (no duplica alertas activas), así
-- que repetirla seguido es seguro.
create extension if not exists pg_cron;

select cron.schedule(
  'evaluar-alertas-cada-hora',
  '0 * * * *',
  $$select public.fn_evaluar_alertas();$$
);

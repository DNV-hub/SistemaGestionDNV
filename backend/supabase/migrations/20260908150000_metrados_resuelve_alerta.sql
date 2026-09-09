-- Situación real de obra: un frente puede empezar a consumir materiales
-- antes de que Planeamiento termine de sacar el metrado Procura del plano
-- (el plano llega tarde, o el frente arranca sin él todavía). Eso ya genera
-- la alerta 'material_no_previsto' (fn_evaluar_alertas). Lo que faltaba: en
-- cuanto Planeamiento por fin carga el metrado de ese material para ese
-- frente, la alerta debía resolverse sola — hasta ahora quedaba activa
-- aunque el motivo ya no existiera, dependiendo de que alguien la resolviera
-- a mano.
--
-- No hace falta recalcular nada de consumo: procura_vs_consumo es una vista
-- (no una tabla), así que en cuanto existe la fila de metrado, la
-- comparación ya suma sola todo el histórico de reservas/salidas de ese
-- material+frente, hayan ocurrido antes o después del metrado.
create or replace function public.fn_resolver_alerta_material_previsto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update alertas
    set estado = 'resuelta', resuelta_at = now()
  where tipo = 'material_no_previsto'
    and estado = 'activa'
    and frente_id = new.frente_id
    and material_id = new.material_id;
  return new;
end;
$$;

create trigger trg_metrados_resolver_alerta
  after insert on metrados_procura
  for each row execute function public.fn_resolver_alerta_material_previsto();

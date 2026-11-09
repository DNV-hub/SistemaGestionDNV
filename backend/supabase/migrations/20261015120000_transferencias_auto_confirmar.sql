-- Las transferencias dejan de necesitar que Almacén las confirme o
-- rechace: es un movimiento a solicitud del propio supervisor, entre sus
-- frentes, así que se confirma sola al crearse. `confirmada_por` queda en
-- el propio supervisor (no hay nadie más resolviéndola) y `confirmada_at`
-- al instante de la solicitud.
--
-- No se borran fn_confirmar_transferencia/fn_rechazar_transferencia ni el
-- permiso transferencias.confirmar_rechazar: quedan sin uso real (nunca va
-- a quedar nada en 'Solicitada' para que resuelvan) pero no estorban, y es
-- reversible con solo quitar este trigger si el criterio cambia.
create or replace function public.fn_trg_transferencias_auto_confirmar()
returns trigger
language plpgsql
as $$
begin
  new.estado := 'Confirmada';
  new.confirmada_por := new.supervisor_id;
  new.confirmada_at := now();
  return new;
end;
$$;

create trigger trg_transferencias_auto_confirmar
  before insert on transferencias
  for each row execute function public.fn_trg_transferencias_auto_confirmar();

-- No había ninguna 'Solicitada' pendiente al momento de este cambio
-- (verificado), pero por si alguna quedó de antes:
update transferencias
set estado = 'Confirmada', confirmada_por = supervisor_id, confirmada_at = now()
where estado = 'Solicitada';

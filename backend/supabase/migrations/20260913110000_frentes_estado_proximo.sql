-- "Próximo": el usuario tiene ~40 frentes pero solo 5 cuadrillas, así que
-- avanza de 5 en 5 y necesita saber cuál sigue. La diferencia con
-- "planificado" es la fecha: un frente sin fecha de inicio todavía es solo
-- una idea en el catálogo (planificado); en cuanto Planeamiento le pone una
-- fecha de inicio, pasa a ser "próximo" — y el mismo día que esa fecha
-- llega, se vuelve "activo" SOLO, sin que nadie tenga que entrar a
-- cambiarlo a mano, y desde ahí aparece en RDC, Vales, Procura, Alertas,
-- todo lo que ya filtraba por `estado = 'activo'`.
--
-- Es deliberadamente automático y no una elección manual más en el
-- desplegable: el dato real que Planeamiento conoce es "cuándo arranca
-- este frente", no una etiqueta aparte — pedirle que además marque
-- "próximo" a mano sería un dato redundante que se puede desincronizar de
-- la fecha (poner la fecha y olvidarse de marcarlo, o al revés).
alter table frentes drop constraint frentes_estado_check;
alter table frentes add constraint frentes_estado_check
  check (estado in ('planificado', 'proximo', 'activo', 'paralizado', 'cerrado'));

-- ---------------------------------------------------------------------------
-- 1. Al guardar: si el estado es 'planificado' o 'proximo' (los dos que se
--    derivan de la fecha), se recalcula según fecha_inicio en cada
--    INSERT/UPDATE. 'activo', 'paralizado' y 'cerrado' son decisiones
--    humanas y esto nunca las toca — por eso el `if` de abajo solo entra
--    para esos dos casos.
-- ---------------------------------------------------------------------------
create or replace function public.fn_frentes_estado_por_fecha()
returns trigger
language plpgsql
as $$
begin
  if new.estado in ('planificado', 'proximo') then
    if new.fecha_inicio is null then
      new.estado := 'planificado';
    elsif new.fecha_inicio <= current_date then
      new.estado := 'activo';
    else
      new.estado := 'proximo';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_frentes_estado_por_fecha
  before insert or update on frentes
  for each row execute function public.fn_frentes_estado_por_fecha();

-- ---------------------------------------------------------------------------
-- 2. El trigger de arriba solo corre cuando alguien GUARDA la fila — un
--    frente que quedó "próximo" con fecha 15 de octubre no se entera solo
--    de que llegó el 15 si nadie lo vuelve a tocar. pg_cron lo revisa una
--    vez al día y promueve los que ya les tocaba. Se corre a las 05:30 UTC
--    (00:30 en Perú, UTC-5) — justo después de medianoche en Perú, no en
--    UTC, para que un frente programado para "mañana" en el calendario de
--    Perú no se active hasta 5 horas antes de tiempo si el servidor
--    calcula la fecha en UTC.
-- ---------------------------------------------------------------------------
create or replace function public.fn_activar_frentes_proximos()
returns void
language sql
security definer
set search_path = public
as $$
  update frentes set estado = 'activo' where estado = 'proximo' and fecha_inicio <= current_date;
$$;

select cron.schedule(
  'activar-frentes-proximos',
  '30 5 * * *',
  $$select public.fn_activar_frentes_proximos();$$
);

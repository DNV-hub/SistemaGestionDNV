-- El usuario pidió distinguir el número de vale por tipo: VR para vales de
-- requerimiento (los que ya existían, "V-0001"...) y VD para vales de
-- devolución (devoluciones), cada uno con su propia numeración correlativa.

-- 1. Vales de requerimiento: pasa de "V-" a "VR-".
create or replace function public.fn_vales_generar_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := 'VR-' || lpad(nextval('vales_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

-- 2. Devoluciones: mismo patrón, numeración propia con prefijo VD.
alter table devoluciones add column numero text unique;

create sequence if not exists devoluciones_numero_seq start with 1;
grant usage on sequence devoluciones_numero_seq to authenticated;

create or replace function public.fn_devoluciones_generar_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := 'VD-' || lpad(nextval('devoluciones_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_devoluciones_generar_numero
  before insert on devoluciones
  for each row execute function public.fn_devoluciones_generar_numero();

-- Devoluciones ya existentes (de prueba) también necesitan un número, ya
-- que la columna quedó con unique.
update devoluciones set numero = 'VD-' || lpad(nextval('devoluciones_numero_seq')::text, 4, '0') where numero is null;

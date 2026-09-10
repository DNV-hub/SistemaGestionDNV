-- Permite corregir ancho/largo de un ingreso que ya existe (típicamente el
-- stock inicial, cargado en lote por Excel antes de que existiera esta
-- columna) sin tocar su cantidad ni su saldo restante — el usuario pidió
-- poder exportar los ingresos, completar las medidas en Excel y volver a
-- subir, en vez de borrar y recrear (que descuadraría kardex/stock).
--
-- fn_trg_ingreso_preparar (BEFORE INSERT) no sirve para esto: reinicia
-- cantidad_restante = cantidad, lo cual borraría cualquier salida que ya
-- haya consumido parte de este lote. Esta es una función aparte, solo para
-- UPDATE de ancho/largo, que jamás toca cantidad_restante.
create or replace function public.fn_trg_ingreso_recalcular_factor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_conversion text;
begin
  select tipo_conversion into v_tipo_conversion from materiales where id = new.material_id;

  if v_tipo_conversion = 'area' and new.ancho is not null and new.largo is not null then
    new.factor_conversion := new.ancho * new.largo;
  elsif v_tipo_conversion = 'longitud' and new.largo is not null then
    new.factor_conversion := new.largo;
  else
    new.factor_conversion := null;
  end if;

  return new;
end;
$$;

create trigger trg_ingresos_recalcular_factor
  before update of ancho, largo on ingresos
  for each row execute function public.fn_trg_ingreso_recalcular_factor();

-- `ingresos` no tiene política de UPDATE para `authenticated` (a propósito:
-- es una tabla de solo-inserción, igual que el resto del historial físico).
-- En vez de abrir un UPDATE genérico, esta función solo permite tocar
-- ancho/largo, gateada por el mismo permiso que ya hace falta para crear un
-- ingreso.
create or replace function public.fn_actualizar_medidas_ingreso(p_ingreso_id uuid, p_ancho numeric, p_largo numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('stock.registrar_ingreso') then
    raise exception 'No tiene permiso para corregir ingresos (stock.registrar_ingreso)';
  end if;

  update ingresos set ancho = p_ancho, largo = p_largo where id = p_ingreso_id;

  if not found then
    raise exception 'El ingreso % no existe', p_ingreso_id;
  end if;
end;
$$;

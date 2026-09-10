-- El usuario pidió que código y descripción de un material queden siempre
-- en mayúscula, sin importar cómo se hayan tipeado — y que se corrija lo
-- que ya estaba cargado. Se resuelve con un trigger (no solo en el
-- frontend) para que valga sin importar por dónde se escriba: el
-- formulario interactivo, la importación masiva por Excel, o cualquier
-- otra vía futura.
update materiales
set codigo = upper(codigo), descripcion = upper(descripcion)
where codigo <> upper(codigo) or descripcion <> upper(descripcion);

create or replace function public.fn_trg_materiales_mayusculas()
returns trigger
language plpgsql
as $$
begin
  new.codigo := upper(new.codigo);
  new.descripcion := upper(new.descripcion);
  return new;
end;
$$;

create trigger trg_materiales_mayusculas
  before insert or update on materiales
  for each row execute function public.fn_trg_materiales_mayusculas();

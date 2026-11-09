-- Permite completar o corregir los DATOS de un ingreso ya registrado (N.º de
-- guía, proveedor, observación) sin tocar cantidades ni stock. Antes la tabla
-- no tenía política de UPDATE, así que un ingreso sin guía no se podía arreglar.
-- Reversible: drop function public.fn_editar_datos_ingreso(uuid[], text, text, text);

create or replace function public.fn_editar_datos_ingreso(
  p_ids uuid[],
  p_documento text,
  p_proveedor text,
  p_observacion text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not public.has_permission('stock.registrar_ajuste') then
    raise exception 'No tiene permiso para corregir ingresos';
  end if;

  update ingresos
  set documento_referencia = nullif(btrim(p_documento), ''),
      proveedor = nullif(btrim(p_proveedor), ''),
      observacion = nullif(btrim(p_observacion), '')
  where id = any(p_ids);
  get diagnostics v_n = row_count;

  -- El kardex copió "observación o guía" al registrarse: se mantiene al día.
  update kardex
  set observacion = coalesce(nullif(btrim(p_observacion), ''), nullif(btrim(p_documento), ''))
  where referencia_tabla = 'ingresos' and referencia_id = any(p_ids);

  return v_n;
end;
$$;

grant execute on function public.fn_editar_datos_ingreso(uuid[], text, text, text) to authenticated;

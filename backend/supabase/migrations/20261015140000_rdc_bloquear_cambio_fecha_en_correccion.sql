-- Bug real que pasó de verdad: Bryan corrigió lo que su celular mostraba
-- como "el reporte del 14" para reenviarlo — pero por dentro, esa fila ya
-- tenía el id del reporte del 13 (que ya estaba bien guardado y enviado a
-- SharePoint). "Corregir y reenviar" no impedía cambiar la fecha, así que
-- el reenvío pisó por completo la fila del 13 con el contenido y la fecha
-- del 14 — el reporte del 13 desapareció del Sistema (quedó solo su Excel
-- en SharePoint, que por suerte ya se había mandado antes). Se reconstruyó
-- a mano desde ese Excel.
--
-- "Corregir" debe arreglar ESE día, nunca convertirlo en el reporte de
-- otro día — si el supervisor de verdad necesita reportar un día distinto,
-- existe "Nuevo reporte" para eso, que sí crea una fila con id propio.
create or replace function public.fn_rdc_bloquear_cambio_fecha_en_correccion()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.es_correccion, false) and new.fecha is distinct from old.fecha then
    raise exception 'No se puede cambiar la fecha de un reporte al corregirlo (quedaría como el reporte de otro día). Usa "Nuevo reporte" si necesitas reportar una fecha distinta.';
  end if;
  return new;
end;
$$;

create trigger trg_rdc_bloquear_cambio_fecha_en_correccion
  before update on rdc_reportes
  for each row execute function public.fn_rdc_bloquear_cambio_fecha_en_correccion();

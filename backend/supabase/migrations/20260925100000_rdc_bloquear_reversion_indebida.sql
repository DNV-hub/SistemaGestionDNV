-- Bug real encontrado: el módulo RDC guarda todo primero en el celular
-- (IndexedDB) y lo sincroniza con Supabase después. Mientras un reporte
-- sigue en Borrador, el celular vuelve a subirlo COMPLETO en cada ciclo de
-- sincronización (rdcSync.js), incluyendo la columna `estado` — a propósito,
-- para que un supervisor pueda seguir un reporte en otro dispositivo. El
-- problema: si ese dispositivo todavía no se enteró de que el reporte ya se
-- Finalizó y se mandó a SharePoint (por ejemplo, se finalizó desde OTRO
-- celular/pestaña), su copia vieja en Borrador puede pisar el estado real
-- en el servidor — el reporte queda marcado "Borrador" en la lista aunque
-- Power Automate ya lo haya recibido y generado su Excel. Confirmado con
-- datos reales: 11 reportes con estado_sharepoint = 'enviado' (archivo real
-- generado) pero estado = 'Borrador', y es_correccion = false en los 11 —
-- así que no es el flujo de "Corregir y reenviar" (que si necesita volver a
-- Borrador a propósito, y para eso existe `es_correccion`).
--
-- La corrección real vive en el servidor, no en el celular: un reporte
-- Finalizado nunca puede volver a Borrador salvo que sea explícitamente una
-- corrección (es_correccion = true, que es justo la señal que ya manda
-- rdc.corregir() en el frontend). Si algún dispositivo con una copia vieja
-- intenta pisarlo de todos modos, ahora la base de datos lo rechaza en vez
-- de aceptarlo — el frontend ya sabe mostrar ese error en el propio reporte
-- (rdcSync.js guarda cualquier error de subida en `errorSupabase`).
create or replace function public.fn_rdc_bloquear_reversion_indebida()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'Finalizado' and new.estado = 'Borrador' and coalesce(new.es_correccion, false) = false then
    raise exception 'No se puede volver un reporte Finalizado a Borrador sin marcarlo como corrección (es_correccion = true).';
  end if;
  return new;
end;
$$;

create trigger trg_rdc_bloquear_reversion_indebida
  before update on rdc_reportes
  for each row execute function public.fn_rdc_bloquear_reversion_indebida();

-- Repara los reportes ya afectados: mismo criterio exacto que confirmó el
-- bug (enviado a SharePoint de verdad, pero no es una corrección en curso).
-- No toca contenido, solo el estado.
update rdc_reportes
set estado = 'Finalizado'
where estado = 'Borrador' and estado_sharepoint = 'enviado' and es_correccion = false;

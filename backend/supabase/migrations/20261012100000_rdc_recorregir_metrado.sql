-- Pedido del usuario: corrigió una cantidad, se equivocó de nuevo, y no
-- había forma de volver a tocarla — fn_rdc_corregir_metrado exigía
-- estado='por_confirmar', así que una fila ya 'confirmado'/'corregido'
-- quedaba fija para siempre. Ahora se puede volver a corregir en cualquiera
-- de esos 3 estados (no 'ignorado': ese primero se "revive" aparte, no
-- pedido todavía). cantidad_original ya NO se pisa en una segunda
-- corrección — coalesce conserva el valor que de verdad reportó el
-- supervisor la primera vez, no la corrección anterior.
create or replace function public.fn_rdc_corregir_metrado(p_id uuid, p_cantidad numeric, p_motivo text, p_partida_edt_id uuid default null)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion
  set estado = 'corregido',
      cantidad_original = coalesce(cantidad_original, cantidad),
      cantidad_corregida = p_cantidad,
      cantidad = p_cantidad, motivo = p_motivo,
      partida_edt_id = case when origen in ('libre', 'estandar') then coalesce(p_partida_edt_id, partida_edt_id) else partida_edt_id end,
      resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado in ('por_confirmar', 'confirmado', 'corregido');
$$;
grant execute on function public.fn_rdc_corregir_metrado(uuid, numeric, text, uuid) to authenticated;

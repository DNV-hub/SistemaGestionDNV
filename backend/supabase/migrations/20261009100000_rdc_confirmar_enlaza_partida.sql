-- Cierra el hueco real reportado por Planeamiento: hoy "confirmar" un
-- metrado libre (texto suelto del supervisor) lo marca resuelto pero nunca
-- lo asocia a ninguna partida_edt_id, así que ese metrado NUNCA suma al
-- acumulado de ninguna partida real de cronograma — fn_rdc_acumulado_edt
-- agrupa por partida_edt_id, que para 'libre' queda null. Esta migración
-- deja que Planeamiento elija (o acepte la sugerida) la partida real al
-- confirmar/corregir, y esa elección sí cuenta en el acumulado.
--
-- Solo se permite tocar partida_edt_id en filas origen='libre' — para
-- digitado_edt/conteo_pernos/suma_panos_malla/suma_tramos_cable la partida
-- ya es la correcta de origen y no se debe poder reasignar por acá.
--
-- Cambia el número de parámetros: se dropean las firmas viejas en vez de
-- CREATE OR REPLACE (que crearía un overload ambiguo para PostgREST).
-- Reversible: volver a las firmas/cuerpos de 20261007100000.

drop function if exists public.fn_rdc_confirmar_metrado(uuid);
create function public.fn_rdc_confirmar_metrado(p_id uuid, p_partida_edt_id uuid default null)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion
  set estado = 'confirmado',
      partida_edt_id = case when origen = 'libre' then coalesce(p_partida_edt_id, partida_edt_id) else partida_edt_id end,
      resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado = 'por_confirmar';
$$;
grant execute on function public.fn_rdc_confirmar_metrado(uuid, uuid) to authenticated;

drop function if exists public.fn_rdc_corregir_metrado(uuid, numeric, text);
create function public.fn_rdc_corregir_metrado(p_id uuid, p_cantidad numeric, p_motivo text, p_partida_edt_id uuid default null)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion
  set estado = 'corregido', cantidad_original = cantidad, cantidad_corregida = p_cantidad,
      cantidad = p_cantidad, motivo = p_motivo,
      partida_edt_id = case when origen = 'libre' then coalesce(p_partida_edt_id, partida_edt_id) else partida_edt_id end,
      resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado = 'por_confirmar';
$$;
grant execute on function public.fn_rdc_corregir_metrado(uuid, numeric, text, uuid) to authenticated;

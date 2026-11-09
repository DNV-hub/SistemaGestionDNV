-- Cuánto material figura "en" un frente, en unidades de almacén:
--   entregado (salidas) - devuelto (recibidas) - transferido a otros (confirmadas)
--   + recibido por transferencia (confirmadas).
-- Además devuelve lo ya comprometido en transferencias 'Solicitada' que salen
-- de ese frente y todavía no confirmó Almacén. Sirve para avisar, antes de
-- transferir, si se está pasando más de lo que el frente tiene.
-- Reversible: drop function public.fn_stock_en_frente(uuid, uuid);
create or replace function public.fn_stock_en_frente(p_frente_id uuid, p_material_id uuid)
returns table (disponible numeric, comprometido numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(s.cantidad) from salidas s where s.frente_id = p_frente_id and s.material_id = p_material_id), 0)
    - coalesce((select sum(d.cantidad) from devoluciones d where d.frente_id = p_frente_id and d.material_id = p_material_id and d.estado = 'Recibida'), 0)
    - coalesce((select sum(t.cantidad) from transferencias t where t.frente_origen_id = p_frente_id and t.material_id = p_material_id and t.estado = 'Confirmada'), 0)
    + coalesce((select sum(t.cantidad) from transferencias t where t.frente_destino_id = p_frente_id and t.material_id = p_material_id and t.estado = 'Confirmada'), 0),
    coalesce((select sum(t.cantidad) from transferencias t where t.frente_origen_id = p_frente_id and t.material_id = p_material_id and t.estado = 'Solicitada'), 0)
  where public.has_permission('transferencias.crear')
     or public.has_permission('stock.ver')
     or public.has_permission('vales.crear');
$$;
grant execute on function public.fn_stock_en_frente(uuid, uuid) to authenticated;

-- Detalle de lo que compone el "stock en un frente" (ver fn_stock_en_frente):
-- cada salida con su fecha y su vale, y los descuentos/aportes por devoluciones
-- recibidas y transferencias confirmadas. Cantidades en unidades de almacén;
-- las que restan vienen en negativo.
-- Reversible: drop function public.fn_movimientos_en_frente(uuid, uuid);
create or replace function public.fn_movimientos_en_frente(p_frente_id uuid, p_material_id uuid)
returns table (tipo text, fecha date, documento text, cantidad numeric)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select 'salida'::text as tipo, s.fecha::date as fecha,
           coalesce(v.numero, s.documento_referencia) as documento, s.cantidad::numeric as cantidad
      from salidas s
      left join vale_detalle vd on vd.id = s.vale_detalle_id
      left join vales v on v.id = vd.vale_id
     where s.frente_id = p_frente_id and s.material_id = p_material_id
    union all
    select 'devolucion', d.fecha::date, d.numero, -d.cantidad::numeric
      from devoluciones d
     where d.frente_id = p_frente_id and d.material_id = p_material_id and d.estado = 'Recibida'
    union all
    select 'transferencia_sale', t.fecha::date, null, -t.cantidad::numeric
      from transferencias t
     where t.frente_origen_id = p_frente_id and t.material_id = p_material_id and t.estado = 'Confirmada'
    union all
    select 'transferencia_entra', t.fecha::date, null, t.cantidad::numeric
      from transferencias t
     where t.frente_destino_id = p_frente_id and t.material_id = p_material_id and t.estado = 'Confirmada'
  ) m
  where public.has_permission('transferencias.crear')
     or public.has_permission('stock.ver')
     or public.has_permission('vales.crear')
  order by fecha desc nulls last;
$$;
grant execute on function public.fn_movimientos_en_frente(uuid, uuid) to authenticated;

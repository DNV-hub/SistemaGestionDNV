-- Bug real, no el stock mínimo (que solo alimenta alertas, nunca bloquea
-- nada — se confirmó recorriendo todo el flujo). `fn_trg_salida` bajaba
-- primero `stock.cantidad_fisica` y RECIÉN DESPUÉS `stock.cantidad_reservada`
-- (vía fn_avanzar_reserva). El check `chk_stock_reservada_no_excede_fisica`
-- (cantidad_reservada <= cantidad_fisica) no es diferible en Postgres — se
-- evalúa al toque, al final del primer UPDATE — así que en ese instante
-- intermedio comparaba la física YA reducida contra la reservada TODAVÍA
-- sin reducir, y reventaba cada vez que se entregaba algo que ya estaba
-- reservado (el caso normal de toda entrega contra un vale aprobado, no una
-- rareza). Con CANCAMOS DE 1" L=1.50M, la reserva activa igualaba el 100%
-- del stock físico (cantidad_disponible = 0), así que CUALQUIER entrega
-- contra esa reserva disparaba el error.
--
-- El arreglo es de orden nomás: bajar primero cantidad_reservada
-- (fn_avanzar_reserva) y recién después cantidad_fisica
-- (fn_registrar_movimiento_stock). Con cantidad_reservada ya en su valor
-- final en ambos pasos, la invariante reservada <= física se cumple en todo
-- momento — antes de entregar ya valía (R <= F), y después de bajar ambas
-- por lo mismo (R-D <= F-D) sigue valiendo exactamente igual.
create or replace function public.fn_trg_salida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vale_id uuid;
begin
  if new.vale_detalle_id is not null then
    select vale_id into v_vale_id from vale_detalle where id = new.vale_detalle_id;
  end if;

  if new.reserva_id is not null then
    perform public.fn_avanzar_reserva(new.reserva_id, new.cantidad, new.usuario_id);
  end if;

  perform public.fn_registrar_movimiento_stock(
    new.almacen_id, new.material_id, new.contrato_id, -new.cantidad, 'salida', new.cantidad,
    new.usuario_id, 'salidas', new.id, v_vale_id,
    coalesce(new.observacion, new.documento_referencia)
  );

  return new;
end;
$$;

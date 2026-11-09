-- fn_borrar_vale_prueba (20260910120000) se negaba del todo si el vale ya
-- tuvo una entrega física real (salidas/kardex), con el mensaje "revertilo
-- con Devoluciones". Eso deja sin salida a un vale de PRUEBA con una
-- entrega de PRUEBA: Devoluciones existe para revertir entregas reales de
-- obra, no para limpiar datos de prueba, y esa entrega de prueba además
-- bloquea "Reiniciar ingresos" (que se niega si hay CUALQUIER salida).
--
-- Ahora, si el vale tiene salidas, se revierten primero: se repone
-- cantidad_fisica en stock y se borran la salida y su fila de kardex. No
-- hace falta "deshacer" reservas/vale_detalle a su estado previo a la
-- entrega (Activa/Parcial con cantidad_entregada menor) porque el resto de
-- esta misma función va a borrar esas filas de todos modos unas líneas más
-- abajo — a diferencia de fn_liberar_reserva (pensada para un vale que
-- SIGUE existiendo), acá no importa dejar cantidad_entregada/estado
-- "correctos" a mitad de camino, total no van a persistir.
create or replace function public.fn_borrar_vale_prueba(p_vale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva record;
  v_salida record;
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para borrar vales (sistema.borrar_pruebas)';
  end if;

  if not exists (select 1 from vales where id = p_vale_id) then
    raise exception 'El vale % no existe', p_vale_id;
  end if;

  for v_salida in
    select s.* from salidas s
    join vale_detalle vd on vd.id = s.vale_detalle_id
    where vd.vale_id = p_vale_id
  loop
    update stock
      set cantidad_fisica = cantidad_fisica + v_salida.cantidad
    where almacen_id = v_salida.almacen_id and material_id = v_salida.material_id;

    delete from kardex where referencia_tabla = 'salidas' and referencia_id = v_salida.id;
    delete from salidas where id = v_salida.id;
  end loop;

  -- Reservas todavía Activas/Parciales (sin entrega, o con la que se acaba
  -- de revertir arriba): se liberan formalmente para que stock.cantidad_reservada
  -- quede correcto. Una reserva "Convertida" (entrega total, ya revertida
  -- arriba) no necesita este paso — su cupo reservado ya se había liberado
  -- en su momento, al ir entregando — y de todas formas se borra abajo.
  for v_reserva in
    select r.id from reservas r
    join vale_detalle vd on vd.id = r.vale_detalle_id
    where vd.vale_id = p_vale_id and r.estado in ('Activa', 'Parcial')
  loop
    perform public.fn_liberar_reserva(v_reserva.id, 'Vale de prueba borrado por Developer', auth.uid(), true);
  end loop;

  delete from reservas_historial
  where reserva_id in (
    select r.id from reservas r
    join vale_detalle vd on vd.id = r.vale_detalle_id
    where vd.vale_id = p_vale_id
  );

  delete from reservas
  where vale_detalle_id in (select id from vale_detalle where vale_id = p_vale_id);

  delete from vales where id = p_vale_id;
end;
$$;

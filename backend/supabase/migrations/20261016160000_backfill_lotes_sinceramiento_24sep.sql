-- Auditoría pedida por el usuario tras el caso de VR-0101 (ver migración
-- 20261016150000): ¿a cuántos materiales más les falta el mismo tipo de
-- lote?
--
-- Se comparó, para cada material con tipo_conversion <> 'ninguna' (los que
-- necesitan lote para poder entregarse), el stock.cantidad_fisica actual
-- contra la suma real de ingresos.cantidad_restante disponible. La
-- diferencia es exactamente el monto que quedó "flotando" en el agregado
-- sin ningún lote real detrás — y por lo tanto, el monto que el próximo
-- "Registrar entrega" de ese material NO va a poder ofrecer, repitiendo el
-- mismo bloqueo que tuvo VR-0101.
--
-- Los 9 materiales de abajo (más M80.3_2.5X20, ya corregido en la
-- migración anterior) comparten la misma causa: la sesión masiva de
-- "sinceramiento" del 2026-09-24 (ajustes positivos, motivo "S"/
-- "sinceramiento", todos de LUIS OPPE), tres semanas antes de que un
-- ajuste positivo generara lote automáticamente (migración 20261016130000).
-- Nada de esto lo causaron las correcciones de hoy — es historial previo
-- que quedó pendiente de regularizar a nivel de lote.
--
-- PERNO.B25L1.5 es el único con cantidad_reservada > 0 ahorita mismo (hay
-- una reserva activa esperando entrega): sin este backfill, esa entrega
-- iba a chocar con el mismo problema en cualquier momento.
--
-- Cada bloque: crea el lote real que falta (mismas medidas que el ingreso
-- original de ese material) + un movimiento compensatorio para no duplicar
-- el stock (ese monto ya está contado desde el ajuste original).
--
-- Reversible: por material, borrar el ingreso creado (buscar por
-- observacion 'Backfill sinceramiento 24/09...') junto con su movimiento
-- compensatorio en kardex.
do $$
declare
  v_almacen_id uuid := '4c4c5ccf-759f-4b5a-a3e4-b55bb8d7bb39'; -- DM2
  v_contrato_id uuid := '56bd7188-8186-4dbd-ab83-1c06cc8c027c'; -- Contrato Marco
  v_usuario_id uuid := 'cbb3a83d-e28c-42dd-9f64-96241a04787d'; -- LUIS OPPE, autor de los ajustes originales del 24/09
  v_ingreso_id uuid;

  -- (material_id, cantidad, ancho, largo, codigo para el comentario)
  v_materiales uuid[] := array[
    '8bff3bb1-e7d2-4a73-aff0-64a75b797a62', -- PERNO.B32L6
    '773098d2-db45-46fc-b6b2-a21eca9d5f6b', -- PERNO.R38L1.5
    '10b855dd-ef78-4adc-981d-b5e770dc806a', -- M80.4_3.60X12.5
    'b93e9643-2ea5-4d43-8a3f-393f775ebbf1', -- PERNO.R32L1.5
    '3871c2f0-355b-4263-9ec6-3aec5f867b50', -- M80.4_2.5X20
    '069683b2-9271-4d3a-85f4-24acf3952430', -- PERNO.R38L3
    'e54cff97-b0d9-46d0-bc99-cf719a4db0ba', -- PERNO.B32L3
    '022f6370-d7aa-43f7-9a7a-ea2f079fbb47', -- MA_TT
    'd1bbc629-934a-4615-8f2d-05de8db12ef6'  -- PERNO.B25L1.5
  ];
  v_cantidades numeric[] := array[205, 20, 9, 3, 1, 1, 1, 1, 1];
  v_anchos numeric[] := array[null, null, 3.6, null, 2.5, null, null, 2, null];
  v_largos numeric[] := array[6, 1.5, 12.5, 1.5, 20, 3, 3, 25, 1.5];
  v_codigos text[] := array[
    'PERNO.B32L6', 'PERNO.R38L1.5', 'M80.4_3.60X12.5', 'PERNO.R32L1.5',
    'M80.4_2.5X20', 'PERNO.R38L3', 'PERNO.B32L3', 'MA_TT', 'PERNO.B25L1.5'
  ];
  i int;
begin
  for i in 1 .. array_length(v_materiales, 1) loop
    insert into ingresos (
      fecha, material_id, almacen_id, cantidad, documento_referencia,
      usuario_id, observacion, contrato_id, ancho, largo
    ) values (
      '2026-09-24', v_materiales[i], v_almacen_id, v_cantidades[i], null,
      v_usuario_id,
      'Backfill sinceramiento 24/09: crea el lote real que le faltaba al ajuste positivo de esa fecha (motivo "S", sin lote real) para ' || v_codigos[i] || '. Auditoría a raíz de VR-0101 (ver migración 20261016150000) — ese ajuste se anula con un movimiento negativo aparte en esta misma migración.',
      v_contrato_id, v_anchos[i], v_largos[i]
    )
    returning id into v_ingreso_id;

    perform public.fn_registrar_movimiento_stock(
      v_almacen_id, v_materiales[i], v_contrato_id, -v_cantidades[i], 'ajuste_negativo', v_cantidades[i],
      v_usuario_id, 'ingresos', v_ingreso_id, null,
      'Anula el ajuste positivo del 24/09 (motivo "S", sin lote real) para ' || v_codigos[i] || ': esa cantidad ya quedó registrada como ingreso real para poder entregarse. Auditoría a raíz de VR-0101.'
    );
  end loop;
end $$;

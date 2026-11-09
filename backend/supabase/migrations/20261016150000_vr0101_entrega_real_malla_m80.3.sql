-- Caso real reportado por el usuario: el almacenero SÍ entregó las 2 RLL de
-- M80.3_2.5X20 (MALLA MINAX 80/3 D=2.5X20M) del vale VR-0101, pero el modal
-- de "Registrar entrega" no le mostró ningún lote para elegir, así que se
-- fue a Reservas y le dio "Liberar" — eso canceló la línea del vale sin
-- dejar ningún rastro de que el material sí salió.
--
-- La causa es la misma que ya se corrigió para VR-0098 (hoy) y VR-0074
-- (10/09, ver el historial de MA_TT): el 2026-09-24 hubo una sesión masiva
-- de "sinceramiento" de stock (ajustes positivos/negativos, motivo "S")
-- que tocó varios materiales a la vez. En esa fecha un ajuste positivo
-- todavía no generaba un lote (eso recién se arregló hoy, migración
-- 20261016130000) — solo sumaba al stock agregado. Para este material
-- puntual: un ingreso real de 2 RLL (devolución del 15/09) quedó sin lote
-- propio por un ajuste negativo de -2 el 24/09, y luego un ajuste positivo
-- de "sinceramiento" el 27/09 volvió a poner 2 RLL en el agregado sin
-- ningún lote real detrás. Por eso "Registrar entrega" no tenía nada que
-- ofrecer: no existía ningún lote con saldo > 0 para este material.
--
-- Esta migración:
-- 1) Crea el lote real que faltaba (2 RLL, mismas medidas 2.5x20 que el
--    único ingreso real que tiene este material) con un movimiento
--    compensatorio para no duplicar el stock (esas 2 unidades ya estaban
--    contadas desde el ajuste del 27/09).
-- 2) Reactiva la reserva y la línea del vale (estaban en 'Cancelada'/
--    'Cancelado' por el "Liberar" del almacenero) e inserta la salida real
--    contra el lote recién creado, disparando los mismos triggers que una
--    entrega normal — dejando VR-0101 con esta línea en 'Entregado', que
--    es lo que de verdad pasó, y el stock bajando en 2 como corresponde a
--    una entrega real.
--
-- Reversible: borrar la salida insertada (el trigger no revierte solo),
-- devolver reservas/vale_detalle a 'Cancelada'/'Cancelado', y borrar el
-- ingreso creado junto con su movimiento compensatorio.
do $$
declare
  v_material_id uuid := '25be8cb4-5633-490f-992a-b85c63f597c8'; -- M80.3_2.5X20
  v_almacen_id uuid := '4c4c5ccf-759f-4b5a-a3e4-b55bb8d7bb39'; -- DM2
  v_contrato_id uuid := '56bd7188-8186-4dbd-ab83-1c06cc8c027c'; -- Contrato Marco
  v_frente_id uuid := '342ab759-bf75-46f6-a6cc-8b12a3af20b1'; -- ZCM05
  v_vale_detalle_id uuid := '43d7c0e7-20aa-4ecd-a0eb-c7faaa1fe186';
  v_reserva_id uuid := '7a90fd75-c1e3-4d4c-a729-bc0a5048faf4';
  v_usuario_id uuid := '0a8b96cb-9e6f-44aa-bd46-47c60ac6c567'; -- LUIS VIDAL, almacenero que entregó el resto de VR-0101
  v_ingreso_id uuid;
begin
  insert into ingresos (
    fecha, material_id, almacen_id, cantidad, documento_referencia,
    usuario_id, observacion, contrato_id, ancho, largo
  ) values (
    '2026-09-27', v_material_id, v_almacen_id, 2, null,
    v_usuario_id,
    'Correccion: crea el lote real (2.5x20) que le faltaba al ajuste +2 generico del 27/09 (motivo "sinceramiento", sin lote real), para poder atender VR-0101. Ese ajuste se anula con un movimiento negativo aparte en esta misma migracion.',
    v_contrato_id, 2.5, 20
  )
  returning id into v_ingreso_id;

  -- Compensa el alta automática de stock que dispara el insert en
  -- `ingresos` (fn_trg_ingreso): esas 2 unidades ya estaban en el agregado
  -- desde el ajuste del 27/09, así que sin esto se duplicarían.
  perform public.fn_registrar_movimiento_stock(
    v_almacen_id, v_material_id, v_contrato_id, -2, 'ajuste_negativo', 2,
    v_usuario_id, 'ingresos', v_ingreso_id, null,
    'Anula el ajuste positivo +2 del 27/09 (motivo "sinceramiento", sin lote real): esas 2 RLL ya quedaron registradas como ingreso real (2.5x20) para poder entregarlas en VR-0101.'
  );

  -- Reactiva la reserva y la línea del vale para poder registrar la
  -- entrega real contra el lote recién creado (estaban 'Cancelada'/
  -- 'Cancelado' por el "Liberar" que hizo el almacenero al no encontrar
  -- lote disponible). Hay que devolver también la cantidad_reservada que
  -- "Liberar" ya había soltado, para que fn_avanzar_reserva la pueda
  -- descontar de nuevo sin dejar el stock en negativo.
  insert into reservas_historial (reserva_id, estado_anterior, estado_nuevo, cantidad_anterior, cantidad_nueva, motivo, usuario_id)
  values (v_reserva_id, 'Cancelada', 'Activa', 0, 0, 'Correccion: el material si se entrego fisicamente, se reactiva para registrar la entrega real', v_usuario_id);

  update reservas set estado = 'Activa' where id = v_reserva_id;
  update vale_detalle set estado = 'Reservado' where id = v_vale_detalle_id;

  update stock
    set cantidad_reservada = cantidad_reservada + 2
  where almacen_id = v_almacen_id and material_id = v_material_id and contrato_id = v_contrato_id;

  -- Entrega real contra el lote recién creado: dispara los triggers
  -- normales de `salidas` (fn_trg_salidas_preparar baja cantidad_restante
  -- del lote y calcula cantidad_edp; fn_trg_salida avanza la reserva/línea
  -- del vale a 'Entregado' y baja stock.cantidad_fisica/cantidad_reservada)
  -- — igual que si el almacenero hubiera completado el flujo normal de
  -- "Registrar entrega".
  insert into salidas (
    material_id, almacen_id, frente_id, vale_detalle_id, reserva_id,
    usuario_id, documento_referencia, cantidad, ingreso_id, observacion
  ) values (
    v_material_id, v_almacen_id, v_frente_id, v_vale_detalle_id, v_reserva_id,
    v_usuario_id, 'VR-0101', 2, v_ingreso_id,
    'Correccion: registra retroactivamente la entrega que el almacenero ya hizo en fisico el 16/10, pero que no pudo completar en el sistema porque no aparecia ningun lote disponible.'
  );
end $$;

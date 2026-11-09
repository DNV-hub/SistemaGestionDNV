-- Caso real reportado por el usuario: en VR-0098, Almacén solo pudo
-- registrar 1 de las 5 unidades de PERNO.B25L2 que de verdad entregó — al
-- intentar completar las 4 restantes, "Registrar entrega" no ofrecía
-- ningún lote (el material se convierte a ML para el EDP, así que exige
-- elegir de qué lote sale).
--
-- La causa: el 2026-10-03, Antony Aycaya hizo un ajuste positivo de +4 UND
-- (motivo "sinceramiento", id 3f56d763-57ed-4735-875e-de8a404bc14e) sobre
-- este material. Un ajuste SIEMPRE suma solo al stock agregado — nunca crea
-- un lote en `ingresos` — así que esas 4 unidades quedaron "atrapadas":
-- cuentan para el stock físico (y por eso la reserva de 5 se pudo aprobar),
-- pero no tienen lote del que salir. Los 3 lotes reales que sí existen para
-- este material (70, 10 y 1 unidades) ya estaban en 0 antes de esto.
--
-- Esta migración crea el lote que ese ajuste debió generar. Como insertar
-- en `ingresos` dispara el mismo trigger que un ingreso normal (vuelve a
-- sumar la cantidad al stock), se revierte esa alta automática a
-- continuación — estas 4 unidades YA estaban contadas, este insert solo les
-- da un lote del que entregarse, no debe duplicar el stock.
--
-- Reversible: borrar el ingreso insertado (ver su documento_referencia) y
-- el movimiento 'ajuste_negativo' de kardex que lo acompaña, y deshacer a
-- mano la suma neta sobre stock.cantidad_fisica (quedaría en +4 si se
-- revierte todo).
do $$
declare
  v_ingreso_id uuid := gen_random_uuid();
begin
  insert into ingresos (id, fecha, material_id, almacen_id, contrato_id, cantidad, largo, documento_referencia, usuario_id, observacion)
  values (
    v_ingreso_id, date '2026-10-03',
    'c22c2813-904e-4e8e-9d4a-a0050bf65b58', -- PERNO.B25L2
    '4c4c5ccf-759f-4b5a-a3e4-b55bb8d7bb39', -- DM2
    '56bd7188-8186-4dbd-ab83-1c06cc8c027c', -- Contrato Marco
    4, 2,
    'Ajuste positivo 2026-10-03 (sinceramiento) — lote creado retroactivamente',
    '4d5eb8ea-f9c3-4126-a260-c1c4f8ef8e25', -- ANTONY AYCAYA
    'Backfill: el ajuste de sinceramiento del 2026-10-03 (id 3f56d763-57ed-4735-875e-de8a404bc14e) sumó estas 4 unidades al stock pero no generó lote — sin esto, VR-0098 no podía completar su entrega (ver migración 20261016120000).'
  );

  perform public.fn_registrar_movimiento_stock(
    '4c4c5ccf-759f-4b5a-a3e4-b55bb8d7bb39', -- DM2
    'c22c2813-904e-4e8e-9d4a-a0050bf65b58', -- PERNO.B25L2
    '56bd7188-8186-4dbd-ab83-1c06cc8c027c', -- Contrato Marco
    -4, 'ajuste_negativo', 4,
    '4d5eb8ea-f9c3-4126-a260-c1c4f8ef8e25', -- ANTONY AYCAYA
    'ingresos', v_ingreso_id, null,
    'Reversa la alta automática del trigger de ingresos para el lote recién creado — estas 4 unidades ya estaban contadas por el ajuste de sinceramiento del 2026-10-03, este movimiento solo evita duplicarlas en el stock físico.'
  );
end $$;

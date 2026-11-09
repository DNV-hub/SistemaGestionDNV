-- Continuación de la regularización OPB (20261001100000): el usuario
-- compartió la guía de remisión real (GR 0032, mismo documento
-- T001-0002993) y se confirmó que las 23 líneas ya registradas coinciden
-- exactamente con la guía — pero faltaba la PRIMERA línea del documento:
-- "BARRERA DINAMICA GBE 1000A_H5 (equivalente a 40M de longitud de
-- barrera)", 1 juego. Único material de esa familia en catálogo:
-- GBE.1000.4M "BARRERA GBE-1000 H=4M" (el "H5" de la guía es nomenclatura
-- del proveedor, no un material distinto).
--
-- Se agrega como línea nueva del MISMO vale de regularización ya existente
-- (44eb10d6-7368-4bb3-9a81-57ec9938b081, ya "Atendido") en vez de crear un
-- vale aparte — es la misma entrega física, el mismo documento, solo que
-- esta línea se había pasado por alto la primera vez.
--
-- cantidad=1 (UND, "1 juego"), largo=40 (m): fn_trg_ingreso_preparar
-- calcula factor_conversion=40 para tipo_conversion='longitud', así que el
-- EDP ve 1 x 40 = 40 ml, que es justo lo que dice la guía.
do $$
declare
  v_frente_opb      uuid := 'fddaca4c-5d94-4c5e-a52c-3aed393a0fd1';
  v_contrato_marco  uuid := '56bd7188-8186-4dbd-ab83-1c06cc8c027c';
  v_almacen_dm2     uuid := '4c4c5ccf-759f-4b5a-a3e4-b55bb8d7bb39';
  v_luis_vidal      uuid := '0a8b96cb-9e6f-44aa-bd46-47c60ac6c567';
  v_fecha           date := '2026-09-04';
  v_documento       text := 'T001-0002993';
  v_observacion     text := 'Material especifico para dar salida al frente OPB (linea omitida en la regularizacion original, agregada tras verificar contra la guia GR 0032)';
  v_vale_id         uuid := '44eb10d6-7368-4bb3-9a81-57ec9938b081';
  v_material_id     uuid := '17fbfaae-93fd-484a-9539-a43b5e86dcd8'; -- GBE.1000.4M

  v_ingreso_id      uuid;
  v_vale_detalle_id uuid;
  v_reserva_id      uuid;
begin
  insert into ingresos (fecha, material_id, almacen_id, contrato_id, cantidad, ancho, largo, documento_referencia, observacion, usuario_id)
  values (v_fecha, v_material_id, v_almacen_dm2, v_contrato_marco, 1, null, 40, v_documento, v_observacion, v_luis_vidal)
  returning id into v_ingreso_id;

  insert into vale_detalle (vale_id, material_id, cantidad_solicitada, cantidad_aprobada, estado)
  values (v_vale_id, v_material_id, 1, 1, 'Reservado')
  returning id into v_vale_detalle_id;

  insert into reservas (vale_detalle_id, material_id, almacen_id, frente_id, contrato_id, cantidad, estado, usuario_id)
  values (v_vale_detalle_id, v_material_id, v_almacen_dm2, v_frente_opb, v_contrato_marco, 1, 'Activa', v_luis_vidal)
  returning id into v_reserva_id;

  update stock set cantidad_reservada = cantidad_reservada + 1
  where almacen_id = v_almacen_dm2 and material_id = v_material_id and contrato_id = v_contrato_marco;

  insert into salidas (fecha, material_id, almacen_id, contrato_id, cantidad, frente_id, vale_detalle_id, reserva_id, usuario_id, observacion, ingreso_id)
  values (v_fecha, v_material_id, v_almacen_dm2, v_contrato_marco, 1, v_frente_opb, v_vale_detalle_id, v_reserva_id, v_luis_vidal, v_observacion, v_ingreso_id);
end $$;

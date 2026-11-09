-- Regularización de ingreso + salida para el frente OPB: material que ya
-- había entrado y salido físicamente el 04/09/2026 (guía T001-0002993) pero
-- nunca quedó registrado en el sistema. Se registra ahora, con la fecha real
-- del hecho (no la de hoy), para que el kardex y el historial de Procura de
-- OPB queden completos. Pedido explícito del usuario, confirmado en el chat
-- del 2026-10-01: ingreso a nombre de Luis Vidal (Almacén), vale a nombre
-- del supervisor Aarón Céspedes, 23 materiales, algunos nuevos en el
-- catálogo (se crean acá con los datos de su propio Excel de catálogo).
do $$
declare
  v_frente_opb      uuid := 'fddaca4c-5d94-4c5e-a52c-3aed393a0fd1';
  v_contrato_marco  uuid := '56bd7188-8186-4dbd-ab83-1c06cc8c027c';
  v_almacen_dm2     uuid := '4c4c5ccf-759f-4b5a-a3e4-b55bb8d7bb39';
  v_luis_vidal      uuid := '0a8b96cb-9e6f-44aa-bd46-47c60ac6c567'; -- Almacén: ingresa y entrega
  v_aaron_cespedes  uuid := '5bd40906-9346-4380-a716-133702ae438d'; -- Supervisor: dueño del vale
  v_fecha           date := '2026-09-04';
  v_documento       text := 'T001-0002993';
  v_observacion     text := 'Material especifico para dar salida al frente OPB';
  v_vale_id         uuid;

  v_row             record;
  v_categoria_id    uuid;
  v_nombre_edp_id   uuid;
  v_material_id     uuid;
  v_ingreso_id      uuid;
  v_vale_detalle_id uuid;
  v_reserva_id      uuid;
begin
  -- Un solo vale para las 23 líneas, ya "Atendido" porque la entrega real ya
  -- ocurrió — no tiene sentido dejarlo pendiente de aprobar algo que ya pasó
  -- (el bucle de abajo lo deja en "Atendido" en cuanto procesa la última línea).
  insert into vales (fecha, supervisor_id, frente_id, estado, observaciones, fecha_envio, creado_por)
  values (
    v_fecha, v_aaron_cespedes, v_frente_opb, 'Reservado',
    'Vale de regularización: material entregado el 04/09/2026, registrado posteriormente en el sistema (guía ' || v_documento || ').',
    v_fecha + time '12:00', v_luis_vidal
  )
  returning id into v_vale_id;

  for v_row in
    select * from (values
      ('CABLE.A1','Cable de Acero A1 7/8','UND','ninguna',1::numeric,null::numeric,null::numeric,'CABLE DE ACERO A1 7/8"','UND','CABLE DE ACERO'),
      ('CABLE.A2','Cable de Acero A2 7/8','UND','ninguna',1,null,null,'CABLE DE ACERO A2 7/8"','UND','CABLE DE ACERO'),
      ('CFLEX.4016','Cabeza Flexible Titan 40/16','UND','ninguna',10,null,null,'CABEZA FLEXIBLE TITAN 40/16','UND','BARRERA'),
      ('ARAN.GEN','Arandela','UND','ninguna',10,null,null,'ARANDELA','UND','PERNOS Y TUERCAS'),
      ('GRI.34','Grillete 3/4"','UND','ninguna',10,null,null,'GRILLETE 3/4"','UND','GRILLETE'),
      ('GRI.58','Grillete 5/8"','UND','ninguna',205,null,null,'GRILLETE 5/8"','UND','GRILLETE'),
      ('SUJE.22','Sujetacable 22mm 7/8','UND','ninguna',14,null,null,'SUJETACABLES FORJET 22MM','UND','CABLE DE ACERO'),
      ('SUJE.16','Sujetacable 16mm 5/8','UND','ninguna',50,null,null,'SUJETACABLES FORJET 16MM','UND','CABLE DE ACERO'),
      ('GRI.1','Grillete 1"','UND','ninguna',10,null,null,'GRILLETE 1"','UND','GRILLETE'),
      ('TOR.M20','Tornillo M20','UND','ninguna',5,null,null,'TORNILLO M20','UND','PERNOS Y TUERCAS'),
      ('TUE.HEXM20','Tuerca Hexagonal M20','UND','ninguna',5,null,null,'TUERCA HEXAGONAL M20','UND','PERNOS Y TUERCAS'),
      ('ARAN.21373','Arandela 21/37/3','UND','ninguna',10,null,null,'ARANDELA 21/37/3','UND','PERNOS Y TUERCAS'),
      ('GRI.38','Grillete 3/8','UND','ninguna',164,null,null,'GRILLETE 3/8"','UND','GRILLETE'),
      ('POLEA','Polea','UND','ninguna',10,null,null,'POLEA','UND','BARRERA'),
      ('CUERDA.14','Cuerda de Seguridad 14mm','UND','ninguna',1,null,null,'CUERDA DE SEGURIDAD 14MM','UND','BARRERA'),
      ('CUERDA.ESP','Cuerda de Seguridad Especial','UND','ninguna',4,null,null,'CUERDA DE SEGURIDAD ESPECIAL','UND','BARRERA'),
      ('CABLE.C1','Cable de Acero C1','UND','ninguna',2,null,null,'CABLE DE ACERO C1','UND','CABLE DE ACERO'),
      ('CABLE.D1','Cable de Acero D1 5/8','UND','ninguna',10,null,null,'CABLE DE ACERO D1 5/8"','UND','CABLE DE ACERO'),
      ('CABLE.F1','Cable de Acero F1 7/8','UND','ninguna',2,null,null,'CABLE DE ACERO F1 7/8"','UND','CABLE DE ACERO'),
      ('FRENO.U300','Freno U-300-70X8 BS','UND','ninguna',4,null,null,'FRENO U-300-70X8 BS','UND','BARRERA'),
      ('PLACA.BASE.TYP','Placa Base TYP','UND','ninguna',5,null,null,'PLACA BASE TYP','UND','PLACA'),
      ('T80.4_5.3X10','Tecco 80/4 5.3x10m','RLL','area',4,5.3,10,'MALLA TECCO G80/4','M2','MALLA DE ALTA RESISTENCIA'),
      ('POSTE.HEA140.H5','Poste HEA 140 H5','UND','ninguna',5,null,null,'POSTE HEA 140 H5','UND','BARRERA')
    ) as t(codigo, descripcion, unidad, tipo_conversion, cantidad, ancho, largo, descripcion_edp, unidad_edp, categoria)
  loop
    -- Nombre EDP: agrupa por nombre igual que el importador real
    -- (20260930100000_procura_por_nombre_edp.sql) — se reutiliza si ya
    -- existe, se crea si no.
    select id into v_nombre_edp_id from nombres_edp where upper(nombre) = upper(v_row.descripcion_edp) limit 1;
    if v_nombre_edp_id is null then
      insert into nombres_edp (nombre) values (v_row.descripcion_edp) returning id into v_nombre_edp_id;
    end if;

    -- Categoría: mismo criterio de "buscar por nombre, crear si no existe"
    -- que usa el importador de catálogo (catalogo/utils/importarExcel.js).
    select id into v_categoria_id from categorias where upper(nombre) = upper(v_row.categoria) limit 1;
    if v_categoria_id is null then
      insert into categorias (nombre) values (v_row.categoria) returning id into v_categoria_id;
    end if;

    -- Material: la identidad real es el NOMBRE, nunca el código (memoria
    -- catalogo-codigo-no-es-identidad) — si ya existe un material con esta
    -- descripción se reutiliza tal cual está, sin tocar sus atributos.
    select id into v_material_id from materiales where upper(descripcion) = upper(v_row.descripcion) limit 1;
    if v_material_id is null then
      insert into materiales (codigo, descripcion, unidad, categoria_id, estado, descripcion_edp_id, unidad_edp, tipo_conversion)
      values (v_row.codigo, v_row.descripcion, v_row.unidad, v_categoria_id, 'activo', v_nombre_edp_id, v_row.unidad_edp, v_row.tipo_conversion)
      returning id into v_material_id;
    end if;

    -- Ingreso: factor_conversion y cantidad_restante los calcula solo el
    -- trigger fn_trg_ingreso_preparar a partir de ancho/largo.
    insert into ingresos (fecha, material_id, almacen_id, contrato_id, cantidad, ancho, largo, documento_referencia, observacion, usuario_id)
    values (v_fecha, v_material_id, v_almacen_dm2, v_contrato_marco, v_row.cantidad, v_row.ancho, v_row.largo, v_documento, v_observacion, v_luis_vidal)
    returning id into v_ingreso_id;

    -- Línea del vale, ya "Reservado" (cantidad aprobada = lo pedido) — la
    -- reserva + salida de abajo la terminan de pasar a "Entregado".
    insert into vale_detalle (vale_id, material_id, cantidad_solicitada, cantidad_aprobada, estado)
    values (v_vale_id, v_material_id, v_row.cantidad, v_row.cantidad, 'Reservado')
    returning id into v_vale_detalle_id;

    -- Reserva "Activa": a diferencia de ingresos/salidas, insertar en
    -- `reservas` no tiene un trigger que aparte stock solo — eso normalmente
    -- lo hace la función de aprobar línea desde la UI — así que acá se
    -- refleja a mano en cantidad_reservada antes de la salida de abajo.
    insert into reservas (vale_detalle_id, material_id, almacen_id, frente_id, contrato_id, cantidad, estado, usuario_id)
    values (v_vale_detalle_id, v_material_id, v_almacen_dm2, v_frente_opb, v_contrato_marco, v_row.cantidad, 'Activa', v_luis_vidal)
    returning id into v_reserva_id;

    update stock set cantidad_reservada = cantidad_reservada + v_row.cantidad
    where almacen_id = v_almacen_dm2 and material_id = v_material_id and contrato_id = v_contrato_marco;

    -- Salida: el trigger fn_trg_salida avanza solo la reserva a "Convertida",
    -- la línea del vale a "Entregado" y (cuando ya no quede ninguna
    -- pendiente) el vale completo a "Atendido" — además de descontar el
    -- stock físico y anotar el kardex. ingreso_id solo hace falta cuando el
    -- material tiene conversión (ahí sí hay que saber de qué lote sale, para
    -- calcular los m2/ml reales — fn_trg_salida_preparar lo exige).
    insert into salidas (fecha, material_id, almacen_id, contrato_id, cantidad, frente_id, vale_detalle_id, reserva_id, usuario_id, observacion, ingreso_id)
    values (
      v_fecha, v_material_id, v_almacen_dm2, v_contrato_marco, v_row.cantidad, v_frente_opb,
      v_vale_detalle_id, v_reserva_id, v_luis_vidal, v_observacion,
      case when v_row.tipo_conversion <> 'ninguna' then v_ingreso_id else null end
    );
  end loop;
end $$;

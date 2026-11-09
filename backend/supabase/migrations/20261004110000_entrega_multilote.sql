-- Hoy una entrega de vale solo podía salir de UN lote (ingreso_id) por
-- operación — si el lote más grande disponible no alcanzaba, el almacenero
-- tenía que cerrar el modal y repetir todo el flujo para el resto. El
-- modelo de `salidas` ya estaba pensado para esto (una fila = una entrega
-- de un lote); esta función solo deja insertar varias filas de una sola
-- vez, repartiendo una entrega entre N lotes en una sola operación atómica.
--
-- No reimplementa ninguna validación: cada elemento del array se inserta
-- como una fila normal de `salidas`, y son los triggers ya existentes
-- (fn_trg_salidas_set_contrato, fn_trg_salida_preparar, fn_trg_salida ->
-- fn_avanzar_reserva + fn_registrar_movimiento_stock) los que validan el
-- lote, calculan cantidad_edp, avanzan la reserva y escriben el kardex —
-- igual que si se hubiera hecho un INSERT manual por cada lote, uno por
-- uno. Si cualquier fila falla (un lote sin saldo, o la suma total
-- excediendo el saldo pendiente de la reserva), Postgres aborta la función
-- completa: ninguna fila de esa llamada queda insertada.
--
-- Se usa también para el caso de un solo lote y para materiales que no
-- necesitan lote (tipo_conversion = 'ninguna', ingreso_id = null): el
-- frontend siempre manda un array de 1+ elementos, para no mantener un
-- segundo camino de guardado (insert directo) sincronizado a mano con este.
create or replace function public.fn_registrar_entrega_multilote(
  p_material_id uuid,
  p_almacen_id uuid,
  p_frente_id uuid,
  p_vale_detalle_id uuid,
  p_reserva_id uuid,
  p_usuario_id uuid,
  p_documento_referencia text,
  p_asignaciones jsonb -- [{"ingreso_id": "<uuid o null>", "cantidad": 12.5}, ...]
) returns setof salidas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_cantidad numeric(14,3);
  v_ingreso_id uuid;
  v_fila salidas%rowtype;
begin
  -- Mismo chequeo que exige hoy la política RLS `salidas_insert` para un
  -- insert directo — como esta función es security definer, RLS no se
  -- aplica adentro y hay que repetirlo a mano (verificado contra la base:
  -- la política dice exactamente `has_permission('salidas.registrar_entrega')
  -- AND usuario_id = auth.uid()`).
  if not public.has_permission('salidas.registrar_entrega') then
    raise exception 'No tiene permiso para registrar entregas (salidas.registrar_entrega)';
  end if;
  if p_usuario_id is distinct from auth.uid() then
    raise exception 'usuario_id no coincide con el usuario autenticado';
  end if;

  if p_asignaciones is null or jsonb_typeof(p_asignaciones) <> 'array' or jsonb_array_length(p_asignaciones) = 0 then
    raise exception 'Debe indicar al menos un lote (o un ingreso_id nulo) con su cantidad';
  end if;

  for v_item in select * from jsonb_array_elements(p_asignaciones)
  loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_ingreso_id := nullif(v_item->>'ingreso_id', '')::uuid;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada lote debe tener una cantidad mayor a cero';
    end if;

    -- Deliberadamente sin try/catch: si este INSERT lanza (lote sin saldo,
    -- o la reserva se excede), la excepción se propaga y Postgres revierte
    -- TODO lo insertado en esta llamada.
    insert into salidas (
      material_id, almacen_id, frente_id, vale_detalle_id, reserva_id,
      usuario_id, documento_referencia, cantidad, ingreso_id
    ) values (
      p_material_id, p_almacen_id, p_frente_id, p_vale_detalle_id, p_reserva_id,
      p_usuario_id, p_documento_referencia, v_cantidad, v_ingreso_id
    )
    returning * into v_fila;

    return next v_fila;
  end loop;

  return;
end;
$$;

comment on function public.fn_registrar_entrega_multilote is
  'Registra una entrega de vale repartida entre uno o más lotes (ingresos) en una sola operación atómica. Un INSERT por elemento de p_asignaciones; delega toda la validación (saldo del lote, saldo de la reserva, cálculo de cantidad_edp, kardex) en los triggers existentes de salidas.';

grant execute on function public.fn_registrar_entrega_multilote(uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb) to authenticated;

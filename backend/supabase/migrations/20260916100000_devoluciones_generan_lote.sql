-- El vale VR-0012 (malla triple torsión) quedó bloqueado sin poder
-- entregarse: fn_recibir_devolucion devolvía la parte reutilizable a
-- cantidad_fisica directamente (vía fn_registrar_movimiento_stock), sin
-- crear un lote en `ingresos`. Para materiales que necesitan conversión
-- (tipo_conversion <> 'ninguna' — mallas, geomallas, pernos, medidos por
-- rollo/barra pero convertidos a m2/ml según SU ancho×largo, que varía lote
-- a lote), fn_trg_salida_preparar exige un ingreso_id al momento de la
-- entrega ("De qué lote sale"). Sin un lote, esa entrega queda bloqueada
-- para siempre aunque el stock físico muestre cantidad disponible.
--
-- La corrección: cuando la parte reutilizable de una devolución necesita
-- conversión, se registra como un `ingreso` nuevo (con su propio
-- ancho/largo, que Almacén ingresa al evaluar la devolución) en vez de
-- tocar el stock directamente — el mismo trigger que usan los ingresos
-- normales (trg_ingresos_movimiento) se encarga de sumarlo al stock. Así
-- ese material reutilizable queda como un lote elegible en el selector "De
-- qué lote sale" de la próxima entrega. Para materiales sin conversión seguí
-- igual que antes (movimiento directo sobre el stock).
--
-- De paso se elimina el overload de 3 parámetros (p_devolucion_id,
-- p_almacen_id, p_usuario_id) que quedó como resto de antes de la
-- evaluación parcial (20260915110000) — el frontend ya solo llama a la
-- versión con p_cantidad_reutilizable.
drop function if exists public.fn_recibir_devolucion(uuid, uuid, uuid);

create or replace function public.fn_recibir_devolucion(
  p_devolucion_id uuid,
  p_almacen_id uuid,
  p_usuario_id uuid,
  p_cantidad_reutilizable numeric,
  p_ancho numeric default null,
  p_largo numeric default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_dev devoluciones%rowtype;
  v_cantidad_baja numeric(14,3);
  v_tipo_conversion text;
begin
  if not public.has_permission('devoluciones.recibir_rechazar') then
    raise exception 'No tiene permiso para recibir devoluciones (devoluciones.recibir_rechazar)';
  end if;

  select * into v_dev from devoluciones where id = p_devolucion_id for update;
  if v_dev.id is null then
    raise exception 'devolución % no existe', p_devolucion_id;
  end if;
  if v_dev.estado <> 'Solicitada' then
    raise exception 'La devolución % ya está en estado %, no se puede recibir de nuevo', p_devolucion_id, v_dev.estado;
  end if;
  if p_cantidad_reutilizable is null or p_cantidad_reutilizable < 0 or p_cantidad_reutilizable > v_dev.cantidad then
    raise exception 'La cantidad reutilizable (%) tiene que estar entre 0 y la cantidad devuelta (%)', p_cantidad_reutilizable, v_dev.cantidad;
  end if;

  v_cantidad_baja := v_dev.cantidad - p_cantidad_reutilizable;

  if p_cantidad_reutilizable > 0 then
    select tipo_conversion into v_tipo_conversion from materiales where id = v_dev.material_id;

    if v_tipo_conversion is not null and v_tipo_conversion <> 'ninguna' then
      if p_largo is null or (v_tipo_conversion = 'area' and p_ancho is null) then
        raise exception 'Este material necesita indicar la medida (ancho×largo) de lo que vuelve a stock, para generar su lote.';
      end if;
      insert into ingresos (almacen_id, material_id, contrato_id, cantidad, documento_referencia, usuario_id, observacion, ancho, largo)
      values (
        p_almacen_id, v_dev.material_id, v_dev.contrato_id, p_cantidad_reutilizable,
        'Devolución ' || coalesce(v_dev.numero, v_dev.id::text), p_usuario_id,
        coalesce(v_dev.observacion, 'Devolución evaluada — parte reutilizable'), p_ancho, p_largo
      );
    else
      perform public.fn_registrar_movimiento_stock(
        p_almacen_id, v_dev.material_id, v_dev.contrato_id, p_cantidad_reutilizable, 'ingreso', p_cantidad_reutilizable,
        p_usuario_id, 'devoluciones', v_dev.id, null,
        coalesce(v_dev.observacion, 'Devolución evaluada — parte reutilizable')
      );
    end if;
  end if;

  update devoluciones
    set estado = 'Recibida', almacen_id = p_almacen_id, recibida_por = p_usuario_id, recibida_at = now(),
        cantidad_reutilizable = p_cantidad_reutilizable, cantidad_baja = v_cantidad_baja
  where id = p_devolucion_id;
end;
$function$;

-- Caso real que motivó esto (VR-0098, ver migración 20261016120000): un
-- ajuste positivo de "sinceramiento" sobre un material con conversión
-- (se convierte a m²/ML para el EDP, como mallas, cables y algunos pernos)
-- sumaba al stock agregado pero NUNCA creaba un lote en `ingresos` — las
-- unidades quedaban "atrapadas": contaban para el stock pero no había de
-- dónde entregarlas, porque "Registrar entrega" exige elegir un lote para
-- esos materiales. Mismo bug de fondo que ya se arregló para devoluciones
-- en 20260916100000 (fn_recibir_devolucion) — ahora se aplica el mismo
-- criterio acá: si el ajuste es positivo y el material necesita conversión,
-- se le pide la medida (ancho×largo) y se crea un `ingreso` (el trigger de
-- ingresos ya se encarga de sumarlo al stock) en vez de tocar el stock
-- directo. Igual que en devoluciones, el ajuste en sí queda igual de
-- visible en su propia pestaña — lo único que cambia es que el movimiento
-- de kardex que lo acompaña queda como 'ingreso' (con el lote nuevo) en vez
-- de 'ajuste_positivo', porque ahora es un ingreso real lo que lo respalda.
--
-- Un ajuste NEGATIVO no cambia: sigue sin pedir lote (no hace falta saber
-- de qué lote específico se resta para una merma/corrección hacia abajo).
--
-- Reversible: alter table ajustes drop column ancho; alter table ajustes
-- drop column largo; y recrear fn_trg_ajuste con el cuerpo de
-- 20260908120000 (sin el branch de conversión).
alter table ajustes add column ancho numeric(10,3);
alter table ajustes add column largo numeric(10,3);

create or replace function public.fn_trg_ajuste()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_conversion text;
begin
  if new.tipo = 'positivo' then
    select tipo_conversion into v_tipo_conversion from materiales where id = new.material_id;

    if v_tipo_conversion is not null and v_tipo_conversion <> 'ninguna' then
      if new.largo is null or (v_tipo_conversion = 'area' and new.ancho is null) then
        raise exception 'Este material necesita indicar su medida (ancho×largo) para generar el lote del ajuste.';
      end if;
      insert into ingresos (almacen_id, material_id, contrato_id, cantidad, documento_referencia, usuario_id, observacion, ancho, largo)
      values (
        new.almacen_id, new.material_id, new.contrato_id, new.cantidad,
        'Ajuste positivo (' || new.motivo || ')', new.usuario_id, new.motivo, new.ancho, new.largo
      );
    else
      perform public.fn_registrar_movimiento_stock(
        new.almacen_id, new.material_id, new.contrato_id, new.cantidad, 'ajuste_positivo', new.cantidad,
        new.usuario_id, 'ajustes', new.id, null, new.motivo
      );
    end if;
  else
    perform public.fn_registrar_movimiento_stock(
      new.almacen_id, new.material_id, new.contrato_id, -new.cantidad, 'ajuste_negativo', new.cantidad,
      new.usuario_id, 'ajustes', new.id, null, new.motivo
    );
  end if;
  return new;
end;
$$;

-- Conversión de unidades para el EDP (Estado de Pago): Almacén controla y
-- entrega en su propia unidad (rollos, unidades de anclaje…), pero el
-- cliente exige el EDP en otra (m2 de malla, ml de anclaje). El factor de
-- conversión NO es fijo por material — un rollo de malla puede venir de
-- 2.5×30 en un ingreso y de 2×25 en el siguiente — así que se captura por
-- ingreso (cada ingreso es, en los hechos, un lote con su propio factor), y
-- al momento de la entrega el almacenero elige de qué lote sale (puede
-- registrar varias entregas parciales contra la misma reserva, cada una de
-- un lote distinto, para "partir" una salida entre lotes).
--
-- Deliberadamente NO alcanza a `ajustes` ni a `reservas`: los ajustes
-- corrigen el conteo agregado (no hace falta que sepan de qué lote), y la
-- reserva sigue siendo "aparta N unidades" en abstracto — el lote se elige
-- recién cuando el material físicamente sale (`salidas`), que es el punto
-- natural donde existe un rollo/anclaje concreto de por medio.

-- ---------------------------------------------------------------------------
-- 1. Catálogo: qué características pide el ingreso de este material.
-- ---------------------------------------------------------------------------
alter table materiales add column tipo_conversion text not null default 'ninguna'
  check (tipo_conversion in ('ninguna', 'area', 'longitud'));

comment on column materiales.tipo_conversion is
  'ninguna: no aplica. area: el ingreso pide ancho×largo (ej. rollos de malla, factor = m2 por rollo). longitud: el ingreso pide largo (ej. barras de anclaje, factor = ml por unidad).';

-- ---------------------------------------------------------------------------
-- 2. Ingreso = lote: sus propias características, su propio factor, y
--    cuánto le queda por entregar.
-- ---------------------------------------------------------------------------
alter table ingresos add column ancho numeric(10,3);
alter table ingresos add column largo numeric(10,3);
alter table ingresos add column factor_conversion numeric(14,4);
alter table ingresos add column cantidad_restante numeric(14,3);

-- Los ingresos ya existentes nacen sin este dato (la columna es nueva). Se
-- los marca como si tuvieran todavía toda su cantidad original disponible
-- — no hay forma de saber retroactivamente cuánto de CADA ingreso puntual
-- ya salió, porque las salidas viejas no guardaban de qué ingreso venían.
-- Esto puede sobrestimar el saldo de un lote viejo en particular, pero
-- nunca el stock total (`stock.cantidad_disponible`, que no cambia acá y
-- sigue siendo quien de verdad limita cuánto se puede entregar): lo único
-- que se apoya en `cantidad_restante` es qué lotes se pueden elegir al
-- entregar, no cuánto stock hay en total.
update ingresos set cantidad_restante = cantidad where cantidad_restante is null;

-- No exige las medidas a nivel base de datos (a propósito): la carga
-- masiva de ingresos desde Excel (ImportarIngresosModal, stock inicial) no
-- tiene columnas de ancho/largo y seguiría funcionando igual que hoy —
-- esos ingresos simplemente quedan sin factor de conversión (sus salidas
-- no van a poder elegirlos como lote si el material pide conversión). El
-- formulario interactivo (IngresoFormModal) sí exige las medidas del lado
-- del cliente antes de enviar.
create or replace function public.fn_trg_ingreso_preparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_conversion text;
begin
  new.cantidad_restante := new.cantidad;

  select tipo_conversion into v_tipo_conversion from materiales where id = new.material_id;

  if v_tipo_conversion = 'area' and new.ancho is not null and new.largo is not null then
    new.factor_conversion := new.ancho * new.largo;
  elsif v_tipo_conversion = 'longitud' and new.largo is not null then
    new.factor_conversion := new.largo;
  else
    new.factor_conversion := null;
  end if;

  return new;
end;
$$;

-- BEFORE INSERT: corre antes que trg_ingresos_movimiento (AFTER INSERT, ya
-- existente) — no lo reemplaza, solo completa estas columnas nuevas antes
-- de que la fila quede escrita.
create trigger trg_ingresos_preparar
  before insert on ingresos
  for each row execute function public.fn_trg_ingreso_preparar();

-- ---------------------------------------------------------------------------
-- 3. Salida: de qué lote sale, y cuánto representa en la unidad del EDP.
-- ---------------------------------------------------------------------------
alter table salidas add column ingreso_id uuid references ingresos(id);
alter table salidas add column cantidad_edp numeric(14,4);

create or replace function public.fn_trg_salida_preparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_conversion text;
  v_ingreso ingresos%rowtype;
begin
  select tipo_conversion into v_tipo_conversion from materiales where id = new.material_id;

  if v_tipo_conversion is null or v_tipo_conversion = 'ninguna' then
    new.cantidad_edp := null;
    return new;
  end if;

  if new.ingreso_id is null then
    raise exception 'Este material necesita indicar de qué ingreso (lote) sale, para calcular la cantidad del EDP.';
  end if;

  select * into v_ingreso from ingresos where id = new.ingreso_id for update;

  if v_ingreso.id is null then
    raise exception 'El ingreso (lote) % no existe', new.ingreso_id;
  end if;
  if v_ingreso.material_id <> new.material_id or v_ingreso.almacen_id <> new.almacen_id then
    raise exception 'El lote elegido no corresponde a este material o almacén';
  end if;
  if new.cantidad > v_ingreso.cantidad_restante then
    raise exception 'La salida (%) excede lo que queda de ese lote (%)', new.cantidad, v_ingreso.cantidad_restante;
  end if;

  new.cantidad_edp := new.cantidad * v_ingreso.factor_conversion;

  update ingresos set cantidad_restante = cantidad_restante - new.cantidad where id = new.ingreso_id;

  return new;
end;
$$;

-- BEFORE INSERT: corre antes que trg_salidas_movimiento (AFTER INSERT, ya
-- existente).
create trigger trg_salidas_preparar
  before insert on salidas
  for each row execute function public.fn_trg_salida_preparar();

-- El reporte EDP en el frontend consulta `salidas` directamente (mismo
-- patrón que "Salidas por frente" en Reportes) y agrupa/filtra por fecha en
-- el cliente — no hace falta una vista nueva, y la política salidas_select
-- ya existente (kardex.ver) alcanza.

-- El stock mínimo deja de ser una cantidad fija (ej. "avisa cuando queden
-- menos de 50 sacos") y pasa a ser un PORCENTAJE del último ingreso de ese
-- material a ese almacén (ej. 0.2 = 20%: si el último lote que entró fue de
-- 100 sacos, el mínimo de hoy es 20 sacos — no un número que alguien tiene
-- que ir actualizando a mano cada vez que cambia el tamaño de lote habitual).
--
-- `materiales.stock_minimo_default` y `stock.stock_minimo` (el override por
-- almacén) NO se borran: quedan sin uso desde esta migración en adelante,
-- pero borrar la columna es una operación destructiva que no hace falta para
-- este cambio — si algún día se quiere limpiar del todo, es una migración
-- aparte.
alter table materiales add column stock_minimo_pct numeric(5,4);

-- "corrige todos": todo material existente arranca en 20%, el umbral que
-- pidió el usuario como estándar.
update materiales set stock_minimo_pct = 0.2;

alter table materiales alter column stock_minimo_pct set default 0.2;
alter table materiales alter column stock_minimo_pct set not null;

-- ---------------------------------------------------------------------------
-- Vista con el mínimo ya calculado: una sola fuente de verdad para las
-- alertas (fn_evaluar_alertas) y el panel de stock crítico del dashboard, en
-- vez de repetir "buscar el ingreso más reciente de este material en este
-- almacén" en dos lugares que podrían terminar diciendo cosas distintas.
-- Como es una vista normal (no security definer), la política RLS de
-- `stock`/`materiales`/`ingresos` se sigue aplicando tal cual a quien la
-- consulte — no es una puerta trasera.
-- ---------------------------------------------------------------------------
-- `stock` está partido por (almacén, material, CONTRATO) desde
-- 20260908120000 — el mismo material en el mismo almacén puede tener una
-- fila para el contrato Marco y otra para otro contrato. `ingresos` también
-- lleva contrato_id, así que el "último ingreso" tiene que buscarse con los
-- tres campos calzando, o se podría tomar por error el lote de un contrato
-- distinto al de la fila de stock que se está evaluando.
create or replace view stock_con_minimo as
select
  s.almacen_id,
  a.codigo as almacen_codigo,
  a.nombre as almacen_nombre,
  s.material_id,
  m.codigo as material_codigo,
  m.descripcion as material_descripcion,
  m.unidad as material_unidad,
  s.contrato_id,
  s.cantidad_fisica,
  s.cantidad_reservada,
  s.cantidad_disponible,
  m.stock_minimo_pct,
  ui.cantidad as ultimo_ingreso_cantidad,
  ui.fecha as ultimo_ingreso_fecha,
  case
    when ui.cantidad is not null then round(m.stock_minimo_pct * ui.cantidad, 3)
    else null
  end as stock_minimo_efectivo
from stock s
join materiales m on m.id = s.material_id
join almacenes a on a.id = s.almacen_id
left join lateral (
  select i.cantidad, i.fecha
  from ingresos i
  where i.material_id = s.material_id and i.almacen_id = s.almacen_id and i.contrato_id = s.contrato_id
  order by i.fecha desc, i.created_at desc
  limit 1
) ui on true;

grant select on stock_con_minimo to authenticated;

-- ---------------------------------------------------------------------------
-- fn_evaluar_alertas: el bloque de stock bajo/agotado ahora lee el mínimo
-- efectivo de la vista en vez de coalesce(stock.stock_minimo,
-- materiales.stock_minimo_default). Sin ingreso registrado todavía para ese
-- material+almacén no hay lote de referencia, así que no se genera alerta
-- (stock_minimo_efectivo sale null y la fila no entra en el where).
-- ---------------------------------------------------------------------------
create or replace function public.fn_evaluar_alertas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_umbral_riesgo numeric;
  v_dias_reserva int;
begin
  select (valor #>> '{}')::numeric into v_umbral_riesgo
    from configuracion where clave = 'umbral_riesgo_sobreconsumo';
  select (valor #>> '{}')::int into v_dias_reserva
    from configuracion where clave = 'dias_reserva_prolongada';

  -- Stock bajo / agotado
  insert into alertas (tipo, nivel, material_id, almacen_id, mensaje)
  select
    case when scm.cantidad_disponible <= 0 then 'stock_agotado' else 'stock_bajo' end,
    case when scm.cantidad_disponible <= 0 then 'critica' else 'advertencia' end,
    scm.material_id, scm.almacen_id,
    format(
      'Stock disponible (%s) por debajo del %s%% del último ingreso (%s).',
      scm.cantidad_disponible, scm.stock_minimo_pct * 100, scm.ultimo_ingreso_cantidad
    )
  from stock_con_minimo scm
  where scm.stock_minimo_efectivo is not null
    and scm.cantidad_disponible <= scm.stock_minimo_efectivo
    and not exists (
      select 1 from alertas a
      where a.material_id = scm.material_id and a.almacen_id = scm.almacen_id
        and a.tipo in ('stock_bajo', 'stock_agotado') and a.estado = 'activa'
    );

  -- Riesgo de sobreconsumo / sobreconsumo (Procura)
  insert into alertas (tipo, nivel, material_id, frente_id, mensaje)
  select
    case when pvc.porcentaje_consumo >= 100 then 'sobreconsumo' else 'riesgo_sobreconsumo' end,
    case when pvc.porcentaje_consumo >= 100 then 'critica' else 'advertencia' end,
    pvc.material_id, pvc.frente_id,
    format('Consumo al %s%% de lo previsto en Procura.', pvc.porcentaje_consumo)
  from procura_vs_consumo pvc
  where pvc.porcentaje_consumo is not null
    and pvc.porcentaje_consumo >= v_umbral_riesgo
    and not exists (
      select 1 from alertas a
      where a.material_id = pvc.material_id and a.frente_id = pvc.frente_id
        and a.tipo in ('riesgo_sobreconsumo', 'sobreconsumo') and a.estado = 'activa'
    );

  -- Material no previsto: hay reserva activa o salida para un material+frente
  -- sin metrado vigente.
  insert into alertas (tipo, nivel, material_id, frente_id, mensaje)
  select distinct 'material_no_previsto', 'advertencia', x.material_id, x.frente_id,
    'Existe consumo o reserva para un material sin metrado Procura vigente en este frente.'
  from (
    select material_id, frente_id from reservas where estado in ('Activa', 'Parcial')
    union
    select material_id, frente_id from salidas
  ) x
  where not exists (
    select 1 from metrados_procura mp
    where mp.material_id = x.material_id and mp.frente_id = x.frente_id and mp.vigente = true
  )
  and not exists (
    select 1 from alertas a
    where a.material_id = x.material_id and a.frente_id = x.frente_id
      and a.tipo = 'material_no_previsto' and a.estado = 'activa'
  );

  -- Reserva prolongada
  insert into alertas (tipo, nivel, material_id, frente_id, mensaje)
  select 'reserva_prolongada', 'advertencia', r.material_id, r.frente_id,
    format('Reserva activa desde hace más de %s días sin completarse.', v_dias_reserva)
  from reservas r
  where r.estado in ('Activa', 'Parcial')
    and r.created_at < now() - (v_dias_reserva || ' days')::interval
    and not exists (
      select 1 from alertas a
      where a.material_id = r.material_id and a.frente_id = r.frente_id
        and a.tipo = 'reserva_prolongada' and a.estado = 'activa'
    );
end;
$$;

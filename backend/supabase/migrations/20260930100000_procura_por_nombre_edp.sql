-- Procura pasa a trabajar por NOMBRE EDP, no por material puntual.
--
-- POR QUÉ: el metrado real que entrega Planeamiento (ver ejemplo real: "4 ML
-- de BARRA HELICOIDAL D25MM") no distingue con qué longitud puntual se va a
-- cubrir esa cantidad — un perno de 3m, o dos de 1.5m, da igual, mientras no
-- se pase el total en ML. El catálogo ya modela esto: PERNO.B25L1.5, L2, L3,
-- L4 y L5 son longitudes distintas del MISMO perno D25mm, y las cinco ya
-- comparten el mismo `descripcion_edp_id` (nombres_edp), con
-- `tipo_conversion = 'longitud'` para convertirse solas a ML. Lo único que
-- faltaba era que Procura usara esa agrupación en vez de material_id.
--
-- metrados_procura no tenía ninguna fila real todavía (tabla vacía,
-- verificado antes de escribir esto: 0 filas), así que este cambio reemplaza
-- material_id por descripcion_edp_id directamente, sin backfill que hacer.
-- Se verificó también que ningún nombre_edp mezcla materiales con distinta
-- unidad_edp o tipo_conversion — agruparlos es seguro.

-- La vista vieja todavía depende de material_id — hay que quitarla de en
-- medio antes de poder tocar la columna (se vuelve a crear más abajo).
drop view if exists procura_vs_consumo;

alter table metrados_procura drop constraint metrados_procura_material_id_fkey;
alter table metrados_procura drop column material_id;
alter table metrados_procura add column descripcion_edp_id uuid not null references nombres_edp(id);

drop index if exists idx_metrados_frente_material;
create index idx_metrados_frente_edp on metrados_procura(frente_id, descripcion_edp_id, vigente);

create or replace function public.fn_versionar_metrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_version int;
begin
  select coalesce(max(version), 0) into v_max_version
  from metrados_procura
  where frente_id = new.frente_id and descripcion_edp_id = new.descripcion_edp_id;

  if v_max_version > 0 then
    new.version := v_max_version + 1;
    update metrados_procura
      set vigente = false
    where frente_id = new.frente_id and descripcion_edp_id = new.descripcion_edp_id and vigente = true;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- procura_vs_consumo: se agrega por (frente, nombre EDP). Cada movimiento
-- real (reserva/solicitud/entrega/devolución/transferencia) se convierte a la
-- unidad EDP de SU material antes de sumarlo al grupo — un perno de 3m
-- entregado cuenta 3 ML, uno de 1.5m cuenta 1.5 ML, y los dos suman contra el
-- mismo límite, sin importar cuál longitud puntual se pidió.
--
-- El factor de conversión de cada material sale de su ingreso más reciente
-- (mismo criterio que ya usa el export de stock de Almacén — ver
-- almacenService.js listarStockParaExportar). Un material sin ingresos
-- todavía usa 1: no puede tener movimientos reales que dependan de ese
-- factor, porque sin ingreso no hay stock, y sin stock no hay salida ni
-- reserva posible.
-- ---------------------------------------------------------------------------
create or replace view procura_vs_consumo as
with factor_por_material as (
  select
    m.id as material_id,
    m.descripcion_edp_id,
    coalesce(
      (select i.factor_conversion from ingresos i
       where i.material_id = m.id and i.factor_conversion is not null
       order by i.fecha desc, i.created_at desc limit 1),
      1
    ) as factor
  from materiales m
  where m.descripcion_edp_id is not null
),
base as (
  select
    mp.frente_id,
    mp.descripcion_edp_id,
    ne.nombre as nombre_edp,
    mp.cantidad_contractual,
    mp.cantidad_procura,
    (mp.cantidad_contractual + mp.cantidad_procura) as cantidad_prevista,
    mp.unidad,
    coalesce(r.reservado, 0) as cantidad_reservada,
    coalesce(sol.solicitado, 0) as cantidad_solicitada,
    greatest(
      ((coalesce(s.entregado, 0) - coalesce(d.devuelto, 0)) - coalesce(t_out.transferido, 0)) + coalesce(t_in.transferido, 0),
      0
    ) as cantidad_entregada
  from metrados_procura mp
  join nombres_edp ne on ne.id = mp.descripcion_edp_id
  left join (
    select r.frente_id, fpm.descripcion_edp_id, sum((r.cantidad - r.cantidad_entregada) * fpm.factor) as reservado
    from reservas r
    join factor_por_material fpm on fpm.material_id = r.material_id
    where r.estado in ('Activa', 'Parcial')
    group by r.frente_id, fpm.descripcion_edp_id
  ) r on r.frente_id = mp.frente_id and r.descripcion_edp_id = mp.descripcion_edp_id
  left join (
    select v.frente_id, fpm.descripcion_edp_id, sum(vd.cantidad_solicitada * fpm.factor) as solicitado
    from vale_detalle vd
    join vales v on v.id = vd.vale_id
    join factor_por_material fpm on fpm.material_id = vd.material_id
    where vd.estado <> 'Cancelado'
    group by v.frente_id, fpm.descripcion_edp_id
  ) sol on sol.frente_id = mp.frente_id and sol.descripcion_edp_id = mp.descripcion_edp_id
  left join (
    select s.frente_id, fpm.descripcion_edp_id, sum(s.cantidad * fpm.factor) as entregado
    from salidas s
    join factor_por_material fpm on fpm.material_id = s.material_id
    group by s.frente_id, fpm.descripcion_edp_id
  ) s on s.frente_id = mp.frente_id and s.descripcion_edp_id = mp.descripcion_edp_id
  left join (
    select dv.frente_id, fpm.descripcion_edp_id, sum(dv.cantidad * fpm.factor) as devuelto
    from devoluciones dv
    join factor_por_material fpm on fpm.material_id = dv.material_id
    where dv.estado = 'Recibida'
    group by dv.frente_id, fpm.descripcion_edp_id
  ) d on d.frente_id = mp.frente_id and d.descripcion_edp_id = mp.descripcion_edp_id
  left join (
    select t.frente_origen_id as frente_id, fpm.descripcion_edp_id, sum(t.cantidad * fpm.factor) as transferido
    from transferencias t
    join factor_por_material fpm on fpm.material_id = t.material_id
    where t.estado = 'Confirmada'
    group by t.frente_origen_id, fpm.descripcion_edp_id
  ) t_out on t_out.frente_id = mp.frente_id and t_out.descripcion_edp_id = mp.descripcion_edp_id
  left join (
    select t.frente_destino_id as frente_id, fpm.descripcion_edp_id, sum(t.cantidad * fpm.factor) as transferido
    from transferencias t
    join factor_por_material fpm on fpm.material_id = t.material_id
    where t.estado = 'Confirmada'
    group by t.frente_destino_id, fpm.descripcion_edp_id
  ) t_in on t_in.frente_id = mp.frente_id and t_in.descripcion_edp_id = mp.descripcion_edp_id
  where mp.vigente = true
)
select
  frente_id,
  descripcion_edp_id,
  nombre_edp,
  cantidad_contractual,
  cantidad_procura,
  cantidad_prevista,
  unidad,
  cantidad_reservada,
  cantidad_solicitada,
  cantidad_entregada,
  cantidad_prevista - cantidad_entregada - cantidad_reservada as saldo,
  case when cantidad_prevista > 0
    then round(cantidad_entregada / cantidad_prevista * 100, 1)
    else null
  end as porcentaje_consumo,
  cantidad_entregada - cantidad_prevista as desviacion
from base
where public.has_permission('procura.ver_comparacion')
  and (not public.es_supervisor() or frente_id = public.current_frente_id());

-- ---------------------------------------------------------------------------
-- Alertas de Procura: ahora identifican el grupo EDP, no un material puntual
-- (un grupo cubre varios materiales, así que ya no hay un único material_id
-- que tenga sentido). material_id queda null para estas dos; el nombre del
-- grupo va escrito directo en el mensaje, así que la pantalla de Alertas
-- (que ya muestra `a.materiales?.codigo` solo si existe) no necesita cambios.
-- "Stock bajo/agotado" y "Reserva prolongada" siguen siendo por material
-- puntual, sin cambios — no son comparaciones contra el metrado de Procura.
-- ---------------------------------------------------------------------------
alter table alertas add column descripcion_edp_id uuid references nombres_edp(id);

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

  -- Riesgo de sobreconsumo / sobreconsumo (Procura), por grupo EDP.
  insert into alertas (tipo, nivel, descripcion_edp_id, frente_id, mensaje)
  select
    case when pvc.porcentaje_consumo >= 100 then 'sobreconsumo' else 'riesgo_sobreconsumo' end,
    case when pvc.porcentaje_consumo >= 100 then 'critica' else 'advertencia' end,
    pvc.descripcion_edp_id, pvc.frente_id,
    format('Consumo al %s%% de lo previsto en Procura para %s.', pvc.porcentaje_consumo, pvc.nombre_edp)
  from procura_vs_consumo pvc
  where pvc.porcentaje_consumo is not null
    and pvc.porcentaje_consumo >= v_umbral_riesgo
    and not exists (
      select 1 from alertas a
      where a.descripcion_edp_id = pvc.descripcion_edp_id and a.frente_id = pvc.frente_id
        and a.tipo in ('riesgo_sobreconsumo', 'sobreconsumo') and a.estado = 'activa'
    );

  -- Material no previsto: hay reserva activa, salida, o transferencia
  -- confirmada hacia un GRUPO EDP sin metrado vigente en ese frente.
  insert into alertas (tipo, nivel, descripcion_edp_id, frente_id, mensaje)
  select distinct 'material_no_previsto', 'advertencia', x.descripcion_edp_id, x.frente_id,
    format('Existe consumo o reserva de %s sin metrado Procura vigente en este frente.', ne.nombre)
  from (
    select m.descripcion_edp_id, r.frente_id from reservas r join materiales m on m.id = r.material_id where r.estado in ('Activa', 'Parcial')
    union
    select m.descripcion_edp_id, s.frente_id from salidas s join materiales m on m.id = s.material_id
    union
    select m.descripcion_edp_id, t.frente_destino_id as frente_id from transferencias t join materiales m on m.id = t.material_id where t.estado = 'Confirmada'
  ) x
  join nombres_edp ne on ne.id = x.descripcion_edp_id
  where x.descripcion_edp_id is not null
    and not exists (
      select 1 from metrados_procura mp
      where mp.descripcion_edp_id = x.descripcion_edp_id and mp.frente_id = x.frente_id and mp.vigente = true
    )
    and not exists (
      select 1 from alertas a
      where a.descripcion_edp_id = x.descripcion_edp_id and a.frente_id = x.frente_id
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

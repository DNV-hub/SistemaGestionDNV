-- "material_no_previsto" deja de generarse (y las que ya existen se
-- resuelven) para frentes paralizados o cerrados — si el frente ya no va a
-- seguir trabajando, no importa que le falte un metrado. Solo interesa para
-- frentes que siguen o van a estar en operación (activo, planificado o
-- próximo a iniciar).
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
  -- confirmada hacia un GRUPO EDP sin metrado vigente en ese frente — y ese
  -- frente sigue en operación (no paralizado ni cerrado).
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
  join frentes f on f.id = x.frente_id
  where x.descripcion_edp_id is not null
    and f.estado not in ('paralizado', 'cerrado')
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

-- Limpieza de lo ya existente, en dos pasos:

-- 1. Resolver las "material_no_previsto" activas de frentes que ya no
--    califican (paralizados/cerrados).
update alertas a
set estado = 'resuelta', resuelta_at = now()
from frentes f
where a.tipo = 'material_no_previsto'
  and a.estado = 'activa'
  and a.frente_id = f.id
  and f.estado in ('paralizado', 'cerrado');

-- 2. Duplicados: la reparación anterior (20260930120000) unió varias
--    alertas viejas por material puntual en el mismo grupo EDP, y algunas
--    coincidieron en (frente, grupo) — se queda la más antigua de cada
--    combinación y el resto se marca resuelta.
with duplicadas as (
  select id,
    row_number() over (
      partition by frente_id, descripcion_edp_id
      order by created_at asc
    ) as posicion
  from alertas
  where tipo = 'material_no_previsto' and estado = 'activa'
)
update alertas a
set estado = 'resuelta', resuelta_at = now()
from duplicadas d
where a.id = d.id and d.posicion > 1;

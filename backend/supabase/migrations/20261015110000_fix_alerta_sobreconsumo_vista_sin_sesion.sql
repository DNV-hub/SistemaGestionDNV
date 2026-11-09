-- Bug más profundo del que parecía: la migración anterior (20261015100000)
-- seguía consultando procura_vs_consumo para la alerta de sobreconsumo, y esa
-- vista trae el permiso INCRUSTADO en su propio WHERE (`has_permission(...)`,
-- ver 20260930100000_procura_por_nombre_edp.sql). `has_permission()` depende
-- de auth.uid(), que solo existe dentro de un request autenticado real — un
-- cron job o una migración no tienen sesión, así que esa condición siempre
-- da falso ahí y la vista devuelve 0 filas. Resultado: la alerta de
-- sobreconsumo/riesgo_sobreconsumo nunca pudo dispararse sola desde el
-- 30/09 (cuando la vista empezó a vivir agrupada por nombre EDP), ni antes
-- ni después del cambio de ayer — se verificó corriendo fn_evaluar_alertas()
-- a mano y comprobando que la alerta esperada (CLIP T3 en OLC) seguía sin
-- aparecer.
--
-- La corrección real: fn_evaluar_alertas() calcula el consumo comprometido
-- (entregado + reservado, por grupo EDP) con los MISMOS joins que usa la
-- vista, pero en línea, sin pasar por ella — mismo criterio que ya usa el
-- bloque de "material_no_previsto" un poco más abajo, que por esta misma
-- razón siempre consultó las tablas directo en vez de la vista.
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

  -- Riesgo de sobreconsumo / sobreconsumo (Procura), por grupo EDP. Mismos
  -- joins que procura_vs_consumo (factor por material, reservas activas,
  -- entregas netas de devoluciones/transferencias) pero calculados acá
  -- mismo, sin pasar por la vista con permiso incrustado, y basados en lo ya
  -- COMPROMETIDO (entregado + reservado) para avisar apenas se aprueba un
  -- vale que rompe el previsto, no recién cuando Almacén entrega.
  insert into alertas (tipo, nivel, descripcion_edp_id, frente_id, mensaje)
  select
    case when pct_comprometido >= 100 then 'sobreconsumo' else 'riesgo_sobreconsumo' end,
    case when pct_comprometido >= 100 then 'critica' else 'advertencia' end,
    descripcion_edp_id, frente_id,
    format('Lo aprobado/reservado + entregado de %s ya está al %s%% de lo previsto en Procura.', nombre_edp, pct_comprometido)
  from (
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
    )
    select
      mp.frente_id, mp.descripcion_edp_id, ne.nombre as nombre_edp,
      (mp.cantidad_contractual + mp.cantidad_procura) as cantidad_prevista,
      round(
        (
          coalesce(r.reservado, 0)
          + greatest(((coalesce(s.entregado, 0) - coalesce(d.devuelto, 0)) - coalesce(t_out.transferido, 0)) + coalesce(t_in.transferido, 0), 0)
        ) / nullif(mp.cantidad_contractual + mp.cantidad_procura, 0) * 100,
        1
      ) as pct_comprometido
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
  ) x
  where pct_comprometido is not null
    and pct_comprometido >= v_umbral_riesgo
    and not exists (
      select 1 from alertas a
      where a.descripcion_edp_id = x.descripcion_edp_id and a.frente_id = x.frente_id
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

-- Corre una vez ahora, para no esperar al próximo tick de pg_cron.
select public.fn_evaluar_alertas();

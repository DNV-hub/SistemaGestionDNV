-- Bug real encontrado: la alerta de "riesgo de sobreconsumo"/"sobreconsumo"
-- solo miraba procura_vs_consumo.porcentaje_consumo, que se calcula nada más
-- con lo ENTREGADO físicamente (ver 20260822101100_metrados_procura.sql).
-- Un vale puede aprobarse y reservarse (el saldo de Procura ya cae, incluso
-- en negativo) sin que Almacén haya entregado todavía una sola unidad — y
-- mientras eso no pase, la alerta no se disparaba, aunque el compromiso real
-- ya hubiera superado lo previsto. Caso real: CLIP T3 en OLC, previsto 446,
-- vale aprobado por 300 encima de 250 ya consumidos (saldo -104), 0%
-- "consumido" según la vista (nada entregado todavía) — cero alertas.
--
-- La corrección no toca procura_vs_consumo.porcentaje_consumo (lo sigue
-- usando el resto de la app para mostrar "% consumido" = entregado real, y
-- cambiarle el significado ahí afectaría pantallas que no pidieron este
-- cambio) — el porcentaje de la ALERTA se recalcula acá mismo a partir de
-- `saldo` (que sí descuenta reservas) y `cantidad_prevista`, ambos ya
-- expuestos por la vista.
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

  -- Riesgo de sobreconsumo / sobreconsumo (Procura), por grupo EDP. Se basa
  -- en lo ya comprometido de verdad (entregado + reservado, vía `saldo`),
  -- no solo en lo entregado — para que aprobar un vale que ya rompe el
  -- previsto avise de inmediato, sin esperar a que Almacén entregue.
  insert into alertas (tipo, nivel, descripcion_edp_id, frente_id, mensaje)
  select
    case when pct_comprometido >= 100 then 'sobreconsumo' else 'riesgo_sobreconsumo' end,
    case when pct_comprometido >= 100 then 'critica' else 'advertencia' end,
    descripcion_edp_id, frente_id,
    format('Lo aprobado/reservado + entregado de %s ya está al %s%% de lo previsto en Procura.', nombre_edp, pct_comprometido)
  from (
    select
      pvc.descripcion_edp_id, pvc.frente_id, pvc.nombre_edp,
      round((pvc.cantidad_prevista - pvc.saldo) / pvc.cantidad_prevista * 100, 1) as pct_comprometido
    from procura_vs_consumo pvc
    where pvc.cantidad_prevista > 0
  ) x
  where pct_comprometido >= v_umbral_riesgo
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

-- Corre una vez ahora: no hace falta esperar al próximo tick de pg_cron
-- para que el caso real (CLIP T3 en OLC) y cualquier otro ya atrasado
-- queden alertados.
select public.fn_evaluar_alertas();

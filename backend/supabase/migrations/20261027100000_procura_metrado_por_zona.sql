-- Metrado de Procura POR ZONA dentro de un frente.
--
-- Un mismo frente (ej. ZCM05) tiene materiales para varias zonas (Zona 2, Zona
-- 3…) en el mismo Excel. Ahora cada fila del metrado lleva su zona ('' = sin
-- zona, el comportamiento de siempre) y la versión se lleva por
-- frente + nombre EDP + zona.
--
-- El consumo real (salidas, reservas, devoluciones, transferencias) NO tiene
-- zona: es del frente. Por eso la comparación Procura vs consumo y las alertas
-- de sobreconsumo SUMAN el metrado de todas las zonas de un mismo nombre EDP
-- (así el consumo no se cuenta dos veces) — el resultado para frentes sin
-- zonas es idéntico al anterior.
-- Reversible: volver a las definiciones de 20260930100000_procura_por_nombre_edp.sql
-- y 20261015110000_fix_alerta_sobreconsumo_vista_sin_sesion.sql; alter table
-- metrados_procura drop column zona.

alter table metrados_procura add column zona text not null default '';

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
  where frente_id = new.frente_id and descripcion_edp_id = new.descripcion_edp_id and zona = new.zona;

  if v_max_version > 0 then
    new.version := v_max_version + 1;
    update metrados_procura
      set vigente = false
    where frente_id = new.frente_id and descripcion_edp_id = new.descripcion_edp_id and zona = new.zona and vigente = true;
  end if;

  return new;
end;
$$;

create or replace view procura_vs_consumo as
 WITH factor_por_material AS (
         SELECT m.id AS material_id,
            m.descripcion_edp_id,
            COALESCE(( SELECT i.factor_conversion
                   FROM ingresos i
                  WHERE i.material_id = m.id AND i.factor_conversion IS NOT NULL
                  ORDER BY i.fecha DESC, i.created_at DESC
                 LIMIT 1), 1::numeric) AS factor
           FROM materiales m
          WHERE m.descripcion_edp_id IS NOT NULL
        ), base AS (
         SELECT mp.frente_id,
            mp.descripcion_edp_id,
            ne.nombre AS nombre_edp,
            mp.cantidad_contractual,
            mp.cantidad_procura,
            mp.cantidad_contractual + mp.cantidad_procura AS cantidad_prevista,
            mp.unidad,
            COALESCE(r.reservado, 0::numeric) AS cantidad_reservada,
            COALESCE(sol.solicitado, 0::numeric) AS cantidad_solicitada,
            GREATEST(COALESCE(s.entregado, 0::numeric) - COALESCE(d.devuelto, 0::numeric) - COALESCE(t_out.transferido, 0::numeric) + COALESCE(t_in.transferido, 0::numeric), 0::numeric) AS cantidad_entregada
           FROM (
            SELECT frente_id, descripcion_edp_id,
                   sum(cantidad_contractual)::numeric(14,3) AS cantidad_contractual,
                   sum(cantidad_procura)::numeric(14,3) AS cantidad_procura,
                   (array_agg(unidad ORDER BY created_at DESC))[1] AS unidad
              FROM metrados_procura
             WHERE vigente = true
             GROUP BY frente_id, descripcion_edp_id
          ) mp
             JOIN nombres_edp ne ON ne.id = mp.descripcion_edp_id
             LEFT JOIN ( SELECT r_1.frente_id,
                    fpm.descripcion_edp_id,
                    sum((r_1.cantidad - r_1.cantidad_entregada) * fpm.factor) AS reservado
                   FROM reservas r_1
                     JOIN factor_por_material fpm ON fpm.material_id = r_1.material_id
                  WHERE r_1.estado = ANY (ARRAY['Activa'::text, 'Parcial'::text])
                  GROUP BY r_1.frente_id, fpm.descripcion_edp_id) r ON r.frente_id = mp.frente_id AND r.descripcion_edp_id = mp.descripcion_edp_id
             LEFT JOIN ( SELECT v.frente_id,
                    fpm.descripcion_edp_id,
                    sum(vd.cantidad_solicitada * fpm.factor) AS solicitado
                   FROM vale_detalle vd
                     JOIN vales v ON v.id = vd.vale_id
                     JOIN factor_por_material fpm ON fpm.material_id = vd.material_id
                  WHERE vd.estado <> 'Cancelado'::text
                  GROUP BY v.frente_id, fpm.descripcion_edp_id) sol ON sol.frente_id = mp.frente_id AND sol.descripcion_edp_id = mp.descripcion_edp_id
             LEFT JOIN ( SELECT s_1.frente_id,
                    fpm.descripcion_edp_id,
                    sum(s_1.cantidad * fpm.factor) AS entregado
                   FROM salidas s_1
                     JOIN factor_por_material fpm ON fpm.material_id = s_1.material_id
                  GROUP BY s_1.frente_id, fpm.descripcion_edp_id) s ON s.frente_id = mp.frente_id AND s.descripcion_edp_id = mp.descripcion_edp_id
             LEFT JOIN ( SELECT dv.frente_id,
                    fpm.descripcion_edp_id,
                    sum(dv.cantidad * fpm.factor) AS devuelto
                   FROM devoluciones dv
                     JOIN factor_por_material fpm ON fpm.material_id = dv.material_id
                  WHERE dv.estado = 'Recibida'::text
                  GROUP BY dv.frente_id, fpm.descripcion_edp_id) d ON d.frente_id = mp.frente_id AND d.descripcion_edp_id = mp.descripcion_edp_id
             LEFT JOIN ( SELECT t.frente_origen_id AS frente_id,
                    fpm.descripcion_edp_id,
                    sum(t.cantidad * fpm.factor) AS transferido
                   FROM transferencias t
                     JOIN factor_por_material fpm ON fpm.material_id = t.material_id
                  WHERE t.estado = 'Confirmada'::text
                  GROUP BY t.frente_origen_id, fpm.descripcion_edp_id) t_out ON t_out.frente_id = mp.frente_id AND t_out.descripcion_edp_id = mp.descripcion_edp_id
             LEFT JOIN ( SELECT t.frente_destino_id AS frente_id,
                    fpm.descripcion_edp_id,
                    sum(t.cantidad * fpm.factor) AS transferido
                   FROM transferencias t
                     JOIN factor_por_material fpm ON fpm.material_id = t.material_id
                  WHERE t.estado = 'Confirmada'::text
                  GROUP BY t.frente_destino_id, fpm.descripcion_edp_id) t_in ON t_in.frente_id = mp.frente_id AND t_in.descripcion_edp_id = mp.descripcion_edp_id
        )
 SELECT frente_id,
    descripcion_edp_id,
    nombre_edp,
    cantidad_contractual,
    cantidad_procura,
    cantidad_prevista,
    unidad,
    cantidad_reservada,
    cantidad_solicitada,
    cantidad_entregada,
    cantidad_prevista - cantidad_entregada - cantidad_reservada AS saldo,
        CASE
            WHEN cantidad_prevista > 0::numeric THEN round(cantidad_entregada / cantidad_prevista * 100::numeric, 1)
            ELSE NULL::numeric
        END AS porcentaje_consumo,
    cantidad_entregada - cantidad_prevista AS desviacion
   FROM base
  WHERE has_permission('procura.ver_comparacion'::text) AND (NOT es_supervisor() OR frente_id = current_frente_id());

CREATE OR REPLACE FUNCTION public.fn_evaluar_alertas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    from (
            select frente_id, descripcion_edp_id,
                   sum(cantidad_contractual)::numeric(14,3) AS cantidad_contractual,
                   sum(cantidad_procura)::numeric(14,3) AS cantidad_procura,
                   (array_agg(unidad ORDER BY created_at DESC))[1] AS unidad
              from metrados_procura
             where vigente = true
             group by frente_id, descripcion_edp_id
          ) mp
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

  -- RDC finalizado sin llegar a SharePoint: 1 hora de margen (el propio
  -- backoff del celular reintenta hasta cada 60 min) para no marcar como
  -- "atascado" algo que todavía está en su reintento normal.
  insert into alertas (tipo, nivel, frente_id, reporte_id, mensaje)
  select 'rdc_sin_sharepoint', 'advertencia', r.frente_id, r.id,
    format(
      'El reporte RDC del %s sigue sin llegar a SharePoint — el celular que lo cerró no terminó de enviarlo. Hay que completarlo a mano.',
      to_char(r.fecha, 'DD/MM/YYYY')
    )
  from rdc_reportes r
  where r.estado = 'Finalizado'
    and r.estado_sharepoint <> 'enviado'
    and r.eliminado_at is null
    and r.created_at < now() - interval '1 hour'
    and not exists (
      select 1 from alertas a
      where a.reporte_id = r.id and a.tipo = 'rdc_sin_sharepoint' and a.estado = 'activa'
    );
end;
$function$;

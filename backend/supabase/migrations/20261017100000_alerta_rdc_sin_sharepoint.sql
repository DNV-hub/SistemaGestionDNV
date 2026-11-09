-- Caso real: el vale... no, el REPORTE RDC de Barrera 5 del 16/10 (Bryan
-- Ventura) quedó "Finalizado" en el Sistema pero nunca llegó a SharePoint
-- (el Excel que de verdad usa la obra). Causa: el envío a SharePoint lo
-- hace el propio celular del supervisor en segundo plano, sin esperar —
-- "Terminado y Enviar" devuelve el control al toque a propósito, para que
-- el supervisor no tenga que quedarse mirando la pantalla. Si cierra la app
-- (o el sistema operativo mata la pestaña en segundo plano) en la ventana
-- entre que terminó el guardado rápido (Supabase) y el envío más pesado
-- (armar el Excel + mandarlo por el webhook), ese envío queda pendiente
-- para siempre — y esa cola vive SOLO en ese celular, ningún otro
-- dispositivo la puede reintentar ni avisar que quedó así.
--
-- Esta migración no arregla esa causa (requeriría mover el envío a
-- SharePoint al servidor, un cambio más grande) — agrega una ALERTA
-- visible en el módulo de Alertas ya existente, para que alguien lo note
-- sin tener que revisar reporte por reporte. Se evalúa junto con las demás
-- (fn_evaluar_alertas, ya corre sola cada hora vía pg_cron) y se resuelve
-- sola en cuanto el reporte finalmente llega a SharePoint (por el mismo
-- celular reabriendo la app, o por alguien completándolo a mano).
alter table alertas add column reporte_id uuid references rdc_reportes(id);

alter table alertas drop constraint alertas_tipo_check;
alter table alertas add constraint alertas_tipo_check check (tipo in (
  'stock_bajo', 'stock_agotado', 'vale_pendiente', 'material_no_previsto',
  'riesgo_sobreconsumo', 'sobreconsumo', 'reserva_prolongada', 'inconsistencia_stock',
  'rdc_sin_sharepoint'
));

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
    case when s.cantidad_disponible <= 0 then 'stock_agotado' else 'stock_bajo' end,
    case when s.cantidad_disponible <= 0 then 'critica' else 'advertencia' end,
    s.material_id, s.almacen_id,
    format('Stock disponible (%s) por debajo del mínimo para este material en este almacén.', s.cantidad_disponible)
  from stock s
  join materiales m on m.id = s.material_id
  where coalesce(s.stock_minimo, m.stock_minimo_default) is not null
    and s.cantidad_disponible <= coalesce(s.stock_minimo, m.stock_minimo_default)
    and not exists (
      select 1 from alertas a
      where a.material_id = s.material_id and a.almacen_id = s.almacen_id
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
$$;

-- Se resuelve sola en cuanto el reporte por fin llega a SharePoint — mismo
-- criterio que fn_resolver_alerta_material_previsto (20260908150000).
create or replace function public.fn_resolver_alerta_rdc_sharepoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado_sharepoint = 'enviado' and old.estado_sharepoint is distinct from 'enviado' then
    update alertas
      set estado = 'resuelta', resuelta_at = now()
    where tipo = 'rdc_sin_sharepoint' and estado = 'activa' and reporte_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_rdc_reportes_resolver_alerta_sharepoint
  after update on rdc_reportes
  for each row execute function public.fn_resolver_alerta_rdc_sharepoint();

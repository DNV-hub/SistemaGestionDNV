create table alertas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'stock_bajo', 'stock_agotado', 'vale_pendiente', 'material_no_previsto',
    'riesgo_sobreconsumo', 'sobreconsumo', 'reserva_prolongada', 'inconsistencia_stock'
  )),
  nivel text not null default 'advertencia' check (nivel in ('info', 'advertencia', 'critica')),
  material_id uuid references materiales(id),
  frente_id uuid references frentes(id),
  almacen_id uuid references almacenes(id),
  vale_id uuid references vales(id),
  mensaje text not null,
  estado text not null default 'activa' check (estado in ('activa', 'resuelta')),
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_por uuid references usuarios(id)
);

create index idx_alertas_estado on alertas(estado);
create index idx_alertas_tipo on alertas(tipo, estado);

-- Evalúa los umbrales configurables (tabla `configuracion`) y genera las
-- alertas que falten. Pensada para un job periódico (Edge Function
-- programada o pg_cron), no para ser llamada desde la UI en cada request.
-- No duplica alertas: solo inserta si no existe ya una activa equivalente.
--
-- 'vale_pendiente' e 'inconsistencia_stock' quedan declaradas en el check
-- de `tipo` para uso futuro; esta primera versión cubre las 6 alertas con
-- regla de umbral clara (spec §9).
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
end;
$$;

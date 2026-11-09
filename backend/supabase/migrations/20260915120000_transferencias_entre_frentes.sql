-- Transferencias entre frentes: hoy, mover un sobrante de un frente a otro
-- exige dos ciclos completos (el supervisor pide una devolución, Almacén la
-- recibe, y DESPUÉS el supervisor pide un vale nuevo para el frente
-- destino) — un paso administrativo de más, porque el material nunca
-- volvió físicamente al almacén: sigue en campo, solo cambia de frente.
--
-- Esto agrega un módulo nuevo, paralelo a Devoluciones (mismo patrón:
-- Supervisor solicita, Almacén confirma en UN solo paso) que:
--   - NO toca `salidas` ni `stock.cantidad_fisica` — el material nunca
--     "sale" del almacén de nuevo ni "entra" tampoco, porque nunca dejó de
--     estar en campo.
--   - SÍ hace que los reportes de consumo por frente (`procura_vs_consumo`,
--     de donde salen "Procura vs consumo" y las alertas de sobreconsumo) le
--     resten al frente de origen y le sumen al de destino — exactamente el
--     efecto de "se devolvió y se volvió a pedir para el otro frente", sin
--     que nadie tenga que tramitarlo dos veces.

-- ---------------------------------------------------------------------------
-- 1. Permisos — mismo patrón de roles que devoluciones.*.
-- ---------------------------------------------------------------------------
insert into permisos (codigo, modulo, descripcion) values
  ('transferencias.crear', 'transferencias', 'Solicitar transferencia de material entre frentes'),
  ('transferencias.ver_propias', 'transferencias', 'Ver las transferencias propias'),
  ('transferencias.ver_todas', 'transferencias', 'Ver todas las transferencias'),
  ('transferencias.confirmar_rechazar', 'transferencias', 'Confirmar o rechazar una transferencia')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = 'transferencias.crear' where r.nombre = 'Supervisor'
union all
select r.id, p.id from roles r join permisos p on p.codigo = 'transferencias.ver_propias' where r.nombre = 'Supervisor'
union all
select r.id, p.id from roles r join permisos p on p.codigo = 'transferencias.confirmar_rechazar' where r.nombre in ('Administrador', 'Almacen', 'Developer')
union all
select r.id, p.id from roles r join permisos p on p.codigo = 'transferencias.ver_todas' where r.nombre in ('Administrador', 'Almacen', 'Developer', 'Planeamiento')
on conflict (rol_id, permiso_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tabla
-- ---------------------------------------------------------------------------
create table transferencias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  material_id uuid not null references materiales(id),
  frente_origen_id uuid not null references frentes(id),
  frente_destino_id uuid not null references frentes(id),
  contrato_id uuid references contratos(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  estado text not null default 'Solicitada' check (estado in ('Solicitada', 'Confirmada', 'Rechazada')),
  supervisor_id uuid not null references usuarios(id),
  observacion text,
  confirmada_por uuid references usuarios(id),
  confirmada_at timestamptz,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_transferencias_frentes_distintos check (frente_origen_id <> frente_destino_id)
);

create index idx_transferencias_supervisor on transferencias(supervisor_id);
create index idx_transferencias_estado on transferencias(estado);
create index idx_transferencias_frente_origen on transferencias(frente_origen_id);
create index idx_transferencias_frente_destino on transferencias(frente_destino_id);

create trigger trg_transferencias_updated_at
  before update on transferencias
  for each row execute function public.set_updated_at();

-- El contrato se deriva del frente de ORIGEN (de dónde sale el material),
-- mismo criterio que ya usa `salidas`/`devoluciones` con su propio frente.
create or replace function public.fn_trg_transferencias_set_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select contrato_id into new.contrato_id from frentes where id = new.frente_origen_id;
  return new;
end;
$$;

create trigger trg_transferencias_set_contrato
  before insert on transferencias
  for each row execute function public.fn_trg_transferencias_set_contrato();

-- ---------------------------------------------------------------------------
-- 3. RLS — igual que devoluciones: select + insert directos nada más: el
--    cambio de estado (Solicitada -> Confirmada/Rechazada) pasa únicamente
--    por las funciones de abajo, que son security definer.
-- ---------------------------------------------------------------------------
grant select, insert on transferencias to authenticated;
alter table transferencias enable row level security;

create policy transferencias_select on transferencias for select
  using (
    (public.has_permission('transferencias.ver_propias') and supervisor_id = auth.uid())
    or public.has_permission('transferencias.ver_todas')
  );

create policy transferencias_insert on transferencias for insert
  with check (public.has_permission('transferencias.crear') and supervisor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Confirmar / rechazar — Almacén resuelve en un solo paso, sin tocar
--    stock ni kardex (a propósito: el material nunca volvió al almacén).
-- ---------------------------------------------------------------------------
create or replace function public.fn_confirmar_transferencia(
  p_transferencia_id uuid,
  p_usuario_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t transferencias%rowtype;
begin
  if not public.has_permission('transferencias.confirmar_rechazar') then
    raise exception 'No tiene permiso para confirmar transferencias (transferencias.confirmar_rechazar)';
  end if;

  select * into v_t from transferencias where id = p_transferencia_id for update;
  if v_t.id is null then
    raise exception 'transferencia % no existe', p_transferencia_id;
  end if;
  if v_t.estado <> 'Solicitada' then
    raise exception 'La transferencia % ya está en estado %, no se puede confirmar de nuevo', p_transferencia_id, v_t.estado;
  end if;

  update transferencias
    set estado = 'Confirmada', confirmada_por = p_usuario_id, confirmada_at = now()
  where id = p_transferencia_id;
end;
$$;

create or replace function public.fn_rechazar_transferencia(
  p_transferencia_id uuid,
  p_motivo text,
  p_usuario_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.has_permission('transferencias.confirmar_rechazar') then
    raise exception 'No tiene permiso para rechazar transferencias (transferencias.confirmar_rechazar)';
  end if;

  select estado into v_estado from transferencias where id = p_transferencia_id for update;
  if v_estado is null then
    raise exception 'transferencia % no existe', p_transferencia_id;
  end if;
  if v_estado <> 'Solicitada' then
    raise exception 'La transferencia % ya está en estado %, no se puede rechazar', p_transferencia_id, v_estado;
  end if;

  update transferencias
    set estado = 'Rechazada', confirmada_por = p_usuario_id, confirmada_at = now(), motivo_rechazo = p_motivo
  where id = p_transferencia_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. procura_vs_consumo: la transferencia resta del origen y suma al
--    destino, exactamente al lado de como ya "devoluciones" resta del
--    consumo entregado — reescrita con un CTE para no repetir la misma
--    expresión de cantidad_entregada cuatro veces (como estaba antes).
-- ---------------------------------------------------------------------------
create or replace view procura_vs_consumo as
with base as (
  select
    mp.frente_id,
    mp.material_id,
    mp.cantidad_contractual,
    mp.cantidad_procura,
    (mp.cantidad_contractual + mp.cantidad_procura) as cantidad_prevista,
    mp.unidad,
    coalesce(r.reservado, 0) as cantidad_reservada,
    coalesce(sol.solicitado, 0) as cantidad_solicitada,
    greatest(
      coalesce(s.entregado, 0) - coalesce(d.devuelto, 0)
        - coalesce(t_out.transferido, 0) + coalesce(t_in.transferido, 0),
      0
    ) as cantidad_entregada
  from metrados_procura mp
  left join (
    select frente_id, material_id, sum(cantidad - cantidad_entregada) as reservado
    from reservas where estado in ('Activa', 'Parcial')
    group by frente_id, material_id
  ) r on r.frente_id = mp.frente_id and r.material_id = mp.material_id
  left join (
    select v.frente_id, vd.material_id, sum(vd.cantidad_solicitada) as solicitado
    from vale_detalle vd
    join vales v on v.id = vd.vale_id
    where vd.estado <> 'Cancelado'
    group by v.frente_id, vd.material_id
  ) sol on sol.frente_id = mp.frente_id and sol.material_id = mp.material_id
  left join (
    select frente_id, material_id, sum(cantidad) as entregado
    from salidas
    group by frente_id, material_id
  ) s on s.frente_id = mp.frente_id and s.material_id = mp.material_id
  left join (
    select frente_id, material_id, sum(cantidad) as devuelto
    from devoluciones
    where estado = 'Recibida'
    group by frente_id, material_id
  ) d on d.frente_id = mp.frente_id and d.material_id = mp.material_id
  left join (
    select frente_origen_id as frente_id, material_id, sum(cantidad) as transferido
    from transferencias where estado = 'Confirmada'
    group by frente_origen_id, material_id
  ) t_out on t_out.frente_id = mp.frente_id and t_out.material_id = mp.material_id
  left join (
    select frente_destino_id as frente_id, material_id, sum(cantidad) as transferido
    from transferencias where estado = 'Confirmada'
    group by frente_destino_id, material_id
  ) t_in on t_in.frente_id = mp.frente_id and t_in.material_id = mp.material_id
  where mp.vigente = true
)
select
  frente_id,
  material_id,
  cantidad_contractual,
  cantidad_procura,
  cantidad_prevista,
  unidad,
  cantidad_reservada,
  cantidad_solicitada,
  cantidad_entregada,
  cantidad_prevista - cantidad_entregada - cantidad_reservada as saldo,
  case when cantidad_prevista > 0 then round(cantidad_entregada / cantidad_prevista * 100, 1) else null end as porcentaje_consumo,
  cantidad_entregada - cantidad_prevista as desviacion
from base
where public.has_permission('procura.ver_comparacion')
  and (not public.es_supervisor() or frente_id = public.current_frente_id());

grant select on procura_vs_consumo to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Alerta "material no previsto": que el frente DESTINO de una
--    transferencia confirmada también dispare la alerta si no tiene
--    metrado vigente — mismo criterio que ya aplica a salidas/reservas.
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

  -- Material no previsto: hay reserva activa, salida, o transferencia
  -- confirmada hacia un material+frente sin metrado vigente.
  insert into alertas (tipo, nivel, material_id, frente_id, mensaje)
  select distinct 'material_no_previsto', 'advertencia', x.material_id, x.frente_id,
    'Existe consumo o reserva para un material sin metrado Procura vigente en este frente.'
  from (
    select material_id, frente_id from reservas where estado in ('Activa', 'Parcial')
    union
    select material_id, frente_id from salidas
    union
    select material_id, frente_destino_id as frente_id from transferencias where estado = 'Confirmada'
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

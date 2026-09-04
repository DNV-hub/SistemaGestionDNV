-- Nunca se edita en sitio: cada cambio inserta una fila nueva con
-- version + 1 y marca la anterior vigente = false (§12 de la spec, §6
-- aprobado). fn_versionar_metrado hace ambas cosas de forma atómica.
create table metrados_procura (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references frentes(id),
  material_id uuid not null references materiales(id),
  unidad text not null,
  cantidad_prevista numeric(14,3) not null check (cantidad_prevista >= 0),
  version int not null default 1,
  vigente boolean not null default true,
  responsable_id uuid not null references usuarios(id),
  observaciones text,
  created_at timestamptz not null default now()
);

create index idx_metrados_frente_material on metrados_procura(frente_id, material_id, vigente);

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
  where frente_id = new.frente_id and material_id = new.material_id;

  if v_max_version > 0 then
    new.version := v_max_version + 1;
    update metrados_procura
      set vigente = false
    where frente_id = new.frente_id and material_id = new.material_id and vigente = true;
  end if;

  return new;
end;
$$;

create trigger trg_metrados_versionar
  before insert on metrados_procura
  for each row execute function public.fn_versionar_metrado();

-- Comparación Procura vs consumo (§4 de docs/MODELO_DATOS_Y_FLUJOS.md).
-- Vista, no tabla: se recalcula en cada consulta a partir del metrado
-- vigente, las reservas activas/parciales y las salidas reales, así nunca
-- queda desactualizada.
create view procura_vs_consumo as
select
  mp.frente_id,
  mp.material_id,
  mp.cantidad_prevista,
  mp.unidad,
  coalesce(r.reservado, 0) as cantidad_reservada,
  coalesce(sol.solicitado, 0) as cantidad_solicitada,
  coalesce(s.entregado, 0) as cantidad_entregada,
  mp.cantidad_prevista - coalesce(s.entregado, 0) - coalesce(r.reservado, 0) as saldo,
  case when mp.cantidad_prevista > 0
    then round(coalesce(s.entregado, 0) / mp.cantidad_prevista * 100, 1)
    else null
  end as porcentaje_consumo,
  coalesce(s.entregado, 0) - mp.cantidad_prevista as desviacion
from metrados_procura mp
left join (
  select frente_id, material_id, sum(cantidad - cantidad_entregada) as reservado
  from reservas
  where estado in ('Activa', 'Parcial')
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
where mp.vigente = true
  -- Autorización embebida en la vista: no depende de si Postgres ejecuta la
  -- vista con los privilegios del dueño o del invocador (RLS "pass-through"
  -- de vistas es ambiguo entre versiones). Almacén tiene
  -- procura.ver_comparacion sin procura.ver, así que esto no puede resolverse
  -- delegando solo en la RLS de metrados_procura — se valida aquí también.
  and public.has_permission('procura.ver_comparacion')
  and (not public.es_supervisor() or mp.frente_id = public.current_frente_id());

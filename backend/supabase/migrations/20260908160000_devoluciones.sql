-- Devolución de material: el supervisor puede devolver material que ya
-- recibió, indicando su estado (bueno / dañado). Espeja el flujo de un vale
-- al revés — el supervisor solicita, Almacén confirma la recepción física
-- antes de que se mueva cualquier stock (igual que Almacén decide el
-- almacén de origen al aprobar un vale, acá decide el almacén de destino al
-- recibir la devolución — el supervisor no lo elige).
--
-- Solo "bueno" vuelve a stock disponible. "Dañado" queda registrado (merma)
-- pero no se puede volver a repartir. Ambos casos reducen el consumo real
-- del frente en la comparación de Procura (ver el update de la vista al
-- final): el material devuelto — sano o dañado — dejó de estar en uso en el
-- frente, así que ya no debe contarse como "entregado".

-- Bug preexistente encontrado al insertar los permisos nuevos de abajo:
-- fn_audit() asume que toda tabla auditada tiene columna `id` (usa
-- `new.id`/`old.id` directo), pero rol_permisos tiene llave compuesta
-- (rol_id, permiso_id) sin columna `id` propia — cualquier insert/update/
-- delete sobre rol_permisos posterior a que existiera trg_audit_rol_permisos
-- fallaba con "record new has no field id". El seed original de
-- 20260822100100 nunca lo notó porque corrió ANTES de que el trigger de
-- auditoría existiera. Se arregla leyendo el id por JSON (null si no
-- existe, en vez de reventar) y permitiendo null en auditoria.registro_id
-- para las tablas de llave compuesta.
alter table auditoria alter column registro_id drop not null;

create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into auditoria (tabla, registro_id, accion, usuario_id, valor_anterior, valor_nuevo)
  values (
    TG_TABLE_NAME,
    coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid),
    TG_OP,
    auth.uid(),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

insert into permisos (codigo, modulo, descripcion) values
  ('devoluciones.crear', 'devoluciones', 'Solicitar devolución de material'),
  ('devoluciones.ver_propias', 'devoluciones', 'Ver las devoluciones propias'),
  ('devoluciones.ver_todas', 'devoluciones', 'Ver todas las devoluciones'),
  ('devoluciones.recibir_rechazar', 'devoluciones', 'Recibir o rechazar una devolución');

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('Administrador', 'devoluciones.ver_todas'), ('Administrador', 'devoluciones.recibir_rechazar'),
  ('Almacen', 'devoluciones.ver_todas'), ('Almacen', 'devoluciones.recibir_rechazar'),
  ('Planeamiento', 'devoluciones.ver_todas'),
  ('Supervisor', 'devoluciones.crear'), ('Supervisor', 'devoluciones.ver_propias')
) as seed(rol_nombre, permiso_codigo)
join roles r on r.nombre = seed.rol_nombre
join permisos p on p.codigo = seed.permiso_codigo;

create table devoluciones (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  material_id uuid not null references materiales(id),
  frente_id uuid not null references frentes(id),
  contrato_id uuid references contratos(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  estado_material text not null check (estado_material in ('bueno', 'danado')),
  estado text not null default 'Solicitada' check (estado in ('Solicitada', 'Recibida', 'Rechazada')),
  supervisor_id uuid not null references usuarios(id),
  observacion text,
  -- Lo decide Almacén al recibir (igual que el almacén de una reserva), no
  -- el supervisor al solicitar.
  almacen_id uuid references almacenes(id),
  recibida_por uuid references usuarios(id),
  recibida_at timestamptz,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_devoluciones_updated_at
  before update on devoluciones
  for each row execute function public.set_updated_at();

create index idx_devoluciones_supervisor on devoluciones(supervisor_id);
create index idx_devoluciones_estado on devoluciones(estado);
create index idx_devoluciones_frente on devoluciones(frente_id);

-- El contrato nunca lo elige nadie a mano: se deriva del frente, igual que
-- en salidas (fn_trg_salidas_set_contrato).
create or replace function public.fn_trg_devoluciones_set_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select contrato_id into new.contrato_id from frentes where id = new.frente_id;
  return new;
end;
$$;

create trigger trg_devoluciones_set_contrato
  before insert on devoluciones
  for each row execute function public.fn_trg_devoluciones_set_contrato();

-- Confirma la recepción física: si el material vuelve en buen estado, entra
-- a stock igual que un ingreso (reutiliza fn_registrar_movimiento_stock, que
-- ya escribe kardex); si vuelve dañado, no se toca stock — el registro de la
-- devolución en sí es el único rastro (no aporta nada duplicar un kardex de
-- un movimiento de stock que no ocurrió).
create or replace function public.fn_recibir_devolucion(
  p_devolucion_id uuid,
  p_almacen_id uuid,
  p_usuario_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dev devoluciones%rowtype;
begin
  if not public.has_permission('devoluciones.recibir_rechazar') then
    raise exception 'No tiene permiso para recibir devoluciones (devoluciones.recibir_rechazar)';
  end if;

  select * into v_dev from devoluciones where id = p_devolucion_id for update;
  if v_dev.id is null then
    raise exception 'devolución % no existe', p_devolucion_id;
  end if;
  if v_dev.estado <> 'Solicitada' then
    raise exception 'La devolución % ya está en estado %, no se puede recibir de nuevo', p_devolucion_id, v_dev.estado;
  end if;

  if v_dev.estado_material = 'bueno' then
    perform public.fn_registrar_movimiento_stock(
      p_almacen_id, v_dev.material_id, v_dev.contrato_id, v_dev.cantidad, 'ingreso', v_dev.cantidad,
      p_usuario_id, 'devoluciones', v_dev.id, null,
      coalesce(v_dev.observacion, 'Devolución de material en buen estado')
    );
  end if;

  update devoluciones
    set estado = 'Recibida', almacen_id = p_almacen_id, recibida_por = p_usuario_id, recibida_at = now()
  where id = p_devolucion_id;
end;
$$;

create or replace function public.fn_rechazar_devolucion(
  p_devolucion_id uuid,
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
  if not public.has_permission('devoluciones.recibir_rechazar') then
    raise exception 'No tiene permiso para rechazar devoluciones (devoluciones.recibir_rechazar)';
  end if;

  select estado into v_estado from devoluciones where id = p_devolucion_id for update;
  if v_estado is null then
    raise exception 'devolución % no existe', p_devolucion_id;
  end if;
  if v_estado <> 'Solicitada' then
    raise exception 'La devolución % ya está en estado %, no se puede rechazar', p_devolucion_id, v_estado;
  end if;

  update devoluciones
    set estado = 'Rechazada', recibida_por = p_usuario_id, recibida_at = now(), motivo_rechazo = p_motivo
  where id = p_devolucion_id;
end;
$$;

grant select, insert, update, delete on devoluciones to authenticated;

alter table devoluciones enable row level security;

-- Solo select + insert directos: los cambios de estado (Recibida/Rechazada)
-- pasan únicamente por las funciones de arriba, igual que reservas.
create policy devoluciones_select on devoluciones for select
  using (
    (public.has_permission('devoluciones.ver_propias') and supervisor_id = auth.uid())
    or public.has_permission('devoluciones.ver_todas')
  );

create policy devoluciones_insert on devoluciones for insert
  with check (public.has_permission('devoluciones.crear') and supervisor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- procura_vs_consumo: el consumo real de un frente ya no es solo lo que
-- salió (salidas) — hay que restarle lo que volvió (devoluciones recibidas,
-- sano o dañado: en ambos casos el material dejó de estar en uso en el
-- frente). Mismas columnas y mismo orden que antes, así que CREATE OR
-- REPLACE alcanza (no hace falta el DROP+CREATE que sí hizo falta cuando se
-- renombró una columna en 20260907120000).
-- ---------------------------------------------------------------------------
create or replace view procura_vs_consumo as
select
  mp.frente_id,
  mp.material_id,
  mp.cantidad_contractual,
  mp.cantidad_procura,
  (mp.cantidad_contractual + mp.cantidad_procura) as cantidad_prevista,
  mp.unidad,
  coalesce(r.reservado, 0) as cantidad_reservada,
  coalesce(sol.solicitado, 0) as cantidad_solicitada,
  greatest(coalesce(s.entregado, 0) - coalesce(d.devuelto, 0), 0) as cantidad_entregada,
  (mp.cantidad_contractual + mp.cantidad_procura)
    - greatest(coalesce(s.entregado, 0) - coalesce(d.devuelto, 0), 0)
    - coalesce(r.reservado, 0) as saldo,
  case when (mp.cantidad_contractual + mp.cantidad_procura) > 0
    then round(
      greatest(coalesce(s.entregado, 0) - coalesce(d.devuelto, 0), 0)
        / (mp.cantidad_contractual + mp.cantidad_procura) * 100,
      1
    )
    else null
  end as porcentaje_consumo,
  greatest(coalesce(s.entregado, 0) - coalesce(d.devuelto, 0), 0) - (mp.cantidad_contractual + mp.cantidad_procura) as desviacion
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
left join (
  select frente_id, material_id, sum(cantidad) as devuelto
  from devoluciones
  where estado = 'Recibida'
  group by frente_id, material_id
) d on d.frente_id = mp.frente_id and d.material_id = mp.material_id
where mp.vigente = true
  and public.has_permission('procura.ver_comparacion')
  and (not public.es_supervisor() or mp.frente_id = public.current_frente_id());

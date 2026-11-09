-- Fase 4: estado de confirmación por metrado reportado (por_confirmar |
-- confirmado | corregido | ignorado), bandeja de confirmación, y el
-- acumulado oficial (fn_rdc_acumulado_edt) pasa a contar solo lo
-- confirmado/corregido — hasta ahora (Fase 3) contaba todo lo reportado sin
-- filtrar.
create extension if not exists pg_trgm;

-- metrado_origen_id identifica la fila fuente exacta cuando existe
-- (rdc_reporte_metrados.id para 'libre', rdc_reporte_metrados_edt.id para
-- 'digitado_edt') — sin esto, dos metrados "libres" del mismo reporte (dos
-- textos sueltos distintos, ninguno con partida_edt_id propio) chocarían
-- entre sí en el unique de abajo. Para los orígenes derivados
-- (conteo_pernos/suma_panos_malla/suma_tramos_cable) queda null: esos ya
-- son únicos por (reporte_id, origen, partida_edt_id).
--
-- Reversible: drop table rdc_metrados_confirmacion; drop extension pg_trgm
-- (si nada más la usa); drop function fn_rdc_sincronizar_confirmaciones/
-- fn_rdc_confirmar_metrado/fn_rdc_corregir_metrado/fn_rdc_ignorar_metrado/
-- fn_rdc_metrados_alertas; y volver fn_rdc_acumulado_edt a la versión de
-- Fase 3 (20261006100000).
create table rdc_metrados_confirmacion (
  id uuid primary key default gen_random_uuid(),
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  frente_id uuid not null references frentes(id),
  fecha date not null,
  partida_edt_id uuid references rdc_partidas_edt(id),
  metrado_origen_id uuid,
  origen text not null check (origen in ('digitado_edt', 'conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable', 'libre')),
  texto_reportado text,
  cantidad numeric(14,3) not null check (cantidad >= 0),
  sugerida_partida_edt_id uuid references rdc_partidas_edt(id),
  coincidencia_pct numeric(5,2),
  estado text not null default 'por_confirmar' check (estado in ('por_confirmar', 'confirmado', 'corregido', 'ignorado')),
  cantidad_original numeric(14,3),
  cantidad_corregida numeric(14,3),
  motivo text,
  resuelto_por uuid references usuarios(id),
  resuelto_en timestamptz,
  created_at timestamptz not null default now(),
  constraint rdc_metrados_confirmacion_motivo_segun_estado check (
    estado not in ('corregido', 'ignorado') or motivo is not null
  )
);
-- Postgres no admite expresiones (coalesce) dentro de un `unique(...)` de
-- tabla — hace falta un índice único de expresión aparte. `ON CONFLICT`
-- puede apuntar a esta misma lista de expresiones sin problema.
create unique index rdc_metrados_confirmacion_unico on rdc_metrados_confirmacion (
  reporte_id, origen,
  coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000')
);
create index idx_rdc_metrados_confirmacion_frente_fecha on rdc_metrados_confirmacion(frente_id, fecha);
create index idx_rdc_metrados_confirmacion_estado on rdc_metrados_confirmacion(estado);

alter table rdc_metrados_confirmacion enable row level security;
create policy rdc_metrados_confirmacion_select on rdc_metrados_confirmacion for select
  using (public.has_permission('rdc.ver_todos') or public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_metrados_confirmacion_resolver on rdc_metrados_confirmacion for update
  using (public.has_permission('rdc.confirmar_metrados'))
  with check (public.has_permission('rdc.confirmar_metrados'));

insert into permisos (codigo, modulo, descripcion) values
  ('rdc.confirmar_metrados', 'rdc', 'Confirmar, corregir o ignorar metrados reportados en el RDC')
on conflict (codigo) do nothing;
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where p.codigo = 'rdc.confirmar_metrados' and r.nombre in ('Administrador', 'Planeamiento')
on conflict do nothing;

-- Genera/actualiza las confirmaciones de un reporte recién sincronizado. Se
-- llama una vez al final de subirReporte() en el cliente (no por trigger,
-- mismo criterio ya documentado en el proyecto para el resto del RDC).
-- Idempotente: re-sincronizar el mismo reporte no duplica filas (unique de
-- arriba) y nunca pisa un estado que ya dejó de ser 'por_confirmar'.
create or replace function public.fn_rdc_sincronizar_confirmaciones(p_reporte_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frente_id uuid; v_fecha date;
begin
  if not public.rdc_puede_editar_reporte(p_reporte_id) and not public.has_permission('rdc.editar_todos') then
    raise exception 'No tiene permiso para sincronizar este reporte';
  end if;
  select frente_id, fecha into v_frente_id, v_fecha from rdc_reportes where id = p_reporte_id;

  -- 1) Digitado EDT.
  insert into rdc_metrados_confirmacion (reporte_id, frente_id, fecha, partida_edt_id, metrado_origen_id, origen, cantidad)
  select p_reporte_id, v_frente_id, v_fecha, m.partida_edt_id, m.id, 'digitado_edt', m.cantidad
  from rdc_reporte_metrados_edt m where m.reporte_id = p_reporte_id
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';

  -- 2) Derivado (conteo_pernos/suma_panos_malla/suma_tramos_cable).
  -- e.cantidad ya es m2/ML directo (ver nota en fn_rdc_acumulado_edt).
  insert into rdc_metrados_confirmacion (reporte_id, frente_id, fecha, partida_edt_id, origen, cantidad)
  select p_reporte_id, v_frente_id, v_fecha, p.id, p.tipo_medicion,
         sum(case when p.tipo_medicion = 'conteo_pernos' then 1 else e.cantidad end)
  from rdc_partidas_edt p
  join rdc_reporte_elementos e on e.reporte_id = p_reporte_id
    and ((p.tipo_medicion = 'conteo_pernos' and e.elemento = 'Perno' and e.actividad = 'Perforación')
      or (p.tipo_medicion = 'suma_panos_malla' and e.elemento = 'Malla' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro)))
      or (p.tipo_medicion = 'suma_tramos_cable' and e.elemento = 'Cable' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro))))
    and (p.zona_filtro is null or e.zona = p.zona_filtro)
  where p.frente_id = v_frente_id and p.tipo_medicion <> 'digitado'
  group by p.id, p.tipo_medicion
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';

  -- 3) Libre: sugerencia por similaridad de texto (pg_trgm) contra las
  -- partidas EDT del frente — placeholder explícitamente autorizado por el
  -- pedido ("por ahora comparación simple de texto; más adelante un agente").
  insert into rdc_metrados_confirmacion (reporte_id, frente_id, fecha, metrado_origen_id, origen,
                                          texto_reportado, cantidad, sugerida_partida_edt_id, coincidencia_pct)
  select p_reporte_id, v_frente_id, v_fecha, m.id, 'libre', m.partida_nombre, m.cantidad, mejor.id, mejor.pct
  from rdc_reporte_metrados m
  left join lateral (
    select p.id, round(similarity(m.partida_nombre, p.nombre) * 100, 2) as pct
    from rdc_partidas_edt p where p.frente_id = v_frente_id and p.activo
    order by similarity(m.partida_nombre, p.nombre) desc limit 1
  ) mejor on true
  where m.reporte_id = p_reporte_id and m.bloque = 'libre'
  on conflict (reporte_id, origen, coalesce(partida_edt_id, '00000000-0000-0000-0000-000000000000'),
               coalesce(metrado_origen_id, '00000000-0000-0000-0000-000000000000'))
  do update set cantidad = excluded.cantidad
  where rdc_metrados_confirmacion.estado = 'por_confirmar';
end;
$$;
grant execute on function public.fn_rdc_sincronizar_confirmaciones(uuid) to authenticated;

-- Acciones de planeamiento — centralizan las reglas de "qué se puede hacer
-- cuándo" en vez de repetirlas en el frontend.
create or replace function public.fn_rdc_confirmar_metrado(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion set estado = 'confirmado', resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado = 'por_confirmar';
$$;

create or replace function public.fn_rdc_corregir_metrado(p_id uuid, p_cantidad numeric, p_motivo text)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion
  set estado = 'corregido', cantidad_original = cantidad, cantidad_corregida = p_cantidad,
      cantidad = p_cantidad, motivo = p_motivo, resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado = 'por_confirmar';
$$;

create or replace function public.fn_rdc_ignorar_metrado(p_id uuid, p_motivo text)
returns void language sql security definer set search_path = public as $$
  update rdc_metrados_confirmacion set estado = 'ignorado', motivo = p_motivo,
      resuelto_por = auth.uid(), resuelto_en = now()
  where id = p_id and public.has_permission('rdc.confirmar_metrados') and estado = 'por_confirmar';
$$;

grant execute on function public.fn_rdc_confirmar_metrado(uuid) to authenticated;
grant execute on function public.fn_rdc_corregir_metrado(uuid, numeric, text) to authenticated;
grant execute on function public.fn_rdc_ignorar_metrado(uuid, text) to authenticated;

-- Reemplaza fn_rdc_acumulado_edt (misma firma): el "acumulado oficial" ahora
-- cuenta solo confirmado+corregido, como exige esta fase (Fase 3 contaba
-- todo lo reportado sin filtrar).
create or replace function public.fn_rdc_acumulado_edt(p_frente_id uuid default null, p_hasta date default current_date - 1)
returns table (frente_id uuid, partida_edt_id uuid, previsto numeric, acumulado numeric, saldo numeric)
language sql stable security definer set search_path = public
as $$
  select p.frente_id, p.id, p.metrado_previsto,
         coalesce(sum(c.cantidad) filter (where c.estado in ('confirmado', 'corregido') and c.fecha <= p_hasta), 0),
         p.metrado_previsto - coalesce(sum(c.cantidad) filter (where c.estado in ('confirmado', 'corregido') and c.fecha <= p_hasta), 0)
  from rdc_partidas_edt p
  left join rdc_metrados_confirmacion c on c.partida_edt_id = p.id
  where p.activo and (p_frente_id is null or p.frente_id = p_frente_id)
  group by p.frente_id, p.id, p.metrado_previsto;
$$;

-- Alertas: se calculan al vuelo, no se persisten.
create or replace function public.fn_rdc_metrados_alertas(p_frente_id uuid default null)
returns table (confirmacion_id uuid, tipo text, detalle text)
language sql stable security definer set search_path = public
as $$
  select c.id, 'supera_previsto', 'La cantidad de hoy supera el saldo previsto'
  from rdc_metrados_confirmacion c
  join fn_rdc_acumulado_edt(c.frente_id, c.fecha - 1) a on a.partida_edt_id = c.partida_edt_id
  where c.estado = 'por_confirmar' and (p_frente_id is null or c.frente_id = p_frente_id)
    and c.cantidad > a.saldo
  union all
  select c.id, 'glb_cerrada', 'La partida GLB ya está completa'
  from rdc_metrados_confirmacion c
  join rdc_partidas_edt p on p.id = c.partida_edt_id
  join fn_rdc_acumulado_edt(c.frente_id, c.fecha - 1) a on a.partida_edt_id = c.partida_edt_id
  where c.estado = 'por_confirmar' and p.unidad = 'GLB' and a.saldo <= 0
    and (p_frente_id is null or c.frente_id = p_frente_id)
  union all
  select c.id, 'coincidencia_baja', 'Coincidencia con la partida sugerida menor al 60%'
  from rdc_metrados_confirmacion c
  where c.estado = 'por_confirmar' and c.origen = 'libre' and coalesce(c.coincidencia_pct, 0) < 60
    and (p_frente_id is null or c.frente_id = p_frente_id);
  -- "Rendimiento fuera de rango" (cantidad ÷ personal del día) queda para
  -- una segunda pasada: falta decidir con el usuario qué conteo de personal
  -- usar (total del día vs. cuadrilla de esa partida específica).
$$;
grant execute on function public.fn_rdc_metrados_alertas(uuid) to authenticated;

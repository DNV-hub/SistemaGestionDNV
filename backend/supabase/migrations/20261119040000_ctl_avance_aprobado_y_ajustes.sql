-- PRUEBA · La curva S solo cuenta lo APROBADO por Planeamiento.
-- Carga inicial = Control diario (Excel) aprobado; después, lo confirmado o
-- corregido en la bandeja del RDC (rdc_metrados_confirmacion). Ajuste
-- manual de la curva opcional, con motivo y registro. Grupos de partidas
-- según el Control diario (Excel MET).
alter table public.ctl_cronograma_partida add column if not exists grupo text, add column if not exists sector_codigo text, add column if not exists met_previsto numeric;
alter table public.ctl_avance_partida add column if not exists estado text not null default 'aprobado' check (estado in ('aprobado','por_aprobar'));
create table if not exists public.ctl_curva_ajuste (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  fecha date not null, ejecutado_pct numeric(6,2) not null, motivo text not null,
  creado_por uuid default auth.uid(), created_at timestamptz not null default now(), activo boolean not null default true
);
alter table public.ctl_curva_ajuste enable row level security;
drop policy if exists ctl_curva_ajuste_select on public.ctl_curva_ajuste;
create policy ctl_curva_ajuste_select on public.ctl_curva_ajuste for select to authenticated using (public.has_permission('frentes.ver') or public.has_permission('procura.ver'));
drop policy if exists ctl_curva_ajuste_insert on public.ctl_curva_ajuste;
create policy ctl_curva_ajuste_insert on public.ctl_curva_ajuste for insert to authenticated with check (public.has_permission('procura.crear_version'));
drop policy if exists ctl_curva_ajuste_update on public.ctl_curva_ajuste;
create policy ctl_curva_ajuste_update on public.ctl_curva_ajuste for update to authenticated using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));
create or replace function public.ctl_avance_aprobado(p_frente_id uuid)
returns table(edt text, fecha date, cantidad numeric, fuente text)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_permission('frentes.ver') or public.has_permission('procura.ver')) then
    raise exception 'Sin permiso';
  end if;
  return query
  select a.edt, a.fecha, a.cantidad, a.fuente from public.ctl_avance_partida a
   where a.frente_id = p_frente_id and a.estado = 'aprobado'
  union all
  select pe.codigo_edt, c.fecha, sum(coalesce(c.cantidad_corregida, c.cantidad)), 'Bandeja RDC'
    from public.rdc_metrados_confirmacion c
    join public.rdc_partidas_edt pe on pe.id = c.partida_edt_id
   where c.frente_id = p_frente_id and c.estado in ('confirmado','corregido')
     and not exists (select 1 from public.ctl_avance_partida a2 where a2.frente_id = p_frente_id and a2.edt = pe.codigo_edt and a2.fecha = c.fecha and a2.estado = 'aprobado')
   group by pe.codigo_edt, c.fecha;
end; $$;
revoke all on function public.ctl_avance_aprobado(uuid) from public, anon;
grant execute on function public.ctl_avance_aprobado(uuid) to authenticated;

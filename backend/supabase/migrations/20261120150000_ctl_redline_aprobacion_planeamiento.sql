-- Lienzo 6 · pestaña Redline: la aprobación de Planeamiento es la que manda.
-- 1) ctl_partida_item: qué ítems del plano forman el metrado de cada partida
--    del cronograma (solo relaciones 1:1 o sumas directas; factor convierte unidades).
-- 2) ctl_metrado_vigente: cantidad_vigente = redline APROBADO POR PLANEAMIENTO
--    (con la cantidad corregida si la hubo); cantidad_valorizable = redline
--    firmado por BBA (la valorización sigue el plano firmado).
-- 3) ctl_aprobar_redline / ctl_devolver_redline: aprobar exige que no quede
--    ningún cambio por confirmar; al aprobar, las partidas vinculadas toman el
--    metrado vigente (las HH no cambian: el programado no se mueve; un rebase
--    solo procede si el cambio supera el 10 % de las HH, desde "Modificar curva").

create table if not exists public.ctl_partida_item (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  edt text not null,
  item_codigo text not null,
  factor numeric not null default 1,
  unique (frente_id, edt, item_codigo)
);
alter table public.ctl_partida_item enable row level security;
drop policy if exists ctl_partida_item_select on public.ctl_partida_item;
create policy ctl_partida_item_select on public.ctl_partida_item for select to authenticated
  using (public.has_permission('frentes.ver') or public.has_permission('procura.ver'));
drop policy if exists ctl_partida_item_write on public.ctl_partida_item;
create policy ctl_partida_item_write on public.ctl_partida_item for all to authenticated
  using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));

-- ZCM06: partidas cuyo metrado sale directo del plano (las del RL01).
insert into public.ctl_partida_item (frente_id, edt, item_codigo) values
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', '2.03', 'ZCM06-P1-12'),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', '2.04', 'ZCM06-P2-24'),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', '2.07', 'ZCM06-P1-07'),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', '2.07', 'ZCM06-P2-20'),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', '2.08', 'ZCM06-P1-08'),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', '2.08', 'ZCM06-P2-21'),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', '3.03', 'ZCM06-P1-13')
on conflict (frente_id, edt, item_codigo) do nothing;

create or replace view public.ctl_metrado_vigente with (security_invoker = true) as
select m.frente_id, m.sector_codigo, m.item_codigo, m.descripcion, m.unidad, m.cantidad_constructivo, m.plano_origen,
       ap.redline as redline_aprobado,
       ap.cantidad as cantidad_redline_aprobado,
       pe.redline as redline_pendiente,
       pe.cantidad as cantidad_redline_pendiente,
       pe.nota as nota_redline,
       coalesce(ap.cantidad, m.cantidad_constructivo)::numeric(14,3) as cantidad_vigente,
       coalesce(bb.cantidad, m.cantidad_constructivo)::numeric(14,3) as cantidad_valorizable
from public.ctl_metrado_plano m
left join lateral (
  select c.redline, coalesce(c.cantidad_corregida, c.cantidad_despues)::numeric(14,3) as cantidad
  from public.ctl_redline_cambio c
  join public.ctl_redline r on r.frente_id = c.frente_id and r.codigo = c.redline and r.estado = 'aprobado'
  where c.frente_id = m.frente_id and c.item_codigo = m.item_codigo
  order by c.fecha desc, c.created_at desc limit 1) ap on true
left join lateral (
  select c.redline, coalesce(c.cantidad_corregida, c.cantidad_despues)::numeric(14,3) as cantidad, c.nota
  from public.ctl_redline_cambio c
  left join public.ctl_redline r on r.frente_id = c.frente_id and r.codigo = c.redline
  where c.frente_id = m.frente_id and c.item_codigo = m.item_codigo and coalesce(r.estado, 'en_revision') = 'en_revision'
  order by c.fecha desc, c.created_at desc limit 1) pe on true
left join lateral (
  select coalesce(c.cantidad_corregida, c.cantidad_despues)::numeric(14,3) as cantidad
  from public.ctl_redline_cambio c
  where c.frente_id = m.frente_id and c.item_codigo = m.item_codigo and c.aprobado_bba is true
  order by c.fecha desc, c.created_at desc limit 1) bb on true;

create or replace function public.ctl_aprobar_redline(p_redline_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.ctl_redline%rowtype; n int;
begin
  if not public.has_permission('procura.crear_version') then raise exception 'Sin permiso'; end if;
  select * into r from public.ctl_redline where id = p_redline_id for update;
  if not found then raise exception 'Redline no encontrado'; end if;
  if r.estado = 'aprobado' then return; end if;
  select count(*) into n from public.ctl_redline_cambio
   where frente_id = r.frente_id and redline = r.codigo and estado = 'por_confirmar';
  if n > 0 then raise exception 'Falta confirmar % cambio(s) antes de aprobar', n; end if;
  update public.ctl_redline set estado = 'aprobado', aprobado_por = auth.uid(), aprobado_en = now(), nota_devolucion = null
   where id = p_redline_id;
  -- Las partidas vinculadas toman el metrado vigente (las HH se conservan).
  update public.ctl_cronograma_partida p
     set metrado = s.q
    from (select pi.edt, sum(pi.factor * v.cantidad_vigente) as q
            from public.ctl_partida_item pi
            join public.ctl_metrado_vigente v on v.frente_id = pi.frente_id and v.item_codigo = pi.item_codigo
           where pi.frente_id = r.frente_id
           group by pi.edt) s
   where p.frente_id = r.frente_id and p.edt = s.edt and s.q > 0;
end $$;

create or replace function public.ctl_devolver_redline(p_redline_id uuid, p_nota text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('procura.crear_version') then raise exception 'Sin permiso'; end if;
  if length(trim(coalesce(p_nota, ''))) < 10 then raise exception 'Escribe qué debe corregir el supervisor (mínimo 10 caracteres)'; end if;
  update public.ctl_redline set estado = 'devuelto', nota_devolucion = trim(p_nota) where id = p_redline_id and estado <> 'aprobado';
end $$;

revoke all on function public.ctl_aprobar_redline(uuid) from public, anon;
revoke all on function public.ctl_devolver_redline(uuid, text) from public, anon;
grant execute on function public.ctl_aprobar_redline(uuid) to authenticated;
grant execute on function public.ctl_devolver_redline(uuid, text) to authenticated;

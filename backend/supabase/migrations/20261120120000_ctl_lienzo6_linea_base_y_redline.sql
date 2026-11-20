-- PRUEBA · Lienzo 6 (aprobado 20/11/2026).
-- 1) Curva S: fechas del cronograma, metrados del plano constructivo o
--    redline aprobado. Las partidas adicionales (no previstas en el
--    cronograma) quedan fuera de la línea base hasta que el cliente las
--    apruebe y se haga una nueva revisión.
-- 2) "Modificar curva" por ratios (HH/und): cada guardado crea una revisión
--    de la línea base con motivo, usuario y fecha.
-- 3) Redline por frente: cabecera del redline, estado de cada cambio y
--    aprobación de Planeamiento. Solo lo aprobado por Planeamiento cambia
--    el plano, el metrado vigente, la procura y la curva; la valorización
--    sigue el plano firmado por BBA.

alter table public.ctl_cronograma_partida
  add column if not exists en_linea_base boolean not null default true;

update public.ctl_cronograma_partida
   set en_linea_base = false
 where frente_id = '289cf1e7-9c87-4a47-8407-966cfe4aee6a' and edt like '3.%';

-- Revisiones de la línea base por ratios
create table if not exists public.ctl_linea_base_rev (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  rev text not null,
  edt text not null,
  ratio_anterior numeric not null,
  ratio_nuevo numeric not null,
  motivo text not null check (length(trim(motivo)) >= 10),
  desviacion_antes numeric,
  desviacion_despues numeric,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists ctl_linea_base_rev_frente_idx on public.ctl_linea_base_rev (frente_id, created_at);
alter table public.ctl_linea_base_rev enable row level security;
drop policy if exists ctl_linea_base_rev_select on public.ctl_linea_base_rev;
create policy ctl_linea_base_rev_select on public.ctl_linea_base_rev for select to authenticated
  using (public.has_permission('frentes.ver') or public.has_permission('procura.ver'));
drop policy if exists ctl_linea_base_rev_insert on public.ctl_linea_base_rev;
create policy ctl_linea_base_rev_insert on public.ctl_linea_base_rev for insert to authenticated
  with check (public.has_permission('procura.crear_version'));

-- Redline: cabecera
create table if not exists public.ctl_redline (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  codigo text not null,
  titulo text not null,
  fecha date not null,
  origen text,
  estado text not null default 'en_revision' check (estado in ('en_revision','aprobado','devuelto')),
  firma_bba boolean not null default false,
  imagen_campo text,
  imagen_plano text,
  puntos_alineacion text,
  nota_devolucion text,
  aprobado_por uuid,
  aprobado_en timestamptz,
  created_at timestamptz not null default now(),
  unique (frente_id, codigo)
);
alter table public.ctl_redline enable row level security;
drop policy if exists ctl_redline_select on public.ctl_redline;
create policy ctl_redline_select on public.ctl_redline for select to authenticated
  using (public.has_permission('frentes.ver') or public.has_permission('procura.ver'));
drop policy if exists ctl_redline_write on public.ctl_redline;
create policy ctl_redline_write on public.ctl_redline for update to authenticated
  using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));
drop policy if exists ctl_redline_insert on public.ctl_redline;
create policy ctl_redline_insert on public.ctl_redline for insert to authenticated
  with check (public.has_permission('procura.crear_version'));

-- Redline: estado de cada cambio leído
alter table public.ctl_redline_cambio
  add column if not exists estado text not null default 'confirmado' check (estado in ('confirmado','por_confirmar','corregido')),
  add column if not exists cantidad_corregida numeric;
drop policy if exists ctl_redline_cambio_update on public.ctl_redline_cambio;
create policy ctl_redline_cambio_update on public.ctl_redline_cambio for update to authenticated
  using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));

-- Carga del RL01 de ZCM06 (foto de campo 09/11 firmada por BBA, formalizada el 12/11).
-- Ya está en el plano del sistema desde la carga inicial; queda "aprobado" por
-- Planeamiento recién cuando lo apruebes en la pestaña Redline.
insert into public.ctl_redline (frente_id, codigo, titulo, fecha, origen, estado, firma_bba, imagen_campo, imagen_plano, puntos_alineacion)
values ('289cf1e7-9c87-4a47-8407-966cfe4aee6a', 'RL01', 'Plano CE1087 · Redline 01 · Pasivo 1 y Pasivo 2', '2026-11-12',
        'Foto de campo del 09/11 firmada por BBA', 'en_revision', false,
        '289cf1e7-9c87-4a47-8407-966cfe4aee6a/redline-rl01-campo-0911.jpg',
        '289cf1e7-9c87-4a47-8407-966cfe4aee6a/redline-rl01-plano-ce1087.jpg',
        'P1-P10, P1-P13, P2-P1 y P2-P9')
on conflict (frente_id, codigo) do nothing;

update public.ctl_redline_cambio
   set estado = 'por_confirmar',
       nota = 'P2-P23 retirado en campo el 16/11 pero perforado e inyectado según RDC (16 y 18/11): confirmar si se descuenta.'
 where frente_id = '289cf1e7-9c87-4a47-8407-966cfe4aee6a' and item_codigo = 'ZCM06-P2-19';

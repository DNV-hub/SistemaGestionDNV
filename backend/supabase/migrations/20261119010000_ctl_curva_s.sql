-- PRUEBA · Curva S por frente (línea base vs ejecutado, % ponderado por HH)
-- Aditivo: tabla nueva ctl_curva_s. No toca tablas existentes.
create table if not exists public.ctl_curva_s (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  fecha date not null,
  programado_pct numeric(6,2) not null,
  ejecutado_pct numeric(6,2),
  linea_base text not null default 'Rev00',
  created_at timestamptz not null default now(),
  unique (frente_id, linea_base, fecha)
);
alter table public.ctl_curva_s enable row level security;
drop policy if exists ctl_curva_s_select on public.ctl_curva_s;
create policy ctl_curva_s_select on public.ctl_curva_s for select to authenticated
  using (public.has_permission('frentes.ver') or public.has_permission('procura.ver'));
drop policy if exists ctl_curva_s_write on public.ctl_curva_s;
create policy ctl_curva_s_write on public.ctl_curva_s for all to authenticated
  using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));

-- Parámetros de la banda por frente
create table if not exists public.ctl_curva_param (
  frente_id uuid primary key references public.frentes(id) on delete cascade,
  tol_inf numeric(5,2) not null default -3,
  tol_sup numeric(5,2) not null default 6,
  alerta_desde numeric(5,2) not null default 4,
  fecha_dato date,
  dia_inicio_semana int not null default 4, -- 4 = jueves (ISO)
  fuente text
);
alter table public.ctl_curva_param enable row level security;
drop policy if exists ctl_curva_param_select on public.ctl_curva_param;
create policy ctl_curva_param_select on public.ctl_curva_param for select to authenticated
  using (public.has_permission('frentes.ver') or public.has_permission('procura.ver'));
drop policy if exists ctl_curva_param_write on public.ctl_curva_param;
create policy ctl_curva_param_write on public.ctl_curva_param for all to authenticated
  using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));

-- Datos ZCM06 (Excel ZCM06_CurvaS_datos_16.11.2026, Rev00, corte 16/11)
insert into public.ctl_curva_s (frente_id, fecha, programado_pct, ejecutado_pct) values
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-02',4.79,4.54),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-03',7.77,11.47),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-04',11.02,19.11),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-05',14.62,22.27),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-06',19.01,24.38),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-07',24.65,26.06),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-08',31.34,28.68),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-09',38.01,30.44),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-10',43.38,38.32),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-11',46.96,43.86),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-12',49.39,52.11),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-13',51.77,54.24),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-14',54.97,57.35),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-15',59.3,59.1),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-16',64.82,63.7),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-17',71.47,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-18',78.67,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-19',85.19,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-20',90.01,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-21',92.98,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-22',94.58,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-23',95.46,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-24',96.17,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-25',97.18,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-26',98.57,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-27',100,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-28',100,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-29',100,null),
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-30',100,null)
on conflict (frente_id, linea_base, fecha) do update set programado_pct = excluded.programado_pct, ejecutado_pct = excluded.ejecutado_pct;
insert into public.ctl_curva_param (frente_id, fecha_dato, fuente) values
  ('289cf1e7-9c87-4a47-8407-966cfe4aee6a','2026-11-16','Rev00 · ponderado por HH (BAC 2,496.19 HH)')
on conflict (frente_id) do update set fecha_dato = excluded.fecha_dato, fuente = excluded.fuente;

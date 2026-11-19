-- PRUEBA · Sketch del plano y cronograma por partida (Resumen v5).
-- Aditivo: 4 tablas nuevas ctl_. Datos de ZCM06 cargados aparte desde
-- zcm06.json (geometría CE1087 RL01) y curva.json (Rev00 + avance aprobado).
create table if not exists public.ctl_plano_sketch (
  frente_id uuid primary key references public.frentes(id) on delete cascade,
  plano text not null, imagen_ruta text, ancho numeric not null, alto numeric not null,
  viewbox text not null, nota text, updated_at timestamptz not null default now()
);
create table if not exists public.ctl_plano_elemento (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  tipo text not null check (tipo in ('perno','pano','marca')),
  codigo text not null, codigo_rdc text, sector_codigo text,
  x numeric, y numeric, geo jsonb, descripcion text, malla_tipo text, area_m2 numeric,
  estado_plano text not null default 'vigente', orden int not null default 0,
  unique (frente_id, tipo, codigo)
);
create table if not exists public.ctl_cronograma_partida (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  linea_base text not null default 'Rev00', edt text not null, nombre text not null, unidad text not null,
  metrado numeric not null, hh numeric not null, inicio date not null, fin date not null,
  unique (frente_id, linea_base, edt)
);
create table if not exists public.ctl_avance_partida (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  edt text not null, fecha date not null, cantidad numeric not null, fuente text not null default 'RDC aprobado',
  unique (frente_id, edt, fecha)
);
do $$ declare t text; begin
  foreach t in array array['ctl_plano_sketch','ctl_plano_elemento','ctl_cronograma_partida','ctl_avance_partida'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(''frentes.ver'') or public.has_permission(''procura.ver''))', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(''procura.crear_version'')) with check (public.has_permission(''procura.crear_version''))', t||'_write', t);
  end loop;
end $$;

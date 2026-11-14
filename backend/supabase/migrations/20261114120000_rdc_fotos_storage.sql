-- Plan C (nov-2026): fotos, redlines y sketches del RDC sin Power Automate.
-- La app sube las imágenes al bucket privado `rdc-fotos` y registra el envío en
-- `rdc_fotos_envios`; el agente local de Planeamiento las copia a OneDrive/Teams.
-- Aplicada en producción el 2026-11-14 (migraciones rdc_fotos_storage + rdc_fotos_reintentos).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rdc-fotos', 'rdc-fotos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create table if not exists public.rdc_fotos_envios (
  id uuid primary key,
  fecha date not null,
  frente_id uuid references public.frentes(id),
  frente_nombre text not null,
  rol text,
  nombre text,
  categoria text not null,
  etiqueta text,
  archivos jsonb not null default '[]'::jsonb,
  creado_por uuid default auth.uid() references auth.users(id),
  creado_en_dispositivo timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rdc_fotos_envios_fecha_idx on public.rdc_fotos_envios (fecha desc);
create index if not exists rdc_fotos_envios_frente_idx on public.rdc_fotos_envios (frente_id, categoria, fecha desc);
alter table public.rdc_fotos_envios enable row level security;

create policy rdc_fotos_envios_insert on public.rdc_fotos_envios for insert to authenticated
  with check ((has_permission('rdc.crear') or has_permission('rdc.editar_todos')) and creado_por = auth.uid());
create policy rdc_fotos_envios_select on public.rdc_fotos_envios for select to authenticated
  using (has_permission('rdc.ver_todos') or has_permission('rdc.crear') or creado_por = auth.uid());
create policy rdc_fotos_envios_update on public.rdc_fotos_envios for update to authenticated
  using (creado_por = auth.uid() or has_permission('rdc.editar_todos'))
  with check (creado_por = auth.uid() or has_permission('rdc.editar_todos'));

create policy rdc_fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'rdc-fotos' and (has_permission('rdc.crear') or has_permission('rdc.editar_todos')));
create policy rdc_fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'rdc-fotos' and (has_permission('rdc.ver_todos') or has_permission('rdc.crear')));
create policy rdc_fotos_actualizar on storage.objects for update to authenticated
  using (bucket_id = 'rdc-fotos' and (has_permission('rdc.crear') or has_permission('rdc.editar_todos')))
  with check (bucket_id = 'rdc-fotos' and (has_permission('rdc.crear') or has_permission('rdc.editar_todos')));

comment on table public.rdc_fotos_envios is 'Envíos de fotos/redlines/sketches desde la app RDC (reemplaza flujo Power Automate). El agente local los copia a OneDrive.';

-- Primer uso de Supabase Storage en el proyecto. Bucket privado, exclusivo
-- para "mapa del sector" y "firma del residente" de la pestaña
-- Configuración de la ficha de frente — no reemplaza Fotos RDC (que sigue
-- yendo a SharePoint vía Power Automate, sin cambios acá).
-- Reversible: delete from storage.buckets where id='frentes-archivos'; y
-- drop policy frentes_archivos_select/frentes_archivos_write on storage.objects.
insert into storage.buckets (id, name, public, file_size_limit)
values ('frentes-archivos', 'frentes-archivos', false, 10485760) -- 10 MB
on conflict (id) do nothing;

create policy frentes_archivos_select on storage.objects for select
  using (bucket_id = 'frentes-archivos' and auth.role() = 'authenticated');

create policy frentes_archivos_write on storage.objects for all
  using (bucket_id = 'frentes-archivos' and public.has_permission('frentes.editar'))
  with check (bucket_id = 'frentes-archivos' and public.has_permission('frentes.editar'));

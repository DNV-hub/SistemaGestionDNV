-- Un material tiene una descripción/unidad interna (guía de materiales, para
-- Almacén) y, por separado, un nombre y unidad con los que el cliente lo
-- identifica en el EDP (Estado de Pago). El nombre EDP se maneja como catálogo
-- reutilizable (igual que categorias) porque varios materiales pueden
-- corresponder a la misma partida EDP.
create table nombres_edp (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

alter table materiales
  add column descripcion_edp_id uuid references nombres_edp(id),
  add column unidad_edp text;

create index idx_materiales_descripcion_edp on materiales(descripcion_edp_id);

-- Mismos permisos que categorias: ver con catalogo.ver, escribir con
-- catalogo.crear/catalogo.editar (ver 20260822101400_rls_policies.sql).
alter table nombres_edp enable row level security;
create policy nombres_edp_select on nombres_edp for select using (public.has_permission('catalogo.ver'));
create policy nombres_edp_write on nombres_edp for all
  using (public.has_permission('catalogo.crear') or public.has_permission('catalogo.editar'))
  with check (public.has_permission('catalogo.crear') or public.has_permission('catalogo.editar'));

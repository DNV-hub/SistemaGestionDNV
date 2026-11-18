-- PRUEBA control de obra (18/11/2026). Aplicada en producción el 18/11/2026 vía MCP.
-- Solo objetos nuevos con prefijo ctl_: no modifica tablas, vistas, funciones ni permisos existentes.
-- Respaldo previo: esquema respaldo_20261118 (54 tablas, 39,556 filas) y rama claude/respaldo-2026-11-18.
-- Para revertir: drop view ctl_conciliacion_material, ctl_vales_destino; drop function ctl_destino(text);
--                drop table ctl_material_sector, ctl_sectores;
create table if not exists public.ctl_sectores (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('pasivo','activo','encapsulado','barrera','general')),
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (frente_id, codigo)
);
create table if not exists public.ctl_material_sector (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  material_id uuid not null references public.materiales(id) on delete cascade,
  sector_codigo text not null,
  criterio text,
  created_at timestamptz not null default now(),
  unique (frente_id, material_id, sector_codigo)
);
alter table public.ctl_sectores enable row level security;
alter table public.ctl_material_sector enable row level security;
create policy ctl_sectores_ver on public.ctl_sectores for select to authenticated using (has_permission('procura.ver') or has_permission('procura.ver_comparacion') or has_permission('frentes.ver'));
create policy ctl_sectores_editar on public.ctl_sectores for all to authenticated using (has_permission('procura.crear_version')) with check (has_permission('procura.crear_version'));
create policy ctl_material_sector_ver on public.ctl_material_sector for select to authenticated using (has_permission('procura.ver') or has_permission('procura.ver_comparacion'));
create policy ctl_material_sector_editar on public.ctl_material_sector for all to authenticated using (has_permission('procura.crear_version')) with check (has_permission('procura.crear_version'));

create or replace function public.ctl_destino(p text) returns text language sql immutable as $$
  select case when coalesce(trim(p),'')='' then 'sin_destino'
              when p ~* '(vida|tirol|provisional|facilid|pat[ií]n|acceso|acondicion)' then 'facilidades'
              else 'sostenimiento' end $$;
-- Vistas ctl_conciliacion_material y ctl_vales_destino: ver definición en la base (pg_get_viewdef) o en docs/DICCIONARIO_DATOS.md.

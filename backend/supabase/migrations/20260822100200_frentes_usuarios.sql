create table frentes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  area text,
  estado text not null default 'activo' check (estado in ('activo','cerrado')),
  fecha_inicio date not null default current_date,
  fecha_cierre date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_frentes_updated_at
  before update on frentes
  for each row execute function public.set_updated_at();

-- usuarios.id = auth.users.id: el perfil vive en public.usuarios, la
-- autenticación (contraseña, sesión, JWT) la resuelve Supabase Auth.
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nombre text not null,
  rol_id uuid not null references roles(id),
  frente_id uuid references frentes(id),
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_usuarios_updated_at
  before update on usuarios
  for each row execute function public.set_updated_at();

create index idx_usuarios_rol on usuarios(rol_id);
create index idx_usuarios_frente on usuarios(frente_id);

-- ---------------------------------------------------------------------------
-- Helpers de autorización. security definer + search_path fijo para poder
-- leer usuarios/roles/permisos aunque el llamante no tenga acceso directo a
-- esas tablas por RLS. Se usan tanto en políticas RLS como desde la app.
-- ---------------------------------------------------------------------------

create or replace function public.has_permission(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuarios u
    join rol_permisos rp on rp.rol_id = u.rol_id
    join permisos p on p.id = rp.permiso_id
    where u.id = auth.uid()
      and u.estado = 'activo'
      and p.codigo = p_codigo
  );
$$;

create or replace function public.current_frente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select frente_id from usuarios where id = auth.uid();
$$;

create or replace function public.es_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios u
    join roles r on r.id = u.rol_id
    where u.id = auth.uid() and r.nombre = 'Supervisor'
  );
$$;

create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios u
    join roles r on r.id = u.rol_id
    where u.id = auth.uid() and r.nombre = 'Administrador'
  );
$$;

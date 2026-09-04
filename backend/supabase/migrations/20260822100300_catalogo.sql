create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria_padre_id uuid references categorias(id),
  created_at timestamptz not null default now()
);

create index idx_categorias_padre on categorias(categoria_padre_id);

create table materiales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  unidad text not null,
  categoria_id uuid references categorias(id),
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  observaciones text,
  -- Umbral de stock mínimo por defecto (§6.3 aprobado). Se puede sobrescribir
  -- por almacén en stock.stock_minimo; si esa columna es null, se usa este.
  stock_minimo_default numeric(14,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_materiales_updated_at
  before update on materiales
  for each row execute function public.set_updated_at();

create index idx_materiales_categoria on materiales(categoria_id);

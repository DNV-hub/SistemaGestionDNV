create table almacenes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  ubicacion text,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_almacenes_updated_at
  before update on almacenes
  for each row execute function public.set_updated_at();

-- Existencia por (almacén, material). cantidad_fisica solo cambia por
-- ingresos/salidas/ajustes; cantidad_reservada es una caché mantenida por
-- las funciones de reservas (fn_crear_reserva, fn_avanzar_reserva,
-- fn_liberar_reserva) — nunca por movimientos físicos. Ver
-- docs/MODELO_DATOS_Y_FLUJOS.md §1.1.
create table stock (
  almacen_id uuid not null references almacenes(id),
  material_id uuid not null references materiales(id),
  cantidad_fisica numeric(14,3) not null default 0 check (cantidad_fisica >= 0),
  cantidad_reservada numeric(14,3) not null default 0 check (cantidad_reservada >= 0),
  cantidad_disponible numeric(14,3) generated always as (cantidad_fisica - cantidad_reservada) stored,
  -- Override de stock mínimo para este almacén (§6.3). Si es null, se usa
  -- materiales.stock_minimo_default.
  stock_minimo numeric(14,3),
  updated_at timestamptz not null default now(),
  primary key (almacen_id, material_id),
  constraint chk_stock_reservada_no_excede_fisica check (cantidad_reservada <= cantidad_fisica)
);

create trigger trg_stock_updated_at
  before update on stock
  for each row execute function public.set_updated_at();

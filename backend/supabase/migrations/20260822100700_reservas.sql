-- Una reserva es un compromiso sobre stock disponible, no un movimiento
-- físico. Vive fuera del Kardex (§1.3/1.4 del modelo). Se resuelve con 1..N
-- filas en `salidas` (entregas parciales) hasta agotar `cantidad`.
create table reservas (
  id uuid primary key default gen_random_uuid(),
  vale_detalle_id uuid not null references vale_detalle(id),
  material_id uuid not null references materiales(id),
  almacen_id uuid not null references almacenes(id),
  frente_id uuid not null references frentes(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  -- Caché = suma de salidas entregadas contra esta reserva.
  cantidad_entregada numeric(14,3) not null default 0 check (cantidad_entregada >= 0),
  estado text not null default 'Activa' check (estado in (
    'Activa', 'Parcial', 'Liberada', 'Convertida', 'Cancelada'
  )),
  usuario_id uuid not null references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_reserva_entregada_no_excede check (cantidad_entregada <= cantidad)
);

create trigger trg_reservas_updated_at
  before update on reservas
  for each row execute function public.set_updated_at();

create index idx_reservas_stock on reservas(almacen_id, material_id);
create index idx_reservas_vale_detalle on reservas(vale_detalle_id);
create index idx_reservas_frente_estado on reservas(frente_id, estado);

-- Historial propio del ciclo de vida de cada reserva (§6.7 aprobado: tabla
-- propia, separada del Kardex y de la auditoría genérica).
create table reservas_historial (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  cantidad_anterior numeric(14,3),
  cantidad_nueva numeric(14,3),
  motivo text,
  usuario_id uuid references usuarios(id),
  fecha_hora timestamptz not null default now()
);

create index idx_reservas_historial_reserva on reservas_historial(reserva_id);

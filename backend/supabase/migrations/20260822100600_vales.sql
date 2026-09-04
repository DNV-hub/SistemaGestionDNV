-- El vale no especifica almacén (§6.6 aprobado): Almacén decide el almacén
-- de origen al aprobar cada línea, por eso almacen_id vive en `reservas`,
-- no aquí.
create table vales (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  fecha date not null default current_date,
  supervisor_id uuid not null references usuarios(id),
  frente_id uuid not null references frentes(id),
  estado text not null default 'Borrador' check (estado in (
    'Borrador', 'Enviado', 'En revision', 'Aprobado', 'Rechazado', 'Reservado',
    'Parcialmente atendido', 'Atendido', 'Cancelado', 'Cerrado'
  )),
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_vales_updated_at
  before update on vales
  for each row execute function public.set_updated_at();

create index idx_vales_supervisor on vales(supervisor_id);
create index idx_vales_frente on vales(frente_id);

create table vale_detalle (
  id uuid primary key default gen_random_uuid(),
  vale_id uuid not null references vales(id) on delete cascade,
  material_id uuid not null references materiales(id),
  cantidad_solicitada numeric(14,3) not null check (cantidad_solicitada > 0),
  cantidad_aprobada numeric(14,3) check (cantidad_aprobada >= 0),
  -- Caché = suma de salidas contra las reservas de esta línea (entregas
  -- parciales incluidas). Mantenida por fn_avanzar_reserva.
  cantidad_entregada numeric(14,3) not null default 0 check (cantidad_entregada >= 0),
  estado text not null default 'Pendiente' check (estado in (
    'Pendiente', 'Aprobado', 'Rechazado', 'Reservado',
    'Parcialmente entregado', 'Entregado', 'Cancelado'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_vd_entregada_no_excede_aprobada
    check (cantidad_aprobada is null or cantidad_entregada <= cantidad_aprobada)
);

create trigger trg_vale_detalle_updated_at
  before update on vale_detalle
  for each row execute function public.set_updated_at();

create index idx_vale_detalle_vale on vale_detalle(vale_id);
create index idx_vale_detalle_material on vale_detalle(material_id);

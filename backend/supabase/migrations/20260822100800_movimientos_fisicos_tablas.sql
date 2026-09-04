-- Tablas de movimientos físicos reales. La lógica que las conecta con
-- stock.cantidad_fisica y con kardex vive en
-- 20260822101000_triggers_movimientos_fisicos.sql — separada para que el
-- esquema y el comportamiento se puedan leer por separado.

create table ingresos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  material_id uuid not null references materiales(id),
  almacen_id uuid not null references almacenes(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  documento_referencia text,
  proveedor text,
  usuario_id uuid not null references usuarios(id),
  observacion text,
  created_at timestamptz not null default now()
);

create index idx_ingresos_material_almacen on ingresos(material_id, almacen_id);

create table ajustes (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  material_id uuid not null references materiales(id),
  almacen_id uuid not null references almacenes(id),
  tipo text not null check (tipo in ('positivo', 'negativo')),
  cantidad numeric(14,3) not null check (cantidad > 0),
  motivo text not null,
  usuario_id uuid not null references usuarios(id),
  created_at timestamptz not null default now()
);

create index idx_ajustes_material_almacen on ajustes(material_id, almacen_id);

-- Cada fila es una entrega física real (parcial o total). Varias salidas
-- pueden apuntar a la misma reserva: eso es lo que modela la entrega
-- parcial (§6 / §3 de docs/MODELO_DATOS_Y_FLUJOS.md).
create table salidas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  material_id uuid not null references materiales(id),
  almacen_id uuid not null references almacenes(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  frente_id uuid not null references frentes(id),
  vale_detalle_id uuid references vale_detalle(id),
  reserva_id uuid references reservas(id),
  usuario_id uuid not null references usuarios(id),
  documento_referencia text,
  observacion text,
  created_at timestamptz not null default now(),
  constraint chk_salida_vale_reserva_consistentes check (
    (vale_detalle_id is null and reserva_id is null) or
    (vale_detalle_id is not null and reserva_id is not null)
  )
);

create index idx_salidas_reserva on salidas(reserva_id);
create index idx_salidas_vale_detalle on salidas(vale_detalle_id);
create index idx_salidas_material_almacen on salidas(material_id, almacen_id);

-- Libro de movimientos físicos reales. Se llena solo por trigger — nunca a
-- mano desde la aplicación. No incluye tipos "reserva" / "liberación de
-- reserva" (a diferencia de la especificación original §11): ese ciclo de
-- vida vive en reservas_historial (§1.4 del modelo de datos).
create table kardex (
  id uuid primary key default gen_random_uuid(),
  fecha_hora timestamptz not null default now(),
  tipo_movimiento text not null check (tipo_movimiento in (
    'ingreso', 'salida', 'ajuste_positivo', 'ajuste_negativo'
  )),
  material_id uuid not null references materiales(id),
  almacen_id uuid not null references almacenes(id),
  cantidad numeric(14,3) not null,
  saldo_resultante numeric(14,3) not null,
  usuario_id uuid not null references usuarios(id),
  referencia_tabla text not null,
  referencia_id uuid not null,
  vale_id uuid references vales(id),
  observacion text
);

create index idx_kardex_material_almacen_fecha on kardex(material_id, almacen_id, fecha_hora);
create index idx_kardex_vale on kardex(vale_id);
create index idx_kardex_referencia on kardex(referencia_tabla, referencia_id);

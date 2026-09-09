-- Catálogos del módulo RDC (Reporte Diario de Campo), primera migración de su
-- fusión dentro del Sistema. Ver docs/MODELO_RDC.md para la ingeniería inversa
-- de la que sale este esquema y docs/PLAN_MIGRACION_RDC.md para el plan.
--
-- POR QUÉ TABLAS PROPIAS CON PREFIJO `rdc_` Y NO REUSAR LAS DEL SISTEMA:
-- decisión explícita del usuario (docs/MODELO_RDC.md §8.3). `frentes` existe en
-- ambos sistemas pero hoy NO están alineados: el RDC tiene 21 frentes con
-- sector como tabla propia, y el Sistema tiene otros frentes con `sector` como
-- texto libre, `area` obligatoria y ciclo de vida activo/paralizado/cerrado.
-- Fusionarlos ahora obligaría a sincerar dos maestros a la vez que se migra la
-- aplicación. La uniformización se hará después, como trabajo propio.
--
-- POR QUÉ `activo boolean` Y NO `estado text` COMO EN EL RESTO DEL SISTEMA:
-- en las tablas del Sistema `estado` modela un ciclo de vida (activo →
-- paralizado → cerrado, Borrador → Enviado → …). Acá el dato real del RDC es
-- un booleano de "aparece o no en el desplegable", sin ciclo de vida. Se
-- modela como lo que es.

-- ---------------------------------------------------------------------------
-- Sectores y frentes
-- ---------------------------------------------------------------------------
create table rdc_sectores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_rdc_sectores_updated_at
  before update on rdc_sectores
  for each row execute function public.set_updated_at();

create table rdc_frentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  sector_id uuid not null references rdc_sectores(id),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_rdc_frentes_updated_at
  before update on rdc_frentes
  for each row execute function public.set_updated_at();

create index idx_rdc_frentes_sector on rdc_frentes(sector_id);

-- ---------------------------------------------------------------------------
-- Personas de catálogo
--
-- `usuario_id` en rdc_supervisores es la pieza que conecta el catálogo viejo
-- (nombres sueltos elegidos de un desplegable) con las cuentas reales de la
-- Fase B. Es opcional a propósito: los supervisores existen como catálogo
-- desde antes de tener cuenta, y algunos pueden no llegar a tenerla.
-- ---------------------------------------------------------------------------
create table rdc_supervisores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  usuario_id uuid unique references usuarios(id),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_rdc_supervisores_updated_at
  before update on rdc_supervisores
  for each row execute function public.set_updated_at();

create table rdc_capataces (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_rdc_capataces_updated_at
  before update on rdc_capataces
  for each row execute function public.set_updated_at();

-- Supervisores de la contratista que firman un redline. Es un catálogo
-- distinto del de supervisores propios: son personas de otra empresa y no
-- llevan cuenta en el Sistema.
create table rdc_redline_supervisores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_rdc_redline_supervisores_updated_at
  before update on rdc_redline_supervisores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Prefijos de codificación por frente + zona + sistema de sostenimiento
--
-- Con esto la app arma el código de cada elemento (`prefijo + letra + número`,
-- p. ej. `GB/A-12`). `prefijo` guarda una LISTA separada por comas cuando una
-- misma combinación admite varios: el RDC la parte por comas y ofrece las
-- opciones al supervisor. Se conserva ese formato tal cual para no cambiar el
-- comportamiento del formulario; normalizarlo a una fila por prefijo cambiaría
-- lo que ve el usuario en campo.
--
-- `sostenimiento = 'Manual'` es un valor especial: significa "sin prefijo, el
-- supervisor escribe el código a mano".
-- ---------------------------------------------------------------------------
create table rdc_prefijos (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references rdc_frentes(id) on delete cascade,
  zona text not null,
  sostenimiento text not null,
  prefijo text,
  plano text,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (frente_id, zona, sostenimiento)
);

create trigger trg_rdc_prefijos_updated_at
  before update on rdc_prefijos
  for each row execute function public.set_updated_at();

create index idx_rdc_prefijos_frente on rdc_prefijos(frente_id);

-- ---------------------------------------------------------------------------
-- Maquinaria
--
-- Tabla nueva: hoy los equipos son diez nombres sueltos en una constante de
-- JavaScript (EQUIPOS_PERFORACION_FIJOS / EQUIPOS_SOPORTE_FIJOS en
-- config.js), sin modelo ni placa. El usuario pidió un inventario real.
--
-- `tipo` es el nombre genérico (Compresora, Retroexcavadora…) y es el que
-- viaja al Excel como encabezado de columna — por eso no se toca a la ligera:
-- agregar un tipo nuevo cambia el ancho de la hoja RDC que consume el flujo de
-- Power Automate (docs/MODELO_RDC.md §3.2). Modelo y placa identifican la
-- máquina concreta y no salen en el Excel actual.
-- ---------------------------------------------------------------------------
create table rdc_maquinarias (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  categoria text not null check (categoria in ('perforacion', 'soporte')),
  modelo text,
  placa text unique,
  observaciones text,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_rdc_maquinarias_updated_at
  before update on rdc_maquinarias
  for each row execute function public.set_updated_at();

create index idx_rdc_maquinarias_tipo on rdc_maquinarias(tipo);

-- ---------------------------------------------------------------------------
-- Partidas estándar de metrados (bloques 1 y 3)
--
-- Son las 8 actividades preliminares y las 7 complementarias que hoy viven en
-- PARTIDAS_PRELIMINARES / PARTIDAS_COMPLEMENTARIAS (config.js).
--
-- `codigo` existe para resolver un problema real del RDC actual: allá los
-- metrados se guardan indexados por la POSICIÓN de la partida en el array de
-- configuración (`blq1Valores = {0: 12.5}`), así que insertar una partida en
-- medio desalinea todos los borradores guardados — ya hubo que escribir una
-- migración en JavaScript por eso (_migrarBlq3TrasQuitarPullTest). Acá cada
-- partida tiene un código estable y el reporte lo referencia por código, no
-- por posición.
-- ---------------------------------------------------------------------------
create table rdc_partidas_estandar (
  id uuid primary key default gen_random_uuid(),
  bloque smallint not null check (bloque in (1, 3)),
  codigo text not null unique,
  nombre text not null,
  unidad text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_rdc_partidas_estandar_updated_at
  before update on rdc_partidas_estandar
  for each row execute function public.set_updated_at();

-- Seed: las 15 partidas fijas, con su orden actual. El código se deriva del
-- bloque + posición original (P## para preliminares, C## para complementarias)
-- y ya no cambia aunque la lista se reordene.
insert into rdc_partidas_estandar (bloque, codigo, nombre, unidad, orden) values
  (1, 'P01', 'Movilización interna', 'GLB', 1),
  (1, 'P02', 'Habilitación de facilidades', 'GLB', 2),
  (1, 'P03', 'Habilitación de accesos', 'ML', 3),
  (1, 'P04', 'Traslado de materiales con camión grúa', 'VJE', 4),
  (1, 'P05', 'Instalación de Tirolina', 'UND', 5),
  (1, 'P06', 'Línea de vida', 'ML', 6),
  (1, 'P07', 'Traslado de malla por Tirolina', 'M2', 7),
  (1, 'P08', 'Trazo y levantamiento topográfico', 'GLB', 8),
  (3, 'C01', 'Cosido de malla', 'M2', 1),
  (3, 'C02', 'Desquinche', 'M2', 2),
  (3, 'C03', 'Descolmatación', 'M3', 3),
  (3, 'C04', 'Instalación de accesorios (Placas, tuercas, etc)', 'UND', 4),
  (3, 'C05', 'Reparación de malla descolmatada', 'GLB', 5),
  (3, 'C06', 'Acondicionamiento de área de trabajo', 'GLB', 6),
  (3, 'C07', 'Desmovilización', 'GLB', 7);

-- ---------------------------------------------------------------------------
-- Partidas EDT por frente (presupuesto)
--
-- Las 343 filas que hoy viven en la constante PARTIDAS de config.js (35 KB en
-- una sola línea de JavaScript), repartidas en 18 frentes. Alimentan el
-- resumen del día y el texto de WhatsApp.
--
-- Tres de los 21 frentes no tienen ninguna partida EDT y eso es correcto: el
-- usuario confirmó que todavía no se les asigna numeración
-- (docs/MODELO_RDC.md §8.4). Un frente sin partidas es un estado válido, no un
-- dato faltante — nada acá lo exige.
-- ---------------------------------------------------------------------------
-- El código EDT es obligatorio y único dentro del frente: se verificó contra
-- las 343 filas reales y no hay ninguna sin código ni ninguna repetida dentro
-- de un mismo frente. Los NOMBRES en cambio sí se repiten (50 casos: la misma
-- actividad aparece en secciones distintas del presupuesto), así que el
-- nombre no sirve como clave — de ahí que la migración de datos sincronice
-- por (frente, código).
create table rdc_partidas_edt (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references rdc_frentes(id) on delete cascade,
  codigo_edt text not null,
  nombre text not null,
  unidad text not null,
  seccion text,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (frente_id, codigo_edt)
);

create trigger trg_rdc_partidas_edt_updated_at
  before update on rdc_partidas_edt
  for each row execute function public.set_updated_at();

create index idx_rdc_partidas_edt_frente on rdc_partidas_edt(frente_id);

-- ---------------------------------------------------------------------------
-- Biblioteca de pernos (el plano digitalizado)
--
-- Las 339 entradas de BIBLIOTECA_PERNOS (config.js), hoy solo del frente
-- PLATAFORMA SALA ELECTRICA. Cumple dos funciones que hay que preservar:
--   1. Es la ÚNICA fuente de la columna "Ángulo" de la hoja
--      CONTROL_SOSTENIMIENTO del Excel, y el respaldo de "Diámetro" y "Plano"
--      cuando el supervisor no los completa.
--   2. Avisa cuando la longitud digitada difiere de la de diseño.
-- ---------------------------------------------------------------------------
create table rdc_pernos_biblioteca (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references rdc_frentes(id) on delete cascade,
  codigo text not null,
  zona text,
  sistema text,
  ubicacion text,
  diametro numeric(8,2),
  longitud numeric(8,2),
  angulo text,
  plano text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (frente_id, codigo)
);

create trigger trg_rdc_pernos_biblioteca_updated_at
  before update on rdc_pernos_biblioteca
  for each row execute function public.set_updated_at();

create index idx_rdc_pernos_biblioteca_frente on rdc_pernos_biblioteca(frente_id);

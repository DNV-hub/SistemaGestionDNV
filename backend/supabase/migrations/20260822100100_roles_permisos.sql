-- Roles, permisos y su asignación. Se modelan como datos (no como reglas en
-- código) para que el Administrador pueda crear roles nuevos y reasignar
-- permisos sin migración ni redeploy — principio aprobado en
-- docs/MODELO_DATOS_Y_FLUJOS.md §2.1.

create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_roles_updated_at
  before update on roles
  for each row execute function public.set_updated_at();

create table permisos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  modulo text not null,
  descripcion text,
  created_at timestamptz not null default now()
);

create table rol_permisos (
  rol_id uuid not null references roles(id) on delete cascade,
  permiso_id uuid not null references permisos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rol_id, permiso_id)
);

-- ---------------------------------------------------------------------------
-- Seed: roles iniciales (spec §5). El Administrador puede crear más desde la UI.
-- ---------------------------------------------------------------------------
insert into roles (nombre, descripcion) values
  ('Administrador', 'Control total del sistema, incluye gestión de usuarios y roles.'),
  ('Almacen', 'Opera ingresos, ajustes, aprobación de vales y entregas físicas.'),
  ('Supervisor', 'Crea y da seguimiento a vales de su frente.'),
  ('Planeamiento', 'Gestiona metrados Procura, comparación de consumo y frentes.'),
  ('Responsable de Catalogo', 'Mantiene el catálogo maestro de materiales.'),
  ('Consulta', 'Acceso de solo lectura y exportación de reportes.');

-- ---------------------------------------------------------------------------
-- Seed: catálogo de permisos (matriz aprobada, docs/MODELO_DATOS_Y_FLUJOS.md §2).
-- ---------------------------------------------------------------------------
insert into permisos (codigo, modulo, descripcion) values
  ('usuarios.ver', 'usuarios', 'Ver listado de usuarios'),
  ('usuarios.crear', 'usuarios', 'Crear usuarios'),
  ('usuarios.editar', 'usuarios', 'Editar usuarios'),
  ('usuarios.desactivar', 'usuarios', 'Desactivar usuarios'),
  ('roles.gestionar', 'usuarios', 'Crear roles y asignar permisos'),
  ('catalogo.ver', 'catalogo', 'Ver catálogo de materiales'),
  ('catalogo.crear', 'catalogo', 'Crear materiales'),
  ('catalogo.editar', 'catalogo', 'Editar materiales'),
  ('catalogo.desactivar', 'catalogo', 'Desactivar materiales'),
  ('catalogo.importar_exportar', 'catalogo', 'Importar/exportar catálogo desde Excel'),
  ('frentes.ver', 'frentes', 'Ver frentes'),
  ('frentes.crear', 'frentes', 'Crear frentes'),
  ('frentes.editar', 'frentes', 'Editar frentes'),
  ('frentes.cerrar', 'frentes', 'Cerrar frentes'),
  ('almacenes.gestionar', 'almacen', 'Crear/editar almacenes'),
  ('stock.ver', 'almacen', 'Ver stock físico/reservado/disponible'),
  ('stock.registrar_ingreso', 'almacen', 'Registrar ingresos de material'),
  ('stock.registrar_ajuste', 'almacen', 'Registrar ajustes de inventario'),
  ('vales.crear', 'vales', 'Crear vales'),
  ('vales.editar_propio', 'vales', 'Editar vale propio en borrador'),
  ('vales.enviar', 'vales', 'Enviar vale para revisión'),
  ('vales.ver_propios', 'vales', 'Ver vales propios'),
  ('vales.ver_todos', 'vales', 'Ver todos los vales'),
  ('vales.aprobar_rechazar', 'vales', 'Aprobar o rechazar líneas de un vale'),
  ('vales.cancelar', 'vales', 'Cancelar un vale'),
  ('reservas.ver', 'reservas', 'Ver reservas'),
  ('reservas.liberar_manual', 'reservas', 'Liberar una reserva manualmente'),
  ('salidas.registrar_entrega', 'almacen', 'Registrar entrega física (parcial o total)'),
  ('kardex.ver', 'kardex', 'Ver Kardex'),
  ('kardex.exportar', 'kardex', 'Exportar Kardex'),
  ('procura.ver', 'procura', 'Ver metrados Procura'),
  ('procura.crear_version', 'procura', 'Crear nueva versión de un metrado'),
  ('procura.ver_comparacion', 'procura', 'Ver comparación Procura vs consumo'),
  ('alertas.ver', 'alertas', 'Ver alertas'),
  ('alertas.resolver', 'alertas', 'Marcar alertas como resueltas'),
  ('alertas.configurar_umbrales', 'alertas', 'Editar parámetros de configuración'),
  ('dashboard.ver', 'dashboard', 'Ver dashboard'),
  ('auditoria.ver', 'auditoria', 'Ver bitácora de auditoría'),
  ('reportes.exportar', 'reportes', 'Exportar reportes generales');

-- ---------------------------------------------------------------------------
-- Seed: asignación inicial rol -> permiso (matriz aprobada). Editable luego
-- por el Administrador vía roles.gestionar, sin migración.
-- Resolución §6.1: vales.aprobar_rechazar se concede a Almacén; si en la
-- operación real existe un "jefe de almacén" distinto, el Administrador crea
-- ese rol y le asigna el mismo permiso desde la UI.
-- ---------------------------------------------------------------------------
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('Administrador', 'usuarios.ver'), ('Administrador', 'usuarios.crear'), ('Administrador', 'usuarios.editar'),
  ('Administrador', 'usuarios.desactivar'), ('Administrador', 'roles.gestionar'),
  ('Administrador', 'catalogo.ver'), ('Administrador', 'catalogo.crear'), ('Administrador', 'catalogo.editar'),
  ('Administrador', 'catalogo.desactivar'), ('Administrador', 'catalogo.importar_exportar'),
  ('Administrador', 'frentes.ver'), ('Administrador', 'frentes.crear'), ('Administrador', 'frentes.editar'), ('Administrador', 'frentes.cerrar'),
  ('Administrador', 'almacenes.gestionar'), ('Administrador', 'stock.ver'), ('Administrador', 'stock.registrar_ingreso'), ('Administrador', 'stock.registrar_ajuste'),
  ('Administrador', 'vales.crear'), ('Administrador', 'vales.editar_propio'), ('Administrador', 'vales.enviar'),
  ('Administrador', 'vales.ver_propios'), ('Administrador', 'vales.ver_todos'), ('Administrador', 'vales.aprobar_rechazar'), ('Administrador', 'vales.cancelar'),
  ('Administrador', 'reservas.ver'), ('Administrador', 'reservas.liberar_manual'),
  ('Administrador', 'salidas.registrar_entrega'),
  ('Administrador', 'kardex.ver'), ('Administrador', 'kardex.exportar'),
  ('Administrador', 'procura.ver'), ('Administrador', 'procura.crear_version'), ('Administrador', 'procura.ver_comparacion'),
  ('Administrador', 'alertas.ver'), ('Administrador', 'alertas.resolver'), ('Administrador', 'alertas.configurar_umbrales'),
  ('Administrador', 'dashboard.ver'), ('Administrador', 'auditoria.ver'), ('Administrador', 'reportes.exportar'),

  ('Almacen', 'catalogo.ver'), ('Almacen', 'frentes.ver'),
  ('Almacen', 'stock.ver'), ('Almacen', 'stock.registrar_ingreso'), ('Almacen', 'stock.registrar_ajuste'),
  ('Almacen', 'vales.ver_propios'), ('Almacen', 'vales.ver_todos'), ('Almacen', 'vales.aprobar_rechazar'), ('Almacen', 'vales.cancelar'),
  ('Almacen', 'reservas.ver'), ('Almacen', 'reservas.liberar_manual'),
  ('Almacen', 'salidas.registrar_entrega'),
  ('Almacen', 'kardex.ver'), ('Almacen', 'kardex.exportar'),
  ('Almacen', 'procura.ver_comparacion'),
  ('Almacen', 'alertas.ver'), ('Almacen', 'alertas.resolver'),
  ('Almacen', 'dashboard.ver'), ('Almacen', 'reportes.exportar'),

  ('Supervisor', 'catalogo.ver'), ('Supervisor', 'frentes.ver'),
  ('Supervisor', 'stock.ver'),
  ('Supervisor', 'vales.crear'), ('Supervisor', 'vales.editar_propio'), ('Supervisor', 'vales.enviar'),
  ('Supervisor', 'vales.ver_propios'), ('Supervisor', 'vales.cancelar'),
  ('Supervisor', 'reservas.ver'),
  ('Supervisor', 'kardex.ver'),
  ('Supervisor', 'procura.ver'), ('Supervisor', 'procura.ver_comparacion'),
  ('Supervisor', 'alertas.ver'),
  ('Supervisor', 'dashboard.ver'),

  ('Planeamiento', 'catalogo.ver'), ('Planeamiento', 'frentes.ver'), ('Planeamiento', 'frentes.crear'),
  ('Planeamiento', 'frentes.editar'), ('Planeamiento', 'frentes.cerrar'),
  ('Planeamiento', 'stock.ver'),
  ('Planeamiento', 'vales.ver_todos'),
  ('Planeamiento', 'reservas.ver'),
  ('Planeamiento', 'kardex.ver'), ('Planeamiento', 'kardex.exportar'),
  ('Planeamiento', 'procura.ver'), ('Planeamiento', 'procura.crear_version'), ('Planeamiento', 'procura.ver_comparacion'),
  ('Planeamiento', 'alertas.ver'), ('Planeamiento', 'alertas.resolver'),
  ('Planeamiento', 'dashboard.ver'), ('Planeamiento', 'reportes.exportar'),

  ('Responsable de Catalogo', 'catalogo.ver'), ('Responsable de Catalogo', 'catalogo.crear'),
  ('Responsable de Catalogo', 'catalogo.editar'), ('Responsable de Catalogo', 'catalogo.desactivar'),
  ('Responsable de Catalogo', 'catalogo.importar_exportar'), ('Responsable de Catalogo', 'dashboard.ver'),

  ('Consulta', 'catalogo.ver'), ('Consulta', 'frentes.ver'), ('Consulta', 'stock.ver'),
  ('Consulta', 'vales.ver_todos'), ('Consulta', 'reservas.ver'),
  ('Consulta', 'kardex.ver'),
  ('Consulta', 'procura.ver'), ('Consulta', 'procura.ver_comparacion'),
  ('Consulta', 'alertas.ver'), ('Consulta', 'dashboard.ver'), ('Consulta', 'reportes.exportar')
) as seed(rol_nombre, permiso_codigo)
join roles r on r.nombre = seed.rol_nombre
join permisos p on p.codigo = seed.permiso_codigo;

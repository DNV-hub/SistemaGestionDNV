-- Permisos, RLS y auditoría del módulo RDC.
--
-- Mismo principio que el resto del Sistema (docs/MODELO_DATOS_Y_FLUJOS.md §2):
-- los permisos son DATOS, no reglas escritas en el código, y la validación
-- ocurre en la base de datos y no solo en el frontend.
--
-- Esto reemplaza el control de acceso actual del RDC, que consiste en una
-- constante `ADMIN_PASSWORD = 'admin123'` dentro de un archivo JavaScript
-- público — el propio código la describe como "un candado suave contra toques
-- accidentales, no seguridad real" — y en un desplegable donde cualquiera
-- podía emitir un reporte a nombre de cualquier supervisor.

-- ---------------------------------------------------------------------------
-- Catálogo de permisos
-- ---------------------------------------------------------------------------
insert into permisos (codigo, modulo, descripcion) values
  ('rdc.crear', 'rdc', 'Crear reportes diarios de campo'),
  ('rdc.editar_propio', 'rdc', 'Editar el reporte propio mientras sigue abierto'),
  ('rdc.ver_propios', 'rdc', 'Ver los reportes propios'),
  ('rdc.ver_todos', 'rdc', 'Ver todos los reportes diarios'),
  ('rdc.exportar', 'rdc', 'Exportar reportes diarios a Excel'),
  ('rdc.catalogos_gestionar', 'rdc', 'Administrar los catálogos del RDC (frentes, supervisores, prefijos, maquinaria, partidas)');

-- El rol Supervisor ya existe desde 20260822100100. Se le agrega el módulo
-- RDC; Planeamiento y Consulta lo ven completo pero no lo escriben.
-- Almacén no recibe nada: un almacenero no llena reportes de campo (el
-- sidebar solo le mostrará sus módulos, ver Fase B.3 del plan).
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('Administrador', 'rdc.crear'), ('Administrador', 'rdc.editar_propio'),
  ('Administrador', 'rdc.ver_propios'), ('Administrador', 'rdc.ver_todos'),
  ('Administrador', 'rdc.exportar'), ('Administrador', 'rdc.catalogos_gestionar'),

  ('Supervisor', 'rdc.crear'), ('Supervisor', 'rdc.editar_propio'),
  ('Supervisor', 'rdc.ver_propios'), ('Supervisor', 'rdc.exportar'),

  ('Planeamiento', 'rdc.ver_todos'), ('Planeamiento', 'rdc.exportar'),

  ('Consulta', 'rdc.ver_todos'), ('Consulta', 'rdc.exportar')
) as seed(rol_nombre, permiso_codigo)
join roles r on r.nombre = seed.rol_nombre
join permisos p on p.codigo = seed.permiso_codigo;

-- ---------------------------------------------------------------------------
-- Helpers de alcance
--
-- POR QUÉ NO SE USA `current_frente_id()` COMO EN EL RESTO DEL SISTEMA:
-- ese helper devuelve `usuarios.frente_id`, que apunta a la tabla `frentes`
-- del Sistema. Los reportes del RDC apuntan a `rdc_frentes`, que por ahora es
-- un maestro distinto (ver la migración de catálogos). Comparar ambos ids
-- daría siempre falso. Mientras los frentes no se unifiquen, el alcance de un
-- supervisor se resuelve por su identidad — los reportes que llenó o de los
-- que es responsable — que además es más preciso que "todo su frente".
-- ---------------------------------------------------------------------------
create or replace function public.rdc_supervisor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from rdc_supervisores where usuario_id = auth.uid();
$$;

comment on function public.rdc_supervisor_id() is
  'Id del supervisor del catálogo RDC vinculado al usuario autenticado, o null si no tiene vínculo.';

create or replace function public.rdc_puede_ver_reporte(p_reporte_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rdc_reportes r
    where r.id = p_reporte_id
      and (
        public.has_permission('rdc.ver_todos')
        or (
          public.has_permission('rdc.ver_propios')
          and (r.creado_por = auth.uid() or r.supervisor_id = public.rdc_supervisor_id())
        )
      )
  );
$$;

-- Un reporte propio se puede corregir mientras sigue abierto: en borrador
-- siempre, y ya finalizado solo el mismo día. Esa segunda parte es el flujo
-- "cometí un error — corregir y reenviar" que el RDC ya tiene hoy.
create or replace function public.rdc_puede_editar_reporte(p_reporte_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rdc_reportes r
    where r.id = p_reporte_id
      and public.has_permission('rdc.editar_propio')
      and (r.creado_por = auth.uid() or r.supervisor_id = public.rdc_supervisor_id())
      and (r.estado = 'Borrador' or r.fecha = current_date)
  );
$$;

grant execute on function public.rdc_supervisor_id() to authenticated;
grant execute on function public.rdc_puede_ver_reporte(uuid) to authenticated;
grant execute on function public.rdc_puede_editar_reporte(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants
--
-- Las tablas creadas después de 20260822101400 no quedan cubiertas por aquel
-- `grant ... on all tables`, que solo aplicó a las existentes en ese momento.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  rdc_sectores, rdc_frentes, rdc_supervisores, rdc_capataces,
  rdc_redline_supervisores, rdc_prefijos, rdc_maquinarias,
  rdc_partidas_estandar, rdc_partidas_edt, rdc_pernos_biblioteca,
  rdc_reportes, rdc_reporte_personal, rdc_reporte_maquinaria,
  rdc_reporte_hitos, rdc_reporte_metrados, rdc_reporte_elementos,
  rdc_reporte_bitacora, rdc_reporte_standby, rdc_reporte_programacion
to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de los catálogos
--
-- Lectura para cualquier usuario autenticado: sin catálogos no se puede ni
-- dibujar el formulario, y no hay nada sensible en una lista de frentes o de
-- tipos de malla. Escritura solo con rdc.catalogos_gestionar.
-- ---------------------------------------------------------------------------
alter table rdc_sectores enable row level security;
create policy rdc_sectores_select on rdc_sectores for select using (auth.role() = 'authenticated');
create policy rdc_sectores_write on rdc_sectores for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_frentes enable row level security;
create policy rdc_frentes_select on rdc_frentes for select using (auth.role() = 'authenticated');
create policy rdc_frentes_write on rdc_frentes for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_supervisores enable row level security;
create policy rdc_supervisores_select on rdc_supervisores for select using (auth.role() = 'authenticated');
create policy rdc_supervisores_write on rdc_supervisores for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_capataces enable row level security;
create policy rdc_capataces_select on rdc_capataces for select using (auth.role() = 'authenticated');
create policy rdc_capataces_write on rdc_capataces for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_redline_supervisores enable row level security;
create policy rdc_redline_supervisores_select on rdc_redline_supervisores for select using (auth.role() = 'authenticated');
create policy rdc_redline_supervisores_write on rdc_redline_supervisores for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_prefijos enable row level security;
create policy rdc_prefijos_select on rdc_prefijos for select using (auth.role() = 'authenticated');
create policy rdc_prefijos_write on rdc_prefijos for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_maquinarias enable row level security;
create policy rdc_maquinarias_select on rdc_maquinarias for select using (auth.role() = 'authenticated');
create policy rdc_maquinarias_write on rdc_maquinarias for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_partidas_estandar enable row level security;
create policy rdc_partidas_estandar_select on rdc_partidas_estandar for select using (auth.role() = 'authenticated');
create policy rdc_partidas_estandar_write on rdc_partidas_estandar for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_partidas_edt enable row level security;
create policy rdc_partidas_edt_select on rdc_partidas_edt for select using (auth.role() = 'authenticated');
create policy rdc_partidas_edt_write on rdc_partidas_edt for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

alter table rdc_pernos_biblioteca enable row level security;
create policy rdc_pernos_biblioteca_select on rdc_pernos_biblioteca for select using (auth.role() = 'authenticated');
create policy rdc_pernos_biblioteca_write on rdc_pernos_biblioteca for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

-- ---------------------------------------------------------------------------
-- RLS de los reportes
--
-- Las condiciones van escritas en línea (y no llamando a
-- rdc_puede_ver_reporte) porque una política sobre rdc_reportes que consulte
-- rdc_reportes es más difícil de leer y de razonar. Las tablas de detalle sí
-- usan los helpers: consultan otra tabla, así que no hay circularidad.
--
-- El INSERT exige `creado_por = auth.uid()`: la autoría sale de la sesión y
-- no se puede falsificar desde el cliente. Ese es el punto entero de la Fase
-- B — hoy el autor es un nombre elegido de una lista.
--
-- No hay política de DELETE sobre rdc_reportes: los reportes son registro
-- histórico y no se borran, igual que kardex, vales y auditoría en el resto
-- del Sistema (spec §16). Corregir se hace editando y reenviando.
-- ---------------------------------------------------------------------------
alter table rdc_reportes enable row level security;

create policy rdc_reportes_select on rdc_reportes for select
  using (
    public.has_permission('rdc.ver_todos')
    or (
      public.has_permission('rdc.ver_propios')
      and (creado_por = auth.uid() or supervisor_id = public.rdc_supervisor_id())
    )
  );

create policy rdc_reportes_insert on rdc_reportes for insert
  with check (public.has_permission('rdc.crear') and creado_por = auth.uid());

create policy rdc_reportes_update on rdc_reportes for update
  using (
    public.has_permission('rdc.editar_propio')
    and (creado_por = auth.uid() or supervisor_id = public.rdc_supervisor_id())
    and (estado = 'Borrador' or fecha = current_date)
  )
  with check (
    public.has_permission('rdc.editar_propio')
    and creado_por = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- RLS de las tablas de detalle
--
-- Todas siguen la misma regla: se ven si se ve el reporte, y se escriben si
-- el reporte se puede editar. El DELETE es necesario — al corregir un
-- reporte el supervisor borra filas (un perno mal digitado, una parada que no
-- fue), y al re-sincronizar el cliente reemplaza el detalle completo.
-- ---------------------------------------------------------------------------
alter table rdc_reporte_personal enable row level security;
create policy rdc_reporte_personal_select on rdc_reporte_personal for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_personal_write on rdc_reporte_personal for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

alter table rdc_reporte_maquinaria enable row level security;
create policy rdc_reporte_maquinaria_select on rdc_reporte_maquinaria for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_maquinaria_write on rdc_reporte_maquinaria for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

alter table rdc_reporte_hitos enable row level security;
create policy rdc_reporte_hitos_select on rdc_reporte_hitos for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_hitos_write on rdc_reporte_hitos for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

alter table rdc_reporte_metrados enable row level security;
create policy rdc_reporte_metrados_select on rdc_reporte_metrados for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_metrados_write on rdc_reporte_metrados for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

alter table rdc_reporte_elementos enable row level security;
create policy rdc_reporte_elementos_select on rdc_reporte_elementos for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_elementos_write on rdc_reporte_elementos for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

alter table rdc_reporte_bitacora enable row level security;
create policy rdc_reporte_bitacora_select on rdc_reporte_bitacora for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_bitacora_write on rdc_reporte_bitacora for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

alter table rdc_reporte_standby enable row level security;
create policy rdc_reporte_standby_select on rdc_reporte_standby for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_standby_write on rdc_reporte_standby for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

alter table rdc_reporte_programacion enable row level security;
create policy rdc_reporte_programacion_select on rdc_reporte_programacion for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_programacion_write on rdc_reporte_programacion for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

-- ---------------------------------------------------------------------------
-- Auditoría
--
-- Solo sobre la cabecera. Auditar el detalle inundaría la tabla: un solo
-- reporte puede traer 200 pernos, y cada uno generaría su fila de auditoría
-- con el registro completo en JSON. Lo que interesa rastrear es quién creó,
-- corrigió o reenvió un reporte — eso vive en la cabecera.
-- ---------------------------------------------------------------------------
create trigger trg_audit_rdc_reportes
  after insert or update or delete on rdc_reportes
  for each row execute function public.fn_audit();

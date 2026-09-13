-- Dos pedidos distintos de Planeamiento sobre el Reporte Diario:
--
-- 1. "A veces nos ponen como supervisores porque alguno se enferma" — para
--    esto alcanza con rdc.editar_propio (ya tiene rdc.crear desde antes,
--    para Fotos): con los dos puede crear y terminar de llenar SU PROPIO
--    reporte (creado_por = su cuenta).
--
-- 2. "Corregir un reporte mal hecho" — un reporte que YA mandó un supervisor
--    de verdad no lo puede tocar ni con rdc.editar_propio: la política
--    actual solo deja editar lo que uno mismo creó o lo del frente donde
--    uno es el supervisor vinculado (rdc_supervisor_id()), y Planeamiento
--    no tiene ese vínculo con ningún frente. Para esto hace falta un
--    permiso nuevo, sin esa restricción de autoría.
insert into permisos (codigo, modulo, descripcion) values
  ('rdc.editar_todos', 'rdc', 'Editar cualquier reporte diario, sin importar quién lo creó')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo = 'rdc.editar_propio'
where r.nombre = 'Planeamiento'
on conflict (rol_id, permiso_id) do nothing;

-- rdc.editar_todos también a Administrador: hoy tiene rdc.editar_propio
-- pero, igual que Planeamiento, no está vinculado a ningún frente como
-- supervisor — así que en la práctica tampoco podía corregir un reporte
-- ajeno. "Control total del sistema" (su descripción en el catálogo de
-- roles) debería incluir esto.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r
join permisos p on p.codigo = 'rdc.editar_todos'
where r.nombre in ('Planeamiento', 'Administrador')
on conflict (rol_id, permiso_id) do nothing;

-- ---------------------------------------------------------------------------
-- rdc_puede_editar_reporte(): la usan las 8 tablas de detalle del reporte
-- (personal, maquinaria, hitos, metrados, elementos, bitácora, standby,
-- programación) — un solo lugar que actualizar en vez de 8 políticas.
-- ---------------------------------------------------------------------------
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
      and (
        public.has_permission('rdc.editar_todos')
        or (
          public.has_permission('rdc.editar_propio')
          and (r.creado_por = auth.uid() or r.supervisor_id = public.rdc_supervisor_id())
        )
      )
      and (
        r.estado = 'Borrador'
        or r.fecha >= current_date - coalesce(
             (select (valor #>> '{}')::int from configuracion where clave = 'rdc_dias_correccion'),
             7
           )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- rdc_reportes_update: en línea y no vía el helper de arriba (misma razón
-- que ya explica la migración original — una política sobre rdc_reportes
-- que consultara rdc_reportes sería más difícil de razonar).
-- ---------------------------------------------------------------------------
drop policy rdc_reportes_update on rdc_reportes;

create policy rdc_reportes_update on rdc_reportes for update
  using (
    (
      public.has_permission('rdc.editar_todos')
      or (
        public.has_permission('rdc.editar_propio')
        and (creado_por = auth.uid() or supervisor_id = public.rdc_supervisor_id())
      )
    )
    and (
      estado = 'Borrador'
      or fecha >= current_date - coalesce(
           (select (valor #>> '{}')::int from configuracion where clave = 'rdc_dias_correccion'),
           7
         )
    )
  )
  with check (
    public.has_permission('rdc.editar_todos')
    or (
      public.has_permission('rdc.editar_propio')
      and creado_por = auth.uid()
    )
  );

-- Tres pedidos del usuario sobre el módulo Vales, probado con un único
-- supervisor real mientras el resto sigue enviando por WhatsApp:
--
-- 1. Numeración simple y secuencial (V-0001, V-0002…) en vez del código
--    aleatorio que generaba el frontend (V-20260908-IDKU): un correlativo
--    por secuencia, asignado en el propio insert así no hay condición de
--    carrera entre dos altas simultáneas.
-- 2. `creado_por`: cuando Almacén transcribe manualmente un vale que llegó
--    por WhatsApp, hay que poder registrar tanto para qué supervisor es
--    (`supervisor_id`, ya existía) como quién lo tipeó (`creado_por`, nuevo).
--    Nace null cuando el propio supervisor lo envía desde la app.
-- 3. Corrige que un vale quedara "Aprobado" aunque Almacén hubiera
--    rechazado su única línea: eso lo arregla el frontend
--    (_actualizarEstadoValeSiCorresponde en store/vales.js), esta migración
--    solo habilita los permisos y políticas que la carga manual necesita.

-- ---------------------------------------------------------------------------
-- 1. Numeración secuencial simple
-- ---------------------------------------------------------------------------
create sequence if not exists vales_numero_seq start with 1;
grant usage on sequence vales_numero_seq to authenticated;

create or replace function public.fn_vales_generar_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := 'V-' || lpad(nextval('vales_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_vales_generar_numero
  before insert on vales
  for each row execute function public.fn_vales_generar_numero();

-- ---------------------------------------------------------------------------
-- 2. Quién transcribió el vale (si no fue el propio supervisor)
-- ---------------------------------------------------------------------------
alter table vales add column creado_por uuid references usuarios(id);
create index idx_vales_creado_por on vales(creado_por);

-- Almacén hoy no tiene vales.crear (solo Administrador y Supervisor lo
-- tenían): sin esto ni siquiera aparece el botón "+ Nuevo vale" para cargar
-- manualmente lo que llega por WhatsApp.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r, permisos p
where p.codigo = 'vales.crear' and r.nombre = 'Almacen';

-- Permiso separado de vales.crear: no todo el que puede crear su propio
-- vale (un Supervisor) debe poder crear vales a nombre de otro.
insert into permisos (codigo, modulo, descripcion) values
  ('vales.crear_para_otro', 'vales', 'Crear un vale en nombre de otro supervisor (carga manual, ej. por WhatsApp)');

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
from roles r, permisos p
where p.codigo = 'vales.crear_para_otro'
  and r.nombre in ('Administrador', 'Almacen');

-- ---------------------------------------------------------------------------
-- 3. Políticas: permitir insertar con supervisor_id distinto de auth.uid()
--    solo cuando creado_por = auth.uid() y tiene vales.crear_para_otro.
-- ---------------------------------------------------------------------------
drop policy vales_insert on vales;
create policy vales_insert on vales for insert
  with check (
    public.has_permission('vales.crear')
    and (
      (supervisor_id = auth.uid() and creado_por is null)
      or (creado_por = auth.uid() and public.has_permission('vales.crear_para_otro'))
    )
  );

drop policy vale_detalle_insert on vale_detalle;
create policy vale_detalle_insert on vale_detalle for insert
  with check (
    exists (
      select 1 from vales v where v.id = vale_detalle.vale_id
        and v.estado = 'Borrador'
        and (
          (v.supervisor_id = auth.uid() and public.has_permission('vales.editar_propio'))
          or (v.creado_por = auth.uid() and public.has_permission('vales.crear_para_otro'))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Para mostrar nombres (supervisor y quién lo transcribió) en la lista de
-- vales: los mismos roles que ya ven todos los vales (vales.ver_todos)
-- pueden resolver el nombre del usuario detrás de cada uno.
-- ---------------------------------------------------------------------------
drop policy usuarios_select on usuarios;
create policy usuarios_select on usuarios for select
  using (
    id = auth.uid()
    or public.has_permission('usuarios.ver')
    or public.has_permission('vales.ver_todos')
  );

-- Lista de supervisores activos para el selector "¿a nombre de quién es
-- este vale?" en la carga manual. Solo expone id + nombre (no todo
-- `usuarios`) y solo a quien puede crear vales para otro.
create or replace function public.fn_listar_supervisores()
returns table (id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('vales.crear_para_otro') then
    raise exception 'No tiene permiso para listar supervisores (vales.crear_para_otro)';
  end if;

  return query
    select u.id, u.nombre
    from usuarios u
    join roles r on r.id = u.rol_id
    where r.nombre = 'Supervisor'
      and u.estado = 'activo'
    order by u.nombre;
end;
$$;

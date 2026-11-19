-- Control de ingresos y ajustes de stock (caso PLACA.B32_4.5, 19/11/2026).
--
-- Origen: la carga inicial del 14/09/2026 metió 901 placas sin guía que no
-- existían en físico, y un ajuste con motivo "S" sumó 2 más. Nada lo impedía.
-- Desde ahora:
--   1. Todo ingreso exige documento de referencia (guía / acta). Los ingresos
--      que genera el propio sistema (devoluciones, reevaluaciones, ajustes con
--      lote) ya llevan uno, así que no se ven afectados.
--   2. Todo ajuste exige un motivo de al menos 10 caracteres, y los ajustes
--      positivos exigen además documento (guía o acta de conteo).
--   3. Un ajuste de más de 50 unidades queda "Pendiente" y NO mueve stock
--      hasta que lo apruebe alguien con el permiso stock.aprobar_ajuste,
--      que no puede ser quien lo registró.
--   4. Solo el rol Almacen registra ingresos y ajustes.
--
-- Reversible: drop trigger trg_ingresos_validar on ingresos;
--   drop trigger trg_ajustes_validar on ajustes; drop trigger trg_ajustes_aprobacion on ajustes;
--   restaurar fn_trg_ajuste anterior (20261016120000) y el trigger trg_ajustes_movimiento sin WHEN;
--   alter table ajustes drop column estado, documento_referencia, aprobado_por, aprobado_at, motivo_rechazo;
--   volver a dar stock.registrar_ingreso/registrar_ajuste a Administrador, Developer, Coordinador y Planeamiento.

-- ---------------------------------------------------------------- columnas
alter table ajustes
  add column if not exists documento_referencia text,
  add column if not exists estado text not null default 'Aprobado',
  add column if not exists aprobado_por uuid references usuarios(id),
  add column if not exists aprobado_at timestamptz,
  add column if not exists motivo_rechazo text;

alter table ajustes drop constraint if exists chk_ajustes_estado;
alter table ajustes add constraint chk_ajustes_estado check (estado in ('Pendiente', 'Aprobado', 'Rechazado'));

-- -------------------------------------------------------- 1. ingresos con guía
create or replace function public.fn_trg_ingreso_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(length(btrim(new.documento_referencia)), 0) < 4 then
    raise exception 'Todo ingreso necesita su documento de referencia (número de guía o acta). Sin documento no se registra stock.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ingresos_validar on ingresos;
create trigger trg_ingresos_validar before insert on ingresos
  for each row execute function public.fn_trg_ingreso_validar();

-- ------------------------------------------- 2 y 3. ajustes validados y aprobados
create or replace function public.fn_trg_ajuste_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(length(btrim(new.motivo)), 0) < 10 then
    raise exception 'El motivo del ajuste debe explicar qué pasó (mínimo 10 caracteres).';
  end if;
  if new.tipo = 'positivo' and coalesce(length(btrim(new.documento_referencia)), 0) < 4 then
    raise exception 'Un ajuste positivo necesita documento de respaldo (guía o acta de conteo).';
  end if;
  new.estado := case when new.cantidad > 50 then 'Pendiente' else 'Aprobado' end;
  new.aprobado_por := null;
  new.aprobado_at := null;
  return new;
end;
$$;

drop trigger if exists trg_ajustes_validar on ajustes;
create trigger trg_ajustes_validar before insert on ajustes
  for each row execute function public.fn_trg_ajuste_validar();

-- El movimiento de stock solo corre si el ajuste está Aprobado (al insertarse
-- chico, o cuando se aprueba uno pendiente).
create or replace function public.fn_trg_ajuste()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_conversion text;
begin
  if new.estado <> 'Aprobado' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'Aprobado' then
    return new; -- ya se aplicó
  end if;

  if new.tipo = 'positivo' then
    select tipo_conversion into v_tipo_conversion from materiales where id = new.material_id;

    if v_tipo_conversion is not null and v_tipo_conversion <> 'ninguna' then
      if new.largo is null or (v_tipo_conversion = 'area' and new.ancho is null) then
        raise exception 'Este material necesita indicar su medida (ancho×largo) para generar el lote del ajuste.';
      end if;
      insert into ingresos (almacen_id, material_id, contrato_id, cantidad, documento_referencia, usuario_id, observacion, ancho, largo)
      values (
        new.almacen_id, new.material_id, new.contrato_id, new.cantidad,
        'Ajuste positivo (' || coalesce(new.documento_referencia, new.motivo) || ')', new.usuario_id, new.motivo, new.ancho, new.largo
      );
    else
      perform public.fn_registrar_movimiento_stock(
        new.almacen_id, new.material_id, new.contrato_id, new.cantidad, 'ajuste_positivo', new.cantidad,
        new.usuario_id, 'ajustes', new.id, null, new.motivo
      );
    end if;
  else
    perform public.fn_registrar_movimiento_stock(
      new.almacen_id, new.material_id, new.contrato_id, -new.cantidad, 'ajuste_negativo', new.cantidad,
      new.usuario_id, 'ajustes', new.id, null, new.motivo
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ajustes_aprobacion on ajustes;
create trigger trg_ajustes_aprobacion after update of estado on ajustes
  for each row when (old.estado = 'Pendiente' and new.estado = 'Aprobado')
  execute function public.fn_trg_ajuste();

insert into permisos (codigo, modulo, descripcion)
select 'stock.aprobar_ajuste', 'almacen', 'Aprobar o rechazar ajustes de inventario mayores a 50 unidades'
where not exists (select 1 from permisos where codigo = 'stock.aprobar_ajuste');

create or replace function public.fn_resolver_ajuste(p_ajuste_id uuid, p_aprobar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aj ajustes%rowtype;
begin
  if not public.has_permission('stock.aprobar_ajuste') then
    raise exception 'No tiene permiso para aprobar ajustes de inventario.';
  end if;
  select * into v_aj from ajustes where id = p_ajuste_id for update;
  if not found then
    raise exception 'Ajuste no encontrado.';
  end if;
  if v_aj.estado <> 'Pendiente' then
    raise exception 'Este ajuste ya fue resuelto (%).', v_aj.estado;
  end if;
  if v_aj.usuario_id = auth.uid() then
    raise exception 'Quien registra un ajuste no puede aprobarlo: debe hacerlo otra persona.';
  end if;
  if not p_aprobar and coalesce(length(btrim(p_motivo)), 0) < 5 then
    raise exception 'Indica el motivo del rechazo.';
  end if;

  update ajustes
     set estado = case when p_aprobar then 'Aprobado' else 'Rechazado' end,
         aprobado_por = auth.uid(),
         aprobado_at = now(),
         motivo_rechazo = case when p_aprobar then null else btrim(p_motivo) end
   where id = p_ajuste_id;
end;
$$;

revoke all on function public.fn_resolver_ajuste(uuid, boolean, text) from public, anon;
grant execute on function public.fn_resolver_ajuste(uuid, boolean, text) to authenticated;

-- ------------------------------------------------- 4. solo Almacen registra stock
delete from rol_permisos rp
 using roles r, permisos p
 where rp.rol_id = r.id and rp.permiso_id = p.id
   and p.codigo in ('stock.registrar_ingreso', 'stock.registrar_ajuste')
   and r.nombre <> 'Almacen';

-- Aprobador: Administrador y Coordinador (se puede cambiar desde Roles).
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id
  from roles r cross join permisos p
 where p.codigo = 'stock.aprobar_ajuste'
   and r.nombre in ('Administrador', 'Coordinador')
   and not exists (select 1 from rol_permisos x where x.rol_id = r.id and x.permiso_id = p.id);

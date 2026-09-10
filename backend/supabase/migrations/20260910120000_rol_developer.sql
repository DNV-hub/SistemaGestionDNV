-- Rol Developer: acceso total igual que Administrador, más dos permisos
-- exclusivos que Administrador no tiene:
--   - sistema.borrar_pruebas: borrar vales y reportes del RDC de prueba.
--   - sistema.suplantar_usuario: abrir una sesión real como otra cuenta,
--     para ver el sistema tal cual lo ve (Almacén, un supervisor, etc.).
-- Ambos son deliberadamente más peligrosos que cualquier permiso existente
-- (uno hace DELETE irreversible, el otro es tomar control de una cuenta
-- ajena), por eso van en un rol aparte y no se le agregan a Administrador.

insert into permisos (codigo, modulo, descripcion) values
  ('sistema.borrar_pruebas', 'sistema', 'Borrar vales y reportes del RDC (limpieza de pruebas)'),
  ('sistema.suplantar_usuario', 'sistema', 'Abrir una sesión real como otra cuenta, para ver el sistema desde su punto de vista');

insert into roles (nombre, descripcion) values
  ('Developer', 'Acceso total (igual que Administrador) más herramientas de prueba: borrar datos de prueba y ver el sistema como otra cuenta.');

-- Copia exacta de todo lo que ya tiene Administrador.
insert into rol_permisos (rol_id, permiso_id)
select (select id from roles where nombre = 'Developer'), rp.permiso_id
from rol_permisos rp
where rp.rol_id = (select id from roles where nombre = 'Administrador');

-- Más los dos exclusivos de este rol.
insert into rol_permisos (rol_id, permiso_id)
select (select id from roles where nombre = 'Developer'), p.id
from permisos p
where p.codigo in ('sistema.borrar_pruebas', 'sistema.suplantar_usuario');

-- ---------------------------------------------------------------------------
-- Borrar un vale de prueba.
--
-- Un vale real que ya tuvo una entrega física (hay `salidas`, que ya
-- descontaron `stock` y quedaron en `kardex`) NO se borra: eso es historia
-- de inventario real, no una prueba, y borrarlo dejaría el stock mal sin que
-- nada lo avise. Para esos casos existe Devoluciones.
--
-- Lo que sí tuvo una reserva pero nunca se entregó, se libera primero
-- (fn_liberar_reserva ya sabe devolver `stock.cantidad_reservada`) y recién
-- ahí se borran las filas de `reservas`/`reservas_historial` y el vale
-- (que en cascada se lleva `vale_detalle`).
-- ---------------------------------------------------------------------------
create or replace function public.fn_borrar_vale_prueba(p_vale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva record;
  v_tiene_entrega boolean;
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para borrar vales (sistema.borrar_pruebas)';
  end if;

  if not exists (select 1 from vales where id = p_vale_id) then
    raise exception 'El vale % no existe', p_vale_id;
  end if;

  select exists (
    select 1 from reservas r
    join vale_detalle vd on vd.id = r.vale_detalle_id
    where vd.vale_id = p_vale_id and r.cantidad_entregada > 0
  ) into v_tiene_entrega;

  if v_tiene_entrega then
    raise exception
      'Este vale ya tuvo una entrega física real (hay salidas/kardex de por medio) — no se puede borrar. Si es una prueba, revertila con Devoluciones.';
  end if;

  for v_reserva in
    select r.id from reservas r
    join vale_detalle vd on vd.id = r.vale_detalle_id
    where vd.vale_id = p_vale_id and r.estado in ('Activa', 'Parcial')
  loop
    perform public.fn_liberar_reserva(v_reserva.id, 'Vale de prueba borrado por Developer', auth.uid(), true);
  end loop;

  delete from reservas_historial
  where reserva_id in (
    select r.id from reservas r
    join vale_detalle vd on vd.id = r.vale_detalle_id
    where vd.vale_id = p_vale_id
  );

  delete from reservas
  where vale_detalle_id in (select id from vale_detalle where vale_id = p_vale_id);

  delete from vales where id = p_vale_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Borrar un reporte del RDC de prueba. No mueve stock ni kardex — solo va a
-- SharePoint como Excel y a esta tabla — así que es un DELETE simple, y las
-- 8 tablas de detalle ya están en cascada desde su creación.
-- ---------------------------------------------------------------------------
create or replace function public.fn_borrar_reporte_rdc_prueba(p_reporte_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para borrar reportes del RDC (sistema.borrar_pruebas)';
  end if;

  delete from rdc_reportes where id = p_reporte_id;
end;
$$;

-- Cuenta Administrador existente del usuario: pasa a Developer.
update usuarios
set rol_id = (select id from roles where nombre = 'Developer')
where email = 'luisoppe98@gmail.com';

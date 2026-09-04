-- Row Level Security, alineada a la matriz de docs/MODELO_DATOS_Y_FLUJOS.md §2.
-- Esto es lo que hace que la validación de permisos ocurra también en la
-- base de datos, no solo en el frontend (spec §18).
--
-- `stock`, `kardex`, `reservas`, `reservas_historial`, `alertas` y
-- `auditoria` no tienen políticas de escritura para `authenticated`: solo
-- cambian mediante las funciones security definer ya creadas, que corren
-- con los privilegios del rol propietario y por lo tanto no dependen de
-- estas políticas.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on procura_vs_consumo to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- roles / permisos / rol_permisos
-- ---------------------------------------------------------------------------
alter table roles enable row level security;
create policy roles_select on roles for select using (auth.role() = 'authenticated');
create policy roles_write on roles for all
  using (public.has_permission('roles.gestionar'))
  with check (public.has_permission('roles.gestionar'));

alter table permisos enable row level security;
create policy permisos_select on permisos for select using (auth.role() = 'authenticated');
create policy permisos_write on permisos for all
  using (public.has_permission('roles.gestionar'))
  with check (public.has_permission('roles.gestionar'));

alter table rol_permisos enable row level security;
create policy rol_permisos_select on rol_permisos for select using (auth.role() = 'authenticated');
create policy rol_permisos_write on rol_permisos for all
  using (public.has_permission('roles.gestionar'))
  with check (public.has_permission('roles.gestionar'));

-- ---------------------------------------------------------------------------
-- usuarios
-- ---------------------------------------------------------------------------
alter table usuarios enable row level security;
create policy usuarios_select on usuarios for select
  using (id = auth.uid() or public.has_permission('usuarios.ver'));
create policy usuarios_insert on usuarios for insert
  with check (public.has_permission('usuarios.crear'));
create policy usuarios_update on usuarios for update
  using (public.has_permission('usuarios.editar') or public.has_permission('usuarios.desactivar'))
  with check (public.has_permission('usuarios.editar') or public.has_permission('usuarios.desactivar'));

-- ---------------------------------------------------------------------------
-- frentes
-- ---------------------------------------------------------------------------
alter table frentes enable row level security;
create policy frentes_select on frentes for select using (public.has_permission('frentes.ver'));
create policy frentes_insert on frentes for insert with check (public.has_permission('frentes.crear'));
create policy frentes_update on frentes for update
  using (public.has_permission('frentes.editar') or public.has_permission('frentes.cerrar'))
  with check (public.has_permission('frentes.editar') or public.has_permission('frentes.cerrar'));

-- ---------------------------------------------------------------------------
-- categorias / materiales
-- ---------------------------------------------------------------------------
alter table categorias enable row level security;
create policy categorias_select on categorias for select using (public.has_permission('catalogo.ver'));
create policy categorias_write on categorias for all
  using (public.has_permission('catalogo.crear') or public.has_permission('catalogo.editar'))
  with check (public.has_permission('catalogo.crear') or public.has_permission('catalogo.editar'));

alter table materiales enable row level security;
create policy materiales_select on materiales for select using (public.has_permission('catalogo.ver'));
create policy materiales_insert on materiales for insert with check (public.has_permission('catalogo.crear'));
create policy materiales_update on materiales for update
  using (public.has_permission('catalogo.editar') or public.has_permission('catalogo.desactivar'))
  with check (public.has_permission('catalogo.editar') or public.has_permission('catalogo.desactivar'));

-- ---------------------------------------------------------------------------
-- almacenes / stock
-- ---------------------------------------------------------------------------
alter table almacenes enable row level security;
create policy almacenes_select on almacenes for select
  using (public.has_permission('stock.ver') or public.has_permission('almacenes.gestionar'));
create policy almacenes_write on almacenes for all
  using (public.has_permission('almacenes.gestionar'))
  with check (public.has_permission('almacenes.gestionar'));

alter table stock enable row level security;
create policy stock_select on stock for select using (public.has_permission('stock.ver'));
-- Sin políticas de INSERT/UPDATE/DELETE: cantidad_fisica y
-- cantidad_reservada solo cambian vía fn_registrar_movimiento_stock,
-- fn_crear_reserva, fn_avanzar_reserva y fn_liberar_reserva.

-- ---------------------------------------------------------------------------
-- configuracion
-- ---------------------------------------------------------------------------
alter table configuracion enable row level security;
create policy configuracion_select on configuracion for select using (auth.role() = 'authenticated');
create policy configuracion_write on configuracion for all
  using (public.has_permission('alertas.configurar_umbrales'))
  with check (public.has_permission('alertas.configurar_umbrales'));

-- ---------------------------------------------------------------------------
-- vales / vale_detalle
-- Un Supervisor solo ve/edita sus propios vales; el resto de roles con
-- vales.ver_todos ve todo. Aprobar/rechazar/cancelar son permisos aparte.
-- ---------------------------------------------------------------------------
alter table vales enable row level security;
create policy vales_select on vales for select
  using (supervisor_id = auth.uid() or public.has_permission('vales.ver_todos'));
create policy vales_insert on vales for insert
  with check (public.has_permission('vales.crear') and supervisor_id = auth.uid());
create policy vales_update on vales for update
  using (
    (supervisor_id = auth.uid() and estado = 'Borrador' and public.has_permission('vales.editar_propio'))
    or public.has_permission('vales.aprobar_rechazar')
    or public.has_permission('vales.cancelar')
  )
  with check (
    (supervisor_id = auth.uid() and public.has_permission('vales.editar_propio'))
    or public.has_permission('vales.aprobar_rechazar')
    or public.has_permission('vales.cancelar')
  );

alter table vale_detalle enable row level security;
create policy vale_detalle_select on vale_detalle for select
  using (exists (
    select 1 from vales v where v.id = vale_detalle.vale_id
      and (v.supervisor_id = auth.uid() or public.has_permission('vales.ver_todos'))
  ));
create policy vale_detalle_insert on vale_detalle for insert
  with check (
    public.has_permission('vales.editar_propio')
    and exists (
      select 1 from vales v where v.id = vale_detalle.vale_id
        and v.supervisor_id = auth.uid() and v.estado = 'Borrador'
    )
  );
create policy vale_detalle_update on vale_detalle for update
  using (
    public.has_permission('vales.aprobar_rechazar')
    or exists (
      select 1 from vales v where v.id = vale_detalle.vale_id
        and v.supervisor_id = auth.uid() and v.estado = 'Borrador'
        and public.has_permission('vales.editar_propio')
    )
  )
  with check (
    public.has_permission('vales.aprobar_rechazar')
    or exists (
      select 1 from vales v where v.id = vale_detalle.vale_id
        and v.supervisor_id = auth.uid() and v.estado = 'Borrador'
        and public.has_permission('vales.editar_propio')
    )
  );

-- ---------------------------------------------------------------------------
-- reservas / reservas_historial
-- Sin políticas de escritura directa: se mutan solo vía
-- fn_crear_reserva / fn_avanzar_reserva / fn_liberar_reserva.
-- ---------------------------------------------------------------------------
alter table reservas enable row level security;
create policy reservas_select on reservas for select
  using (
    public.has_permission('reservas.ver')
    and (not public.es_supervisor() or frente_id = public.current_frente_id())
  );

alter table reservas_historial enable row level security;
create policy reservas_historial_select on reservas_historial for select
  using (exists (
    select 1 from reservas r
    where r.id = reservas_historial.reserva_id
      and public.has_permission('reservas.ver')
      and (not public.es_supervisor() or r.frente_id = public.current_frente_id())
  ));

-- ---------------------------------------------------------------------------
-- ingresos / ajustes / salidas
-- ---------------------------------------------------------------------------
alter table ingresos enable row level security;
create policy ingresos_select on ingresos for select using (public.has_permission('stock.ver'));
create policy ingresos_insert on ingresos for insert
  with check (public.has_permission('stock.registrar_ingreso') and usuario_id = auth.uid());

alter table ajustes enable row level security;
create policy ajustes_select on ajustes for select using (public.has_permission('stock.ver'));
create policy ajustes_insert on ajustes for insert
  with check (public.has_permission('stock.registrar_ajuste') and usuario_id = auth.uid());

alter table salidas enable row level security;
create policy salidas_select on salidas for select
  using (
    public.has_permission('kardex.ver')
    and (not public.es_supervisor() or frente_id = public.current_frente_id())
  );
create policy salidas_insert on salidas for insert
  with check (public.has_permission('salidas.registrar_entrega') and usuario_id = auth.uid());

-- ---------------------------------------------------------------------------
-- kardex — solo lectura, se llena por trigger.
-- ---------------------------------------------------------------------------
alter table kardex enable row level security;
create policy kardex_select on kardex for select
  using (
    public.has_permission('kardex.ver')
    and (
      not public.es_supervisor()
      or exists (
        select 1 from vales v where v.id = kardex.vale_id and v.frente_id = public.current_frente_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- metrados_procura — solo insert (versionado), nunca update/delete directo.
-- ---------------------------------------------------------------------------
alter table metrados_procura enable row level security;
create policy metrados_select on metrados_procura for select
  using (
    public.has_permission('procura.ver')
    and (not public.es_supervisor() or frente_id = public.current_frente_id())
  );
create policy metrados_insert on metrados_procura for insert
  with check (public.has_permission('procura.crear_version') and responsable_id = auth.uid());

-- ---------------------------------------------------------------------------
-- alertas — insertadas solo por fn_evaluar_alertas; los usuarios pueden
-- resolverlas.
-- ---------------------------------------------------------------------------
alter table alertas enable row level security;
create policy alertas_select on alertas for select
  using (
    public.has_permission('alertas.ver')
    and (not public.es_supervisor() or frente_id = public.current_frente_id() or frente_id is null)
  );
create policy alertas_update on alertas for update
  using (public.has_permission('alertas.resolver'))
  with check (public.has_permission('alertas.resolver'));

-- ---------------------------------------------------------------------------
-- auditoria — solo lectura para quien tiene auditoria.ver.
-- ---------------------------------------------------------------------------
alter table auditoria enable row level security;
create policy auditoria_select on auditoria for select using (public.has_permission('auditoria.ver'));

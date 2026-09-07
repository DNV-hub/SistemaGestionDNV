-- Mismo criterio que materiales/almacenes (ver 20260906130000_materiales_delete.sql):
-- no existe un permiso "frentes.eliminar" en la matriz aprobada, los frentes
-- se cierran, no se borran. Permitimos igual el DELETE para frentes que
-- todavía no tienen vales/salidas/reservas/metrados asociados — esas FK (sin
-- "on delete cascade") bloquean el borrado en cuanto haya una fila
-- relacionada, así que el intento falla solo para frentes que sí están en
-- uso. Reutiliza los mismos permisos que ya controlan la edición/cierre.
create policy frentes_delete on frentes for delete
  using (public.has_permission('frentes.editar') or public.has_permission('frentes.cerrar'));
